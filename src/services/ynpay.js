/**
 * YNPay API Service
 * Provider for YNPay channel (internal name: ynpay)
 * Uses unified request format: AES/CBC/PKCS5Padding encrypted content + MD5 signature
 * 
 * API Endpoints:
 * - Payin:          POST /api/api_inr.aspx
 * - Payout:         POST /api/api_inr_df.aspx
 * - Query:          POST /api/api_query.aspx  (payment / disbursement / balance)
 * - UTR Supplement:  POST /api/api_inr_supplement.aspx
 * - Callbacks:      Payin state: 0=Unpaid, 1=Paid  |  Payout transactionStatus: 0=Processing, 1=Success, 2=Failed
 * 
 * IMPORTANT: Amount is in CENTS (multiply INR by 100).
 * e.g. ₹500.10 = 50010 cents
 * 
 * Encryption: AES/CBC/PKCS5Padding with appSecret as key and platform-issued IV
 * Signature:  MD5 of "appSecret={}&channel={}&content={}&timestamp={}" → lowercase hex
 */

const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
require('dotenv').config();

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

const BASE_URL = process.env.YNPAY_BASE_URL;
const APP_ID = process.env.YNPAY_APP_ID;
const APP_SECRET = process.env.YNPAY_APP_SECRET;
const IV = process.env.YNPAY_IV;

const httpClient = axios.create({
    baseURL: BASE_URL,
    timeout: 60000,
    headers: { 'Content-Type': 'application/json' },
    family: 4,
    httpAgent,
    httpsAgent
});

/**
 * Encrypt business parameters using AES/CBC/PKCS5Padding
 * Key: APP_SECRET (first 32 bytes as hex → 16 bytes, or used as UTF-8 if 32 chars)
 * IV: Platform-issued initialization vector
 */
function encryptContent(data) {
    const jsonStr = JSON.stringify(data);
    // APP_SECRET is 32 hex chars = 32 bytes as UTF-8 → AES-256-CBC
    const keyBuf = Buffer.from(APP_SECRET, 'utf8');
    const ivBuf = Buffer.alloc(16);
    Buffer.from(IV, 'utf8').copy(ivBuf);

    const cipher = crypto.createCipheriv('aes-256-cbc', keyBuf, ivBuf);
    cipher.setAutoPadding(true); // PKCS5/PKCS7 padding
    let encrypted = cipher.update(jsonStr, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
}

/**
 * Decrypt content from AES/CBC/PKCS5Padding
 */
function decryptContent(encryptedStr) {
    const keyBuf = Buffer.from(APP_SECRET, 'utf8');
    const ivBuf = Buffer.alloc(16);
    Buffer.from(IV, 'utf8').copy(ivBuf);

    const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuf, ivBuf);
    decipher.setAutoPadding(true);
    let decrypted = decipher.update(encryptedStr, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
}

/**
 * Generate MD5 signature
 * Format: appSecret={APP_SECRET}&channel={APP_ID}&content={encrypted_content}&timestamp={timestamp}
 * Result: lowercase hex MD5
 */
function generateSign(content, timestamp) {
    const str = `appSecret=${APP_SECRET}&channel=${APP_ID}&content=${content}&timestamp=${timestamp}`;
    return crypto.createHash('md5').update(str).digest('hex').toLowerCase();
}

/**
 * Verify callback signature
 */
function verifySign(params) {
    if (!params || !params.sign || !params.content || !params.timestamp) return false;
    const calculated = generateSign(params.content, params.timestamp);
    return calculated === params.sign;
}

/**
 * Build unified request wrapper
 * @param {Object} businessParams - The business parameters to encrypt
 * @returns {Object} { channel, timestamp, sign, content }
 */
function buildRequest(businessParams) {
    const timestamp = Date.now();
    const content = encryptContent(businessParams);
    const sign = generateSign(content, timestamp);

    return {
        channel: APP_ID,
        timestamp,
        sign,
        content
    };
}

/**
 * Parse callback body - decrypt the unified request format
 * @param {Object} body - The raw callback body { channel, timestamp, sign, content }
 * @returns {Object} Decrypted business parameters
 */
function parseCallback(body) {
    try {
        if (!body || !body.content) {
            console.error('[YNPay] parseCallback: Missing content in body');
            return null;
        }
        return decryptContent(body.content);
    } catch (error) {
        console.error('[YNPay] parseCallback error:', error.message);
        return null;
    }
}

/**
 * Create payin order (collection)
 * POST /api/api_inr.aspx
 */
async function createPayin({ orderId, amount, notifyUrl, returnUrl, customerName, customerEmail, customerPhone }) {
    try {
        const businessParams = {
            timestamp: String(Math.floor(Date.now() / 1000)),
            mchOrderId: orderId,
            amount: Math.round(parseFloat(amount) * 100), // Convert INR to cents
            customerName: customerName || 'User',
            channelCode: '1000', // India Native
            notifyUrl: notifyUrl,
            redirectUrl: returnUrl || 'https://gaurpay.site/pay/success',
            email: customerEmail || 'user@example.com',
            mobile: customerPhone || '9999999999'
        };

        const payload = buildRequest(businessParams);

        console.log('[YNPay] Creating payin:', { orderId, amount, amountCents: businessParams.amount });
        const response = await httpClient.post('/api/api_inr.aspx', payload);

        if (response.data && response.data.code === '1' && response.data.data) {
            const data = response.data.data;
            return {
                success: true,
                payUrl: data.payData || data.payUrl || '',
                upiLink: data.upi || '',
                providerOrderId: data.transactionId || orderId
            };
        } else {
            console.error('[YNPay] Payin error:', response.data);
            return {
                success: false,
                error: response.data?.msg || `Error code: ${response.data?.code}`
            };
        }
    } catch (error) {
        console.error('[YNPay] Payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payin order status
 * POST /api/api_query.aspx
 */
async function queryPayin(orderId) {
    try {
        const businessParams = {
            method: 'payment',
            mchOrderId: orderId,
            timestamp: String(Math.floor(Date.now() / 1000))
        };

        const payload = buildRequest(businessParams);
        const response = await httpClient.post('/api/api_query.aspx', payload);

        if (response.data && response.data.code === '1' && response.data.data) {
            const data = response.data.data;
            return {
                success: true,
                orderId: data.mchOrderId,
                status: mapPayinStatus(data.state),
                amount: data.amount ? parseFloat(data.amount) / 100 : 0, // cents to INR
                utr: data.utr || ''
            };
        } else {
            return { success: false, error: response.data?.msg || 'Query failed' };
        }
    } catch (error) {
        console.error('[YNPay] Payin query exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Create payout order (payment on behalf)
 * POST /api/api_inr_df.aspx
 */
async function createPayout({ orderId, amount, name, accountNo, ifsc, notifyUrl, customerPhone, customerEmail }) {
    try {
        const businessParams = {
            timestamp: String(Math.floor(Date.now() / 1000)),
            mchOrderId: orderId,
            amount: Math.round(parseFloat(amount) * 100), // Convert INR to cents
            customerName: name || 'User',
            accountNo: accountNo || '',
            payMethodCode: 'UPI',
            transferCode: ifsc || '',
            notifyUrl: notifyUrl,
            accountPhone: customerPhone || '9999999999',
            email: customerEmail || 'user@example.com'
        };

        const payload = buildRequest(businessParams);

        console.log('[YNPay] Creating payout:', { orderId, amount, amountCents: businessParams.amount });
        const response = await httpClient.post('/api/api_inr_df.aspx', payload);

        if (response.data && response.data.code === '1' && response.data.data) {
            const data = response.data.data;
            return {
                success: true,
                providerOrderId: data.transactionId || orderId,
                status: mapPayoutStatus(data.transactionStatus || '0')
            };
        } else {
            console.error('[YNPay] Payout error:', response.data);
            return {
                success: false,
                error: response.data?.msg || `Error code: ${response.data?.code}`
            };
        }
    } catch (error) {
        console.error('[YNPay] Payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payout order status
 * POST /api/api_query.aspx
 */
async function queryPayout(orderId) {
    try {
        const businessParams = {
            method: 'disbursement',
            mchOrderId: orderId,
            timestamp: String(Math.floor(Date.now() / 1000))
        };

        const payload = buildRequest(businessParams);
        const response = await httpClient.post('/api/api_query.aspx', payload);

        if (response.data && response.data.code === '1' && response.data.data) {
            const data = response.data.data;
            return {
                success: true,
                orderId: data.mchOrderId,
                providerOrderId: data.transactionId,
                status: mapPayoutStatus(data.transactionStatus),
                utr: data.utr || ''
            };
        } else {
            return { success: false, error: response.data?.msg || 'Query failed' };
        }
    } catch (error) {
        console.error('[YNPay] Payout query exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get balance
 * POST /api/api_query.aspx with method: 'balance'
 */
async function getBalance() {
    try {
        const businessParams = {
            method: 'balance',
            timestamp: String(Math.floor(Date.now() / 1000))
        };

        const payload = buildRequest(businessParams);
        const response = await httpClient.post('/api/api_query.aspx', payload);

        if (response.data && response.data.code === '1' && response.data.data) {
            const data = response.data.data;
            // Balance response contains array of { amount, cur }
            const inrBalance = data.balance?.find(b => b.cur === 'INR') || data.balance?.[0];
            return {
                success: true,
                balance: parseFloat(inrBalance?.amount || 0),
                settleBalance: 0
            };
        } else {
            return { success: false, error: response.data?.msg || 'Balance query failed' };
        }
    } catch (error) {
        console.error('[YNPay] Balance exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Submit UTR for payin order replacement
 * POST /api/api_inr_supplement.aspx
 */
async function submitUtr(orderId, utr) {
    try {
        const businessParams = {
            mchOrderId: orderId,
            refNo: utr
        };

        const payload = buildRequest(businessParams);

        console.log('[YNPay] Submitting UTR:', { orderId, utr });
        const response = await httpClient.post('/api/api_inr_supplement.aspx', payload);

        if (response.data && (response.data.code === '200' || response.data.code === 200)) {
            return { success: true, message: response.data.msg || 'UTR submitted successfully' };
        } else {
            return {
                success: false,
                error: response.data?.msg || `UTR submission failed (code: ${response.data?.code})`
            };
        }
    } catch (error) {
        console.error('[YNPay] UTR submission exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Map YNPay payin status to standard statuses
 * state: 0 = Unpaid (pending), 1 = Paid (success)
 */
function mapPayinStatus(state) {
    const s = parseInt(state);
    switch (s) {
        case 1: return 'success';
        case 0:
        default: return 'pending';
    }
}

/**
 * Map YNPay payout status to standard statuses
 * transactionStatus: 0 = In transaction (processing), 1 = Success, 2 = Failed
 */
function mapPayoutStatus(transactionStatus) {
    const s = parseInt(transactionStatus);
    switch (s) {
        case 1: return 'success';
        case 2: return 'failed';
        case 0:
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
    parseCallback,
    encryptContent,
    decryptContent,
    mapPayinStatus,
    mapPayoutStatus,
    usesCustomPayPage: false,
    providerName: 'ynpay'
};
