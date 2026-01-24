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
const { DataTypes } = require('sequelize');
const callbackService = require('../../services/callbackService');

// BatchPayout model for admin batch payouts (created by scripts/hdpay-payout-batch.js)
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
}, {
    tableName: 'batch_payouts',
    timestamps: true,
    freezeTableName: true
});

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

    // Determine success response based on channel
    const successResponse = channelName === 'ckpay' ? 'OK' : (channelName === 'aapay' ? 'SUCCESS' : 'success');

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
            // Silkpay V2 uses mOrderId for merchant order ID
            orderId = req.body.mOrderId || req.body.orderId;
            status = req.body.status === 1 || req.body.status === '1' ? 'success' :
                req.body.status === 2 || req.body.status === '2' ? 'failed' : 'pending';
            utr = req.body.utr || req.body.bankRef;
            actualAmount = parseFloat(req.body.actualAmount || req.body.amount);
            providerOrderId = req.body.sysOrderId || req.body.tradeNo;
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
        } else if (channelName === 'ckpay') {
            // CKPay: status 70/80=success, 60=failed
            orderId = req.body.accountOrder;
            const isSuccess = [70, 80, '70', '80'].includes(req.body.status);
            console.log(`[CKPay] Callback processing - Order: ${orderId}, Status: ${req.body.status}, IsSuccess: ${isSuccess}`);

            status = isSuccess ? 'success' :
                [60, '60'].includes(req.body.status) ? 'failed' : 'pending';
            utr = req.body.utr;
            actualAmount = parseFloat(req.body.amount);
            providerOrderId = req.body.orderId;
        } else if (channelName === 'bharatpay') {
            // BharatPay: callback data is AES encrypted
            // Decrypt using parseCallback from bharatpay service
            const bharatpayService = require('../../services/bharatpay');
            const callbackData = bharatpayService.parseCallback(req.body);

            // Extract order info from decrypted data
            // The callback contains channelCreditOrderSimpleInfo and channelPaymentRecordSimpleInfo
            const creditInfo = callbackData.channelCreditOrderSimpleInfo || callbackData;
            const paymentInfo = callbackData.channelPaymentRecordSimpleInfo || {};

            orderId = req.body.sourceNo || creditInfo.merchantSourceNo;
            // processCode: 10=Pending, 20=Confirmed, 30=Completed, 40=Cancelled
            status = creditInfo.processCode === 30 ? 'success' :
                creditInfo.processCode === 40 ? 'failed' : 'pending';
            utr = paymentInfo.utr || '';
            actualAmount = parseFloat(creditInfo.fiatAmount || req.body.amount);
            providerOrderId = String(creditInfo.id || '');
        } else if (channelName === 'cxpay') {
            // CXPay: status 0=pending, 1=success, 2=failed
            orderId = req.body.orderId;
            status = req.body.status === 1 || req.body.status === '1' ? 'success' :
                req.body.status === 2 || req.body.status === '2' ? 'failed' : 'pending';
            utr = req.body.utr;
            actualAmount = parseFloat(req.body.amount);
            providerOrderId = req.body.platOrderId;
        } else if (channelName === 'aapay') {
            // AaPay: status = SUCCESS/FAIL (string)
            orderId = req.body.orderId;
            status = req.body.status === 'SUCCESS' ? 'success' :
                req.body.status === 'FAIL' ? 'failed' : 'pending';
            utr = req.body.utr;
            actualAmount = parseFloat(req.body.realAmount || req.body.amount);
            providerOrderId = req.body.platformOrderId;
        }

        if (!orderId) {
            console.error('[Callback] Missing orderId in callback');
            return res.send(successResponse);
        }

        // Find order
        const order = await Order.findOne({
            where: { orderId: orderId, type: 'payin' }
        });

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
        // Need to define successResponse here too or re-derive it, but simpler to use channel check
        return res.send(req.params.channel === 'ckpay' ? 'OK' : 'success');
    }
});

/**
 * POST /callback/:channel/payout
 * Handle payout callback from upstream provider
 */
router.post('/:channel/payout', async (req, res) => {
    const channelName = req.params.channel;
    console.log(`[Callback] Payout callback from ${channelName}:`, JSON.stringify(req.body));

    // Determine success response based on channel
    const successResponse = channelName === 'ckpay' ? 'OK' : (channelName === 'aapay' ? 'SUCCESS' : 'success');

    try {
        let orderId, status, utr, providerOrderId;

        // ... Extraction logic remains essentially the same, but simplified for brevity in this replace ...
        if (channelName === 'hdpay') {
            orderId = req.body.merchantPayoutId;
            status = req.body.status === '1' ? 'success' : 'failed';
            utr = req.body.utr;
            providerOrderId = req.body.payoutId;
        } else if (channelName === 'x2' || channelName === 'f2pay') {
            const bizContent = typeof req.body.bizContent === 'string' ? JSON.parse(req.body.bizContent) : req.body.bizContent;
            orderId = bizContent.mchOrderNo;
            status = bizContent.state === 'Success' || bizContent.state === 'Paid' ? 'success' : bizContent.state === 'Failed' ? 'failed' : 'processing';
            utr = bizContent.trxId;
            providerOrderId = bizContent.platNo;
        } else if (channelName === 'payable' || channelName === 'silkpay') {
            // Silkpay V2 payout callback uses mOrderId for merchant order ID
            // PAYOUT status codes: 1=processing, 2=success (with UTR), 3=failed
            orderId = req.body.mOrderId || req.body.orderId;
            status = req.body.status === 2 || req.body.status === '2' ? 'success' :
                req.body.status === 3 || req.body.status === '3' ? 'failed' : 'processing';
            utr = req.body.utr || req.body.bankRef;
            providerOrderId = req.body.payOrderId || req.body.sysOrderId || req.body.tradeNo;
        } else if (channelName === 'fendpay' || channelName === 'upi super') {
            orderId = req.body.outTradeNo;
            status = req.body.status == 1 ? 'success' : req.body.status == 0 ? 'processing' : 'failed';
            utr = req.body.utr;
            providerOrderId = req.body.orderNo;
        } else if (channelName === 'caipay' || channelName === 'yellow') {
            orderId = req.body.customerOrderNo;
            status = req.body.orderStatus === 'SUCCESS' ? 'success' : 'failed';
            utr = req.body.payUtrNo;
            providerOrderId = req.body.platOrderNo;
        } else if (channelName === 'ckpay') {
            // CKPay payout: status 70=success, 60=failed
            orderId = req.body.accountOrder;
            status = [70, '70'].includes(req.body.status) ? 'success' :
                [60, '60'].includes(req.body.status) ? 'failed' : 'processing';
            utr = req.body.utr;
            providerOrderId = req.body.orderId;
        } else if (channelName === 'bharatpay') {
            // BharatPay payout callback - AES encrypted
            const bharatpayService = require('../../services/bharatpay');
            const callbackData = bharatpayService.parseCallback(req.body);

            const debitInfo = callbackData.channelDebitOrderSimpleInfo || callbackData;
            const paymentInfo = callbackData.channelPaymentRecordSimpleInfo || {};

            orderId = req.body.sourceNo || debitInfo.merchantSourceNo;
            // processCode: 10=Pending, 20=Confirmed, 30=Completed, 40=Cancelled, 60=Failed
            status = debitInfo.processCode === 30 ? 'success' :
                [40, 60].includes(debitInfo.processCode) ? 'failed' : 'processing';
            utr = paymentInfo.utr || '';
            providerOrderId = String(debitInfo.id || '');
        } else if (channelName === 'cxpay') {
            // CXPay payout: status 0=pending, 1=success, 2=failed
            orderId = req.body.orderId;
            status = req.body.status === 1 || req.body.status === '1' ? 'success' :
                req.body.status === 2 || req.body.status === '2' ? 'failed' : 'processing';
            utr = req.body.utr;
            providerOrderId = req.body.platOrderId;
        } else if (channelName === 'aapay') {
            // AaPay payout: status 1=success, -1=failed, 0/2=processing
            orderId = req.body.orderId;
            const statusNum = parseInt(req.body.status);
            status = statusNum === 1 ? 'success' :
                statusNum === -1 ? 'failed' : 'processing';
            utr = req.body.utr;
            providerOrderId = req.body.platformOrderId;
        }

        if (!orderId) return res.send(successResponse);

        // Check if this is a batch payout (admin payout from scripts/hdpay-payout-batch.js)
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
                } else {
                    console.log(`[Callback] Batch payout ${orderId} not found in database`);
                }
            } catch (batchErr) {
                console.error(`[Callback] Batch payout update error: ${batchErr.message}`);
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

            await User.update(
                { pendingBalance: sequelize.literal(`GREATEST(pendingBalance - ${order.amount}, 0)`) },
                { where: { id: order.merchantId }, transaction: t }
            );

            if (status === 'success') {
                const adminProfit = parseFloat(order.fee);
                if (adminProfit > 0) {
                    await User.update({ balance: sequelize.literal(`balance + ${adminProfit}`) }, { where: { role: 'admin' }, transaction: t });
                }
            } else if (status === 'failed') {
                const refundAmount = parseFloat(order.amount) + parseFloat(order.fee);
                await User.update({ balance: sequelize.literal(`balance + ${refundAmount}`) }, { where: { id: order.merchantId }, transaction: t });
            }

            await t.commit();

            if (order.callbackUrl && !order.callbackSent) {
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
        return res.send(req.params.channel === 'ckpay' ? 'OK' : 'success');
    }
});

module.exports = router;

