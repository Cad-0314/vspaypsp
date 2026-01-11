/**
 * Balance API Routes
 * POST /api/balance/query - Get merchant balance
 */

const express = require('express');
const router = express.Router();
const { validateMerchant } = require('../../middleware/apiAuth');

/**
 * POST /api/balance/query
 * Get merchant's current balance
 */
router.post('/query', validateMerchant, async (req, res) => {
    try {
        const merchant = req.merchant;

        const availableAmount = parseFloat(merchant.balance) || 0;
        const pendingAmount = parseFloat(merchant.pendingBalance) || 0;
        const totalAmount = availableAmount + pendingAmount;

        return res.json({
            status: 'success',
            timestamp: new Date().toISOString(),
            result: {
                availableBalance: parseFloat(availableAmount.toFixed(2)),
                pendingBalance: parseFloat(pendingAmount.toFixed(2)),
                totalBalance: parseFloat(totalAmount.toFixed(2)),
                currency: 'INR'
            }
        });

    } catch (error) {
        console.error('[Balance Query] Error:', error);
        return res.status(500).json({
            status: 'error',
            errorCode: 'INTERNAL_ERROR',
            message: 'Internal server error',
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;

