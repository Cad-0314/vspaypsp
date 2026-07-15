const axios = require('axios');
const http = require('http');
const https = require('https');
const { Order, User, CallbackRetry } = require('../models');
const { signCallback } = require('../middleware/apiAuth');
const sequelize = require('../config/database');
const { Op } = require('sequelize');

// HTTP Keep-Alive agents for high throughput callback forwarding
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

// Axios instance with keep-alive for merchant callbacks
const callbackClient = axios.create({
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' },
    httpAgent,
    httpsAgent,
    validateStatus: () => true // Resolve for all status codes
});

// Retry configuration
const MAX_CALLBACK_RETRIES = 5;
const RETRY_DELAYS_MS = [0, 30000, 60000, 300000, 600000]; // 0s, 30s, 1m, 5m, 10m
const RETRY_POLL_INTERVAL = 30000; // 30 seconds

const callbackService = {

    /**
     * Send callback for an order (auto-detect type)
     * @param {string} orderId - The merchant order ID or internal UUID
     * @returns {Promise<Object>} - Result of the callback attempt
     */
    manualCallback: async (orderId) => {
        try {
            const order = await Order.findOne({
                where: sequelize.or(
                    { orderId: orderId },
                    { id: orderId }
                )
            });

            if (!order) {
                return { success: false, message: 'Order not found' };
            }

            if (!order.callbackUrl) {
                return { success: false, message: 'No callback URL configured for this order' };
            }

            let result;
            if (order.type === 'payin') {
                result = await callbackService.sendPayinCallback(order, order.status, order.utr);
            } else {
                result = await callbackService.sendPayoutCallback(order, order.status, order.utr);
            }

            return result;

        } catch (error) {
            console.error('[CallbackService] Manual callback error:', error);
            return { success: false, message: error.message };
        }
    },

    /**
     * Send Payin Callback
     */
    sendPayinCallback: async (order, status, utr) => {
        try {
            const merchant = await User.findByPk(order.merchantId);
            if (!merchant) return { success: false, message: 'Merchant not found' };

            const callbackData = {
                orderId: order.orderId,
                amount: parseFloat(order.amount).toFixed(2),
                status: status === 'success' ? 'SUCCESS' : 'FAIL',
                utr: utr || '',
                param: order.param || ''
            };

            callbackData.sign = signCallback(callbackData, merchant.apiSecret);

            console.log(`[Callback] Sending payin to ${order.callbackUrl}`);

            const response = await callbackClient.post(order.callbackUrl, callbackData);

            const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            const isOk = responseText.toUpperCase().includes('SUCCESS') || responseText.toUpperCase().includes('OK');

            // Update order stats
            if (isOk) {
                await order.update({ callbackSent: true, callbackAttempts: order.callbackAttempts + 1 });
            } else {
                await order.update({ callbackAttempts: order.callbackAttempts + 1 });
            }

            return {
                success: true,
                httpCode: response.status,
                response: responseText,
                isOk: isOk,
                dataSent: callbackData
            };

        } catch (error) {
            console.error(`[Callback] Payin send error: ${error.message}`);
            return { success: false, message: error.message };
        }
    },

    /**
     * Send Payout Callback
     */
    sendPayoutCallback: async (order, status, utr) => {
        try {
            const merchant = await User.findByPk(order.merchantId);
            if (!merchant) return { success: false, message: 'Merchant not found' };

            const callbackData = {
                orderId: order.orderId,
                amount: parseFloat(order.amount).toFixed(2),
                status: status === 'success' ? 'SUCCESS' : 'FAIL',
                utr: utr || '',
                param: order.param || ''
            };

            callbackData.sign = signCallback(callbackData, merchant.apiSecret);

            console.log(`[Callback] Sending payout to ${order.callbackUrl}`);

            const response = await callbackClient.post(order.callbackUrl, callbackData);

            const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            const isOk = responseText.toUpperCase().includes('SUCCESS') || responseText.toUpperCase().includes('OK');

            if (isOk) {
                await order.update({ callbackSent: true, callbackAttempts: order.callbackAttempts + 1 });
            } else {
                await order.update({ callbackAttempts: order.callbackAttempts + 1 });
            }

            return {
                success: true,
                httpCode: response.status,
                response: responseText,
                isOk: isOk,
                dataSent: callbackData
            };

        } catch (error) {
            console.error(`[Callback] Payout send error: ${error.message}`);
            return { success: false, message: error.message };
        }
    },

    /**
     * Schedule Retry — DB-backed (survives PM2 restarts)
     * Replaces the old setTimeout-based retry that was lost on restart
     */
    scheduleRetry: async (order, status, utr, type) => {
        try {
            const attempts = (order.callbackAttempts || 0) + 1;
            if (attempts >= MAX_CALLBACK_RETRIES) {
                console.log(`[Callback] Max retries reached for ${order.orderId}, giving up`);
                return;
            }

            const delay = RETRY_DELAYS_MS[attempts] || 600000;
            const nextRetryAt = new Date(Date.now() + delay);

            // Upsert: if a retry already exists for this order, update it
            const [retry, created] = await CallbackRetry.findOrCreate({
                where: { orderUuid: order.id, completedAt: null },
                defaults: {
                    orderId: order.orderId,
                    orderUuid: order.id,
                    type: type,
                    status: status,
                    utr: utr || '',
                    attempts: attempts,
                    maxAttempts: MAX_CALLBACK_RETRIES,
                    nextRetryAt: nextRetryAt
                }
            });

            if (!created) {
                // Update existing retry
                await retry.update({
                    attempts: attempts,
                    nextRetryAt: nextRetryAt,
                    status: status,
                    utr: utr || ''
                });
            }

            console.log(`[Callback] Scheduled DB retry ${attempts} for ${order.orderId} at ${nextRetryAt.toISOString()}`);
        } catch (error) {
            console.error(`[Callback] Failed to schedule retry for ${order.orderId}:`, error.message);
        }
    },

    /**
     * Process pending retries from DB
     * Called on a 30-second interval from server.js (only on PM2 instance 0)
     */
    processRetries: async () => {
        try {
            const now = new Date();

            // Find retries that are due and not completed
            const retries = await CallbackRetry.findAll({
                where: {
                    nextRetryAt: { [Op.lte]: now },
                    completedAt: null,
                    attempts: { [Op.lt]: sequelize.col('maxAttempts') }
                },
                limit: 20, // Process max 20 at a time to avoid overload
                order: [['nextRetryAt', 'ASC']]
            });

            if (retries.length === 0) return;

            console.log(`[CallbackRetry] Processing ${retries.length} pending retries`);

            for (const retry of retries) {
                try {
                    const order = await Order.findByPk(retry.orderUuid);
                    if (!order) {
                        await retry.update({ completedAt: now, lastError: 'Order not found' });
                        continue;
                    }

                    // Skip if already delivered
                    if (order.callbackSent) {
                        await retry.update({ completedAt: now });
                        continue;
                    }

                    // Skip if no callback URL
                    if (!order.callbackUrl) {
                        await retry.update({ completedAt: now, lastError: 'No callback URL' });
                        continue;
                    }

                    // Send callback
                    let result;
                    if (retry.type === 'payin') {
                        result = await callbackService.sendPayinCallback(order, retry.status, retry.utr);
                    } else {
                        result = await callbackService.sendPayoutCallback(order, retry.status, retry.utr);
                    }

                    if (result.isOk) {
                        // Success! Mark as completed
                        await retry.update({ completedAt: now, attempts: retry.attempts + 1 });
                        console.log(`[CallbackRetry] Successfully delivered callback for ${retry.orderId}`);
                    } else {
                        // Failed — schedule next retry
                        const nextAttempt = retry.attempts + 1;
                        if (nextAttempt >= retry.maxAttempts) {
                            await retry.update({
                                completedAt: now,
                                attempts: nextAttempt,
                                lastError: `Max retries reached. Last response: ${result.response || result.message}`
                            });
                            console.log(`[CallbackRetry] Max retries reached for ${retry.orderId}`);
                        } else {
                            const nextDelay = RETRY_DELAYS_MS[nextAttempt] || 600000;
                            await retry.update({
                                attempts: nextAttempt,
                                nextRetryAt: new Date(Date.now() + nextDelay),
                                lastError: result.response || result.message
                            });
                        }
                    }
                } catch (retryErr) {
                    console.error(`[CallbackRetry] Error processing retry for ${retry.orderId}:`, retryErr.message);
                    await retry.update({
                        lastError: retryErr.message,
                        nextRetryAt: new Date(Date.now() + 60000) // Retry in 1 min on error
                    });
                }
            }
        } catch (error) {
            console.error('[CallbackRetry] Fatal error in processRetries:', error.message);
        }
    }
};

module.exports = callbackService;
