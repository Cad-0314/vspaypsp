/**
 * AgPay API Service
 * Provider for AgPay channel (internal name: agpay)
 * Uses MD5 signature: sorted params (key ascending) + &key=secret_key → MD5 → UPPERCASE
 * 
 * API Endpoints (same base for payin/payout, differentiated by channelNo):
 * - Payin:  POST /api/order/unified  channelNo=8002
 * - Payout: POST /api/order/unified  channelNo=6002
 * - Query:  POST /api/order/query
 * - Balance: POST /api/balance/query
 * - Callbacks: via URL query params with orderState 2=success
 * 
 * IMPORTANT: Amount is in CENTS (paisa). Multiply rupee amount by 100.
 * 
 * Gateway: https://pay.perhap.in
 */

const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
require('dotenv').config();

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

const BASE_URL = process.env.AGPAY_BASE_URL;
const MERCHANT_ID = process.env.AGPAY_MERCHANT_ID;
const SECRET_KEY = process.env.AGPAY_SECRET_KEY;
const PAYIN_CHANNEL = process.env.AGPAY_PAYIN_CHANNEL || '8002';
const PAYOUT_CHANNEL = process.env.AGPAY_PAYOUT_CHANNEL || '6002';

const httpClient = axios.create({
    baseURL: BASE_URL,
    timeout: 60000,
    headers: { 'Content-Type': 'application/json' },
    family: 4,
    httpAgent,
    httpsAgent
});

/**
 * Generate MD5 signature for AgPay requests (UPPERCASE)
 * 1. Sort params by key in ascending ASCII order
 * 2. Filter out 'sign', 'signType', and empty/null values
 * 3. Concatenate as key1=value1&key2=value2
 * 4. Append &key=SECRET_KEY
 * 5. MD5 hash and UPPERCASE
 */
function generateSign(params) {
    const sortedKeys = Object.keys(params)
        .filter(k => k !== 'sign' && k !== 'signType' && params[k] !== null && params[k] !== undefined && params[k] !== '')
        .sort();
    const str = sortedKeys.map(k => `${k}=${params[k]}`).join('&') + `&key=${SECRET_KEY}`;
    return crypto.createHash('md5').update(str).digest('hex').toUpperCase();
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
 * POST /api/order/unified with channelNo=8002
 */
async function createPayin({ orderId, amount, notifyUrl, returnUrl, customerIp }) {
    try {
        const amountInCents = Math.round(parseFloat(amount) * 100);

        const payload = {
            mchNo: MERCHANT_ID,
            channelNo: PAYIN_CHANNEL,
            mchOrderNo: orderId,
            orderAmount: amountInCents,
            currency: 'INR',
            clientIp: customerIp || '127.0.0.1',
            notifyUrl: notifyUrl,
            returnUrl: returnUrl || '',
            expiredTime: 3600,
            extParam: '',
            reqTime: String(Date.now()),
            version: '2.0',
            signType: 'MD5'
        };

        payload.sign = generateSign(payload);

        console.log('[AgPay] Creating payin:', { orderId, amount, amountInCents });
        const response = await httpClient.post('/api/order/unified', payload);

        if (response.data.code === 0 && response.data.data) {
            const data = response.data.data;
            return {
                success: true,
                payUrl: data.payData || data.originalPayUrl || '',
                providerOrderId: data.orderNo || orderId
            };
        } else {
            console.error('[AgPay] Payin error:', response.data);
            return {
                success: false,
                error: response.data.msg || `Error code: ${response.data.code}`
            };
        }
    } catch (error) {
        console.error('[AgPay] Payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query order status (works for both payin and payout)
 * POST /api/order/query
 */
async function queryOrder(orderId, channelNo) {
    try {
        const payload = {
            mchNo: MERCHANT_ID,
            channelNo: channelNo,
            mchOrderNo: orderId,
            reqTime: String(Date.now()),
            version: '1.0',
            signType: 'MD5'
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/api/order/query', payload);

        if (response.data.code === 0 && response.data.data) {
            const data = response.data.data;
            return {
                success: true,
                orderId: data.mchOrderNo,
                providerOrderId: data.orderNo,
                status: mapOrderStatus(data.orderState),
                amount: data.orderAmount ? data.orderAmount / 100 : 0,
                payAmount: data.payAmount ? data.payAmount / 100 : 0
            };
        } else {
            return { success: false, error: response.data.msg || 'Query failed' };
        }
    } catch (error) {
        console.error('[AgPay] Query exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payin order status
 */
async function queryPayin(orderId) {
    return queryOrder(orderId, PAYIN_CHANNEL);
}

/**
 * Create payout order (payment on behalf)
 * POST /api/order/unified with channelNo=6002
 */
async function createPayout({ orderId, amount, name, accountNo, ifsc, notifyUrl, customerPhone }) {
    try {
        const amountInCents = Math.round(parseFloat(amount) * 100);

        const payload = {
            mchNo: MERCHANT_ID,
            channelNo: PAYOUT_CHANNEL,
            mchOrderNo: orderId,
            orderAmount: amountInCents,
            currency: 'INR',
            accountNo: accountNo || '',
            accountName: name || 'User',
            ifscCode: ifsc || '',
            number: customerPhone || '9999999999',
            transferMode: 'IMPS',
            clientIp: '127.0.0.1',
            notifyUrl: notifyUrl,
            returnUrl: '',
            expiredTime: 3600,
            extParam: '',
            reqTime: String(Date.now()),
            version: '2.0',
            signType: 'MD5'
        };

        payload.sign = generateSign(payload);

        console.log('[AgPay] Creating payout:', { orderId, amount, amountInCents });
        const response = await httpClient.post('/api/order/unified', payload);

        if (response.data.code === 0 && response.data.data) {
            const data = response.data.data;
            return {
                success: true,
                providerOrderId: data.orderNo,
                status: mapOrderStatus(data.orderState)
            };
        } else {
            console.error('[AgPay] Payout error:', response.data);
            return {
                success: false,
                error: response.data.msg || `Error code: ${response.data.code}`
            };
        }
    } catch (error) {
        console.error('[AgPay] Payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payout order status
 */
async function queryPayout(orderId) {
    return queryOrder(orderId, PAYOUT_CHANNEL);
}

/**
 * Get balance
 * POST /api/balance/query
 */
async function getBalance() {
    try {
        const payload = {
            mchNo: MERCHANT_ID,
            reqTime: String(Date.now()),
            version: '1.0',
            signType: 'MD5'
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/api/balance/query', payload);

        if (response.data.code === 0 && response.data.data) {
            const data = response.data.data;
            return {
                success: true,
                balance: data.balance ? data.balance / 100 : 0,
                settleBalance: data.settleBalance ? data.settleBalance / 100 : 0
            };
        } else {
            return { success: false, error: response.data.msg || 'Balance query failed' };
        }
    } catch (error) {
        console.error('[AgPay] Balance exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Submit UTR (not supported by AgPay)
 */
async function submitUtr(orderId, utr) {
    return { success: false, error: 'UTR submission not supported by this channel' };
}

/**
 * Map AgPay order status to standard statuses
 * 1 = Payment in progress (pending)
 * 2 = Payment successful (success)
 * 3 = Payment failed (failed)
 * 4 = Order closed (failed)
 * 9 = Pending review (processing)
 * 11 = Order reversal (failed)
 */
function mapOrderStatus(state) {
    const stateNum = parseInt(state);
    switch (stateNum) {
        case 2: return 'success';
        case 1: return 'pending';
        case 9: return 'processing';
        case 3:
        case 4:
        case 11:
            return 'failed';
        default: return 'pending';
    }
}

// Aliases for standard interface
const mapPayinStatus = mapOrderStatus;
const mapPayoutStatus = mapOrderStatus;

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
    providerName: 'agpay'
};
