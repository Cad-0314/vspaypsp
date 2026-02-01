/**
 * V2 Collection API Routes
 * POST /v2/collection/initiate - Create collection order
 * POST /v2/collection/status - Query order status
 * POST /v2/collection/verify - Public order verification
 * POST /v2/collection/update-ref - Update UTR/reference
 */

const express = require('express');
const router = express.Router();

const { validateMerchant } = require('../../../middleware/apiAuth');
const channelRouter = require('../../../services/channelRouter');
const { Order, Channel, User } = require('../../../models');
const { v4: uuidv4 } = require('uuid');

const APP_URL = process.env.APP_URL || 'https://payable.firestars.co';

// Helper function to build standard response
function buildResponse(success, code, message, data = null) {
    const response = {
        success,
        code,
        message,
        timestamp: new Date().toISOString()
    };
    if (data) response.data = data;
    return response;
}

// Helper function to build error response
function buildError(code, message, errors = null) {
    const response = {
        success: false,
        code,
        message,
        timestamp: new Date().toISOString()
    };
    if (errors) response.errors = errors;
    return response;
}

/**
 * POST /v2/collection/initiate
 * Create a new collection order
 */
router.post('/initiate', validateMerchant, async (req, res) => {
    try {
        const {
            merchant_order_id,
            amount,
            notify_url,
            redirect_url,
            extra_data,
            customer_name,
            customer_phone,
            customer_email
        } = req.body;

        const merchant = req.merchant;

        // Check if payin is suspended
        if (merchant.canPayin === false) {
            return res.json(buildError('SUSPENDED', 'Collection service is temporarily suspended'));
        }

        // Validate required fields
        const errors = [];
        if (!merchant_order_id) errors.push({ field: 'merchant_order_id', message: 'Order ID is required' });
        if (!amount) errors.push({ field: 'amount', message: 'Amount is required' });
        if (!notify_url) errors.push({ field: 'notify_url', message: 'Notification URL is required' });

        if (errors.length > 0) {
            return res.json(buildError('MISSING_PARAMS', 'Required parameters missing', errors));
        }

        // Validate amount
        const orderAmount = parseFloat(amount);
        if (isNaN(orderAmount) || orderAmount < 100) {
            return res.json(buildError('INVALID_AMOUNT', 'Amount must be at least 100'));
        }

        // Get channel configuration from DB to ensure correct rates
        const channelName = merchant.payinChannel || merchant.assignedChannel || 'aapay';
        let channelConfig = channelRouter.getChannelConfig(channelName);

        // Fetch dynamic channel data from DB including rates
        const dbChannel = await Channel.findOne({ where: { name: channelName } });

        if (!channelConfig && !dbChannel) {
            return res.json(buildError('CHANNEL_ERROR', 'Payment channel not configured'));
        }

        // Calculate fees
        let customRates = {};
        try { customRates = JSON.parse(merchant.channel_rates || '{}'); } catch (e) { }

        // Priority: Merchant Custom Rate > DB Channel Rate > Static Config > Default (5%)
        const feeRate = customRates.payinRate || (dbChannel ? dbChannel.payinRate : (channelConfig.payinRate || 5));
        const fee = (orderAmount * feeRate) / 100;
        const internalId = uuidv4();

        // ATOMIC: Use findOrCreate with transaction
        const sequelize = require('../../../config/database');
        const t = await sequelize.transaction();

        let order;
        try {
            const [foundOrder, created] = await Order.findOrCreate({
                where: { merchantId: merchant.id, orderId: merchant_order_id },
                defaults: {
                    id: internalId,
                    merchantId: merchant.id,
                    orderId: merchant_order_id,
                    channelName: channelName,
                    type: 'payin',
                    amount: orderAmount,
                    fee: fee,
                    status: 'pending',
                    callbackUrl: notify_url,
                    skipUrl: redirect_url || '',
                    param: extra_data || '',
                    customerName: customer_name || '',
                    customerPhone: customer_phone || '',
                    customerEmail: customer_email || ''
                },
                transaction: t
            });

            if (!created) {
                await t.rollback();
                return res.json(buildError('DUPLICATE_ORDER', 'Order ID already exists'));
            }

            await t.commit();
            order = foundOrder;
        } catch (txError) {
            await t.rollback();
            throw txError;
        }

        // Call upstream provider
        let notifyUrl = `${APP_URL}/callback/${channelName}/payin`;
        const providerResult = await channelRouter.createPayin(channelName, {
            orderId: merchant_order_id,
            amount: orderAmount,
            notifyUrl: notifyUrl,
            returnUrl: redirect_url || APP_URL,
            customerName: customer_name,
            customerPhone: customer_phone,
            customerEmail: customer_email,
            ip: req.ip
        });

        // Get actual channel if smart routing
        const actualChannel = providerResult.actualChannel || channelName;

        // Update order with provider response
        await Order.update({
            payUrl: providerResult.payUrl,
            deepLinks: providerResult.deepLinks || null,
            providerResponse: JSON.stringify(providerResult),
            actualChannel: actualChannel
        }, { where: { id: internalId } });

        // Build payment URL
        const paymentUrl = channelConfig.usesCustomPayPage
            ? `${APP_URL}/pay/${internalId}`
            : providerResult.payUrl;

        // Build app links
        const appLinks = {};
        if (providerResult.deepLinks) {
            if (providerResult.deepLinks.upi_phonepe) appLinks.phonepe = providerResult.deepLinks.upi_phonepe;
            if (providerResult.deepLinks.upi_paytm) appLinks.paytm = providerResult.deepLinks.upi_paytm;
            if (providerResult.deepLinks.upi_gpay) appLinks.gpay = providerResult.deepLinks.upi_gpay;
            if (providerResult.deepLinks.upi_scan) appLinks.generic_upi = providerResult.deepLinks.upi_scan;
        }

        // Calculate expiry
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

        return res.json(buildResponse(true, 'SUCCESS', 'Collection order created', {
            merchant_order_id: merchant_order_id,
            platform_order_id: internalId,
            amount: parseFloat(orderAmount.toFixed(2)),
            processing_fee: parseFloat(fee.toFixed(2)),
            payment_url: paymentUrl,
            expires_at: expiresAt.toISOString(),
            app_links: Object.keys(appLinks).length > 0 ? appLinks : undefined
        }));

    } catch (error) {
        console.error('[V2 Collection Initiate] Error:', error);
        return res.status(500).json(buildError('INTERNAL_ERROR', 'Internal server error'));
    }
});

/**
 * POST /v2/collection/status
 * Query collection order status
 */
router.post('/status', validateMerchant, async (req, res) => {
    try {
        const { merchant_order_id } = req.body;
        const merchant = req.merchant;

        if (!merchant_order_id) {
            return res.json(buildError('MISSING_PARAMS', 'merchant_order_id is required'));
        }

        const order = await Order.findOne({
            where: { merchantId: merchant.id, orderId: merchant_order_id, type: 'payin' }
        });

        if (!order) {
            return res.json(buildError('ORDER_NOT_FOUND', 'Order not found'));
        }

        // Map status
        const statusMap = {
            'pending': 'pending',
            'processing': 'processing',
            'success': 'completed',
            'failed': 'failed',
            'expired': 'expired'
        };

        return res.json(buildResponse(true, 'SUCCESS', 'Order status retrieved', {
            merchant_order_id: order.orderId,
            platform_order_id: order.id,
            status: statusMap[order.status] || order.status,
            amount: parseFloat(order.amount),
            processing_fee: parseFloat(order.fee),
            net_amount: parseFloat((order.amount - order.fee).toFixed(2)),
            transaction_ref: order.utr || null,
            created_at: order.createdAt.toISOString(),
            completed_at: order.status === 'success' ? order.updatedAt.toISOString() : null
        }));

    } catch (error) {
        console.error('[V2 Collection Status] Error:', error);
        return res.status(500).json(buildError('INTERNAL_ERROR', 'Internal server error'));
    }
});

/**
 * POST /v2/collection/verify
 * Public order verification (no signature required)
 */
router.post('/verify', async (req, res) => {
    try {
        const { merchant_order_id, merchant_id } = req.body;

        if (!merchant_order_id || !merchant_id) {
            return res.json(buildError('MISSING_PARAMS', 'merchant_order_id and merchant_id are required'));
        }

        // Find merchant by apiKey
        const merchant = await User.findOne({ where: { apiKey: merchant_id, role: 'merchant' } });
        if (!merchant) {
            return res.json(buildError('INVALID_MERCHANT', 'Invalid merchant ID'));
        }

        const order = await Order.findOne({
            where: { merchantId: merchant.id, orderId: merchant_order_id, type: 'payin' }
        });

        if (!order) {
            return res.json(buildError('ORDER_NOT_FOUND', 'Order not found'));
        }

        const statusMap = {
            'pending': 'pending',
            'processing': 'processing',
            'success': 'completed',
            'failed': 'failed',
            'expired': 'expired'
        };

        return res.json(buildResponse(true, 'SUCCESS', 'Order verified', {
            merchant_order_id: order.orderId,
            platform_order_id: order.id,
            status: statusMap[order.status] || order.status,
            amount: parseFloat(order.amount),
            created_at: order.createdAt.toISOString()
        }));

    } catch (error) {
        console.error('[V2 Collection Verify] Error:', error);
        return res.status(500).json(buildError('INTERNAL_ERROR', 'Internal server error'));
    }
});

/**
 * POST /v2/collection/update-ref
 * Update UTR/transaction reference for an order
 */
router.post('/update-ref', validateMerchant, async (req, res) => {
    try {
        const { merchant_order_id, transaction_ref, reason } = req.body;
        const merchant = req.merchant;

        // Validate
        if (!merchant_order_id || !transaction_ref) {
            return res.json(buildError('MISSING_PARAMS', 'merchant_order_id and transaction_ref are required'));
        }

        // Find order
        const order = await Order.findOne({
            where: { merchantId: merchant.id, orderId: merchant_order_id, type: 'payin' }
        });

        if (!order) {
            return res.json(buildError('ORDER_NOT_FOUND', 'Order not found'));
        }

        const oldRef = order.utr;
        const channelName = order.actualChannel || order.channelName;

        // Try to forward to upstream channel
        let channelResponse = { status: 'not_forwarded' };
        try {
            const channelService = channelRouter.getChannelService(channelName);
            if (channelService && typeof channelService.updateReference === 'function') {
                channelResponse = await channelService.updateReference({
                    orderId: order.providerOrderId || merchant_order_id,
                    newUtr: transaction_ref,
                    reason: reason
                });
            } else {
                // Channel doesn't support UTR update - just update locally
                channelResponse = { status: 'local_update_only', message: 'Channel does not support reference updates' };
            }
        } catch (channelError) {
            console.error('[V2 Update Ref] Channel error:', channelError);
            channelResponse = { status: 'error', message: channelError.message };
        }

        // Update order locally
        await Order.update({
            utr: transaction_ref,
            notes: `UTR updated from ${oldRef || 'none'} to ${transaction_ref}. Reason: ${reason || 'Not specified'}`
        }, { where: { id: order.id } });

        return res.json(buildResponse(true, 'SUCCESS', 'Reference updated successfully', {
            merchant_order_id: merchant_order_id,
            platform_order_id: order.id,
            old_ref: oldRef || null,
            new_ref: transaction_ref,
            channel_response: channelResponse
        }));

    } catch (error) {
        console.error('[V2 Collection Update Ref] Error:', error);
        return res.status(500).json(buildError('INTERNAL_ERROR', 'Internal server error'));
    }
});

module.exports = router;
