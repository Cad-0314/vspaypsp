/**
 * Rate Limiter Middleware
 * Prevents API abuse and DoS attacks
 * Configurable via .env
 */

const rateLimit = require('express-rate-limit');

// API rate limiter (merchant API endpoints)
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: parseInt(process.env.RATE_LIMIT_API) || 100,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Rate limit by merchant API key if present, otherwise by IP
        return req.headers['x-merchant-id'] || req.ip;
    },
    handler: (req, res) => {
        console.warn(`[RateLimit] API limit exceeded for ${req.headers['x-merchant-id'] || req.ip}`);
        res.status(429).json({
            status: 'error',
            errorCode: 'RATE_LIMITED',
            message: 'Too many requests. Please slow down.',
            timestamp: new Date().toISOString()
        });
    }
});

// Callback rate limiter (upstream provider callbacks)
const callbackLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_CALLBACK) || 200,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    handler: (req, res) => {
        console.warn(`[RateLimit] Callback limit exceeded for ${req.ip}`);
        res.status(429).send('rate limited');
    }
});

// Admin rate limiter
const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_ADMIN) || 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    handler: (req, res) => {
        console.warn(`[RateLimit] Admin limit exceeded for ${req.ip}`);
        res.status(429).json({
            success: false,
            error: 'Too many requests'
        });
    }
});

module.exports = { apiLimiter, callbackLimiter, adminLimiter };
