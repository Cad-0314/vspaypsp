/**
 * FirPay API Service
 * Provider for FirPay channel (internal name: firpay)
 * Uses MD5 signature: sorted params (key ascending) + &key=secret_key
 * 
 * API Endpoints:
 * - Payin: /pay/payment (create), /pay/query (query)
 * - Payout: /pay/payout (create), /pay/queryPayout (query)
 * - Callbacks: POST to notifyUrl with status 1=success
 * 
 * Gateway: https://firepayment.org
 */

const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
require('dotenv').config();

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

const BASE_URL = process.env.FIRPAY_BASE_URL;
const MERCHANT_ID = process.env.FIRPAY_MERCHANT_ID;
const SECRET_KEY = process.env.FIRPAY_SECRET_KEY;

const httpClient = axios.create({
    baseURL: BASE_URL,
    timeout: 60000,
    headers: { 'Content-Type': 'application/json' },
    family: 4,
    httpAgent,
    httpsAgent
});

/**
 * Generate MD5 signature for FirPay requests
 * 1. Sort params by key in ascending order (ASCII)
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
 * POST /pay/payment
 */
async function createPayin({ orderId, amount, notifyUrl, returnUrl }) {
    try {
        const payload = {
            merchantNumber: MERCHANT_ID,
            outTradeNo: orderId,
            amount: parseFloat(amount).toFixed(2),
            notifyUrl: notifyUrl,
            callbackUrl: returnUrl || notifyUrl
        };

        payload.sign = generateSign(payload);

        console.log('[FirPay] Creating payin:', { orderId, amount });
        const response = await httpClient.post('/pay/payment', payload);

        if (response.data.code === '200' && response.data.data) {
            return {
                success: true,
                payUrl: response.data.data.payUrl,
                providerOrderId: response.data.data.orderNo || orderId
            };
        } else {
            console.error('[FirPay] Payin error:', response.data);
            return {
                success: false,
                error: response.data.msg || `Error code: ${response.data.code}`
            };
        }
    } catch (error) {
        console.error('[FirPay] Payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payin order status (collection inquiry)
 * POST /pay/query
 */
async function queryPayin(orderId) {
    try {
        const payload = {
            outTradeNo: orderId,
            merchantNumber: MERCHANT_ID
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/pay/query', payload);

        if (response.data.code === '200' && response.data.data) {
            const data = response.data.data;
            return {
                success: true,
                orderId: data.outTradeNo,
                providerOrderId: data.orderNo,
                status: mapPayinStatus(data.status),
                utr: data.utr || '',
                amount: data.amount
            };
        } else {
            return { success: false, error: response.data.msg || 'Query failed' };
        }
    } catch (error) {
        console.error('[FirPay] Query payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Create payout order (payment)
 * POST /pay/payout
 */
async function createPayout({ orderId, amount, name, accountNo, ifsc, notifyUrl, customerPhone }) {
    try {
        const payload = {
            merchantNumber: MERCHANT_ID,
            outTradeNo: orderId,
            amount: parseFloat(amount).toFixed(2),
            notifyUrl: notifyUrl,
            accName: name || 'User',
            accNo: accountNo || '',
            ifsc: ifsc || '',
            mobileNo: customerPhone || '9999999999'
        };

        payload.sign = generateSign(payload);

        console.log('[FirPay] Creating payout:', { orderId, amount });
        const response = await httpClient.post('/pay/payout', payload);

        if (response.data.code === '200' && response.data.data) {
            return {
                success: true,
                providerOrderId: response.data.data.orderNo,
                status: response.data.data.status === '0' ? 'processing' : 'processing'
            };
        } else {
            console.error('[FirPay] Payout error:', response.data);
            return {
                success: false,
                error: response.data.msg || `Error code: ${response.data.code}`
            };
        }
    } catch (error) {
        console.error('[FirPay] Payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payout order status (payment inquiry)
 * POST /pay/queryPayout
 */
async function queryPayout(orderId) {
    try {
        const payload = {
            outTradeNo: orderId,
            merchantNumber: MERCHANT_ID
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/pay/queryPayout', payload);

        if (response.data.code === '200' && response.data.data) {
            const data = response.data.data;
            return {
                success: true,
                orderId: data.outTradeNo,
                providerOrderId: data.orderNo,
                status: mapPayoutStatus(data.status),
                utr: data.utr || '',
                amount: data.amount
            };
        } else {
            return { success: false, error: response.data.msg || 'Query failed' };
        }
    } catch (error) {
        console.error('[FirPay] Query payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get balance (not supported by FirPay)
 */
async function getBalance() {
    return { success: false, error: 'Balance query not supported by this channel' };
}

/**
 * Submit UTR (not supported by FirPay)
 */
async function submitUtr(orderId, utr) {
    return { success: false, error: 'UTR submission not supported by this channel' };
}

/**
 * Map FirPay payin status to standard statuses
 * 1 = success
 * 0 = processing
 * others = failed
 */
function mapPayinStatus(status) {
    const statusNum = parseInt(status);
    if (statusNum === 1) return 'success';
    if (statusNum === 0) return 'pending';
    return 'failed';
}

/**
 * Map FirPay payout status to standard statuses
 * 1 = success
 * 0 = processing
 * others = failed
 */
function mapPayoutStatus(status) {
    const statusNum = parseInt(status);
    if (statusNum === 1) return 'success';
    if (statusNum === 0) return 'processing';
    return 'failed';
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
    providerName: 'firpay'
};
