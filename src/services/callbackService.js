const axios = require('axios');
const http = require('http');
const https = require('https');
const { Order, User } = require('../models');
const { signCallback } = require('../middleware/apiAuth');
const sequelize = require('../config/database');

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
const RETRY_DELAYS = [0, 30000, 60000, 300000, 600000]; // 0s, 30s, 1m, 5m, 10m

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
                status: status === 'success' ? 1 : 0,
                amount: parseFloat(parseFloat(order.netAmount).toFixed(2)),
                orderAmount: parseFloat(parseFloat(order.amount).toFixed(2)),
                orderId: order.orderId,
                id: order.id,
                utr: utr || '',
                param: order.param || ''
            };

            callbackData.sign = signCallback(callbackData, merchant.apiSecret);

            console.log(`[Callback] Sending payin to ${order.callbackUrl}`);

            const response = await callbackClient.post(order.callbackUrl, callbackData);

            const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            const isOk = responseText.toUpperCase().includes('OK');

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
                status: status === 'success' ? 1 : 0,
                amount: parseFloat(parseFloat(order.amount).toFixed(2)),
                orderId: order.orderId,
                id: order.id,
                utr: utr || '',
                message: status === 'success' ? 'success' : 'failed',
                param: order.param || ''
            };

            callbackData.sign = signCallback(callbackData, merchant.apiSecret);

            console.log(`[Callback] Sending payout to ${order.callbackUrl}`);

            const response = await callbackClient.post(order.callbackUrl, callbackData);

            const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            const isOk = responseText.toUpperCase().includes('OK');

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
     * Schedule Retry
     */
    scheduleRetry: (order, status, utr, type) => {
        const attempts = order.callbackAttempts + 1;
        if (attempts >= MAX_CALLBACK_RETRIES) return;

        const delay = RETRY_DELAYS[attempts] || 600000;
        console.log(`[Callback] Scheduling retry ${attempts} in ${delay / 1000}s for ${order.orderId}`);

        setTimeout(async () => {
            const freshOrder = await Order.findByPk(order.id);
            if (freshOrder && !freshOrder.callbackSent) {
                if (type === 'payin') {
                    await callbackService.sendPayinCallback(freshOrder, status, utr);
                } else {
                    await callbackService.sendPayoutCallback(freshOrder, status, utr);
                }
            }
        }, delay);
    }
};

module.exports = callbackService;
