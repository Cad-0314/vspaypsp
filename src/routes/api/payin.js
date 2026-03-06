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

const APP_URL = process.env.APP_URL || 'https://gaurpay.site';

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
                status: 'error',
                errorCode: 'SERVICE_SUSPENDED',
                message: 'Payin service suspended for this merchant',
                timestamp: new Date().toISOString()
            });
        }

        // Validate required fields
        if (!orderId || !orderAmount || !callbackUrl) {
            return res.json({
                status: 'error',
                errorCode: 'INVALID_PARAMS',
                message: 'Missing required parameters: orderId, orderAmount, callbackUrl',
                timestamp: new Date().toISOString()
            });
        }

        const amount = parseFloat(orderAmount);
        if (isNaN(amount) || amount < 100) {
            return res.json({
                status: 'error',
                errorCode: 'INVALID_AMOUNT',
                message: 'Invalid amount. Minimum is ₹100',
                timestamp: new Date().toISOString()
            });
        }

        // Get channel configuration
        const channelName = merchant.payinChannel || merchant.assignedChannel || 'aapay';
        const channelConfig = channelRouter.getChannelConfig(channelName);

        if (!channelConfig) {
            return res.json({
                status: 'error',
                errorCode: 'CHANNEL_ERROR',
                message: 'Channel not configured',
                timestamp: new Date().toISOString()
            });
        }

        // Get channel rates from database or use defaults
        let channel = await Channel.findOne({ where: { name: channelName, isActive: true } });

        // Use merchant custom rates if available
        let customRates = {};
        try { customRates = JSON.parse(merchant.channel_rates || '{}'); } catch (e) { }

        const payinRate = customRates.payinRate || (channel ? parseFloat(channel.payinRate) : 5.0);

        // Calculate fee
        const fee = (amount * payinRate) / 100;
        const netAmount = amount - fee;

        // Generate internal order ID
        const internalId = uuidv4();

        // ATOMIC: Use findOrCreate with transaction to prevent race conditions
        const sequelize = require('../../config/database');
        const t = await sequelize.transaction();

        let order;
        try {
            const [foundOrder, created] = await Order.findOrCreate({
                where: { merchantId: merchant.id, orderId: orderId },
                defaults: {
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
                },
                transaction: t
            });

            if (!created) {
                await t.rollback();
                return res.json({
                    status: 'error',
                    errorCode: 'DUPLICATE_ORDER',
                    message: 'Duplicate order ID',
                    timestamp: new Date().toISOString()
                });
            }

            await t.commit();
            order = foundOrder;
        } catch (txError) {
            await t.rollback();
            throw txError;
        }

        // Call upstream provider
        // For smart channel, the notifyUrl must use the actual routed channel
        let notifyUrl = `${APP_URL}/callback/${channelName}/payin`;
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
                status: 'error',
                errorCode: 'PROVIDER_ERROR',
                message: providerResult.error || 'Failed to create order',
                timestamp: new Date().toISOString()
            });
        }

        // For smart channel, store the actual channel used for callback routing
        const actualChannel = providerResult.actualChannel || null;

        // Update order with provider data
        await order.update({
            providerOrderId: providerResult.providerOrderId,
            payUrl: providerResult.payUrl,
            deepLinks: providerResult.deepLinks || null,
            providerResponse: JSON.stringify(providerResult),
            actualChannel: actualChannel
        });

        // Always return own URL — upstream is wrapped in iframe
        const paymentUrl = `${APP_URL}/pay/${internalId}`;

        // Build deeplinks for response
        const deepLinks = {};
        if (providerResult.deepLinks) {
            if (providerResult.deepLinks.upi_phonepe) deepLinks.upi_phonepe = providerResult.deepLinks.upi_phonepe;
            if (providerResult.deepLinks.upi_paytm) deepLinks.upi_paytm = providerResult.deepLinks.upi_paytm;
            if (providerResult.deepLinks.upi_gpay) deepLinks.upi_gpay = providerResult.deepLinks.upi_gpay;
            if (providerResult.deepLinks.upi_scan) deepLinks.upi_scan = providerResult.deepLinks.upi_scan;
            if (providerResult.deepLinks.upi_intent) deepLinks.upi_intent = providerResult.deepLinks.upi_intent;
        }

        // Extract UPI ID (VPA) from upstream response
        let upiId = providerResult.upi || null;
        if (!upiId) {
            // Try extracting from upi_scan deeplink pa= parameter
            const upiScanLink = providerResult.deepLinks?.upi_scan || providerResult.deepLinks?.upi || null;
            if (upiScanLink && upiScanLink.includes('pa=')) {
                try {
                    const urlParts = upiScanLink.split('?');
                    const qp = new URLSearchParams(urlParts.length > 1 ? urlParts[1] : upiScanLink);
                    upiId = qp.get('pa') || null;
                } catch (e) { /* ignore parse errors */ }
            }
        }

        return res.json({
            status: 'success',
            message: 'Order created successfully',
            timestamp: new Date().toISOString(),
            result: {
                merchantOrderId: orderId,
                platformOrderId: internalId,
                requestedAmount: amount,
                processingFee: parseFloat(fee.toFixed(2)),
                paymentUrl: paymentUrl,
                appLinks: Object.keys(deepLinks).length > 0 ? deepLinks : undefined,
                upiId: upiId || undefined,
                expiresIn: 1800
            }
        });

    } catch (error) {
        console.error('[Payin Create] Error:', error);
        return res.status(500).json({
            status: 'error',
            errorCode: 'INTERNAL_ERROR',
            message: 'Internal server error',
            timestamp: new Date().toISOString()
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
                status: 'error',
                errorCode: 'INVALID_PARAMS',
                message: 'Missing orderId',
                timestamp: new Date().toISOString()
            });
        }

        const order = await Order.findOne({
            where: { merchantId: merchant.id, orderId: orderId, type: 'payin' }
        });

        if (!order) {
            return res.json({
                status: 'error',
                errorCode: 'NOT_FOUND',
                message: 'Order not found',
                timestamp: new Date().toISOString()
            });
        }

        // Sync with upstream if order is not finalized or if we want to ensure latest UTR
        // For performance, maybe only if pending? Or always?
        // Let's sync if status is pending or if UTR is missing but status is success
        if (order.status === 'pending' || (order.status === 'success' && !order.utr)) {
            try {
                // Get channel config
                const channelName = order.actualChannel || order.channelName;
                if (channelName) {
                    const queryResult = await channelRouter.queryPayin(channelName, order.orderId);

                    if (queryResult.success) {
                        const updates = {};
                        let updated = false;

                        // Update status if changed
                        if (queryResult.status && queryResult.status !== order.status) {
                            // Only update if moving forward (pending -> success/failed)
                            // or if we trust the upstream strictly
                            if (order.status === 'pending') {
                                updates.status = queryResult.status;
                                updated = true;
                            }
                        }

                        // Update UTR if available and not set
                        if (queryResult.utr && queryResult.utr !== 'None' && queryResult.utr !== order.utr) {
                            updates.utr = queryResult.utr;
                            updated = true;
                        }

                        // Update amount if available (and valid)
                        if (queryResult.amount && parseFloat(queryResult.amount) > 0 && parseFloat(queryResult.amount) !== parseFloat(order.amount)) {
                            // Optional: Upate actual amount received? For now let's just log or store in metadata if needed.
                            // But strict updates might be risky. Let's keep UTR and Status focus.
                        }

                        if (updated) {
                            await order.update(updates);
                            // Refresh order object
                            await order.reload();
                        }
                    }
                }
            } catch (err) {
                console.error('[Payin Query Sync Error]', err.message);
                // Continue to return DB state if sync fails
            }
        }

        return res.json({
            status: 'success',
            timestamp: new Date().toISOString(),
            result: {
                merchantOrderId: order.orderId,
                platformOrderId: order.id,
                orderStatus: order.status,
                settledAmount: parseFloat(order.netAmount),
                requestedAmount: parseFloat(order.amount),
                processingFee: parseFloat(order.fee),
                transactionRef: order.utr || null,
                createdAt: order.createdAt.toISOString()
            }
        });

    } catch (error) {
        console.error('[Payin Query] Error:', error);
        return res.status(500).json({
            status: 'error',
            errorCode: 'INTERNAL_ERROR',
            message: 'Internal server error',
            timestamp: new Date().toISOString()
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
                status: 'error',
                errorCode: 'INVALID_PARAMS',
                message: 'Missing orderId or userId',
                timestamp: new Date().toISOString()
            });
        }

        // Find merchant by API key
        const merchant = await User.findOne({
            where: { apiKey: userId, role: 'merchant' }
        });

        if (!merchant) {
            return res.json({
                status: 'error',
                errorCode: 'INVALID_MERCHANT',
                message: 'Invalid userId',
                timestamp: new Date().toISOString()
            });
        }

        const order = await Order.findOne({
            where: { merchantId: merchant.id, orderId: orderId, type: 'payin' }
        });

        if (!order) {
            return res.json({
                status: 'error',
                errorCode: 'NOT_FOUND',
                message: 'Order not found',
                timestamp: new Date().toISOString()
            });
        }

        return res.json({
            status: 'success',
            timestamp: new Date().toISOString(),
            result: {
                merchantOrderId: order.orderId,
                platformOrderId: order.id,
                orderStatus: order.status,
                amount: parseFloat(order.amount),
                createdAt: order.createdAt.toISOString()
            }
        });

    } catch (error) {
        console.error('[Payin Check] Error:', error);
        return res.status(500).json({
            status: 'error',
            errorCode: 'INTERNAL_ERROR',
            message: 'Internal server error',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/payin/submitUtr
 * Submit UTR for a payin order (forwards to upstream)
 */
router.post('/submitUtr', validateMerchant, async (req, res) => {
    try {
        const { orderId, utr } = req.body;
        const merchant = req.merchant;

        // Validate required fields
        if (!orderId || !utr) {
            return res.json({
                status: 'error',
                errorCode: 'INVALID_PARAMS',
                message: 'Missing required parameters: orderId, utr',
                timestamp: new Date().toISOString()
            });
        }

        // Validate UTR format (min 6 chars, alphanumeric)
        const utrClean = String(utr).trim();
        if (utrClean.length < 6 || !/^[a-zA-Z0-9]+$/.test(utrClean)) {
            return res.json({
                status: 'error',
                errorCode: 'INVALID_UTR',
                message: 'Invalid UTR format. Must be at least 6 alphanumeric characters.',
                timestamp: new Date().toISOString()
            });
        }

        // Find the order
        const order = await Order.findOne({
            where: { merchantId: merchant.id, orderId: orderId, type: 'payin' }
        });

        if (!order) {
            return res.json({
                status: 'error',
                errorCode: 'NOT_FOUND',
                message: 'Order not found',
                timestamp: new Date().toISOString()
            });
        }

        // Reject if order is already finalized
        if (order.status === 'success') {
            return res.json({
                status: 'success',
                message: 'Payment already confirmed',
                timestamp: new Date().toISOString(),
                result: {
                    merchantOrderId: order.orderId,
                    platformOrderId: order.id,
                    orderStatus: order.status,
                    transactionRef: order.utr || null
                }
            });
        }

        if (order.status === 'failed' || order.status === 'expired') {
            return res.json({
                status: 'error',
                errorCode: 'ORDER_CLOSED',
                message: `Order is already ${order.status}`,
                timestamp: new Date().toISOString()
            });
        }

        // Submit UTR to upstream provider
        const channelName = order.actualChannel || order.channelName;
        const upstreamResult = await channelRouter.submitUtr(channelName, order.orderId, utrClean);

        // Update UTR in our DB regardless of upstream result (for tracking)
        await order.update({ utr: utrClean });

        if (upstreamResult.success) {
            console.log(`[Payin SubmitUTR] UTR ${utrClean} submitted for order ${orderId} via ${channelName}`);
            return res.json({
                status: 'success',
                message: 'UTR submitted successfully',
                timestamp: new Date().toISOString(),
                result: {
                    merchantOrderId: order.orderId,
                    platformOrderId: order.id,
                    orderStatus: order.status,
                    transactionRef: utrClean
                }
            });
        } else {
            // UTR saved locally but upstream rejected — still return success with warning
            console.warn(`[Payin SubmitUTR] Upstream rejected UTR for order ${orderId}: ${upstreamResult.error}`);
            return res.json({
                status: 'success',
                message: 'UTR recorded. Verification is in progress.',
                timestamp: new Date().toISOString(),
                result: {
                    merchantOrderId: order.orderId,
                    platformOrderId: order.id,
                    orderStatus: order.status,
                    transactionRef: utrClean
                }
            });
        }

    } catch (error) {
        console.error('[Payin SubmitUTR] Error:', error);
        return res.status(500).json({
            status: 'error',
            errorCode: 'INTERNAL_ERROR',
            message: 'Internal server error',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/payin/checkUtr
 * Check UTR status for a payin order
 */
router.post('/checkUtr', validateMerchant, async (req, res) => {
    try {
        const { orderId } = req.body;
        const merchant = req.merchant;

        if (!orderId) {
            return res.json({
                status: 'error',
                errorCode: 'INVALID_PARAMS',
                message: 'Missing required parameter: orderId',
                timestamp: new Date().toISOString()
            });
        }

        const order = await Order.findOne({
            where: { merchantId: merchant.id, orderId: orderId, type: 'payin' }
        });

        if (!order) {
            return res.json({
                status: 'error',
                errorCode: 'NOT_FOUND',
                message: 'Order not found',
                timestamp: new Date().toISOString()
            });
        }

        // Sync with upstream to get latest UTR/status
        if (order.status === 'pending' || order.status === 'processing' || (order.status === 'success' && !order.utr)) {
            try {
                const channelName = order.actualChannel || order.channelName;
                if (channelName) {
                    const queryResult = await channelRouter.queryPayin(channelName, order.orderId);

                    if (queryResult.success) {
                        const updates = {};
                        let updated = false;

                        // Update status if changed (only move forward)
                        if (queryResult.status && queryResult.status !== order.status) {
                            if (order.status === 'pending' || order.status === 'processing') {
                                updates.status = queryResult.status;
                                updated = true;
                            }
                        }

                        // Update UTR if available
                        if (queryResult.utr && queryResult.utr !== 'None' && queryResult.utr !== order.utr) {
                            updates.utr = queryResult.utr;
                            updated = true;
                        }

                        if (updated) {
                            await order.update(updates);
                            await order.reload();
                        }
                    }
                }
            } catch (err) {
                console.error('[Payin CheckUTR Sync Error]', err.message);
                // Continue to return DB state if sync fails
            }
        }

        return res.json({
            status: 'success',
            timestamp: new Date().toISOString(),
            result: {
                merchantOrderId: order.orderId,
                platformOrderId: order.id,
                orderStatus: order.status,
                requestedAmount: parseFloat(order.amount),
                settledAmount: parseFloat(order.netAmount),
                processingFee: parseFloat(order.fee),
                transactionRef: order.utr || null,
                utrSubmitted: !!order.utr,
                createdAt: order.createdAt.toISOString()
            }
        });

    } catch (error) {
        console.error('[Payin CheckUTR] Error:', error);
        return res.status(500).json({
            status: 'error',
            errorCode: 'INTERNAL_ERROR',
            message: 'Internal server error',
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
