const express = require('express');
const session = require('express-session');
const passport = require('passport');
const flash = require('connect-flash');
const path = require('path');
const sequelize = require('./src/config/database');
const authRoutes = require('./src/routes/auth');
require('dotenv').config();

// Passport Config
require('./src/config/passport')(passport);

const app = express();

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

// Routes
app.use('/auth', authRoutes);

// Protected Routes Middleware
function ensureAuthenticated(req, res, next) {
    if (req.session.user && req.session.user.is2faAuthenticated) {
        return next();
    }
    res.redirect('/auth/login');
}

app.get('/admin', ensureAuthenticated, (req, res) => {
    if (req.session.user.role !== 'admin') return res.redirect('/merchant');
    res.render('admin', { user: req.session.user });
});

app.get('/merchant', ensureAuthenticated, (req, res) => {
    res.render('merchant', { user: req.session.user });
});

app.get('/', (req, res) => {
    res.redirect('/auth/login');
});

// Database Sync & Start Server
const PORT = process.env.PORT || 3000;

sequelize.sync().then(() => {
    console.log('Database connected & synced');
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}).catch(err => console.log('Database connection error:', err));
