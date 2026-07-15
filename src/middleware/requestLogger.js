/**
 * Request Logger Middleware
 * Structured logging with timing for all requests
 */

function requestLogger(req, res, next) {
    const start = Date.now();

    // Capture response finish
    res.on('finish', () => {
        const duration = Date.now() - start;
        const merchantId = req.headers['x-merchant-id'] || (req.session && req.session.user ? req.session.user.username : '-');

        // Only log API/callback/admin requests (skip static files)
        const path = req.originalUrl || req.url;
        if (path.startsWith('/api/') || path.startsWith('/callback/') || path.startsWith('/admin/') ||
            path.startsWith('/v2/') || path.startsWith('/v3/') || path.startsWith('/auth/')) {
            console.log(`[${req.method}] ${path} ${res.statusCode} ${duration}ms merchant=${merchantId} ip=${req.ip}`);
        }

        // Warn on slow requests
        if (duration > 5000) {
            console.warn(`[SLOW] ${req.method} ${path} took ${duration}ms`);
        }
    });

    next();
}

module.exports = requestLogger;
