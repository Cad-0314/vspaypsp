const express = require('express');
const passport = require('passport');
const otplib = require('otplib');
const qrcode = require('qrcode');
const User = require('../models/User');
const router = express.Router();

// Login Page
router.get('/login', (req, res) => {
    res.render('login', { message: req.flash('error') });
});

// Login Handler
router.post('/login', passport.authenticate('local', {
    failureRedirect: '/auth/login',
    failureFlash: true
}), (req, res) => {
    const user = req.user;
    req.session.tempUser = { id: user.id, username: user.username, role: user.role };

    if (user.two_fa_enabled) {
        req.session.is2faPending = true;
        res.redirect('/auth/2fa-verify');
    } else {
        res.redirect('/auth/2fa-setup');
    }
});

// 2FA Setup Page
router.get('/2fa-setup', async (req, res) => {
    if (!req.session.tempUser) return res.redirect('/auth/login');

    // Check if already enabled
    const user = await User.findByPk(req.session.tempUser.id);
    if (user.two_fa_enabled) return res.redirect('/auth/2fa-verify');

    const secret = otplib.authenticator.generateSecret();
    req.session.tempSecret = secret;

    qrcode.toDataURL(otplib.authenticator.keyuri(req.session.tempUser.username, 'VSPAY', secret), (err, data_url) => {
        res.render('2fa-setup', { qr_code: data_url, secret: secret });
    });
});

// Configure otplib
otplib.authenticator.options = { window: 1 }; // Allow 1 step window for time drift

// 2FA Setup Verification
router.post('/2fa-setup', async (req, res) => {
    if (!req.session.tempUser || !req.session.tempSecret) return res.redirect('/auth/login');

    const { token } = req.body;
    const isValid = otplib.authenticator.check(token, req.session.tempSecret);

    if (isValid) {
        await User.update({
            two_fa_secret: req.session.tempSecret,
            two_fa_enabled: true
        }, { where: { id: req.session.tempUser.id } });

        req.session.user = req.session.tempUser;
        req.session.user.is2faAuthenticated = true;
        delete req.session.tempUser;
        delete req.session.tempSecret;
        delete req.session.is2faPending;

        const redirectUrl = req.session.user.role === 'admin' ? '/admin' : '/merchant';
        res.redirect(redirectUrl);
    } else {
        // Regenerate QR for the SAME secret so user can try again or rescan if needed
        qrcode.toDataURL(otplib.authenticator.keyuri(req.session.tempUser.username, 'VSPAY', req.session.tempSecret), (err, data_url) => {
            res.render('2fa-setup', { qr_code: data_url, secret: req.session.tempSecret, error: 'Invalid Code. Please try again.' });
        });
    }
});

// 2FA Verify Page
router.get('/2fa-verify', (req, res) => {
    if (!req.session.tempUser || !req.session.is2faPending) return res.redirect('/auth/login');
    res.render('2fa-verify');
});

// 2FA Verification Handler
router.post('/2fa-verify', async (req, res) => {
    if (!req.session.tempUser) return res.redirect('/auth/login');

    const { token } = req.body;
    const user = await User.findByPk(req.session.tempUser.id);

    const isValid = otplib.authenticator.check(token, user.two_fa_secret);

    if (isValid) {
        req.session.user = req.session.tempUser;
        req.session.user.is2faAuthenticated = true;
        delete req.session.tempUser;
        delete req.session.is2faPending;

        const redirectUrl = req.session.user.role === 'admin' ? '/admin' : '/merchant';
        res.redirect(redirectUrl);
    } else {
        res.render('2fa-verify', { error: 'Invalid OTP' });
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.logout(() => {
        req.session.destroy();
        res.redirect('/auth/login');
    });
});

module.exports = router;
