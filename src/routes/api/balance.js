/**
 * Balance API Routes
 * POST /api/balance/query - Get merchant balance
 */

const express = require('express');
const router = express.Router();
const { validateMerchant } = require('../../middleware/apiAuth');
const { SUPPORTED_CURRENCIES } = require('../../config/currencies');

/**
 * POST /api/balance/query
 * Get merchant's current balance (supports per-currency)
 */
router.post('/query', validateMerchant, async (req, res) => {
    try {
        const merchant = req.merchant;
        const { currency } = req.body;

        // Legacy single balance
        const availableAmount = parseFloat(merchant.balance) || 0;
        const pendingAmount = parseFloat(merchant.pendingBalance) || 0;
        const totalAmount = availableAmount + pendingAmount;

        // Per-currency balances
        let perCurrencyBalances = {};
        try {
            perCurrencyBalances = JSON.parse(merchant.balances || '{"INR":0}');
        } catch (e) {
            perCurrencyBalances = { INR: availableAmount };
        }

        // If specific currency requested, return only that
        if (currency && currency.toUpperCase() !== 'ALL') {
            const cur = currency.toUpperCase();
            const bal = parseFloat(perCurrencyBalances[cur] || 0);
            return res.json({
                status: 'success',
                timestamp: new Date().toISOString(),
                result: {
                    availableBalance: parseFloat(bal.toFixed(2)),
                    pendingBalance: parseFloat(pendingAmount.toFixed(2)),
                    totalBalance: parseFloat((bal + pendingAmount).toFixed(2)),
                    currency: cur
                }
            });
        }

        return res.json({
            status: 'success',
            timestamp: new Date().toISOString(),
            result: {
                availableBalance: parseFloat(availableAmount.toFixed(2)),
                pendingBalance: parseFloat(pendingAmount.toFixed(2)),
                totalBalance: parseFloat(totalAmount.toFixed(2)),
                currency: merchant.defaultCurrency || 'INR',
                balances: perCurrencyBalances
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

