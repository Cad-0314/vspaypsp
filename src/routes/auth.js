const express = require('express');
const passport = require('passport');
const otplib = require('otplib');
const qrcode = require('qrcode');
const User = require('../models/User');
const router = express.Router();

// Configure otplib with generous window for time drift
otplib.authenticator.options = {
    window: 2,  // Allow ±60 seconds of time drift
    step: 30    // Standard 30-second step
};

// Login Page
router.get('/login', (req, res) => {
    res.render('login', { message: req.flash('error') });
});

// Login Handler - Supports JSON for dynamic 2FA
router.post('/login', (req, res, next) => {
    const isJsonRequest = req.headers['content-type']?.includes('application/json');

    // Check if this is a 2FA verification step
    if (req.session.tempUser && req.body.token) {
        // Handle 2FA verification
        return handle2FAVerification(req, res, isJsonRequest);
    }

    // Regular login with passport
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            return isJsonRequest
                ? res.json({ success: false, message: 'Authentication error' })
                : res.redirect('/auth/login');
        }

        if (!user) {
            const message = info?.message || 'Invalid credentials';
            return isJsonRequest
                ? res.json({ success: false, message })
                : (req.flash('error', message), res.redirect('/auth/login'));
        }

        // Store temp user in session
        req.session.tempUser = { id: user.id, username: user.username, role: user.role };
        delete req.session.tempSecret;

        if (user.two_fa_enabled) {
            req.session.is2faPending = true;
            return isJsonRequest
                ? res.json({ success: true, requires2FA: true, message: 'Enter your 2FA code' })
                : res.redirect('/auth/2fa-verify');
        } else {
            // 2FA not setup - redirect to setup
            return isJsonRequest
                ? res.json({ success: true, redirect: '/auth/2fa-setup' })
                : res.redirect('/auth/2fa-setup');
        }
    })(req, res, next);
});

// Handle 2FA verification within login flow
async function handle2FAVerification(req, res, isJsonRequest) {
    const { token } = req.body;
    const user = await User.findByPk(req.session.tempUser.id);

    if (!user || !user.two_fa_secret) {
        return isJsonRequest
            ? res.json({ success: false, message: 'Session expired. Please login again.' })
            : res.redirect('/auth/login');
    }

    const cleanToken = String(token).replace(/\s/g, '').trim();
    const isValid = otplib.authenticator.check(cleanToken, user.two_fa_secret);

    console.log('--- 2FA VERIFY (Dynamic) ---');
    console.log('Server Time:', new Date().toISOString());
    console.log('User Token:', cleanToken);
    console.log('Is Valid:', isValid);
    console.log('----------------------------');

    if (isValid) {
        req.session.user = req.session.tempUser;
        req.session.user.is2faAuthenticated = true;
        delete req.session.tempUser;
        delete req.session.is2faPending;

        const redirectUrl = req.session.user.role === 'admin' ? '/admin' : '/merchant';
        return isJsonRequest
            ? res.json({ success: true, redirect: redirectUrl })
            : res.redirect(redirectUrl);
    } else {
        return isJsonRequest
            ? res.json({ success: false, message: 'Invalid authentication code. Please try again.' })
            : res.render('2fa-verify', { error: 'Invalid code', serverTime: new Date().toISOString() });
    }
}

// 2FA Setup Page
router.get('/2fa-setup', async (req, res) => {
    if (!req.session.tempUser) return res.redirect('/auth/login');

    // Check if already enabled
    const user = await User.findByPk(req.session.tempUser.id);
    if (user && user.two_fa_enabled) return res.redirect('/auth/2fa-verify');

    // IMPORTANT: Only generate a NEW secret if one doesn't exist in session
    // This prevents the secret from changing on page refresh
    if (!req.session.tempSecret) {
        req.session.tempSecret = otplib.authenticator.generateSecret();
    }

    const secret = req.session.tempSecret;
    const serverTime = new Date().toISOString();

    qrcode.toDataURL(otplib.authenticator.keyuri(req.session.tempUser.username, 'Payable', secret), (err, data_url) => {
        res.render('2fa-setup', {
            qr_code: data_url,
            secret: secret,
            serverTime: serverTime,
            error: null
        });
    });
});

// 2FA Setup Verification
router.post('/2fa-setup', async (req, res) => {
    if (!req.session.tempUser || !req.session.tempSecret) {
        return res.redirect('/auth/login');
    }

    const { token } = req.body;
    const secret = req.session.tempSecret;

    // Clean the token - remove spaces and ensure it's exactly 6 digits
    const cleanToken = String(token).replace(/\s/g, '').trim();

    // Debug logging
    console.log('--- 2FA SETUP VERIFICATION ---');
    console.log('Server Time:', new Date().toISOString());
    console.log('User Token (raw):', token);
    console.log('User Token (clean):', cleanToken);
    console.log('Session Secret:', secret);
    const expectedToken = otplib.authenticator.generate(secret);
    console.log('Expected Token:', expectedToken);

    const isValid = otplib.authenticator.check(cleanToken, secret);
    console.log('Is Valid:', isValid);
    console.log('-------------------------------');

    if (isValid) {
        // Save the secret to database and enable 2FA
        await User.update({
            two_fa_secret: secret,
            two_fa_enabled: true
        }, { where: { id: req.session.tempUser.id } });

        // Complete the authentication
        req.session.user = req.session.tempUser;
        req.session.user.is2faAuthenticated = true;
        delete req.session.tempUser;
        delete req.session.tempSecret;
        delete req.session.is2faPending;

        const redirectUrl = req.session.user.role === 'admin' ? '/admin' : '/merchant';
        return res.redirect(redirectUrl);
    } else {
        // Keep the SAME secret and show error
        const serverTime = new Date().toISOString();
        qrcode.toDataURL(otplib.authenticator.keyuri(req.session.tempUser.username, 'Payable', secret), (err, data_url) => {
            res.render('2fa-setup', {
                qr_code: data_url,
                secret: secret,
                serverTime: serverTime,
                error: `Invalid code. Expected: ${expectedToken}. You entered: ${cleanToken}. Please ensure your Authenticator has this exact secret.`
            });
        });
    }
});

// 2FA Verify Page (for users who already have 2FA enabled)
router.get('/2fa-verify', async (req, res) => {
    if (!req.session.tempUser || !req.session.is2faPending) {
        return res.redirect('/auth/login');
    }
    res.render('2fa-verify', { error: null, serverTime: new Date().toISOString() });
});

// 2FA Verification Handler
router.post('/2fa-verify', async (req, res) => {
    if (!req.session.tempUser) return res.redirect('/auth/login');

    const { token } = req.body;
    const user = await User.findByPk(req.session.tempUser.id);

    if (!user || !user.two_fa_secret) {
        return res.redirect('/auth/login');
    }

    // Clean the token
    const cleanToken = String(token).replace(/\s/g, '').trim();

    // Debug logging
    console.log('--- 2FA VERIFY ---');
    console.log('Server Time:', new Date().toISOString());
    console.log('User Token:', cleanToken);
    console.log('DB Secret:', user.two_fa_secret);
    const expectedToken = otplib.authenticator.generate(user.two_fa_secret);
    console.log('Expected Token:', expectedToken);

    const isValid = otplib.authenticator.check(cleanToken, user.two_fa_secret);
    console.log('Is Valid:', isValid);
    console.log('------------------');

    if (isValid) {
        req.session.user = req.session.tempUser;
        req.session.user.is2faAuthenticated = true;
        delete req.session.tempUser;
        delete req.session.is2faPending;

        const redirectUrl = req.session.user.role === 'admin' ? '/admin' : '/merchant';
        return res.redirect(redirectUrl);
    } else {
        res.render('2fa-verify', {
            error: `Invalid code. Expected: ${expectedToken}. Server time: ${new Date().toISOString()}`,
            serverTime: new Date().toISOString()
        });
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
