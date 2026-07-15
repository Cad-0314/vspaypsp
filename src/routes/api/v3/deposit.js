/**
 * V3 Deposit API Routes
 * POST /v3/deposit/create     - Create deposit order
 * POST /v3/deposit/query      - Query deposit status
 * POST /v3/deposit/submit-ref - Submit transaction reference
 * POST /v3/deposit/check-ref  - Check reference status
 */

const express = require('express');
const router = express.Router();
const { validateMerchant } = require('../../../middleware/apiAuth');
const channelRouter = require('../../../services/channelRouter');
const callbackService = require('../../../services/callbackService');
const { Order, Channel, User } = require('../../../models');
const { v4: uuidv4 } = require('uuid');

const APP_URL = process.env.APP_URL || 'https://gaurpay.site';

// Standard response envelope
function envelope(ok, msg, data = null) {
    const r = { status: ok ? 'success' : 'error', message: msg, ts: new Date().toISOString() };
    if (data) r.data = data;
    return r;
}

/**
 * POST /v3/deposit/create
 */
router.post('/create', validateMerchant, async (req, res) => {
    try {
        const {
            ref_id,
            txn_amount,
            webhook_url,
            return_url,
            payer_name,
            payer_phone,
            payer_email,
            metadata,
            channel_code
        } = req.body;
        const merchant = req.merchant;

        if (merchant.canPayin === false) {
            return res.json(envelope(false, 'Deposit service suspended for this account'));
        }

        if (!ref_id || !txn_amount || !webhook_url) {
            return res.json(envelope(false, 'Missing required fields: ref_id, txn_amount, webhook_url'));
        }

        const amount = parseFloat(txn_amount);
        if (isNaN(amount) || amount < 100) {
            return res.json(envelope(false, 'Invalid txn_amount. Minimum is 100'));
        }

        const channelName = merchant.payinChannel || merchant.assignedChannel || 'aapay';
        const channelConfig = channelRouter.getChannelConfig(channelName);
        const dbChannel = await Channel.findOne({ where: { name: channelName, isActive: true } });

        if (!channelConfig && !dbChannel) {
            return res.json(envelope(false, 'Payment channel unavailable'));
        }

        let customRates = {};
        try { customRates = JSON.parse(merchant.channel_rates || '{}'); } catch (e) {}

        const payinRate = customRates.payinRate || (dbChannel ? parseFloat(dbChannel.payinRate) : (channelConfig ? channelConfig.payinRate : 5.0));
        const fee = (amount * payinRate) / 100;
        const netAmount = amount - fee;
        const internalId = uuidv4();

        // Atomic order creation
        const sequelize = require('../../../config/database');
        const t = await sequelize.transaction();

        let order;
        try {
            const [foundOrder, created] = await Order.findOrCreate({
                where: { merchantId: merchant.id, orderId: ref_id },
                defaults: {
                    id: internalId,
                    merchantId: merchant.id,
                    orderId: ref_id,
                    channelName,
                    type: 'payin',
                    amount,
                    fee,
                    netAmount,
                    status: 'pending',
                    callbackUrl: webhook_url || merchant.callbackUrl,
                    skipUrl: return_url,
                    param: metadata,
                    expiresAt: new Date(Date.now() + 30 * 60 * 1000)
                },
                transaction: t
            });

            if (!created) {
                await t.rollback();
                return res.json(envelope(false, 'Duplicate ref_id'));
            }

            await t.commit();
            order = foundOrder;
        } catch (txErr) {
            await t.rollback();
            throw txErr;
        }

        // Upstream call
        const notifyUrl = `${APP_URL}/callback/${channelName}/payin`;
        const providerResult = await channelRouter.createPayin(channelName, {
            orderId: ref_id,
            amount,
            notifyUrl,
            returnUrl: return_url || `${APP_URL}/pay/success`,
            customerName: payer_name,
            customerPhone: payer_phone,
            customerEmail: payer_email,
            customerIp: req.ip || '127.0.0.1',
            channelCode: channel_code || undefined,
            bankCode: channel_code || undefined
        });

        if (!providerResult.success) {
            await order.update({ status: 'failed' });
            return res.json(envelope(false, providerResult.error || 'Channel error'));
        }

        const actualChannel = providerResult.actualChannel || null;
        await order.update({
            providerOrderId: providerResult.providerOrderId,
            payUrl: providerResult.payUrl,
            deepLinks: providerResult.deepLinks || null,
            providerResponse: JSON.stringify(providerResult),
            actualChannel
        });

        const checkoutUrl = `${APP_URL}/pay/${internalId}`;

        // Build deep links
        const deepLinks = {};
        if (providerResult.deepLinks) {
            if (providerResult.deepLinks.upi_phonepe) deepLinks.upi_phonepe = providerResult.deepLinks.upi_phonepe;
            if (providerResult.deepLinks.upi_paytm) deepLinks.upi_paytm = providerResult.deepLinks.upi_paytm;
            if (providerResult.deepLinks.upi_gpay) deepLinks.upi_gpay = providerResult.deepLinks.upi_gpay;
            if (providerResult.deepLinks.upi_scan) deepLinks.upi_scan = providerResult.deepLinks.upi_scan;
            if (providerResult.deepLinks.upi_intent) deepLinks.upi_intent = providerResult.deepLinks.upi_intent;
        }

        // Extract VPA
        let vpa = providerResult.upi || null;
        if (!vpa) {
            const link = providerResult.deepLinks?.upi_scan || providerResult.deepLinks?.upi || null;
            if (link && link.includes('pa=')) {
                try {
                    const parts = link.split('?');
                    const qp = new URLSearchParams(parts.length > 1 ? parts[1] : link);
                    vpa = qp.get('pa') || null;
                } catch (e) {}
            }
        }

        // Extract BCAT-compatible extra fields (BD wallet channels)
        const bdExtra = providerResult.extra || {};

        return res.json(envelope(true, 'Deposit order created', {
            ref_id,
            trace_id: internalId,
            txn_amount: amount,
            service_fee: parseFloat(fee.toFixed(2)),
            checkout_url: checkoutUrl,
            deep_links: Object.keys(deepLinks).length > 0 ? deepLinks : undefined,
            vpa: vpa || undefined,
            channel_code: providerResult.channelCode || channel_code || undefined,
            account_number: bdExtra.account_number || undefined,
            account_name: bdExtra.account_name || undefined,
            qrcode: bdExtra.qrcode || undefined,
            bank_name: bdExtra.bankName || undefined,
            bank_code: bdExtra.bankCode || undefined,
            ttl: 1800
        }));

    } catch (error) {
        console.error('[V3 Deposit Create] Error:', error);
        return res.status(500).json(envelope(false, 'Internal server error'));
    }
});

/**
 * POST /v3/deposit/query
 */
router.post('/query', validateMerchant, async (req, res) => {
    try {
        const { ref_id } = req.body;
        const merchant = req.merchant;

        if (!ref_id) return res.json(envelope(false, 'Missing ref_id'));

        const order = await Order.findOne({
            where: { merchantId: merchant.id, orderId: ref_id, type: 'payin' }
        });

        if (!order) return res.json(envelope(false, 'Order not found'));

        // Sync with upstream if not finalized
        if (order.status === 'pending' || (order.status === 'success' && !order.utr)) {
            try {
                const ch = order.actualChannel || order.channelName;
                if (ch) {
                    const qr = await channelRouter.queryPayin(ch, order.orderId);
                    if (qr.success) {
                        const upd = {};
                        let changed = false;
                        if (qr.status && qr.status !== order.status && order.status === 'pending') {
                            upd.status = qr.status; changed = true;
                        }
                        if (qr.utr && qr.utr !== 'None' && qr.utr !== order.utr) {
                            upd.utr = qr.utr; changed = true;
                        }
                        if (changed) {
                            await order.update(upd);
                            await order.reload();
                            if (order.callbackUrl && (upd.status === 'success' || upd.status === 'failed' || upd.utr)) {
                                callbackService.sendPayinCallback(order, order.status, order.utr).then(r => {
                                    if (!r.isOk) callbackService.scheduleRetry(order, order.status, order.utr, 'payin');
                                });
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('[V3 Deposit Query Sync]', err.message);
            }
        }

        return res.json(envelope(true, 'Deposit status retrieved', {
            ref_id: order.orderId,
            trace_id: order.id,
            state: order.status,
            txn_amount: parseFloat(order.amount),
            settled_amount: parseFloat(order.netAmount),
            service_fee: parseFloat(order.fee),
            txn_ref: order.utr || null,
            created_at: order.createdAt.toISOString()
        }));

    } catch (error) {
        console.error('[V3 Deposit Query] Error:', error);
        return res.status(500).json(envelope(false, 'Internal server error'));
    }
});

/**
 * POST /v3/deposit/submit-ref
 */
router.post('/submit-ref', validateMerchant, async (req, res) => {
    try {
        const { ref_id, txn_ref } = req.body;
        const merchant = req.merchant;

        if (!ref_id || !txn_ref) return res.json(envelope(false, 'Missing ref_id or txn_ref'));

        const clean = String(txn_ref).trim();
        if (clean.length < 6 || !/^[a-zA-Z0-9]+$/.test(clean)) {
            return res.json(envelope(false, 'Invalid txn_ref. Min 6 alphanumeric chars'));
        }

        const order = await Order.findOne({
            where: { merchantId: merchant.id, orderId: ref_id, type: 'payin' }
        });

        if (!order) return res.json(envelope(false, 'Order not found'));

        if (order.status === 'success') {
            return res.json(envelope(true, 'Payment already confirmed', {
                ref_id: order.orderId, trace_id: order.id, state: order.status, txn_ref: order.utr || null
            }));
        }

        if (order.status === 'failed' || order.status === 'expired') {
            return res.json(envelope(false, `Order is ${order.status}`));
        }

        const ch = order.actualChannel || order.channelName;
        const upstream = await channelRouter.submitUtr(ch, order.orderId, clean);
        await order.update({ utr: clean });

        return res.json(envelope(true, upstream.success ? 'Reference submitted' : 'Reference recorded, verification pending', {
            ref_id: order.orderId, trace_id: order.id, state: order.status, txn_ref: clean
        }));

    } catch (error) {
        console.error('[V3 Deposit SubmitRef] Error:', error);
        return res.status(500).json(envelope(false, 'Internal server error'));
    }
});

/**
 * POST /v3/deposit/check-ref
 */
router.post('/check-ref', validateMerchant, async (req, res) => {
    try {
        const { ref_id } = req.body;
        const merchant = req.merchant;

        if (!ref_id) return res.json(envelope(false, 'Missing ref_id'));

        const order = await Order.findOne({
            where: { merchantId: merchant.id, orderId: ref_id, type: 'payin' }
        });

        if (!order) return res.json(envelope(false, 'Order not found'));

        // Sync upstream
        if (order.status === 'pending' || order.status === 'processing' || (order.status === 'success' && !order.utr)) {
            try {
                const ch = order.actualChannel || order.channelName;
                if (ch) {
                    const qr = await channelRouter.queryPayin(ch, order.orderId);
                    if (qr.success) {
                        const upd = {};
                        let changed = false;
                        if (qr.status && qr.status !== order.status && (order.status === 'pending' || order.status === 'processing')) {
                            upd.status = qr.status; changed = true;
                        }
                        if (qr.utr && qr.utr !== 'None' && qr.utr !== order.utr) {
                            upd.utr = qr.utr; changed = true;
                        }
                        if (changed) {
                            await order.update(upd);
                            await order.reload();
                            if (order.callbackUrl && (upd.status === 'success' || upd.status === 'failed' || upd.utr)) {
                                callbackService.sendPayinCallback(order, order.status, order.utr).then(r => {
                                    if (!r.isOk) callbackService.scheduleRetry(order, order.status, order.utr, 'payin');
                                });
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('[V3 Deposit CheckRef Sync]', err.message);
            }
        }

        return res.json(envelope(true, 'Reference status retrieved', {
            ref_id: order.orderId,
            trace_id: order.id,
            state: order.status,
            txn_amount: parseFloat(order.amount),
            settled_amount: parseFloat(order.netAmount),
            service_fee: parseFloat(order.fee),
            txn_ref: order.utr || null,
            ref_submitted: !!order.utr,
            created_at: order.createdAt.toISOString()
        }));

    } catch (error) {
        console.error('[V3 Deposit CheckRef] Error:', error);
        return res.status(500).json(envelope(false, 'Internal server error'));
    }
});

module.exports = router;
