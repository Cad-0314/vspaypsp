const express = require('express');
const session = require('express-session');
const passport = require('passport');
const flash = require('connect-flash');
const path = require('path');
require('dotenv').config();

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
    secret: process.env.SESSION_SECRET || 'secret_key_vspay_backend',
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
// API Routes (VSPAY Merchant API)
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
// Database Sync & Start Server
// ============================================
const PORT = process.env.PORT || 3000;

sequelize.sync({ alter: true }).then(async () => {
    console.log('Database connected & synced');

    // Run seeder to ensure channels exist
    await seedDatabase();

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`API Base URL: ${process.env.APP_URL || 'http://localhost:' + PORT}`);
    });
}).catch(err => console.log('Database connection error:', err));

