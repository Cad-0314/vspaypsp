/**
 * Payment Page Routes
 * GET /pay/:orderId - Render payment page
 * POST /pay/:orderId/utr - Submit UTR
 * GET /pay/success - Success page
 */

const express = require('express');
const router = express.Router();
const { Order } = require('../models');
const channelRouter = require('../services/channelRouter');
const path = require('path');

/**
 * Helper to ensure an upstream order is created for dashboard-generated links
 */
async function ensureUpstreamOrder(order, userIp) {
    if (order.payUrl || order.status !== 'pending') return true;

    const APP_URL = process.env.APP_URL || 'https://gaurpay.site';

    // Use actualChannel if channelName is not a real channel (e.g. manual_topup, paylinks)
    let effectiveChannel = order.channelName;
    if (!channelRouter.isValidChannel(effectiveChannel) || effectiveChannel === 'manual_topup') {
        effectiveChannel = order.actualChannel || order.channelName;
    }

    // If still not valid, abort
    if (!channelRouter.isValidChannel(effectiveChannel)) {
        console.error(`[PayPage] No valid channel for order ${order.id}: channelName=${order.channelName}, actualChannel=${order.actualChannel}`);
        return false;
    }

    const notifyUrl = `${APP_URL}/callback/${effectiveChannel}/payin`;

    console.log(`[PayPage] Initializing upstream order for ${order.id} via ${effectiveChannel}`);
    const result = await channelRouter.createPayin(effectiveChannel, {
        orderId: order.orderId,
        amount: parseFloat(order.amount),
        notifyUrl,
        returnUrl: order.skipUrl || `${APP_URL}/pay/success`,
        customerName: 'Customer',
        customerPhone: '9999999999',
        customerEmail: 'customer@example.com',
        customerIp: userIp || '127.0.0.1'
    });

    if (result.success) {
        await order.update({
            providerOrderId: result.providerOrderId,
            payUrl: result.payUrl,
            deepLinks: result.deepLinks || null,
            providerResponse: JSON.stringify(result),
            channelName: effectiveChannel // Update to the real channel for callback routing
        });
        return true;
    } else {
        console.error(`[PayPage] Upstream initialization failed: ${result.error}`);
        return false;
    }
}

/**
 * GET /pay/:orderId
 * Render payment page for an order
 */
router.get('/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;

        const { Op } = require('sequelize');
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId);

        const order = await Order.findOne({
            where: {
                [Op.or]: isUuid ? [{ id: orderId }, { orderId: orderId }] : [{ orderId: orderId }],
                type: 'payin'
            }
        });

        if (!order) {
            return res.status(404).send('Payment not found');
        }

        // Check if expired
        if (order.expiresAt && new Date() > new Date(order.expiresAt)) {
            return res.status(410).send('Payment expired');
        }

        // For dashboard links, ensure upstream is created before deciding redirect
        if (!order.payUrl && order.status === 'pending') {
            const success = await ensureUpstreamOrder(order, req.ip);
            if (!success) {
                return res.status(422).send('Failed to initialize payment gateway. Please try again later.');
            }
        }

        // Check if channel uses its own custom pay page (UPI deep links etc.) or upstream URL
        const channelConfig = channelRouter.getChannelConfig(order.channelName);
        if (channelConfig && channelConfig.usesCustomPayPage) {
            // Serve the UPI deep-link pay page
            return res.sendFile(path.join(__dirname, '../../public/pay.html'));
        }

        // For all other channels, wrap upstream URL in iframe (never redirect to upstream)
        res.sendFile(path.join(__dirname, '../../public/gateway.html'));

    } catch (error) {
        console.error('[Pay Page] Error:', error);
        return res.status(500).send('Server error');
    }
});

/**
 * GET /pay/gateway/:orderId
 * Returns the upstream payment URL for the iframe wrapper (internal use only)
 */
router.get('/gateway/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;

        const { Op } = require('sequelize');
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId);

        const order = await Order.findOne({
            where: {
                [Op.or]: isUuid ? [{ id: orderId }, { orderId: orderId }] : [{ orderId: orderId }],
                type: 'payin'
            }
        });

        if (!order) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }

        if (order.expiresAt && new Date() > new Date(order.expiresAt)) {
            return res.status(410).json({ success: false, error: 'Payment expired' });
        }

        // Ensure upstream order exists
        if (!order.payUrl && order.status === 'pending') {
            const success = await ensureUpstreamOrder(order, req.ip);
            if (!success) {
                return res.status(422).json({ success: false, error: 'Failed to initialize payment gateway' });
            }
            await order.reload();
        }

        if (!order.payUrl) {
            return res.status(422).json({ success: false, error: 'Payment URL not available' });
        }

        res.json({ success: true, url: order.payUrl });

    } catch (error) {
        console.error('[Pay Gateway API] Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * GET /pay/api/:orderId
 * Returns payment data for the frontend
 */
router.get('/api/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;

        const { Op } = require('sequelize');
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId);

        const order = await Order.findOne({
            where: {
                [Op.or]: isUuid ? [{ id: orderId }, { orderId: orderId }] : [{ orderId: orderId }],
                type: 'payin'
            }
        });

        if (!order) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }

        // Check if expired
        if (order.expiresAt && new Date() > new Date(order.expiresAt)) {
            return res.status(410).json({ success: false, error: 'Payment expired' });
        }

        // Ensure upstream order exists (for API-only calls)
        if (!order.payUrl && order.status === 'pending') {
            const success = await ensureUpstreamOrder(order, req.ip);
            if (!success) {
                return res.status(422).json({ success: false, error: 'Failed to initialize payment gateway' });
            }
        }

        const paymentData = {
            orderId: order.id,
            merchantOrderId: order.orderId,
            amount: parseFloat(order.amount),
            status: order.status,
            payUrl: order.payUrl,
            deepLinks: order.deepLinks || {},
            expiresAt: order.expiresAt ? new Date(order.expiresAt).getTime() : null,
            skipUrl: order.skipUrl
        };

        res.json(paymentData);

    } catch (error) {
        console.error('[Pay Page API] Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * POST /pay/:orderId/utr
 * Submit UTR for an order
 */
router.post('/:orderId/utr', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { utr } = req.body;

        if (!utr || utr.length < 6) {
            return res.json({ success: false, error: 'Invalid UTR' });
        }

        const { Op } = require('sequelize');
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId);

        const order = await Order.findOne({
            where: {
                [Op.or]: isUuid ? [{ id: orderId }, { orderId: orderId }] : [{ orderId: orderId }],
                type: 'payin'
            }
        });

        if (!order) {
            return res.json({ success: false, error: 'Order not found' });
        }

        if (order.status === 'success') {
            return res.json({ success: true, message: 'Payment already confirmed' });
        }

        // Submit UTR to upstream provider
        const result = await channelRouter.submitUtr(order.channelName, order.orderId, utr);

        if (result.success) {
            await order.update({ utr: utr });
            return res.json({ success: true, message: 'UTR submitted successfully' });
        } else {
            return res.json({ success: false, error: result.error || 'Failed to submit UTR' });
        }

    } catch (error) {
        console.error('[UTR Submit] Error:', error);
        return res.json({ success: false, error: 'Server error' });
    }
});

/**
 * GET /pay/success
 * Success page after payment
 */
router.get('/success', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Payment Successful</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: -apple-system, sans-serif; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .container {
                    background: white;
                    padding: 3rem;
                    border-radius: 1rem;
                    text-align: center;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                }
                .icon { font-size: 4rem; margin-bottom: 1rem; }
                h1 { color: #10b981; margin-bottom: 0.5rem; }
                p { color: #6b7280; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="icon">✅</div>
                <h1>Payment Successful</h1>
                <p>Your payment has been processed successfully.</p>
            </div>
        </body>
        </html>
    `);
});

module.exports = router;
