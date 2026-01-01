/**
 * Silkpay API Service
 * Provider for Payable channel/Silkpay
 * Updated to use V2 endpoints and specific signature logic
 */

const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
require('dotenv').config();

// Global keep-alive agents
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

// Configuration
// Default to dev based on snippet, but allow env override.
// User snippet had: process.env.SILKPAY_BASE_URL || 'https://api.dev.silkpay.ai';
const BASE_URL = process.env.SILKPAY_BASE_URL || 'https://api.dev.silkpay.ai';
const MID = process.env.SILKPAY_MID || 'TEST';
const SECRET = process.env.SILKPAY_SECRET || 'SIb3DQEBAQ';

// Helper to log requests (Standardized to console for now, as sqlite getDb is not available)
function logApiRequest(endpoint, requestData, response, duration) {
    const timestamp = new Date().toISOString();
    // Redact secret if sensitive, though standard logs might keep it for debug if needed. 
    // Usually good practice to redact.
    const safeRequest = { ...requestData };
    console.log(`[${timestamp}] SILKPAY API: ${endpoint} (${duration}ms)`);
    // detailed logging can be enabled if needed
    // console.log('Request:', JSON.stringify(safeRequest));
    // console.log('Response:', JSON.stringify(response));
}

function logApiError(endpoint, error, requestData) {
    const timestamp = new Date().toISOString();
    const errorMessage = error.message || String(error);
    console.error(`[${timestamp}] SILKPAY API ERROR [${endpoint}]:`, errorMessage);
    if (error.response) {
        console.error('Response Data:', JSON.stringify(error.response.data));
    }
}

// Create axios instance
const api = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json'
    },
    family: 4, // Force IPv4 matching other services
    httpAgent,
    httpsAgent
});

// Signature Generation Helper
function createSign(str) {
    return crypto.createHash('md5').update(str).digest('hex').toLowerCase(); // 32-bit lowercase
}

/**
 * 1. Create Payin Order (v2)
 * Endpoint: /transaction/payin/v2
 * Sign: md5(mId+mOrderId+orderAmount+timestamp+secret) NOTE: Snippet said amount vs orderAmount check params
 */
async function createPayin(data, config = {}) {
    // Adapter for standard interface to User's snippet expectations
    // Standard interface provided: { orderId, amount, notifyUrl, returnUrl, customerName... }

    // User snippet expects: { orderAmount, orderId, notifyUrl, returnUrl }
    // We map inputs.

    const orderAmount = data.amount; // Ensure this is passed correctly
    const orderId = data.orderId;
    const notifyUrl = data.notifyUrl;
    const returnUrl = data.returnUrl || data.notifyUrl;

    const timestamp = Date.now().toString();

    const mid = config.mid || MID;
    const secret = config.secret || SECRET;

    // User Snippet: Sign: md5(mId+mOrderId+amount+timestamp+secret)
    // Code in snippet: const signStr = `${mid}${orderId}${orderAmount}${timestamp}${secret}`;
    const signStr = `${mid}${orderId}${orderAmount}${timestamp}${secret}`;
    const sign = createSign(signStr);

    const params = {
        amount: orderAmount,
        mId: mid,
        mOrderId: orderId,
        timestamp,
        notifyUrl,
        returnUrl,
        sign
    };

    // Additional standard params that might be useful if API supports them, 
    // but snippet didn't include them. We stick to snippet for safety.

    const startTime = Date.now();
    try {
        console.log('[Silkpay] Creating payin:', { orderId, orderAmount, url: `${BASE_URL}/transaction/payin/v2` });
        const response = await api.post('/transaction/payin/v2', params);
        logApiRequest('createPayin', params, response.data, Date.now() - startTime);

        // Normalize response for our system
        // Standard expectation: { success, payUrl, providerOrderId, deepLinks, ... }
        const resData = response.data;

        // Check success condition
        // Snippet doesn't show success check explicitly in return, but standard is usually code/status
        // Assuming response.data contains necessary info.

        // We need to map the specific response format of this NEW v2 API to our app's needs.
        // Usually: { status: 1, payUrl: '...', ... } or { code: 200, data: { ... } }
        // Looking at snippet: it just returns response.data. 
        // We need to adhere to the existing `silkpay.js` return contract so the router works.

        // Let's assume the V2 API returns something like { status: '1', data: { payUrl: ... } } or similar.
        // Without V2 docs, I'll return a generic success structure wrapping the raw data, 
        // but if I can guess standard fields I will map them.

        // Existing silkpay.js mapped: payUrl: data.payUrl || data.paymentUrl

        // I will return the raw data but also try to map 'payUrl'.
        // If the user's snippet logic is "just return response.data", the calling code (router) 
        // might fail if it expects { success: true }.

        // I will attempt to preserve the `success: true` wrapper pattern from the OLD file 
        // to minimize breakage in `services/order.js` or wherever this is called.

        const success = (resData.status === '1' || resData.status === 1 || resData.code === 200 || resData.success === true);

        return {
            success: success,
            payUrl: resData.payUrl || resData.data?.payUrl || resData.paymentUrl,
            providerOrderId: resData.sysOrderId || resData.tradeNo || resData.data?.tradeNo,
            raw: resData
        };

    } catch (error) {
        logApiError('createPayin', error, params);
        return { success: false, error: error.message };
    }
}

/**
 * 2. Payin Order Status Query
 * Endpoint: /transaction/payin/query
 */
async function queryPayin(orderId) {
    const timestamp = Date.now().toString();
    const signStr = `${MID}${orderId}${timestamp}${SECRET}`;
    const sign = createSign(signStr);

    const params = {
        mId: MID,
        mOrderId: orderId,
        timestamp,
        sign
    };

    const startTime = Date.now();
    try {
        const response = await api.post('/transaction/payin/query', params);
        logApiRequest('queryPayin', params, response.data, Date.now() - startTime);

        const data = response.data;
        // Map to standard format
        // success, status (pending/success/failed), amount, utr
        const statusMap = {
            '1': 'success',
            '2': 'failed',
            '0': 'pending',
            '3': 'expired'
        };

        // Adjust based on actual response structure if known. 
        // Using loose mapping based on snippet 'status: "1"' seen in callback generator.

        return {
            success: true,
            status: statusMap[data.status] || 'pending',
            amount: data.amount,
            utr: data.utr,
            providerOrderId: data.sysOrderId, // if available
            raw: data
        };
    } catch (error) {
        logApiError('queryPayin', error, params);
        return { success: false, error: error.message };
    }
}

/**
 * 1. Create Payout Order
 * Endpoint: /transaction/payout
 */
async function createPayout(data, config = {}) {
    // Adapter: data = { orderId, amount, accountNo, ifsc, name, ... }
    const { amount, orderId, notifyUrl, bankNo, ifsc, name } = data;
    // Map existing service params 'accountNo' -> 'bankNo' if needed
    const actualBankNo = bankNo || data.accountNo;
    const actualName = name || data.accountName;

    const timestamp = Date.now().toString();
    const mid = config.mid || MID;
    const secret = config.secret || SECRET;

    // Sign: md5(mId+mOrderId+amount+timestamp+secret)
    const signStr = `${mid}${orderId}${amount}${timestamp}${secret}`;
    const sign = createSign(signStr);

    const params = {
        amount,
        mId: mid,
        mOrderId: orderId,
        timestamp,
        notifyUrl,
        bankNo: actualBankNo,
        ifsc,
        name: actualName,
        sign,
        upi: ""
    };

    const startTime = Date.now();
    try {
        const response = await api.post('/transaction/payout', params);
        logApiRequest('createPayout', params, response.data, Date.now() - startTime);

        const resData = response.data;
        // Assuming status 1 is accepted/processing
        const success = (resData.status === '1' || resData.code === 200 || resData.success === true);

        return {
            success,
            providerOrderId: resData.sysOrderId || resData.tradeNo,
            status: 'processing', // Payouts are usually async
            raw: resData
        };
    } catch (error) {
        logApiError('createPayout', error, params);
        return { success: false, error: error.message };
    }
}

/**
 * 2. Payout Order Status Inquiry
 * Endpoint: /transaction/payout/query
 */
async function queryPayout(orderId) {
    const timestamp = Date.now().toString();
    const signStr = `${MID}${orderId}${timestamp}${SECRET}`;
    const sign = createSign(signStr);

    const params = {
        mId: MID,
        mOrderId: orderId,
        timestamp,
        sign
    };

    const startTime = Date.now();
    try {
        const response = await api.post('/transaction/payout/query', params);
        logApiRequest('queryPayout', params, response.data, Date.now() - startTime);

        const data = response.data;
        const statusMap = {
            '1': 'success',
            '2': 'failed',
            '0': 'processing',
            '3': 'expired' // guessing 3
        };

        return {
            success: true,
            status: statusMap[data.status] || 'processing',
            utr: data.utr,
            raw: data
        };
    } catch (error) {
        logApiError('queryPayout', error, params);
        return { success: false, error: error.message };
    }
}

/**
 * Balance Inquiry
 */
async function getBalance() {
    const timestamp = Date.now().toString();
    const signStr = `${MID}${timestamp}${SECRET}`;
    const sign = createSign(signStr);

    const params = {
        mId: MID,
        timestamp,
        sign
    };

    const startTime = Date.now();
    try {
        const response = await api.post('/transaction/balance', params);
        logApiRequest('getBalance', params, response.data, Date.now() - startTime);
        return {
            success: true,
            balance: response.data.balance || 0,
            raw: response.data
        };
    } catch (error) {
        logApiError('getBalance', error, params);
        return { success: false, error: error.message };
    }
}

/**
 * Submit UTR
 */
async function submitUtr(orderId, utr) {
    const timestamp = Date.now().toString();
    const signStr = `${MID}${timestamp}${SECRET}`;
    const sign = createSign(signStr);

    const params = {
        mId: MID,
        utr,
        mOrderId: orderId,
        sign,
        timestamp
    };

    const startTime = Date.now();
    try {
        const response = await api.post('/transaction/payin/submit/utr', params);
        logApiRequest('submitUtr', params, response.data, Date.now() - startTime);
        return {
            success: (response.data.status === '1'),
            raw: response.data
        };
    } catch (error) {
        logApiError('submitUtr', error, params);
        return { success: false, error: error.message };
    }
}

/**
 * Verify Payin Callback Signature
 * Docs: sign = md5(amount+mId+mOrderId+timestamp+secret)
 */
function verifyPayinCallback(data, secretOverride = null) {
    const { amount, mId, mOrderId, timestamp, sign } = data;
    const secret = secretOverride || SECRET;

    // Note: User snippet uses specific order: amount+mId+mOrderId+timestamp+secret
    const str = `${amount}${mId}${mOrderId}${timestamp}${secret}`;
    const calculated = createSign(str);
    return calculated === sign;
}

/**
 * Verify Payout Callback Signature
 * Docs: sign = md5(mId+mOrderId+amount+timestamp+secret)
 */
function verifyPayoutCallback(data, secretOverride = null) {
    const { mId, mOrderId, amount, timestamp, sign } = data;
    const secret = secretOverride || SECRET;

    // Note: User snippet uses specific order: mId+mOrderId+amount+timestamp+secret
    const str = `${mId}${mOrderId}${amount}${timestamp}${secret}`;
    const calculated = createSign(str);
    return calculated === sign;
}

// Wrapper for generic verifySign used by router if it doesn't distinguish types
// We guess based on params presence or just fail safe.
function verifySign(params) {
    // Attempt to detect if it's payin or payout based on typical params? 
    // Or just try both?
    // The previous implementation was generic sorted keys. 
    // If the router calls `verifySign(req.body)`, we need to know which one.

    // However, usually the callback URL for payin and payout might be different or the payload distinct.
    // If we can't distinguish, we might return false or try one.
    // Let's assume most callbacks hitting this service are Payin callbacks for now, 
    // unless there's a specific flag.

    return verifyPayinCallback(params);
}


module.exports = {
    createPayin,
    queryPayin,
    createPayout,
    queryPayout,
    submitUtr,
    getBalance,
    verifySign,            // Standard export
    verifyPayinCallback,   // Specific export
    verifyPayoutCallback,  // Specific export
    usesCustomPayPage: true,
    providerName: 'silkpay'
};
