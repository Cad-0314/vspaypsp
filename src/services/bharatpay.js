/**
 * BharatPay API Service
 * Provider for BharatPay channel (internal name: bharatpay)
 * Uses AES-256-ECB encryption with PKCS7 padding
 * API Key serves as both Authorization header and encryption key
 */

require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const dns = require('dns');

// Force IPv4 for all DNS lookups in this module
dns.setDefaultResultOrder('ipv4first');

// Load config from environment - using getters to ensure latest values
const getBaseUrl = () => process.env.BHARATPAY_BASE_URL || 'https://api-beta.bharatpay.cc';
const getMerchantId = () => process.env.BHARATPAY_MERCHANT_ID || '';
const getApiKey = () => process.env.BHARATPAY_API_KEY || '';

// HTTP Keep-Alive agents
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });

// Create axios client dynamically to use current env values
function getHttpClient() {
    return axios.create({
        baseURL: getBaseUrl(),
        timeout: 60000,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': getMerchantId()
        },
        httpAgent,
        httpsAgent
    });
}

/**
 * AES-256-ECB Encryption
 * Mode: ECB, Padding: PKCS7, Key Length: 256 bits, Output: Base64
 */
function aesEncrypt(data, key = null) {
    const actualKey = key || getApiKey();
    console.log(`[BharatPay] Encrypting with key length: ${actualKey.length}`);
    const jsonStr = JSON.stringify(data);
    console.log(`[BharatPay] Encrypting JSON: ${jsonStr}`);
    const cipher = crypto.createCipheriv('aes-256-ecb', Buffer.from(actualKey, 'utf8'), null);
    cipher.setAutoPadding(true);
    let encrypted = cipher.update(jsonStr, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    console.log(`[BharatPay] Encrypted result: ${encrypted}`);
    return encrypted;
}

/**
 * AES-256-ECB Decryption
 */
function aesDecrypt(encryptedData, key = API_KEY) {
    try {
        const decipher = crypto.createDecipheriv('aes-256-ecb', Buffer.from(key, 'utf8'), null);
        decipher.setAutoPadding(true);
        let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch (error) {
        console.error('[BharatPay] Decryption error:', error.message);
        return null;
    }
}

/**
 * Verify callback signature by decrypting the data field
 */
function verifySign(params) {
    try {
        if (!params.data) return false;
        const decrypted = aesDecrypt(params.data);
        return decrypted !== null;
    } catch (error) {
        return false;
    }
}

/**
 * Create payin order using V1 API (plain JSON)
 * POST /api/channel/Credit/Set
 */
async function createPayinV1({ orderId, amount, notifyUrl, customerName, customerEmail, customerPhone }) {
    try {
        console.log(`[BharatPay] Creating V1 payin: ${orderId}, amount: ${amount}`);

        const requestData = {
            amount: parseFloat(amount),
            sourceNo: orderId,
            callbackUrl: notifyUrl
        };

        const response = await getHttpClient().post('/api/channel/Credit/Set', requestData);
        console.log('[BharatPay] V1 Response:', JSON.stringify(response.data, null, 2));

        if (response.data.code === 0 && response.data.result) {
            const orderInfo = response.data.result.channelCreditOrderSimpleInfo;
            const paymentInfo = response.data.result.channelPaymentRecordSimpleInfo;

            return {
                success: true,
                version: 'V1',
                providerOrderId: String(orderInfo?.id || ''),
                payUrl: orderInfo?.cashierLink || '',
                upi: paymentInfo?.upi || '',
                upiUrl: paymentInfo?.upiUrl || '',
                amount: orderInfo?.fiatAmount || amount,
                processCode: orderInfo?.processCode,
                deeplinks: response.data.result.deeplink || {},
                rawResponse: response.data
            };
        }

        return {
            success: false,
            version: 'V1',
            error: response.data.errorDesc || 'Unknown error',
            code: response.data.code,
            rawResponse: response.data
        };

    } catch (error) {
        console.error('[BharatPay] V1 createPayin error:', error.message);
        return {
            success: false,
            version: 'V1',
            error: error.response?.data?.errorDesc || error.message
        };
    }
}

/**
 * Create payin order using V2 API (AES encrypted)
 * POST /api/channel/Credit/Place
 */
async function createPayinV2({ orderId, amount, notifyUrl, customerName, customerEmail, customerPhone }) {
    try {
        console.log(`[BharatPay] Creating V2 payin: ${orderId}, amount: ${amount}`);

        const plainData = {
            amount: parseFloat(amount),
            sourceNo: orderId,
            callbackUrl: notifyUrl
        };

        const encryptedData = aesEncrypt(plainData);
        const requestData = { data: encryptedData };

        const response = await getHttpClient().post('/api/channel/Credit/Place', requestData);
        console.log('[BharatPay] V2 Response:', JSON.stringify(response.data, null, 2));

        if (response.data.code === 0 && response.data.result) {
            const orderInfo = response.data.result.channelCreditOrderSimpleInfo;
            const paymentInfo = response.data.result.channelPaymentRecordSimpleInfo;

            return {
                success: true,
                version: 'V2',
                providerOrderId: String(orderInfo?.id || ''),
                payUrl: orderInfo?.cashierLink || '',
                upi: paymentInfo?.upi || '',
                upiUrl: paymentInfo?.upiUrl || '',
                amount: orderInfo?.fiatAmount || amount,
                processCode: orderInfo?.processCode,
                deeplinks: response.data.result.deeplink || {},
                rawResponse: response.data
            };
        }

        return {
            success: false,
            version: 'V2',
            error: response.data.errorDesc || 'Unknown error',
            code: response.data.code,
            rawResponse: response.data
        };

    } catch (error) {
        console.error('[BharatPay] V2 createPayin error:', error.message);
        return {
            success: false,
            version: 'V2',
            error: error.response?.data?.errorDesc || error.message
        };
    }
}

/**
 * Default createPayin - tries V2 first, falls back to V1
 */
async function createPayin(params) {
    // Try V2 first
    const v2Result = await createPayinV2(params);
    if (v2Result.success) {
        return v2Result;
    }

    // Fall back to V1
    console.log('[BharatPay] V2 failed, trying V1...');
    return await createPayinV1(params);
}

/**
 * Query payin order status
 * POST /api/channel/Credit/Get
 */
async function queryPayin(orderId) {
    try {
        const response = await getHttpClient().post('/api/channel/Credit/Get', {
            sourceNo: orderId
        });

        if (response.data.code === 0 && response.data.result) {
            const orderInfo = response.data.result.channelCreditOrderSimpleInfo;
            const paymentInfo = response.data.result.channelPaymentRecordSimpleInfo;

            // processCode: 10=Pending, 20=Confirmed, 30=Completed, 40=Cancelled
            let status = 'pending';
            if (orderInfo?.processCode === 30) status = 'success';
            else if (orderInfo?.processCode === 40) status = 'failed';

            return {
                success: true,
                status: status,
                processCode: orderInfo?.processCode,
                utr: paymentInfo?.utr || '',
                amount: orderInfo?.fiatAmount,
                providerOrderId: String(orderInfo?.id || '')
            };
        }

        return { success: false, error: response.data.errorDesc };

    } catch (error) {
        console.error('[BharatPay] queryPayin error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Create payout order using V1 API
 * POST /api/channel/Debit/Set
 */
async function createPayout({ orderId, amount, accountNo, ifsc, name, upi, notifyUrl }) {
    try {
        console.log(`[BharatPay] Creating payout: ${orderId}, amount: ${amount}`);

        const payeeAccountDetail = {
            accountName: name,
            bankAccount: upi || accountNo,
            bankNo: ifsc || '',
            accountType: upi ? '2' : '1' // 1=IFSC, 2=UPI
        };

        const requestData = {
            amount: parseFloat(amount),
            sourceNo: orderId,
            callbackUrl: notifyUrl,
            payeeAccountDetail: payeeAccountDetail
        };

        const response = await getHttpClient().post('/api/channel/Debit/Set', requestData);
        console.log('[BharatPay] Payout Response:', JSON.stringify(response.data, null, 2));

        if (response.data.code === 0 && response.data.result) {
            const orderInfo = response.data.result.channelDebitOrderSimpleInfo;

            return {
                success: true,
                providerOrderId: String(orderInfo?.id || ''),
                status: orderInfo?.processCode === 30 ? 'success' :
                    orderInfo?.processCode === 40 ? 'failed' : 'pending'
            };
        }

        return {
            success: false,
            error: response.data.errorDesc || 'Unknown error'
        };

    } catch (error) {
        console.error('[BharatPay] createPayout error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payout order status
 * POST /api/channel/Debit/Get
 */
async function queryPayout(orderId) {
    try {
        const response = await getHttpClient().post('/api/channel/Debit/Get', {
            sourceNo: orderId
        });

        if (response.data.code === 0 && response.data.result) {
            const orderInfo = response.data.result.channelDebitOrderSimpleInfo;

            // processCode: 10=Pending, 20=Confirmed, 30=Completed, 40=Cancelled, 60=Failed
            let status = 'pending';
            if (orderInfo?.processCode === 30) status = 'success';
            else if ([40, 60].includes(orderInfo?.processCode)) status = 'failed';

            return {
                success: true,
                status: status,
                processCode: orderInfo?.processCode,
                utr: '', // BharatPay doesn't return UTR in query response based on docs
                amount: orderInfo?.fiatAmount,
                providerOrderId: String(orderInfo?.id || '')
            };
        }

        return { success: false, error: response.data.errorDesc };

    } catch (error) {
        console.error('[BharatPay] queryPayout error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get balance (not supported by BharatPay API based on docs)
 */
async function getBalance() {
    return { success: false, error: 'Balance query not supported' };
}

/**
 * Submit UTR (not applicable for BharatPay)
 */
async function submitUtr(orderId, utr) {
    return { success: false, error: 'UTR submission not supported' };
}

/**
 * Parse callback data (decrypt AES encrypted data)
 */
function parseCallback(params) {
    try {
        if (!params.data) {
            console.log('[BharatPay] Callback has no data field, using params directly');
            return params;
        }

        const decrypted = aesDecrypt(params.data);
        if (decrypted) {
            console.log('[BharatPay] Decrypted callback data:', JSON.stringify(decrypted, null, 2));
            return decrypted;
        }

        return params;
    } catch (error) {
        console.error('[BharatPay] Callback parse error:', error.message);
        return params;
    }
}

module.exports = {
    createPayin,
    createPayinV1,
    createPayinV2,
    queryPayin,
    createPayout,
    queryPayout,
    getBalance,
    submitUtr,
    verifySign,
    aesEncrypt,
    aesDecrypt,
    parseCallback,
    // Config for channel router
    usesCustomPayPage: false, // BharatPay returns cashierLink for direct redirect
    providerName: 'bharatpay'
};
