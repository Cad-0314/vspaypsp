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
// BharatPay Test Endpoint
// ============================================
app.get('/bharattest', async (req, res) => {
    try {
        const bharatpayService = require('./src/services/bharatpay');
        const testOrderId = `BPTEST_${Date.now()}`;
        const testAmount = req.query.amount || 500;
        const callbackUrl = `${process.env.APP_URL}/callback/bharatpay/payin`;

        console.log('[BharatTest] Testing both V1 and V2 APIs...');

        // Test V1 API
        const v1Result = await bharatpayService.createPayinV1({
            orderId: testOrderId + '_V1',
            amount: testAmount,
            notifyUrl: callbackUrl
        });

        // Test V2 API
        const v2Result = await bharatpayService.createPayinV2({
            orderId: testOrderId + '_V2',
            amount: testAmount,
            notifyUrl: callbackUrl
        });

        // Return HTML page with results
        res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>BharatPay API Test</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 40px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { color: #333; }
        .test-box { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .success { border-left: 4px solid #4CAF50; }
        .failed { border-left: 4px solid #f44336; }
        pre { background: #f0f0f0; padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
        .pay-link { display: inline-block; padding: 10px 20px; background: #2196F3; color: white; text-decoration: none; border-radius: 4px; margin-top: 10px; }
        .pay-link:hover { background: #1976D2; }
        h2 { margin-top: 0; }
        .status { font-weight: bold; padding: 5px 10px; border-radius: 4px; display: inline-block; }
        .status.success { background: #e8f5e9; color: #2e7d32; }
        .status.failed { background: #ffebee; color: #c62828; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🇮🇳 BharatPay API Test Results</h1>
        <p>Test Order ID: <strong>${testOrderId}</strong> | Amount: ₹${testAmount}</p>
        <p>Callback URL: <code>${callbackUrl}</code></p>
        
        <div class="test-box ${v1Result.success ? 'success' : 'failed'}">
            <h2>V1 API (Plain JSON) - Deprecated</h2>
            <span class="status ${v1Result.success ? 'success' : 'failed'}">${v1Result.success ? '✓ SUCCESS' : '✗ FAILED'}</span>
            ${v1Result.success ? `
                <p>Provider Order ID: <strong>${v1Result.providerOrderId}</strong></p>
                <p>Process Code: ${v1Result.processCode}</p>
                ${v1Result.payUrl ? `<a class="pay-link" href="${v1Result.payUrl}" target="_blank">Open Payment Page (V1)</a>` : ''}
            ` : `
                <p>Error: ${v1Result.error}</p>
            `}
            <h3>Raw Response:</h3>
            <pre>${JSON.stringify(v1Result.rawResponse || v1Result, null, 2)}</pre>
        </div>
        
        <div class="test-box ${v2Result.success ? 'success' : 'failed'}">
            <h2>V2 API (AES Encrypted) - Recommended</h2>
            <span class="status ${v2Result.success ? 'success' : 'failed'}">${v2Result.success ? '✓ SUCCESS' : '✗ FAILED'}</span>
            ${v2Result.success ? `
                <p>Provider Order ID: <strong>${v2Result.providerOrderId}</strong></p>
                <p>Process Code: ${v2Result.processCode}</p>
                ${v2Result.payUrl ? `<a class="pay-link" href="${v2Result.payUrl}" target="_blank">Open Payment Page (V2)</a>` : ''}
            ` : `
                <p>Error: ${v2Result.error}</p>
            `}
            <h3>Raw Response:</h3>
            <pre>${JSON.stringify(v2Result.rawResponse || v2Result, null, 2)}</pre>
        </div>
        
        <div class="test-box">
            <h2>📋 Summary</h2>
            <table style="width:100%; border-collapse: collapse;">
                <tr style="background: #f5f5f5;">
                    <th style="text-align:left; padding:10px; border-bottom:1px solid #ddd;">API Version</th>
                    <th style="text-align:left; padding:10px; border-bottom:1px solid #ddd;">Status</th>
                    <th style="text-align:left; padding:10px; border-bottom:1px solid #ddd;">Order ID</th>
                    <th style="text-align:left; padding:10px; border-bottom:1px solid #ddd;">Payment Link</th>
                </tr>
                <tr>
                    <td style="padding:10px; border-bottom:1px solid #eee;">V1 (Deprecated)</td>
                    <td style="padding:10px; border-bottom:1px solid #eee;">${v1Result.success ? '✓' : '✗'}</td>
                    <td style="padding:10px; border-bottom:1px solid #eee;">${v1Result.providerOrderId || 'N/A'}</td>
                    <td style="padding:10px; border-bottom:1px solid #eee;">${v1Result.payUrl ? 'Available' : 'N/A'}</td>
                </tr>
                <tr>
                    <td style="padding:10px;">V2 (Recommended)</td>
                    <td style="padding:10px;">${v2Result.success ? '✓' : '✗'}</td>
                    <td style="padding:10px;">${v2Result.providerOrderId || 'N/A'}</td>
                    <td style="padding:10px;">${v2Result.payUrl ? 'Available' : 'N/A'}</td>
                </tr>
            </table>
        </div>
    </div>
</body>
</html>
        `);

    } catch (error) {
        console.error('[BharatTest] Error:', error);
        res.status(500).json({ success: false, error: error.message });
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

