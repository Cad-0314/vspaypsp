/**
 * V3 Wallet API Routes
 * POST /v3/wallet/balance - Get account balance
 */

const express = require('express');
const router = express.Router();
const { validateMerchant } = require('../../../middleware/apiAuth');
const { User, Order } = require('../../../models');
const { Op } = require('sequelize');

function envelope(ok, msg, data = null) {
    const r = { status: ok ? 'success' : 'error', message: msg, ts: new Date().toISOString() };
    if (data) r.data = data;
    return r;
}

/**
 * POST /v3/wallet/balance
 */
router.post('/balance', validateMerchant, async (req, res) => {
    try {
        const merchant = req.merchant;
        const user = await User.findByPk(merchant.id);

        if (!user) return res.json(envelope(false, 'Account not found'));

        const available = parseFloat(user.balance) || 0;
        const pending = parseFloat(user.pendingBalance) || 0;

        return res.json(envelope(true, 'Balance retrieved', {
            available_balance: available,
            pending_balance: pending,
            total_balance: available + pending,
            currency: 'INR'
        }));

    } catch (error) {
        console.error('[V3 Wallet Balance] Error:', error);
        return res.status(500).json(envelope(false, 'Internal server error'));
    }
});

module.exports = router;
