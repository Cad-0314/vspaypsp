/**
 * AaPay API Service
 * Provider for AaPay channel (internal name: aapay)
 * Uses MD5 signature: sorted params (key ascending) + &key=secret_key
 * 
 * API Endpoints:
 * - Payin: /api/orderin/create, /api/orderin/status
 * - Payout: /api/orderout/create, /api/orderout/status
 */

const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
require('dotenv').config();

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

const BASE_URL = process.env.AAPAY_BASE_URL;
const MERCHANT_ID = process.env.AAPAY_MERCHANT_ID;
const SECRET_KEY = process.env.AAPAY_SECRET_KEY;

const httpClient = axios.create({
    baseURL: BASE_URL,
    timeout: 60000,
    headers: { 'Content-Type': 'application/json' },
    family: 4,
    httpAgent,
    httpsAgent
});

/**
 * Generate MD5 signature for AaPay requests
 * 1. Sort params by key in ascending order (ASCII)
 * 2. Filter out 'sign' and empty values
 * 3. Concatenate as key1=value1&key2=value2
 * 4. Append &key={secret_key}
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
 * Create payin order (orderin/create)
 * POST /api/orderin/create
 */
async function createPayin({ orderId, amount, notifyUrl, returnUrl, customerName, customerEmail, customerPhone }) {
    try {
        const payload = {
            mId: MERCHANT_ID,
            orderId: orderId,
            amount: parseFloat(amount),
            name: customerName || 'User',
            email: customerEmail || 'user@example.com',
            phone: customerPhone || '9999999999',
            callbackUrl: notifyUrl
        };

        payload.sign = generateSign(payload);

        console.log('[AaPay] Creating payin:', { orderId, amount });
        const response = await httpClient.post('/api/orderin/create', payload);

        if (response.data.code === 200 && response.data.data) {
            return {
                success: true,
                payUrl: response.data.data.payLink,
                providerOrderId: response.data.data.platformOrderId || orderId
            };
        } else {
            console.error('[AaPay] Payin error:', response.data);
            return {
                success: false,
                error: response.data.message || `Error code: ${response.data.code}`
            };
        }
    } catch (error) {
        console.error('[AaPay] Payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payin order status
 * POST /api/orderin/status
 */
async function queryPayin(orderId) {
    try {
        const payload = {
            mId: MERCHANT_ID,
            orderId: orderId
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/api/orderin/status', payload);

        if (response.data.code === 200 && response.data.data) {
            const data = response.data.data;
            return {
                success: true,
                orderId: data.orderId,
                providerOrderId: data.platformOrderId,
                status: mapPayinStatus(data.status),
                utr: data.utr,
                amount: data.amount,
                realAmount: data.realAmount
            };
        } else {
            return { success: false, error: response.data.message || 'Query failed' };
        }
    } catch (error) {
        console.error('[AaPay] Query payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Create payout order (orderout/create)
 * POST /api/orderout/create
 */
async function createPayout({ orderId, amount, accountNo, ifsc, name, upi, notifyUrl, customerEmail, customerPhone, bankName }) {
    try {
        const payload = {
            mId: MERCHANT_ID,
            orderId: orderId,
            amount: parseFloat(amount),
            name: name || 'User',
            account: accountNo || upi || '',
            phone: customerPhone || '9999999999',
            email: customerEmail || 'user@example.com',
            ifsc: ifsc || '',
            notifyUrl: notifyUrl
        };

        // Add bank name if provided
        if (bankName) {
            payload.bankName = bankName;
        }

        payload.sign = generateSign(payload);

        console.log('[AaPay] Creating payout:', { orderId, amount });
        const response = await httpClient.post('/api/orderout/create', payload);

        if (response.data.code === 200 && response.data.data) {
            return {
                success: true,
                providerOrderId: response.data.data.platformOrderId,
                status: mapPayoutStatus(response.data.data.status)
            };
        } else {
            console.error('[AaPay] Payout error:', response.data);
            return {
                success: false,
                error: response.data.message || `Error code: ${response.data.code}`
            };
        }
    } catch (error) {
        console.error('[AaPay] Payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payout order status
 * POST /api/orderout/status
 */
async function queryPayout(orderId) {
    try {
        const payload = {
            mId: MERCHANT_ID,
            orderId: orderId
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/api/orderout/status', payload);

        if (response.data.code === 200 && response.data.data) {
            const data = response.data.data;
            return {
                success: true,
                orderId: data.orderId,
                providerOrderId: data.platformOrderId,
                status: mapPayoutStatus(data.status),
                utr: data.utr,
                amount: data.amount
            };
        } else {
            return { success: false, error: response.data.message || 'Query failed' };
        }
    } catch (error) {
        console.error('[AaPay] Query payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get balance (not explicitly documented for AaPay, returns not supported)
 */
async function getBalance() {
    return { success: false, error: 'Balance query not supported by this channel' };
}

/**
 * Submit UTR (not supported by AaPay)
 */
async function submitUtr(orderId, utr) {
    return { success: false, error: 'UTR submission not supported by this channel' };
}

/**
 * Map AaPay payin status to standard statuses
 * ACCEPT = pending (awaiting payment)
 * PENDING = pending (processing)
 * SUCCESS = success
 * FAIL = failed
 * REFUND = refunded
 */
function mapPayinStatus(status) {
    const statusStr = String(status).toUpperCase();
    if (statusStr === 'SUCCESS') return 'success';
    if (statusStr === 'FAIL' || statusStr === 'FAILED') return 'failed';
    if (statusStr === 'REFUND') return 'refunded';
    return 'pending'; // ACCEPT, PENDING
}

/**
 * Map AaPay payout status codes to standard statuses
 * 0 = ACCEPT (initialized)
 * 2 = PENDING (processing)
 * 1 = SUCCESS
 * -1 = FAIL
 */
function mapPayoutStatus(status) {
    const statusNum = parseInt(status);
    if (statusNum === 1) return 'success';
    if (statusNum === -1) return 'failed';
    return 'processing'; // 0, 2
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
    providerName: 'aapay'
};
