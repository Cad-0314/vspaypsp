/**
 * CXPay API Service
 * Provider for CXPay channel (internal name: cxpay)
 * Uses MD5 signature: sorted params + &key=secret_key
 */

const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
require('dotenv').config();

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

const BASE_URL = process.env.CXPAY_BASE_URL;
const MERCHANT_ID = process.env.CXPAY_MERCHANT_ID;
const SECRET_KEY = process.env.CXPAY_SECRET_KEY;

const httpClient = axios.create({
    baseURL: BASE_URL,
    timeout: 60000,
    headers: { 'Content-Type': 'application/json' },
    family: 4,
    httpAgent,
    httpsAgent
});

/**
 * Generate MD5 signature for CXPay requests
 * Sort params alphabetically (ASCII), concatenate as key=value&, append &key=SECRET_KEY
 * Then MD5 and lowercase
 */
function generateSign(params) {
    const sortedKeys = Object.keys(params).filter(k => k !== 'sign' && params[k] !== null && params[k] !== undefined && params[k] !== '').sort();
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
 * POST /collect/create
 */
async function createPayin({ orderId, amount, notifyUrl, returnUrl, customerName }) {
    try {
        const payload = {
            merchant: MERCHANT_ID,
            payCode: '32901',
            amount: String(parseFloat(amount).toFixed(2)),
            orderId: orderId,
            notifyUrl: notifyUrl,
            callbackUrl: returnUrl || '',
            customName: customerName || ''
        };

        payload.sign = generateSign(payload);

        console.log('[CXPay] Creating payin:', { orderId, amount });
        const response = await httpClient.post('/collect/create', payload);

        if (response.data.code === 200 && response.data.success) {
            return {
                success: true,
                payUrl: response.data.data.url,
                providerOrderId: response.data.data.platOrderId || orderId
            };
        } else {
            console.error('[CXPay] Payin error:', response.data);
            return {
                success: false,
                error: response.data.msg || response.data.desc || `Error code: ${response.data.code}`
            };
        }
    } catch (error) {
        console.error('[CXPay] Payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query order status
 * POST /order/query
 */
async function queryPayin(orderId) {
    try {
        const payload = {
            merchant: MERCHANT_ID,
            orderId: orderId
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/order/query', payload);

        if (response.data.code === 200 && response.data.success) {
            const data = response.data.data;
            return {
                success: true,
                orderId: data.orderId,
                providerOrderId: data.platOrderId,
                status: mapStatus(data.status),
                utr: data.utr,
                amount: data.amount
            };
        } else {
            return { success: false, error: response.data.msg || 'Query failed' };
        }
    } catch (error) {
        console.error('[CXPay] Query payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Create payout order (proxy payment)
 * POST /pay/create
 */
async function createPayout({ orderId, amount, accountNo, ifsc, name, upi, notifyUrl }) {
    try {
        const payload = {
            merchant: MERCHANT_ID,
            payCode: '32911',
            amount: String(parseFloat(amount).toFixed(2)),
            orderId: orderId,
            notifyUrl: notifyUrl,
            bankAccount: accountNo || upi || '',
            customName: name || '',
            remark: ifsc || ''
        };

        payload.sign = generateSign(payload);

        console.log('[CXPay] Creating payout:', { orderId, amount });
        const response = await httpClient.post('/pay/create', payload);

        if (response.data.code === 200 && response.data.success) {
            return {
                success: true,
                providerOrderId: response.data.data.platOrderId,
                status: 'processing'
            };
        } else {
            console.error('[CXPay] Payout error:', response.data);
            return {
                success: false,
                error: response.data.msg || response.data.desc || `Error code: ${response.data.code}`
            };
        }
    } catch (error) {
        console.error('[CXPay] Payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payout order status
 */
async function queryPayout(orderId) {
    try {
        const payload = {
            merchant: MERCHANT_ID,
            orderId: orderId
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/order/query', payload);

        if (response.data.code === 200 && response.data.success) {
            const data = response.data.data;
            return {
                success: true,
                orderId: data.orderId,
                providerOrderId: data.platOrderId,
                status: mapStatus(data.status),
                utr: data.utr
            };
        } else {
            return { success: false, error: response.data.msg || 'Query failed' };
        }
    } catch (error) {
        console.error('[CXPay] Query payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get balance
 * POST /order/balance
 */
async function getBalance() {
    try {
        const payload = {
            merchant: MERCHANT_ID
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/order/balance', payload);

        if (response.data.code === 200 && response.data.success) {
            const data = response.data.data;
            return {
                success: true,
                balance: parseFloat(data.balanceAll) || 0,
                availableBalance: parseFloat(data.balanceUsable) || 0
            };
        } else {
            return { success: false, error: response.data.msg || 'Balance query failed' };
        }
    } catch (error) {
        console.error('[CXPay] Balance exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Submit UTR (not supported by CXPay)
 */
async function submitUtr(orderId, utr) {
    return { success: false, error: 'UTR submission not supported by this channel' };
}

/**
 * Map CXPay status codes to standard statuses
 * 0 = pending (Payment submission)
 * 1 = success
 * 2 = failed
 */
function mapStatus(status) {
    if (status === 1 || status === '1') return 'success';
    if (status === 2 || status === '2') return 'failed';
    return 'pending';
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
    usesCustomPayPage: false,
    providerName: 'cxpay'
};
