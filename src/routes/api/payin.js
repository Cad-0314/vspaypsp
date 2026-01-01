/**
 * Payin API Routes
 * POST /api/payin/create - Create deposit order
 * POST /api/payin/query - Query order status
 * POST /api/payin/check - Public order check (no signature)
 */

const express = require('express');
const router = express.Router();
const { validateMerchant } = require('../../middleware/apiAuth');
const channelRouter = require('../../services/channelRouter');
const { Order, Channel, User } = require('../../models');
const { v4: uuidv4 } = require('uuid');

const APP_URL = process.env.APP_URL || 'https://vspay.vip';

/**
 * POST /api/payin/create
 * Create a new payin order
 */
router.post('/create', validateMerchant, async (req, res) => {
    try {
        const { orderId, orderAmount, callbackUrl, skipUrl, param, customerName, customerPhone, customerEmail } = req.body;
        const merchant = req.merchant;

        // Check if payin is suspended
        if (merchant.canPayin === false) {
            return res.json({
                code: 0,
                msg: 'Payin service suspended for this merchant'
            });
        }

        // Validate required fields
        if (!orderId || !orderAmount || !callbackUrl) {
            return res.json({
                code: -2,
                msg: 'Missing required parameters: orderId, orderAmount, callbackUrl'
            });
        }

        const amount = parseFloat(orderAmount);
        if (isNaN(amount) || amount < 100) {
            return res.json({
                code: 0,
                msg: 'Invalid amount. Minimum is ₹100'
            });
        }

        // Check for duplicate order ID
        const existingOrder = await Order.findOne({
            where: { merchantId: merchant.id, orderId: orderId }
        });

        if (existingOrder) {
            return res.json({
                code: 0,
                msg: 'Duplicate order ID'
            });
        }

        // Get channel configuration
        const channelName = merchant.assignedChannel || 'hdpay';
        const channelConfig = channelRouter.getChannelConfig(channelName);

        if (!channelConfig) {
            return res.json({
                code: 0,
                msg: 'Channel not configured'
            });
        }

        // Get channel rates from database or use defaults
        let channel = await Channel.findOne({ where: { name: channelName, isActive: true } });
        const payinRate = channel ? parseFloat(channel.payinRate) : 5.0;

        // Calculate fee
        const fee = (amount * payinRate) / 100;
        const netAmount = amount - fee;

        // Generate internal order ID
        const internalId = uuidv4();

        // Create order in database first
        const order = await Order.create({
            id: internalId,
            merchantId: merchant.id,
            orderId: orderId,
            channelName: channelName,
            type: 'payin',
            amount: amount,
            fee: fee,
            netAmount: netAmount,
            status: 'pending',
            callbackUrl: callbackUrl || merchant.callbackUrl,
            skipUrl: skipUrl,
            param: param,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
        });

        // Call upstream provider
        const notifyUrl = `${APP_URL}/callback/${channelName}/payin`;
        const providerResult = await channelRouter.createPayin(channelName, {
            orderId: orderId,
            amount: amount,
            notifyUrl: notifyUrl,
            returnUrl: skipUrl || `${APP_URL}/pay/success`,
            customerName: customerName,
            customerPhone: customerPhone,
            customerEmail: customerEmail,
            customerIp: req.ip || '127.0.0.1'
        });

        if (!providerResult.success) {
            // Update order as failed
            await order.update({ status: 'failed' });
            return res.json({
                code: 0,
                msg: providerResult.error || 'Failed to create order'
            });
        }

        // Update order with provider data
        await order.update({
            providerOrderId: providerResult.providerOrderId,
            payUrl: providerResult.payUrl,
            deepLinks: providerResult.deepLinks || null,
            providerResponse: JSON.stringify(providerResult)
        });

        // Build response
        const paymentUrl = channelConfig.usesCustomPayPage
            ? `${APP_URL}/pay/${internalId}`
            : providerResult.payUrl;

        // Build deeplinks for response
        const deepLinks = {};
        if (providerResult.deepLinks) {
            if (providerResult.deepLinks.upi_phonepe) deepLinks.upi_phonepe = providerResult.deepLinks.upi_phonepe;
            if (providerResult.deepLinks.upi_paytm) deepLinks.upi_paytm = providerResult.deepLinks.upi_paytm;
            if (providerResult.deepLinks.upi_gpay) deepLinks.upi_gpay = providerResult.deepLinks.upi_gpay;
            if (providerResult.deepLinks.upi_scan) deepLinks.upi_scan = providerResult.deepLinks.upi_scan;
        }

        return res.json({
            code: 1,
            msg: 'Order created',
            data: {
                orderId: orderId,
                id: internalId,
                orderAmount: amount,
                fee: parseFloat(fee.toFixed(2)),
                paymentUrl: paymentUrl,
                deepLinks: Object.keys(deepLinks).length > 0 ? deepLinks : undefined
            }
        });

    } catch (error) {
        console.error('[Payin Create] Error:', error);
        return res.status(500).json({
            code: 0,
            msg: 'Internal server error'
        });
    }
});

/**
 * POST /api/payin/query
 * Query payin order status (requires signature)
 */
router.post('/query', validateMerchant, async (req, res) => {
    try {
        const { orderId } = req.body;
        const merchant = req.merchant;

        if (!orderId) {
            return res.json({
                code: -2,
                msg: 'Missing orderId'
            });
        }

        const order = await Order.findOne({
            where: { merchantId: merchant.id, orderId: orderId, type: 'payin' }
        });

        if (!order) {
            return res.json({
                code: -4,
                msg: 'Order not found'
            });
        }

        return res.json({
            code: 1,
            data: {
                orderId: order.orderId,
                id: order.id,
                status: order.status,
                amount: parseFloat(order.netAmount),
                orderAmount: parseFloat(order.amount),
                fee: parseFloat(order.fee),
                netAmount: parseFloat(order.netAmount),
                utr: order.utr,
                createdAt: order.createdAt.toISOString()
            }
        });

    } catch (error) {
        console.error('[Payin Query] Error:', error);
        return res.status(500).json({
            code: 0,
            msg: 'Internal server error'
        });
    }
});

/**
 * POST /api/payin/check
 * Public order check (no signature required)
 */
router.post('/check', async (req, res) => {
    try {
        const { orderId, userId } = req.body;

        if (!orderId || !userId) {
            return res.json({
                code: -2,
                msg: 'Missing orderId or userId'
            });
        }

        // Find merchant by API key
        const merchant = await User.findOne({
            where: { apiKey: userId, role: 'merchant' }
        });

        if (!merchant) {
            return res.json({
                code: -1,
                msg: 'Invalid userId'
            });
        }

        const order = await Order.findOne({
            where: { merchantId: merchant.id, orderId: orderId, type: 'payin' }
        });

        if (!order) {
            return res.json({
                code: -4,
                msg: 'Order not found'
            });
        }

        return res.json({
            code: 1,
            data: {
                orderId: order.orderId,
                id: order.id,
                status: order.status,
                amount: parseFloat(order.amount),
                createdAt: order.createdAt.toISOString()
            }
        });

    } catch (error) {
        console.error('[Payin Check] Error:', error);
        return res.status(500).json({
            code: 0,
            msg: 'Internal server error'
        });
    }
});

module.exports = router;
