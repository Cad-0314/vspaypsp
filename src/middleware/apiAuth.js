/**
 * API Authentication Middleware
 * Validates x-merchant-id and x-signature headers
 */

const crypto = require('crypto');
const { User } = require('../models');

/**
 * Generate MD5 signature for verification
 */
function generateSignature(params, secretKey) {
    const filtered = {};
    Object.keys(params).forEach(key => {
        if (key !== 'sign' && params[key] !== '' && params[key] != null) {
            filtered[key] = params[key];
        }
    });

    const sorted = Object.keys(filtered).sort();
    const query = sorted.map(k => `${k}=${filtered[k]}`).join('&');
    const str = `${query}&secret=${secretKey}`;

    return crypto.createHash('md5').update(str).digest('hex').toUpperCase();
}

/**
 * Middleware to validate merchant API requests
 */
async function validateMerchant(req, res, next) {
    try {
        const merchantId = req.headers['x-merchant-id'];
        const signature = req.headers['x-signature'];

        if (!merchantId) {
            return res.status(400).json({
                code: -2,
                msg: 'Missing x-merchant-id header'
            });
        }

        if (!signature) {
            return res.status(400).json({
                code: -2,
                msg: 'Missing x-signature header'
            });
        }

        // Find merchant by API key
        const merchant = await User.findOne({
            where: { apiKey: merchantId, role: 'merchant' }
        });

        if (!merchant) {
            return res.status(401).json({
                code: -1,
                msg: 'Invalid merchant ID'
            });
        }

        if (!merchant.isActive) {
            return res.status(403).json({
                code: 0,
                msg: 'Merchant account is disabled'
            });
        }

        // Verify signature
        const body = req.body || {};

        // Ensure all values are converted to strings for consistent signature generation
        const normalizedBody = {};
        Object.keys(body).forEach(key => {
            if (body[key] !== '' && body[key] != null && key !== 'sign') {
                // Convert to string to match client-side signature generation
                normalizedBody[key] = String(body[key]);
            }
        });

        const expectedSign = generateSignature(normalizedBody, (merchant.apiSecret || '').trim());

        if ((signature || '').trim().toUpperCase() !== expectedSign) {
            console.warn(`[API Auth] Signature Mismatch for Merchant ${merchant.username} (ID: ${merchant.id})`);
            console.warn(`[API Auth] Received Signature: ${signature}`);
            console.warn(`[API Auth] Expected Signature: ${expectedSign}`);
            console.warn(`[API Auth] Request Body:`, JSON.stringify(body, null, 2));

            // Log the exact string used for hashing (for debugging)
            const sorted = Object.keys(normalizedBody).sort();
            const query = sorted.map(k => `${k}=${normalizedBody[k]}`).join('&');
            const str = `${query}&secret=${(merchant.apiSecret || '').trim()}`;
            console.warn(`[API Auth] String to Sign: ${str}`);
            console.warn(`[API Auth] Tip: Ensure client uses the same sorting and secret key`);

            return res.status(401).json({
                code: -1,
                msg: 'Invalid signature'
            });
        }

        // Attach merchant to request
        req.merchant = merchant;
        next();
    } catch (error) {
        console.error('[API Auth] Error:', error.message);
        return res.status(500).json({
            code: 0,
            msg: 'Internal server error'
        });
    }
}

/**
 * Generate signature for callback to merchant
 */
function signCallback(params, secretKey) {
    return generateSignature(params, secretKey);
}

module.exports = {
    validateMerchant,
    generateSignature,
    signCallback
};
