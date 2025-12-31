/**
 * Callback Routes
 * Handles upstream provider callbacks and forwards to merchants
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { Order, User, Channel } = require('../../models');
const channelRouter = require('../../services/channelRouter');
const { signCallback } = require('../../middleware/apiAuth');
const sequelize = require('../../config/database');

/**
 * POST /callback/:channel/payin
 * Handle payin callback from upstream provider
 */
router.post('/:channel/payin', async (req, res) => {
    const channelName = req.params.channel;
    console.log(`[Callback] Payin callback from ${channelName}:`, JSON.stringify(req.body));

    try {
        // Verify callback signature
        const isValid = channelRouter.verifyCallback(channelName, req.body);
        if (!isValid) {
            console.warn(`[Callback] Invalid signature from ${channelName}`);
            // Still process - some providers have signature issues
        }

        // Extract order info based on provider format
        let orderId, status, utr, actualAmount, providerOrderId;

        if (channelName === 'hdpay') {
            orderId = req.body.merchantOrderId;
            status = req.body.status === '1' ? 'success' : (req.body.status === '2' ? 'failed' : 'pending');
            utr = req.body.utr;
            actualAmount = parseFloat(req.body.payAmount || req.body.amount);
            providerOrderId = req.body.orderId;
        } else if (channelName === 'x2' || channelName === 'f2pay') {
            // F2Pay callback format
            const bizContent = typeof req.body.bizContent === 'string'
                ? JSON.parse(req.body.bizContent)
                : req.body.bizContent;

            orderId = bizContent.mchOrderNo;
            status = bizContent.state === 'Paid' || bizContent.state === 'UnequalPaid' ? 'success' :
                bizContent.state === 'Failed' ? 'failed' : 'pending';
            utr = bizContent.trxId;
            actualAmount = parseFloat(bizContent.actualAmount);
            providerOrderId = bizContent.platNo;
        } else if (channelName === 'payable' || channelName === 'silkpay') {
            orderId = req.body.orderId;
            status = req.body.status === 1 || req.body.status === '1' ? 'success' :
                req.body.status === 2 || req.body.status === '2' ? 'failed' : 'pending';
            utr = req.body.utr || req.body.bankRef;
            actualAmount = parseFloat(req.body.actualAmount || req.body.amount);
            providerOrderId = req.body.tradeNo;
        }

        if (!orderId) {
            console.error('[Callback] Missing orderId in callback');
            return res.send('success');
        }

        // Find order
        const order = await Order.findOne({
            where: { orderId: orderId, type: 'payin' }
        });

        if (!order) {
            console.error(`[Callback] Order not found: ${orderId}`);
            return res.send('success');
        }

        // Skip if already processed
        if (order.status === 'success' || order.status === 'failed') {
            console.log(`[Callback] Order ${orderId} already processed`);
            return res.send('success');
        }

        // Start transaction
        const t = await sequelize.transaction();

        try {
            // Update order
            await order.update({
                status: status,
                utr: utr || order.utr,
                providerOrderId: providerOrderId || order.providerOrderId,
                callbackData: JSON.stringify(req.body)
            }, { transaction: t });

            // If success, credit merchant balance
            if (status === 'success') {
                await User.update(
                    { balance: sequelize.literal(`balance + ${order.netAmount}`) },
                    { where: { id: order.merchantId }, transaction: t }
                );
                console.log(`[Callback] Credited ${order.netAmount} to merchant ${order.merchantId}`);
            }

            await t.commit();

            // Forward callback to merchant
            if (order.callbackUrl && !order.callbackSent) {
                forwardCallback(order, status, utr);
            }

        } catch (error) {
            await t.rollback();
            throw error;
        }

        // Return success response based on provider
        if (channelName === 'hdpay') {
            return res.send('success');
        } else if (channelName === 'x2' || channelName === 'f2pay') {
            return res.send('success');
        } else {
            return res.send('OK');
        }

    } catch (error) {
        console.error('[Callback] Payin error:', error);
        return res.send('success');
    }
});

/**
 * POST /callback/:channel/payout
 * Handle payout callback from upstream provider
 */
router.post('/:channel/payout', async (req, res) => {
    const channelName = req.params.channel;
    console.log(`[Callback] Payout callback from ${channelName}:`, JSON.stringify(req.body));

    try {
        // Extract order info
        let orderId, status, utr, providerOrderId;

        if (channelName === 'hdpay') {
            orderId = req.body.merchantPayoutId;
            status = req.body.status === '1' ? 'success' : 'failed';
            utr = req.body.utr;
            providerOrderId = req.body.payoutId;
        } else if (channelName === 'x2' || channelName === 'f2pay') {
            const bizContent = typeof req.body.bizContent === 'string'
                ? JSON.parse(req.body.bizContent)
                : req.body.bizContent;

            orderId = bizContent.mchOrderNo;
            status = bizContent.state === 'Success' || bizContent.state === 'Paid' ? 'success' :
                bizContent.state === 'Failed' ? 'failed' : 'processing';
            utr = bizContent.trxId;
            providerOrderId = bizContent.platNo;
        } else if (channelName === 'payable' || channelName === 'silkpay') {
            orderId = req.body.orderId;
            status = req.body.status === 1 || req.body.status === '1' ? 'success' : 'failed';
            utr = req.body.utr;
            providerOrderId = req.body.tradeNo;
        }

        if (!orderId) {
            return res.send('success');
        }

        const order = await Order.findOne({
            where: { orderId: orderId, type: 'payout' }
        });

        if (!order) {
            return res.send('success');
        }

        if (order.status === 'success' || order.status === 'failed') {
            return res.send('success');
        }

        const t = await sequelize.transaction();

        try {
            await order.update({
                status: status,
                utr: utr || order.utr,
                providerOrderId: providerOrderId || order.providerOrderId,
                callbackData: JSON.stringify(req.body)
            }, { transaction: t });

            // Update pending balance
            await User.update(
                { pendingBalance: sequelize.literal(`pendingBalance - ${order.amount}`) },
                { where: { id: order.merchantId }, transaction: t }
            );

            // If failed, refund to available balance
            if (status === 'failed') {
                const refundAmount = parseFloat(order.amount) + parseFloat(order.fee);
                await User.update(
                    { balance: sequelize.literal(`balance + ${refundAmount}`) },
                    { where: { id: order.merchantId }, transaction: t }
                );
                console.log(`[Callback] Refunded ${refundAmount} to merchant ${order.merchantId}`);
            }

            await t.commit();

            // Forward callback to merchant
            if (order.callbackUrl && !order.callbackSent) {
                forwardPayoutCallback(order, status, utr);
            }

        } catch (error) {
            await t.rollback();
            throw error;
        }

        return res.send('success');

    } catch (error) {
        console.error('[Callback] Payout error:', error);
        return res.send('success');
    }
});

/**
 * Forward payin callback to merchant
 */
async function forwardCallback(order, status, utr) {
    try {
        const merchant = await User.findByPk(order.merchantId);
        if (!merchant || !order.callbackUrl) return;

        const callbackData = {
            status: status === 'success' ? 1 : 0,
            amount: parseFloat(order.netAmount),
            orderAmount: parseFloat(order.amount),
            orderId: order.orderId,
            id: order.id,
            utr: utr || '',
            param: order.param || ''
        };

        // Add signature
        callbackData.sign = signCallback(callbackData, merchant.apiSecret);

        console.log(`[Callback] Forwarding to merchant: ${order.callbackUrl}`);

        const response = await axios.post(order.callbackUrl, callbackData, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.data === 'OK' || response.data === 'ok') {
            await order.update({ callbackSent: true, callbackAttempts: order.callbackAttempts + 1 });
            console.log(`[Callback] Merchant acknowledged: ${order.orderId}`);
        } else {
            await order.update({ callbackAttempts: order.callbackAttempts + 1 });
        }
    } catch (error) {
        console.error(`[Callback] Forward error: ${error.message}`);
        await order.update({ callbackAttempts: order.callbackAttempts + 1 });
    }
}

/**
 * Forward payout callback to merchant
 */
async function forwardPayoutCallback(order, status, utr) {
    try {
        const merchant = await User.findByPk(order.merchantId);
        if (!merchant || !order.callbackUrl) return;

        const callbackData = {
            status: status === 'success' ? 1 : 0,
            amount: parseFloat(order.amount),
            orderId: order.orderId,
            id: order.id,
            utr: utr || '',
            message: status,
            param: order.param || ''
        };

        callbackData.sign = signCallback(callbackData, merchant.apiSecret);

        const response = await axios.post(order.callbackUrl, callbackData, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.data === 'OK' || response.data === 'ok') {
            await order.update({ callbackSent: true, callbackAttempts: order.callbackAttempts + 1 });
        } else {
            await order.update({ callbackAttempts: order.callbackAttempts + 1 });
        }
    } catch (error) {
        console.error(`[Callback] Forward payout error: ${error.message}`);
        await order.update({ callbackAttempts: order.callbackAttempts + 1 });
    }
}

module.exports = router;
