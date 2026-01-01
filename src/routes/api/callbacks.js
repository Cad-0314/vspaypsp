/**
 * Callback Routes
 * Handles upstream provider callbacks and forwards to merchants
 * Format matches ourapi.txt specification exactly
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { Order, User, Channel } = require('../../models');
const channelRouter = require('../../services/channelRouter');
const { signCallback } = require('../../middleware/apiAuth');
const sequelize = require('../../config/database');

// Retry configuration
const MAX_CALLBACK_RETRIES = 5;
const RETRY_DELAYS = [0, 30000, 60000, 300000, 600000]; // 0s, 30s, 1m, 5m, 10m

/**
 * POST /callback/:channel/payin
 * Handle payin callback from upstream provider
 */
router.post('/:channel/payin', async (req, res) => {
    const channelName = req.params.channel;
    console.log(`[Callback] Payin callback from ${channelName}:`, JSON.stringify(req.body));

    try {
        // Verify callback signature (optional - some providers have issues)
        const isValid = channelRouter.verifyCallback(channelName, req.body);
        if (!isValid) {
            console.warn(`[Callback] Invalid signature from ${channelName} - processing anyway`);
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
        } else if (channelName === 'fendpay' || channelName === 'upi super') {
            // FendPay: status 1 = success
            orderId = req.body.outTradeNo;
            status = req.body.status === '1' || req.body.status === 1 ? 'success' : 'failed';
            utr = req.body.utr;
            actualAmount = parseFloat(req.body.amount);
            providerOrderId = req.body.orderNo;
        } else if (channelName === 'caipay' || channelName === 'yellow') {
            // CaiPay: orderStatus "SUCCESS"
            orderId = req.body.customerOrderNo;
            status = req.body.orderStatus === 'SUCCESS' ? 'success' : 'failed';
            utr = req.body.payUtrNo;
            actualAmount = parseFloat(req.body.orderAmount);
            providerOrderId = req.body.platOrderNo;
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

            // If success, credit merchant balance and admin profit
            if (status === 'success') {
                let creditAmount = parseFloat(order.netAmount);
                let finalFee = parseFloat(order.fee);

                // Handle discrepancy if actualAmount is provided and significantly different
                if (!isNaN(actualAmount) && actualAmount > 0 && Math.abs(actualAmount - parseFloat(order.amount)) > 0.01) {
                    console.log(`[Callback] Discrepancy detected for order ${order.orderId}: Requested ₹${order.amount}, Paid ₹${actualAmount}`);

                    // Recalculate fee based on the actual amount paid using the same rate
                    const rate = parseFloat(order.amount) > 0 ? (parseFloat(order.fee) / parseFloat(order.amount)) : 0.05;
                    finalFee = actualAmount * rate;
                    creditAmount = actualAmount - finalFee;

                    // Update order with actual values
                    await order.update({
                        amount: actualAmount,
                        fee: finalFee,
                        netAmount: creditAmount
                    }, { transaction: t });
                }

                // Credit merchant with net amount
                await User.update(
                    { balance: sequelize.literal(`balance + ${creditAmount}`) },
                    { where: { id: order.merchantId }, transaction: t }
                );
                console.log(`[Callback] Credited ₹${creditAmount.toFixed(2)} to merchant ${order.merchantId} (Actual Paid: ₹${actualAmount || order.amount})`);

                // Credit admin with the profit (our fee is our profit for payin)
                const adminProfit = finalFee;
                if (adminProfit > 0) {
                    await User.update(
                        { balance: sequelize.literal(`balance + ${adminProfit}`) },
                        { where: { role: 'admin' }, transaction: t }
                    );
                    console.log(`[Callback] Admin profit: ₹${adminProfit.toFixed(2)}`);
                }
            }

            await t.commit();

            // Forward callback to merchant (async, don't wait)
            if (order.callbackUrl && !order.callbackSent) {
                forwardPayinCallback(order, status, utr);
            }

        } catch (error) {
            await t.rollback();
            throw error;
        }

        // Return success to upstream provider
        return res.send('success');

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
        } else if (channelName === 'fendpay' || channelName === 'upi super') {
            // FendPay Payout: status 1 = success, 0 = processing
            orderId = req.body.outTradeNo;
            status = req.body.status === '1' || req.body.status === 1 ? 'success' :
                req.body.status === '0' || req.body.status === 0 ? 'processing' : 'failed';
            utr = req.body.utr;
            providerOrderId = req.body.orderNo;
        } else if (channelName === 'caipay' || channelName === 'yellow') {
            // CaiPay Payout: orderStatus "SUCCESS"
            orderId = req.body.customerOrderNo;
            status = req.body.orderStatus === 'SUCCESS' ? 'success' : 'failed';
            utr = req.body.payUtrNo;
            providerOrderId = req.body.platOrderNo;
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
                { pendingBalance: sequelize.literal(`GREATEST(pendingBalance - ${order.amount}, 0)`) },
                { where: { id: order.merchantId }, transaction: t }
            );

            if (status === 'success') {
                // Payout successful - admin keeps the fee (already deducted from merchant)
                const adminProfit = parseFloat(order.fee);
                if (adminProfit > 0) {
                    await User.update(
                        { balance: sequelize.literal(`balance + ${adminProfit}`) },
                        { where: { role: 'admin' }, transaction: t }
                    );
                    console.log(`[Callback] Admin payout profit: ₹${adminProfit}`);
                }
            } else if (status === 'failed') {
                // Refund full amount + fee to merchant
                const refundAmount = parseFloat(order.amount) + parseFloat(order.fee);
                await User.update(
                    { balance: sequelize.literal(`balance + ${refundAmount}`) },
                    { where: { id: order.merchantId }, transaction: t }
                );
                console.log(`[Callback] Refunded ₹${refundAmount} to merchant ${order.merchantId}`);
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
 * Format exactly matches ourapi.txt Pay-In Callback specification:
 * { status, amount, orderAmount, orderId, id, utr, param, sign }
 */
async function forwardPayinCallback(order, status, utr) {
    try {
        const merchant = await User.findByPk(order.merchantId);
        if (!merchant || !order.callbackUrl) return;

        // Build callback data exactly as per ourapi.txt
        const callbackData = {
            status: status === 'success' ? 1 : 0,
            amount: parseFloat(parseFloat(order.netAmount).toFixed(2)),
            orderAmount: parseFloat(parseFloat(order.amount).toFixed(2)),
            orderId: order.orderId,
            id: order.id,
            utr: utr || '',
            param: order.param || ''
        };

        // Add MD5 signature
        callbackData.sign = signCallback(callbackData, merchant.apiSecret);

        console.log(`[Callback] Forwarding payin to merchant: ${order.callbackUrl}`);
        console.log(`[Callback] Data:`, JSON.stringify(callbackData));

        const response = await axios.post(order.callbackUrl, callbackData, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
        });

        const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

        // Check for OK response (case insensitive)
        if (responseText.toUpperCase().includes('OK')) {
            await order.update({ callbackSent: true, callbackAttempts: order.callbackAttempts + 1 });
            console.log(`[Callback] Merchant acknowledged: ${order.orderId}`);
        } else {
            await order.update({ callbackAttempts: order.callbackAttempts + 1 });
            console.log(`[Callback] Merchant response was not OK: ${responseText}`);
            // Schedule retry if needed
            scheduleRetry(order, status, utr, 'payin');
        }
    } catch (error) {
        console.error(`[Callback] Forward payin error: ${error.message}`);
        await order.update({ callbackAttempts: order.callbackAttempts + 1 });
        // Schedule retry
        scheduleRetry(order, status, utr, 'payin');
    }
}

/**
 * Forward payout callback to merchant  
 * Format exactly matches ourapi.txt Payout Callback specification:
 * { status, amount, orderId, id, utr, message, param, sign }
 */
async function forwardPayoutCallback(order, status, utr) {
    try {
        const merchant = await User.findByPk(order.merchantId);
        if (!merchant || !order.callbackUrl) return;

        // Build callback data exactly as per ourapi.txt
        const callbackData = {
            status: status === 'success' ? 1 : 0,
            amount: parseFloat(parseFloat(order.amount).toFixed(2)),
            orderId: order.orderId,
            id: order.id,
            utr: utr || '',
            message: status === 'success' ? 'success' : 'failed',
            param: order.param || ''
        };

        // Add MD5 signature
        callbackData.sign = signCallback(callbackData, merchant.apiSecret);

        console.log(`[Callback] Forwarding payout to merchant: ${order.callbackUrl}`);
        console.log(`[Callback] Data:`, JSON.stringify(callbackData));

        const response = await axios.post(order.callbackUrl, callbackData, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
        });

        const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

        if (responseText.toUpperCase().includes('OK')) {
            await order.update({ callbackSent: true, callbackAttempts: order.callbackAttempts + 1 });
            console.log(`[Callback] Merchant acknowledged payout: ${order.orderId}`);
        } else {
            await order.update({ callbackAttempts: order.callbackAttempts + 1 });
            scheduleRetry(order, status, utr, 'payout');
        }
    } catch (error) {
        console.error(`[Callback] Forward payout error: ${error.message}`);
        await order.update({ callbackAttempts: order.callbackAttempts + 1 });
        scheduleRetry(order, status, utr, 'payout');
    }
}

/**
 * Schedule callback retry
 */
function scheduleRetry(order, status, utr, type) {
    const attempts = order.callbackAttempts + 1;

    if (attempts >= MAX_CALLBACK_RETRIES) {
        console.log(`[Callback] Max retries reached for order ${order.orderId}`);
        return;
    }

    const delay = RETRY_DELAYS[attempts] || 600000;
    console.log(`[Callback] Scheduling retry ${attempts}/${MAX_CALLBACK_RETRIES} in ${delay / 1000}s for ${order.orderId}`);

    setTimeout(async () => {
        // Reload order to check current state
        const freshOrder = await Order.findByPk(order.id);
        if (freshOrder && !freshOrder.callbackSent) {
            if (type === 'payin') {
                forwardPayinCallback(freshOrder, status, utr);
            } else {
                forwardPayoutCallback(freshOrder, status, utr);
            }
        }
    }, delay);
}

module.exports = router;
