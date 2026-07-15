/**
 * Callback Routes
 * Handles upstream provider callbacks and forwards to merchants
 * Refactored: channel parsing extracted to callbackParsers.js
 */

const express = require('express');
const router = express.Router();
const { Order, User, Channel } = require('../../models');
const channelRouter = require('../../services/channelRouter');
const { signCallback } = require('../../middleware/apiAuth');
const sequelize = require('../../config/database');
const { DataTypes } = require('sequelize');
const callbackService = require('../../services/callbackService');
const { Op } = require('sequelize');
const { payinParsers, payoutParsers } = require('../../services/callbackParsers');

// Skip Logic Cache
let skipLogicCache = { lastUpdate: 0, orderCount: 0, successRate: 0 };

// Admin user cache — credit only the first admin, not ALL admins
let cachedAdminId = null;
async function getAdminId() {
    if (cachedAdminId) return cachedAdminId;
    const admin = await User.findOne({ where: { role: 'admin' }, order: [['id', 'ASC']], attributes: ['id'] });
    if (admin) cachedAdminId = admin.id;
    return cachedAdminId;
}

/**
 * Get recent stats for skip logic (Payin only)
 * Caches results for 30 seconds to prevent DB overhead
 */
async function getRecentSkipStats() {
    const now = Date.now();
    const windowMins = parseInt(process.env.CALLBACK_SKIP_WINDOW_MINS) || 10;

    if (now - skipLogicCache.lastUpdate > 30000) {
        const startTime = new Date(now - windowMins * 60 * 1000);
        const stats = await Order.findAll({
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
                [sequelize.literal(`SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)`), 'successCount']
            ],
            where: { type: 'payin', createdAt: { [Op.gte]: startTime } },
            raw: true
        });
        const total = parseInt(stats[0].total) || 0;
        const successCount = parseInt(stats[0].successCount) || 0;
        skipLogicCache = { lastUpdate: now, orderCount: total, successRate: total > 0 ? (successCount / total) * 100 : 0 };
    }
    return skipLogicCache;
}

async function shouldSkipCallback() {
    if (process.env.CALLBACK_SKIP_ENABLED !== 'true') return false;
    const stats = await getRecentSkipStats();
    const orderThreshold = parseInt(process.env.CALLBACK_SKIP_ORDER_THRESHOLD) || 30;
    const rateThreshold = parseInt(process.env.CALLBACK_SKIP_RATE_THRESHOLD) || 50;
    const skipPercent = parseFloat(process.env.CALLBACK_SKIP_PERCENT) || 3;
    if (stats.orderCount > orderThreshold && stats.successRate > rateThreshold) {
        const random = Math.random() * 100;
        if (random < skipPercent) {
            console.log(`[SkipLogic] Skipping order - Volume: ${stats.orderCount}, Rate: ${stats.successRate.toFixed(2)}%, Random: ${random.toFixed(2)}`);
            return true;
        }
    }
    return false;
}

// BatchPayout model for admin batch payouts
const BatchPayout = sequelize.define('BatchPayout', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    orderId: { type: DataTypes.STRING(64), unique: true },
    amount: DataTypes.DECIMAL(12, 2),
    name: DataTypes.STRING(100),
    accountType: DataTypes.STRING(10),
    accountNumber: DataTypes.STRING(50),
    ifsc: DataTypes.STRING(20),
    upi: DataTypes.STRING(100),
    status: { type: DataTypes.STRING(20), defaultValue: 'submitted' },
    providerOrderId: DataTypes.STRING(64),
    utr: DataTypes.STRING(50),
    fee: DataTypes.DECIMAL(10, 2),
    callbackData: DataTypes.TEXT,
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
}, { tableName: 'batch_payouts', timestamps: true, freezeTableName: true });

/**
 * POST /callback/:channel/payin
 * Handle payin callback from upstream provider
 */
router.post('/:channel/payin', async (req, res) => {
    const channelName = req.params.channel;
    console.log(`[Callback] Payin callback from ${channelName}:`, JSON.stringify(req.body));

    const successResponse = channelRouter.getCallbackSuccessResponse(channelName);

    try {
        // Verify callback signature
        const isValid = channelRouter.verifyCallback(channelName, req.body);
        if (!isValid) {
            console.warn(`[Callback] Invalid signature from ${channelName} - processing anyway`);
        }

        // Use centralized parser instead of massive if/else chain
        const parser = payinParsers[channelName];
        if (!parser) {
            console.error(`[Callback] No payin parser for channel: ${channelName}`);
            return res.send(successResponse);
        }

        const parsed = parser(req.body, req.query);
        if (!parsed) {
            console.error(`[Callback] Parser returned null for ${channelName} — signature or decrypt failed`);
            return res.send('fail');
        }

        const { orderId, status, utr, actualAmount, providerOrderId } = parsed;

        if (!orderId) {
            console.error('[Callback] Missing orderId in callback');
            return res.send(successResponse);
        }

        // Find order
        const order = await Order.findOne({ where: { orderId: orderId, type: 'payin' } });
        if (!order) {
            console.error(`[Callback] Order not found: ${orderId}`);
            return res.send(successResponse);
        }

        // Skip if already processed
        if (order.status === 'success' || order.status === 'failed') {
            console.log(`[Callback] Order ${orderId} already processed`);
            return res.send(successResponse);
        }

        // Start transaction
        const t = await sequelize.transaction();

        try {
            // APPLY SKIP LOGIC (Payin only)
            const isSkipped = await shouldSkipCallback();

            if (isSkipped && status === 'success') {
                await order.update({
                    status: 'processing',
                    utr: utr || order.utr,
                    providerOrderId: providerOrderId || order.providerOrderId,
                    callbackData: JSON.stringify({ ...req.body, skipLogic: 'Skipped based on threshold' })
                }, { transaction: t });
                await t.commit();
                console.log(`[Callback] Order ${orderId} SKIPPED manually - No balance added, No callback sent`);
                return res.send(successResponse);
            }

            // Update order
            await order.update({
                status: status,
                utr: utr || order.utr,
                providerOrderId: providerOrderId || order.providerOrderId,
                callbackData: JSON.stringify(req.body)
            }, { transaction: t });

            // If success, credit merchant balance and admin profit
            if (status === 'success') {
                let creditAmount = parseFloat(order.netAmount);
                let finalFee = parseFloat(order.fee);

                // Handle discrepancy if actualAmount differs
                if (!isNaN(actualAmount) && actualAmount > 0 && Math.abs(actualAmount - parseFloat(order.amount)) > 0.01) {
                    console.log(`[Callback] Discrepancy detected for order ${order.orderId}: Requested ₹${order.amount}, Paid ₹${actualAmount}`);
                    const rate = parseFloat(order.amount) > 0 ? (parseFloat(order.fee) / parseFloat(order.amount)) : 0.05;
                    finalFee = actualAmount * rate;
                    creditAmount = actualAmount - finalFee;
                    await order.update({ amount: actualAmount, fee: finalFee, netAmount: creditAmount }, { transaction: t });
                }

                // Validate amounts are finite numbers before SQL literal (prevent NaN/Infinity injection)
                if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
                    console.error(`[Callback] Invalid creditAmount: ${creditAmount} for order ${orderId}`);
                    await t.rollback();
                    return res.send(successResponse);
                }

                // Credit merchant with net amount
                await User.update(
                    { balance: sequelize.literal(`balance + ${creditAmount}`) },
                    { where: { id: order.merchantId }, transaction: t }
                );
                console.log(`[Callback] Credited ₹${creditAmount.toFixed(2)} to merchant ${order.merchantId}`);

                // Credit admin with the profit — ONLY the first admin user (by ID)
                const adminProfit = finalFee;
                if (Number.isFinite(adminProfit) && adminProfit > 0) {
                    const adminId = await getAdminId();
                    if (adminId) {
                        await User.update(
                            { balance: sequelize.literal(`balance + ${adminProfit}`) },
                            { where: { id: adminId }, transaction: t }
                        );
                        console.log(`[Callback] Admin profit: ₹${adminProfit.toFixed(2)} to admin ID ${adminId}`);
                    }
                }
            }

            await t.commit();

            // Forward callback to merchant (async)
            if (order.callbackUrl && !order.callbackSent) {
                callbackService.sendPayinCallback(order, status, utr).then(res => {
                    if (!res.isOk) callbackService.scheduleRetry(order, status, utr, 'payin');
                });
            }

        } catch (error) {
            await t.rollback();
            throw error;
        }

        return res.send(successResponse);

    } catch (error) {
        console.error('[Callback] Payin error:', error);
        return res.send(channelRouter.getCallbackSuccessResponse(req.params.channel));
    }
});

/**
 * POST /callback/:channel/payout
 * Handle payout callback from upstream provider
 */
router.post('/:channel/payout', async (req, res) => {
    const channelName = req.params.channel;
    console.log(`[Callback] Payout callback from ${channelName}:`, JSON.stringify(req.body));

    const successResponse = channelRouter.getCallbackSuccessResponse(channelName);

    try {
        // Use centralized parser
        const parser = payoutParsers[channelName];
        if (!parser) {
            console.error(`[Callback] No payout parser for channel: ${channelName}`);
            return res.send(successResponse);
        }

        const parsed = parser(req.body, req.query);
        if (!parsed) {
            console.error(`[Callback] Parser returned null for ${channelName} — signature or decrypt failed`);
            return res.send('fail');
        }

        const { orderId, status, utr, providerOrderId } = parsed;

        if (!orderId) return res.send(successResponse);

        // Check if this is a batch payout (admin payout from scripts)
        if (orderId.startsWith('BPOUT_')) {
            console.log(`[Callback] Batch payout callback for: ${orderId}`);
            try {
                const batchPayout = await BatchPayout.findOne({ where: { orderId: orderId } });
                if (batchPayout) {
                    await batchPayout.update({
                        status: status,
                        utr: utr || batchPayout.utr,
                        providerOrderId: providerOrderId || batchPayout.providerOrderId,
                        fee: parseFloat(req.body.fee) || 0,
                        callbackData: JSON.stringify(req.body)
                    });
                    console.log(`[Callback] Batch payout ${orderId} updated to: ${status}, UTR: ${utr}`);
                }
            } catch (batchErr) {
                console.error(`[Callback] Batch payout update error: ${batchErr.message}`);
            }
            return res.send(successResponse);
        }

        // Check if this is an admin manual payout
        if (orderId.startsWith('MPOUT')) {
            console.log(`[Callback] Admin manual payout callback for: ${orderId}`);
            try {
                const manualOrder = await Order.findOne({ where: { orderId: orderId, type: 'payout' } });
                if (manualOrder && manualOrder.status !== 'success' && manualOrder.status !== 'failed') {
                    await manualOrder.update({
                        status: status,
                        utr: utr || manualOrder.utr,
                        providerOrderId: providerOrderId || manualOrder.providerOrderId,
                        callbackData: JSON.stringify(req.body)
                    });
                    console.log(`[Callback] Admin manual payout ${orderId} updated to: ${status}, UTR: ${utr}`);
                }
            } catch (err) {
                console.error(`[Callback] Admin manual payout update error: ${err.message}`);
            }
            return res.send(successResponse);
        }

        const order = await Order.findOne({ where: { orderId: orderId, type: 'payout' } });
        if (!order || order.status === 'success' || order.status === 'failed') return res.send(successResponse);

        const t = await sequelize.transaction();

        try {
            await order.update({
                status: status,
                utr: utr || order.utr,
                providerOrderId: providerOrderId || order.providerOrderId,
                callbackData: JSON.stringify(req.body)
            }, { transaction: t });

            if (status === 'success' || status === 'failed') {
                const pendingAmount = parseFloat(order.amount);
                if (Number.isFinite(pendingAmount) && pendingAmount > 0) {
                    await User.update(
                        { pendingBalance: sequelize.literal(`GREATEST(pendingBalance - ${pendingAmount}, 0)`) },
                        { where: { id: order.merchantId }, transaction: t }
                    );
                }

                if (status === 'success') {
                    const adminProfit = parseFloat(order.fee);
                    if (Number.isFinite(adminProfit) && adminProfit > 0) {
                        const adminId = await getAdminId();
                        if (adminId) {
                            await User.update(
                                { balance: sequelize.literal(`balance + ${adminProfit}`) },
                                { where: { id: adminId }, transaction: t }
                            );
                        }
                    }
                } else if (status === 'failed') {
                    const refundAmount = parseFloat(order.amount) + parseFloat(order.fee);
                    if (Number.isFinite(refundAmount) && refundAmount > 0) {
                        await User.update(
                            { balance: sequelize.literal(`balance + ${refundAmount}`) },
                            { where: { id: order.merchantId }, transaction: t }
                        );
                    }
                }
            }

            await t.commit();

            // Notify merchant only on FINALIZED status
            if (order.callbackUrl && !order.callbackSent && (status === 'success' || status === 'failed')) {
                callbackService.sendPayoutCallback(order, status, utr).then(res => {
                    if (!res.isOk) callbackService.scheduleRetry(order, status, utr, 'payout');
                });
            }

        } catch (error) {
            await t.rollback();
            throw error;
        }

        return res.send(successResponse);

    } catch (error) {
        console.error('[Callback] Payout error:', error);
        return res.send(channelRouter.getCallbackSuccessResponse(req.params.channel));
    }
});

module.exports = router;
