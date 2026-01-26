/**
 * IPay API Service
 * Provider for IPay channel
 * Uses MD5 signature: sorted params + &secret=secret_key
 */

const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
require('dotenv').config();

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

const BASE_URL = process.env.IPAY_BASE_URL;
const TOKEN = process.env.IPAY_TOKEN;
const SECRET_KEY = process.env.IPAY_SECRET_KEY;

const httpClient = axios.create({
    baseURL: BASE_URL,
    timeout: 60000,
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
    family: 4,
    httpAgent,
    httpsAgent
});

/**
 * Generate MD5 signature for IPay requests
 * 1. Sort all parameters in ascending order (remove empty values)
 * 2. Join with &
 * 3. Append &secret={SecretKey}
 * 4. MD5 and Uppercase
 */
function generateSign(params) {
    const sortedKeys = Object.keys(params)
        .filter(k => k !== 'sign' && params[k] !== null && params[k] !== undefined && params[k] !== '')
        .sort();

    // Construct query string: key1=value1&key2=value2...
    const str = sortedKeys.map(k => `${k}=${params[k]}`).join('&');

    // Append secret
    const strWithSecret = `${str}&secret=${SECRET_KEY}`;

    // MD5 and Uppercase
    return crypto.createHash('md5').update(strWithSecret).digest('hex').toUpperCase();
}

/**
 * Verify callback signature
 * Same logic as generation
 */
function verifySign(params) {
    if (!params.sign) return false;
    const receivedSign = params.sign;
    const calculated = generateSign(params);
    return calculated === receivedSign;
}

/**
 * Create payin order (collection)
 * POST /ipay/recharge
 */
async function createPayin({ orderId, amount, notifyUrl, returnUrl, customerName, customerEmail, customerPhone }) {
    try {
        const payload = {
            token: TOKEN,
            callbackUrl: notifyUrl,
            ts: Date.now().toString(),
            orderAmount: String(parseFloat(amount).toFixed(2)),
            orderId: orderId,
            param: 'payment',
            payMode: 'launch', // full wake-up
            redirectUrl: returnUrl || 'https://google.com',
            name: customerName || 'User',
            phone: customerPhone || '9000000000',
            email: customerEmail || 'user@example.com'
        };

        payload.sign = generateSign(payload);

        console.log('[IPay] Creating payin:', { orderId, amount });
        const response = await httpClient.post('/ipay/recharge', payload);

        // Code 1000 means success
        if (response.data.code === 1000) {
            return {
                success: true,
                payUrl: response.data.data.rechargeUrl,
                providerOrderId: response.data.data.orderId || orderId
            };
        } else {
            console.error('[IPay] Payin error:', response.data);
            return {
                success: false,
                error: response.data.msg || `Error code: ${response.data.code}`
            };
        }
    } catch (error) {
        console.error('[IPay] Payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payin order status
 * POST /ipay/recharge/search
 */
async function queryPayin(orderId) {
    try {
        const payload = {
            token: TOKEN,
            ts: Date.now().toString(),
            orderId: orderId
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/ipay/recharge/search', payload);

        if (response.data.code === 1000) {
            const data = response.data.data;
            return {
                success: true,
                orderId: data.orderId,
                status: mapPayinStatus(data.status),
                amount: data.amount, // Actual amount received
                commission: data.commission
            };
        } else {
            return { success: false, error: response.data.msg || 'Query failed' };
        }
    } catch (error) {
        console.error('[IPay] Query payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Create payout order (proxy payment)
 * POST /ipay/payment
 */
async function createPayout({ orderId, amount, accountNo, ifsc, name, notifyUrl }) {
    try {
        const payload = {
            amount: String(parseFloat(amount).toFixed(2)),
            token: TOKEN,
            callbackUrl: notifyUrl,
            account: accountNo,
            ifsc: ifsc,
            ts: Date.now().toString(),
            orderId: orderId,
            param: 'payout',
            personName: name || 'Beneficiary'
        };

        payload.sign = generateSign(payload);

        console.log('[IPay] Creating payout:', { orderId, amount });
        const response = await httpClient.post('/ipay/payment', payload);

        if (response.data.code === 1000) {
            return {
                success: true,
                providerOrderId: response.data.data.orderId, // Usually same as merchant order ID based on doc
                status: 'processing'
            };
        } else {
            console.error('[IPay] Payout error:', response.data);
            return {
                success: false,
                error: response.data.msg || `Error code: ${response.data.code}`
            };
        }
    } catch (error) {
        console.error('[IPay] Payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payout order status
 * POST /ipay/payment/search
 */
async function queryPayout(orderId) {
    try {
        const payload = {
            token: TOKEN,
            ts: Date.now().toString(),
            orderId: orderId
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/ipay/payment/search', payload);

        if (response.data.code === 1000) {
            const data = response.data.data;
            return {
                success: true,
                orderId: data.orderId,
                status: mapPayoutStatus(data.status),
                utr: data.utr,
                errorMessage: data.message
            };
        } else {
            return { success: false, error: response.data.msg || 'Query failed' };
        }
    } catch (error) {
        console.error('[IPay] Query payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get balance
 * POST /ipay/getbalance
 */
async function getBalance() {
    try {
        const payload = {
            token: TOKEN,
            ts: Date.now().toString()
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/ipay/getbalance', payload);

        if (response.data.code === 1000) {
            const data = response.data.data;
            // Doc says "balance" (string)
            return {
                success: true,
                balance: parseFloat(data.balance) || 0,
                availableBalance: parseFloat(data.balance) || 0
            };
        } else {
            return { success: false, error: response.data.msg || 'Balance query failed' };
        }
    } catch (error) {
        console.error('[IPay] Balance exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Submit UTR / Order Replenishment
 * POST /ipay/utr/order
 */
async function submitUtr(orderId, utr) {
    try {
        const payload = {
            token: TOKEN,
            orderId: orderId,
            utr: utr,
            ts: Date.now().toString()
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/ipay/utr/order', payload);

        // Doc says code 0 on example success ?? (Line 421)
        // Check both 0 and 1000 just in case, but follow doc example which is 0
        if (response.data.code === 0 || response.data.code === 1000) {
            return {
                success: true,
                status: 'success'
            };
        } else {
            return { success: false, error: response.data.msg || 'UTR submit failed' };
        }
    } catch (error) {
        console.error('[IPay] UTR submit exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Map IPay Payin status codes
 * 1: successful
 * 0: failed
 */
function mapPayinStatus(status) {
    if (status === '1' || status === 1) return 'success';
    if (status === '0' || status === 0) return 'failed';
    return 'pending';
}

/**
 * Map IPay Payout status codes
 * 0: Withdrawal in progress
 * 1: Successful
 * 2: Failed
 */
function mapPayoutStatus(status) {
    if (status === '1' || status === 1) return 'success';
    if (status === '2' || status === 2) return 'failed';
    return 'processing';
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
    providerName: 'ipay'
};
