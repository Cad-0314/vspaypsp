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
            code: 1,
            msg: 'Success',
            data: {
                availableAmount: parseFloat(availableAmount.toFixed(2)),
                pendingAmount: parseFloat(pendingAmount.toFixed(2)),
                totalAmount: parseFloat(totalAmount.toFixed(2))
            }
        });

    } catch (error) {
        console.error('[Balance Query] Error:', error);
        return res.status(500).json({
            code: 0,
            msg: 'Internal server error'
        });
    }
});

module.exports = router;
