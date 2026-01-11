const express = require('express');
const session = require('express-session');
const passport = require('passport');
const flash = require('connect-flash');
const path = require('path');
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Database and Models
const { sequelize, User, Channel, Order } = require('./src/models');

// Routes
const authRoutes = require('./src/routes/auth');
const payinRoutes = require('./src/routes/api/payin');
const payoutRoutes = require('./src/routes/api/payout');
const balanceRoutes = require('./src/routes/api/balance');
const callbackRoutes = require('./src/routes/api/callbacks');
const paypageRoutes = require('./src/routes/paypage');
const adminRoutes = require('./src/routes/admin');
const merchantApiRoutes = require('./src/routes/merchant_api');

// Seeder
const seedDatabase = require('./src/seeders/init');

// Telegram Bot
const telegramBot = require('./src/services/telegramBot');
console.log('[Server] Initializing Telegram Bot...');
telegramBot.init(process.env.TELEGRAM_BOT_TOKEN);

// Passport Config
require('./src/config/passport')(passport);

const app = express();

// Trust proxy for correct IP detection
app.set('trust proxy', true);

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret_key_payable_backend',
    resave: false,
    saveUninitialized: false
}));

// i18n Middleware
app.use(require('./src/middleware/i18n'));

// Passport Middleware
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// ============================================
// API Routes (Payable Merchant API)
// ============================================
app.use('/api/payin', payinRoutes);
app.use('/api/payout', payoutRoutes);
app.use('/api/balance', balanceRoutes);

// ============================================
// Callback Routes (from upstream providers)
// ============================================
app.use('/callback', callbackRoutes);

// ============================================
// Payment Page Routes
// ============================================
app.use('/pay', paypageRoutes);

// ============================================
// Auth Routes
// ============================================
app.use('/auth', authRoutes);

// ============================================
// Admin API Routes
// ============================================
app.use('/admin/api', adminRoutes);

// ============================================
// Merchant API Routes
// ============================================
app.use('/api/merchant', merchantApiRoutes);

// ============================================
// Protected Routes Middleware
// ============================================
function ensureAuthenticated(req, res, next) {
    if (req.session.user && req.session.user.is2faAuthenticated) {
        return next();
    }
    res.redirect('/auth/login');
}

// ============================================
// Dashboard Routes
// ============================================
app.get('/admin', ensureAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'admin') return res.redirect('/merchant');

    // Fetch additional data for admin dashboard
    const user = await User.findByPk(req.session.user.id);
    const channels = await Channel.findAll();
    const merchantCount = await User.count({ where: { role: 'merchant' } });

    res.render('admin', {
        user: user ? user.toJSON() : req.session.user,
        channels,
        merchantCount
    });
});

app.get('/merchant', ensureAuthenticated, async (req, res) => {
    // Fetch full merchant data including balance
    const user = await User.findByPk(req.session.user.id);
    const channel = await Channel.findOne({ where: { name: user.assignedChannel } });

    res.render('merchant', {
        user: user ? user.toJSON() : req.session.user,
        channel: channel ? channel.toJSON() : null
    });
});

app.get('/docs', (req, res) => {
    res.render('docs', { currentLang: req.query.lang || 'en' });
});

app.get('/apidoc', (req, res) => {
    res.render('apidocs');
});

app.get('/', (req, res) => {
    res.redirect('/auth/login');
});

// ============================================
// Health Check
// ============================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// Public Analysis Endpoint (Temporary)
// ============================================
app.get('/analysis', async (req, res) => {
    try {
        // Dynamic import to avoid caching
        delete require.cache[require.resolve('./test-payin-channels')];
        const testChannels = require('./test-payin-channels');

        console.log('[Analysis] Request received from ' + req.ip);
        const results = await testChannels();
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            results: results
        });
    } catch (error) {
        console.error('[Analysis] Failed:', error);
        res.status(500).json({ success: false, error: 'Analysis failed' });
    }
});

// ============================================
// Database Sync & Start Server
// ============================================
const PORT = process.env.PORT || 3000;

sequelize.sync().then(async () => {
    console.log('Database connected & synced');

    // Backfill credentials
    try {
        const merchants = await User.findAll({ where: { role: 'merchant' } });
        for (const m of merchants) {
            let updates = {};
            // Generate API key starting with 'star' (8-12 chars) if missing or doesn't start with 'star'
            if (!m.apiKey || !m.apiKey.startsWith('star')) {
                const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
                const randomLength = 4 + Math.floor(Math.random() * 5); // 4-8 random chars
                let key = 'star';
                for (let i = 0; i < randomLength; i++) {
                    key += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                updates.apiKey = key;
            }
            if (!m.apiSecret) updates.apiSecret = crypto.randomBytes(32).toString('hex');
            if (Object.keys(updates).length > 0) {
                await m.update(updates);
                console.log(`[Backfill] Updated credentials for ${m.username}`);
            }
        }
    } catch (e) { console.error('Backfill error:', e); }

    // Run seeder to ensure channels exist
    await seedDatabase();

    const server = app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`API Base URL: ${process.env.APP_URL || 'http://localhost:' + PORT}`);

        // Signal PM2 that we're ready
        if (process.send) {
            process.send('ready');
        }
    });

    // Graceful shutdown handling for high-traffic environments
    const gracefulShutdown = async (signal) => {
        console.log(`[Server] Received ${signal}, shutting down gracefully...`);

        server.close(async () => {
            console.log('[Server] HTTP server closed');

            try {
                await sequelize.close();
                console.log('[Server] Database connections closed');
            } catch (err) {
                console.error('[Server] Error closing database:', err);
            }

            process.exit(0);
        });

        // Force close after 10 seconds
        setTimeout(() => {
            console.error('[Server] Forcefully shutting down');
            process.exit(1);
        }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

}).catch(err => console.log('Database connection error:', err));

