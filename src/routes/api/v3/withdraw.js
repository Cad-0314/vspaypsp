/**
 * V3 Withdraw API Routes
 * POST /v3/withdraw/bank  - Bank transfer withdrawal
 * POST /v3/withdraw/query - Query withdrawal status
 */

const express = require('express');
const router = express.Router();
const { validateMerchant } = require('../../../middleware/apiAuth');
const channelRouter = require('../../../services/channelRouter');
const callbackService = require('../../../services/callbackService');
const { Order, Channel, User } = require('../../../models');
const { v4: uuidv4 } = require('uuid');
const sequelize = require('../../../config/database');

const APP_URL = process.env.APP_URL || 'https://gaurpay.site';

function envelope(ok, msg, data = null) {
    const r = { status: ok ? 'success' : 'error', message: msg, ts: new Date().toISOString() };
    if (data) r.data = data;
    return r;
}

/**
 * POST /v3/withdraw/bank
 */
router.post('/bank', validateMerchant, async (req, res) => {
    try {
        const { ref_id, txn_amount, bank_account, bank_code, payee_name, webhook_url, metadata } = req.body;
        const merchant = req.merchant;

        const channelName = merchant.payoutChannel || merchant.assignedChannel || 'aapay';
        const isTestChannel = channelName === 'testpay';

        // For real channels, reject if payout is suspended
        if (merchant.canPayout === false && !isTestChannel) {
            return res.json(envelope(false, 'Payout is currently suspended for this merchant'));
        }

        const isSpecialSuccess = isTestChannel && bank_account === '1111';
        const isSpecialFail = isTestChannel && bank_account === '2222';
        const isSpecial = isSpecialSuccess || isSpecialFail;
        const isFakePayout = isTestChannel && merchant.canPayout === false;

        if (!ref_id || !txn_amount || !bank_account || !bank_code || !payee_name) {
            return res.json(envelope(false, 'Missing required fields: ref_id, txn_amount, bank_account, bank_code, payee_name'));
        }

        const amount = parseFloat(txn_amount);
        if (isNaN(amount) || amount < 100) {
            return res.json(envelope(false, 'Invalid txn_amount. Minimum is 100'));
        }

        // Duplicate check
        const existing = await Order.findOne({ where: { merchantId: merchant.id, orderId: ref_id } });
        if (existing) return res.json(envelope(false, 'Duplicate ref_id'));

        // Channel rates
        const channel = await Channel.findOne({ where: { name: channelName, isActive: true } });

        let customRates = {};
        try { customRates = JSON.parse(merchant.channel_rates || '{}'); } catch (e) {}

        const payoutRate = customRates.payoutRate || (channel ? parseFloat(channel.payoutRate) : 3.0);
        const fixedFee = customRates.payoutFixedFee || (channel ? parseFloat(channel.payoutFixedFee) : 6.0);
        const percentFee = (amount * payoutRate) / 100;
        const totalFee = percentFee + fixedFee;
        const totalDeduction = amount + totalFee;

        // Balance check
        const currentBalance = parseFloat(merchant.balance) || 0;
        if (!isSpecial && currentBalance < totalDeduction) {
            return res.json(envelope(false, `Insufficient balance. Need ₹${totalDeduction.toFixed(2)}, have ₹${currentBalance.toFixed(2)}`));
        }

        const t = await sequelize.transaction();

        try {
            if (!isSpecial) {
                await User.update({
                    balance: sequelize.literal(`balance - ${totalDeduction}`),
                    pendingBalance: sequelize.literal(`pendingBalance + ${amount}`)
                }, { where: { id: merchant.id }, transaction: t });
            }

            const internalId = uuidv4();
            const useDelayed = isFakePayout;
            let autoSuccessAt = null;
            let initialStatus = 'processing';

            if (useDelayed) {
                const delay = Math.floor(Math.random() * (80 - 20 + 1)) + 20;
                autoSuccessAt = new Date(Date.now() + delay * 60 * 1000);
                console.log(`[V3 Withdraw] Auto-success for ${ref_id} in ${delay} mins`);
            } else if (isSpecialSuccess) {
                initialStatus = 'success';
            } else if (isSpecialFail) {
                initialStatus = 'failed';
            }

            const orderData = {
                id: internalId,
                merchantId: merchant.id,
                orderId: ref_id,
                channelName,
                type: 'payout',
                payoutType: 'bank',
                amount,
                fee: totalFee,
                netAmount: amount,
                status: initialStatus,
                callbackUrl: webhook_url || merchant.callbackUrl,
                param: metadata,
                autoSuccessAt,
                payoutDetails: { account: bank_account, ifsc: bank_code, personName: payee_name }
            };

            if (isSpecialSuccess) {
                orderData.utr = Math.floor(100000000000 + Math.random() * 900000000000).toString();
                orderData.providerOrderId = `FAKE_${uuidv4().substring(0, 8)}`;
            } else if (isSpecialFail) {
                orderData.providerOrderId = `FAIL_${uuidv4().substring(0, 8)}`;
            }

            const order = await Order.create(orderData, { transaction: t });

            if (!useDelayed && !isSpecial) {
                const notifyUrl = `${APP_URL}/callback/${channelName}/payout`;
                const result = await channelRouter.createPayout(channelName, {
                    orderId: ref_id,
                    amount,
                    accountNo: bank_account,
                    ifsc: bank_code,
                    name: payee_name,
                    notifyUrl
                });

                if (!result.success) {
                    await t.rollback();
                    return res.json(envelope(false, result.error || 'Channel error'));
                }

                await order.update({
                    providerOrderId: result.providerOrderId,
                    providerResponse: JSON.stringify(result)
                }, { transaction: t });
            }

            await t.commit();

            if (isSpecial) {
                setTimeout(() => {
                    callbackService.manualCallback(order.id).catch(console.error);
                }, 1000);
            }

            return res.json(envelope(true, 'Withdrawal submitted', {
                ref_id,
                trace_id: internalId,
                txn_amount: amount,
                service_fee: parseFloat(totalFee.toFixed(2)),
                state: initialStatus,
                txn_ref: isSpecialSuccess ? orderData.utr : undefined
            }));

        } catch (err) {
            await t.rollback();
            throw err;
        }

    } catch (error) {
        console.error('[V3 Withdraw Bank] Error:', error);
        return res.status(500).json(envelope(false, 'Internal server error'));
    }
});

/**
 * POST /v3/withdraw/upi
 */
router.post('/upi', validateMerchant, async (req, res) => {
    try {
        const { ref_id, txn_amount, upi_id, payee_name, webhook_url, metadata } = req.body;
        const merchant = req.merchant;

        const channelName = merchant.payoutChannel || merchant.assignedChannel || 'aapay';
        const isTestChannel = channelName === 'testpay';

        // For real channels, reject if payout is suspended
        if (merchant.canPayout === false && !isTestChannel) {
            return res.json(envelope(false, 'Payout is currently suspended for this merchant'));
        }

        const isSpecialSuccess = isTestChannel && upi_id === 'success@upi';
        const isSpecialFail = isTestChannel && upi_id === 'failed@upi';
        const isSpecial = isSpecialSuccess || isSpecialFail;
        const isFakePayout = isTestChannel && merchant.canPayout === false;

        if (!ref_id || !txn_amount || !upi_id || !payee_name) {
            return res.json(envelope(false, 'Missing required fields: ref_id, txn_amount, upi_id, payee_name'));
        }

        const amount = parseFloat(txn_amount);
        if (isNaN(amount) || amount < 100) {
            return res.json(envelope(false, 'Invalid txn_amount. Minimum is 100'));
        }

        // Duplicate check
        const existing = await Order.findOne({ where: { merchantId: merchant.id, orderId: ref_id } });
        if (existing) return res.json(envelope(false, 'Duplicate ref_id'));

        // Channel rates
        const channel = await Channel.findOne({ where: { name: channelName, isActive: true } });

        let customRates = {};
        try { customRates = JSON.parse(merchant.channel_rates || '{}'); } catch (e) {}

        const payoutRate = customRates.payoutRate || (channel ? parseFloat(channel.payoutRate) : 3.0);
        const fixedFee = customRates.payoutFixedFee || (channel ? parseFloat(channel.payoutFixedFee) : 6.0);
        const percentFee = (amount * payoutRate) / 100;
        const totalFee = percentFee + fixedFee;
        const totalDeduction = amount + totalFee;

        // Balance check
        const currentBalance = parseFloat(merchant.balance) || 0;
        if (!isSpecial && currentBalance < totalDeduction) {
            return res.json(envelope(false, `Insufficient balance. Need ₹${totalDeduction.toFixed(2)}, have ₹${currentBalance.toFixed(2)}`));
        }

        const t = await sequelize.transaction();

        try {
            if (!isSpecial) {
                await User.update({
                    balance: sequelize.literal(`balance - ${totalDeduction}`),
                    pendingBalance: sequelize.literal(`pendingBalance + ${amount}`)
                }, { where: { id: merchant.id }, transaction: t });
            }

            const internalId = uuidv4();
            const useDelayed = isFakePayout;
            let autoSuccessAt = null;
            let initialStatus = 'processing';

            if (useDelayed) {
                const delay = Math.floor(Math.random() * (80 - 20 + 1)) + 20;
                autoSuccessAt = new Date(Date.now() + delay * 60 * 1000);
                console.log(`[V3 Withdraw] Auto-success for ${ref_id} in ${delay} mins`);
            } else if (isSpecialSuccess) {
                initialStatus = 'success';
            } else if (isSpecialFail) {
                initialStatus = 'failed';
            }

            const orderData = {
                id: internalId,
                merchantId: merchant.id,
                orderId: ref_id,
                channelName,
                type: 'payout',
                payoutType: 'upi',
                amount,
                fee: totalFee,
                netAmount: amount,
                status: initialStatus,
                callbackUrl: webhook_url || merchant.callbackUrl,
                param: metadata,
                autoSuccessAt,
                payoutDetails: { account: upi_id, ifsc: 'UPI', personName: payee_name }
            };

            if (isSpecialSuccess) {
                orderData.utr = Math.floor(100000000000 + Math.random() * 900000000000).toString();
                orderData.providerOrderId = `FAKE_${uuidv4().substring(0, 8)}`;
            } else if (isSpecialFail) {
                orderData.providerOrderId = `FAIL_${uuidv4().substring(0, 8)}`;
            }

            const order = await Order.create(orderData, { transaction: t });

            if (!useDelayed && !isSpecial) {
                const notifyUrl = `${APP_URL}/callback/${channelName}/payout`;
                const result = await channelRouter.createPayout(channelName, {
                    orderId: ref_id,
                    amount,
                    accountNo: upi_id,
                    ifsc: '', // Use empty or 'UPI' based on provider
                    upi: upi_id,
                    name: payee_name,
                    notifyUrl
                });

                if (!result.success) {
                    await t.rollback();
                    return res.json(envelope(false, result.error || 'Channel error'));
                }

                await order.update({
                    providerOrderId: result.providerOrderId,
                    providerResponse: JSON.stringify(result)
                }, { transaction: t });
            }

            await t.commit();

            if (isSpecial) {
                setTimeout(() => {
                    callbackService.manualCallback(order.id).catch(console.error);
                }, 1000);
            }

            return res.json(envelope(true, 'Withdrawal submitted', {
                ref_id,
                trace_id: internalId,
                txn_amount: amount,
                service_fee: parseFloat(totalFee.toFixed(2)),
                state: initialStatus,
                txn_ref: isSpecialSuccess ? orderData.utr : undefined
            }));

        } catch (err) {
            await t.rollback();
            throw err;
        }

    } catch (error) {
        console.error('[V3 Withdraw UPI] Error:', error);
        return res.status(500).json(envelope(false, 'Internal server error'));
    }
});

/**
 * POST /v3/withdraw/query
 */
router.post('/query', validateMerchant, async (req, res) => {
    try {
        const { ref_id } = req.body;
        const merchant = req.merchant;

        if (!ref_id) return res.json(envelope(false, 'Missing ref_id'));

        const order = await Order.findOne({
            where: { merchantId: merchant.id, orderId: ref_id, type: 'payout' }
        });

        if (!order) return res.json(envelope(false, 'Order not found'));

        // Upstream sync
        if (order.status === 'processing' || order.status === 'pending' || (order.status === 'success' && !order.utr)) {
            try {
                const ch = order.actualChannel || order.channelName;
                if (ch) {
                    const qr = await channelRouter.queryPayout(ch, order.orderId);
                    if (qr.success) {
                        const upd = {};
                        let changed = false;
                        if (qr.status && qr.status !== order.status && (order.status === 'processing' || order.status === 'pending')) {
                            upd.status = qr.status; changed = true;
                        }
                        if (qr.utr && qr.utr !== 'None' && qr.utr !== order.utr) {
                            upd.utr = qr.utr; changed = true;
                        }
                        if (changed) {
                            await order.update(upd);
                            await order.reload();
                            if (order.callbackUrl && (upd.status === 'success' || upd.status === 'failed' || upd.utr)) {
                                callbackService.sendPayoutCallback(order, order.status, order.utr).then(r => {
                                    if (!r.isOk) callbackService.scheduleRetry(order, order.status, order.utr, 'payout');
                                });
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('[V3 Withdraw Query Sync]', err.message);
            }
        }

        return res.json(envelope(true, 'Withdrawal status retrieved', {
            ref_id: order.orderId,
            trace_id: order.id,
            type: order.payoutType || 'bank',
            state: order.status,
            txn_amount: parseFloat(order.amount),
            service_fee: parseFloat(order.fee),
            txn_ref: order.utr || undefined,
            created_at: order.createdAt.toISOString()
        }));

    } catch (error) {
        console.error('[V3 Withdraw Query] Error:', error);
        return res.status(500).json(envelope(false, 'Internal server error'));
    }
});

module.exports = router;
