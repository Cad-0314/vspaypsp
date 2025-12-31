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
        const expectedSign = generateSignature(body, merchant.apiSecret);

        if (signature.toUpperCase() !== expectedSign) {
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
