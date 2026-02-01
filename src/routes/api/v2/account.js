/**
 * V2 Account API Routes
 * POST /v2/account/balance - Check account balance
 */

const express = require('express');
const router = express.Router();

const { validateMerchant } = require('../../../middleware/apiAuth');

// Helper function to build standard response
function buildResponse(success, code, message, data = null) {
    const response = {
        success,
        code,
        message,
        timestamp: new Date().toISOString()
    };
    if (data) response.data = data;
    return response;
}

// Helper function to build error response
function buildError(code, message, errors = null) {
    const response = {
        success: false,
        code,
        message,
        timestamp: new Date().toISOString()
    };
    if (errors) response.errors = errors;
    return response;
}

/**
 * POST /v2/account/balance
 * Check account balance
 */
router.post('/balance', validateMerchant, async (req, res) => {
    try {
        const merchant = req.merchant;

        const availableBalance = parseFloat(merchant.balance || 0);
        const pendingBalance = parseFloat(merchant.pendingBalance || 0);
        const totalBalance = availableBalance + pendingBalance;

        return res.json(buildResponse(true, 'SUCCESS', 'Balance retrieved', {
            available_balance: parseFloat(availableBalance.toFixed(2)),
            pending_balance: parseFloat(pendingBalance.toFixed(2)),
            total_balance: parseFloat(totalBalance.toFixed(2)),
            currency: 'INR'
        }));

    } catch (error) {
        console.error('[V2 Account Balance] Error:', error);
        return res.status(500).json(buildError('INTERNAL_ERROR', 'Internal server error'));
    }
});

module.exports = router;
