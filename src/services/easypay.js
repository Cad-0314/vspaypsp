/**
 * EasyPay API Service
 * Provider for EasyPay channel (internal name: easypay)
 * Uses MD5 signature: sorted params (key ascending, excl sign & empty) + &key=secret → MD5 → lowercase
 * 
 * API Endpoints:
 * - Payin:        POST /api/collection/submit
 * - Payin Query:  POST /api/collection/status
 * - Payout:       POST /api/transfer/submit
 * - Payout Query: POST /api/transfer/status
 * - Balance:      POST /api/collection/balance
 * - Callbacks:    payin status=SUCCESS/FAIL (string), payout status=1/-1 (integer)
 * 
 * IMPORTANT: Amount is in INR (NOT cents). Send as-is.
 * 
 * Gateway: https://mchapi.easypayy.xyz/
 */

const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
require('dotenv').config();

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

const BASE_URL = process.env.EASYPAY_BASE_URL;
const MERCHANT_ID = process.env.EASYPAY_MERCHANT_ID;
const SECRET_KEY = process.env.EASYPAY_SECRET_KEY;

const httpClient = axios.create({
    baseURL: BASE_URL,
    timeout: 60000,
    headers: { 'Content-Type': 'application/json' },
    family: 4,
    httpAgent,
    httpsAgent
});

/**
 * Generate MD5 signature for EasyPay requests (lowercase)
 * 1. Sort params by key in ascending ASCII order
 * 2. Filter out 'sign' and empty/null values
 * 3. Concatenate as key1=value1&key2=value2
 * 4. Append &key=SECRET_KEY
 * 5. MD5 hash and lowercase
 */
function generateSign(params) {
    const sortedKeys = Object.keys(params)
        .filter(k => k !== 'sign' && params[k] !== null && params[k] !== undefined && params[k] !== '')
        .sort();
    const str = sortedKeys.map(k => `${k}=${params[k]}`).join('&') + `&key=${SECRET_KEY}`;
    return crypto.createHash('md5').update(str).digest('hex').toLowerCase();
}

/**
 * Verify callback signature
 */
function verifySign(params) {
    const receivedSign = params.sign;
    const calculated = generateSign(params);
    return calculated === receivedSign;
}

/**
 * Create payin order (collection)
 * POST /api/collection/submit
 */
async function createPayin({ orderId, amount, notifyUrl, returnUrl, customerName, customerEmail, customerPhone, customerIp }) {
    try {
        const payload = {
            apiKey: MERCHANT_ID,
            merchantOrderNo: orderId,
            orderAmount: parseFloat(amount),
            customerName: customerName || 'User',
            customerEmail: customerEmail || 'user@example.com',
            customerPhone: customerPhone || '9999999999',
            callbackAddress: notifyUrl,
            returnUrl: returnUrl || '',
            userIp: customerIp || '127.0.0.1'
        };

        payload.sign = generateSign(payload);

        console.log('[EasyPay] Creating payin:', { orderId, amount });
        const response = await httpClient.post('/api/collection/submit', payload);

        if (response.data.code === 200 && response.data.data) {
            const data = response.data.data;
            return {
                success: true,
                payUrl: data.paymentLink || '',
                providerOrderId: data.platformorderNo || data.platformOrderNo || orderId
            };
        } else {
            console.error('[EasyPay] Payin error:', response.data);
            return {
                success: false,
                error: response.data.message || `Error code: ${response.data.code}`
            };
        }
    } catch (error) {
        console.error('[EasyPay] Payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payin order status
 * POST /api/collection/status
 */
async function queryPayin(orderId) {
    try {
        const payload = {
            apiKey: MERCHANT_ID,
            merchantOrderNo: orderId
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/api/collection/status', payload);

        if (response.data.code === 200 && response.data.data) {
            const data = response.data.data;
            return {
                success: true,
                orderId: data.merchantOrderNo || data.merchantorderNo,
                providerOrderId: data.platformOrderNo || data.platformorderNo,
                status: mapPayinStatus(data.orderStatus),
                amount: parseFloat(data.orderAmount) || 0,
                payAmount: parseFloat(data.realAmount) || 0,
                utr: data.utr || ''
            };
        } else {
            return { success: false, error: response.data.message || 'Query failed' };
        }
    } catch (error) {
        console.error('[EasyPay] Payin query exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Create payout order (transfer)
 * POST /api/transfer/submit
 */
async function createPayout({ orderId, amount, name, accountNo, ifsc, notifyUrl, customerPhone, customerEmail }) {
    try {
        const payload = {
            apiKey: MERCHANT_ID,
            merchantOrderNo: orderId,
            orderAmount: parseFloat(amount),
            payeeName: name || 'User',
            payeeAccount: accountNo || '',
            payeePhone: customerPhone || '9999999999',
            payeeEmail: customerEmail || 'user@example.com',
            bankIfsc: ifsc || '',
            notifyAddress: notifyUrl,
            txnMode: 'IMPS'
        };

        payload.sign = generateSign(payload);

        console.log('[EasyPay] Creating payout:', { orderId, amount });
        const response = await httpClient.post('/api/transfer/submit', payload);

        if (response.data.code === 200 && response.data.data) {
            const data = response.data.data;
            return {
                success: true,
                providerOrderId: data.platformorderNo || data.platformOrderNo || orderId,
                status: mapPayoutStatus(data.orderstatus || data.orderStatus || 'PROCESSING')
            };
        } else {
            console.error('[EasyPay] Payout error:', response.data);
            return {
                success: false,
                error: response.data.message || `Error code: ${response.data.code}`
            };
        }
    } catch (error) {
        console.error('[EasyPay] Payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payout order status
 * POST /api/transfer/status
 */
async function queryPayout(orderId) {
    try {
        const payload = {
            apiKey: MERCHANT_ID,
            merchantOrderNo: orderId
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/api/transfer/status', payload);

        if (response.data.code === 200 && response.data.data) {
            const data = response.data.data;
            return {
                success: true,
                orderId: data.merchantOrderNo || data.merchantorderNo,
                providerOrderId: data.platformOrderNo || data.platformorderNo,
                status: mapPayoutStatus(data.orderStatus || data.orderstatus),
                amount: parseFloat(data.orderAmount) || 0,
                utr: data.utr || ''
            };
        } else {
            return { success: false, error: response.data.message || 'Query failed' };
        }
    } catch (error) {
        console.error('[EasyPay] Payout query exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get balance
 * POST /api/collection/balance
 */
async function getBalance() {
    try {
        const payload = {
            apiKey: MERCHANT_ID
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/api/collection/balance', payload);

        if (response.data.code === 200 && response.data.data) {
            const data = response.data.data;
            return {
                success: true,
                balance: parseFloat(data.usableBalance) || 0,
                settleBalance: parseFloat(data.frozenBalance) || 0
            };
        } else {
            return { success: false, error: response.data.message || 'Balance query failed' };
        }
    } catch (error) {
        console.error('[EasyPay] Balance exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Submit UTR (not supported by EasyPay)
 */
async function submitUtr(orderId, utr) {
    return { success: false, error: 'UTR submission not supported by this channel' };
}

/**
 * Map EasyPay payin order status to standard statuses
 * SUCCESS = success
 * PENDING / ACCEPT = pending
 * FAIL = failed
 * REFUND = failed
 */
function mapPayinStatus(status) {
    if (!status) return 'pending';
    const s = String(status).toUpperCase();
    switch (s) {
        case 'SUCCESS': return 'success';
        case 'FAIL': return 'failed';
        case 'REFUND': return 'failed';
        case 'PENDING':
        case 'ACCEPT':
        default: return 'pending';
    }
}

/**
 * Map EasyPay payout order status to standard statuses
 * SUCCESS = success
 * PROCESSING = processing
 * FAIL = failed
 */
function mapPayoutStatus(status) {
    if (!status) return 'processing';
    const s = String(status).toUpperCase();
    switch (s) {
        case 'SUCCESS': return 'success';
        case 'FAIL': return 'failed';
        case 'PROCESSING':
        default: return 'processing';
    }
}

module.exports = {
    createPayin,
    queryPayin,
    createPayout,
    queryPayout,
    getBalance,
    submitUtr,
    verifySign,
    generateSign,
    mapPayinStatus,
    mapPayoutStatus,
    usesCustomPayPage: false,
    providerName: 'easypay'
};
