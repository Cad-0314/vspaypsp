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
 * GET /pay/:orderId
 * Render payment page for an order
 */
router.get('/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;

        const order = await Order.findOne({
            where: { id: orderId, type: 'payin' }
        });

        if (!order) {
            return res.status(404).send('Payment not found');
        }

        // Check if expired
        if (order.expiresAt && new Date() > new Date(order.expiresAt)) {
            return res.status(410).send('Payment expired');
        }

        // Check if already completed
        if (order.status === 'success') {
            return res.redirect('/pay/success?orderId=' + orderId);
        }

        if (order.status === 'failed') {
            return res.status(400).send('Payment failed');
        }

        const channelConfig = channelRouter.getChannelConfig(order.channelName);

        // If channel doesn't use custom pay page, redirect to provider URL
        if (!channelConfig.usesCustomPayPage && order.payUrl) {
            return res.redirect(order.payUrl);
        }

        // Prepare data for payment page
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

        // For simplicity, send JSON that the static HTML will fetch
        // You could also render an EJS template here
        res.json(paymentData);

    } catch (error) {
        console.error('[Pay Page] Error:', error);
        return res.status(500).send('Server error');
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

        const order = await Order.findOne({
            where: { id: orderId, type: 'payin' }
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
