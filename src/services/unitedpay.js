/**
 * UnitedPay API Service
 * Provider for UnitedPay channel (internal name: unitedpay)
 * Uses AES/CBC/PKCS5Padding encryption + MD5 signature
 */

const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
require('dotenv').config();

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

const BASE_URL = process.env.UNITEDPAY_BASE_URL;
const MCH_NO = process.env.UNITEDPAY_MCH_NO;
const ENCRYPT_KEY = process.env.UNITEDPAY_ENCRYPT_KEY;
const SIGN_KEY = process.env.UNITEDPAY_SIGN_KEY;

// Fixed IV as per UnitedPay API spec
const IV = Buffer.from('0102030405060708', 'utf8');

const httpClient = axios.create({
    baseURL: BASE_URL,
    timeout: 60000,
    headers: { 'Content-Type': 'application/json' },
    family: 4,
    httpAgent,
    httpsAgent
});

/**
 * AES encrypt business message
 * AES/CBC/PKCS5Padding with fixed IV 0102030405060708
 * Key is the ENCRYPT_KEY from env
 * Result is Base64 encoded
 */
function aesEncrypt(plainText) {
    const key = Buffer.from(ENCRYPT_KEY, 'utf8');
    const cipher = crypto.createCipheriv('aes-128-cbc', key, IV);
    let encrypted = cipher.update(plainText, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
}

/**
 * AES decrypt business message
 */
function aesDecrypt(cipherText) {
    const key = Buffer.from(ENCRYPT_KEY, 'utf8');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, IV);
    let decrypted = decipher.update(cipherText, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

/**
 * Generate MD5 signature
 * Concatenate encrypted payload string + SIGN_KEY, then MD5 uppercase
 */
function generateSign(encryptedPayload) {
    const signStr = encryptedPayload + SIGN_KEY;
    return crypto.createHash('md5').update(signStr).digest('hex').toUpperCase();
}

/**
 * Verify callback signature
 * The callback body has { mchNo, payload, sign, state }
 */
function verifySign(callbackBody) {
    if (!callbackBody || !callbackBody.payload || !callbackBody.sign) return false;
    const expectedSign = generateSign(callbackBody.payload);
    return expectedSign === callbackBody.sign;
}

/**
 * Build the common request body
 * 1. Serialize business message to JSON
 * 2. AES encrypt it
 * 3. Generate MD5 signature from encrypted string + SIGN_KEY
 * 4. Assemble { mchNo, payload, sign }
 */
function buildRequest(businessData) {
    const jsonStr = JSON.stringify(businessData);
    const payload = aesEncrypt(jsonStr);
    const sign = generateSign(payload);
    return { mchNo: MCH_NO, payload, sign };
}

/**
 * Parse response from UnitedPay
 * Decrypts the payload field and returns the business data
 */
function parseResponse(responseData) {
    if (responseData.state === 'Failed') {
        return {
            success: false,
            error: responseData.message || `Error code: ${responseData.code}`
        };
    }

    if (responseData.state === 'Successful' && responseData.payload) {
        // Verify signature
        const expectedSign = generateSign(responseData.payload);
        if (expectedSign !== responseData.sign) {
            console.warn('[UnitedPay] Response signature mismatch');
        }

        try {
            const decryptedStr = aesDecrypt(responseData.payload);
            return { success: true, data: JSON.parse(decryptedStr) };
        } catch (e) {
            console.error('[UnitedPay] Decryption error:', e.message);
            return { success: false, error: 'Failed to decrypt response' };
        }
    }

    return { success: false, error: 'Unknown response format' };
}

/**
 * Format date as yyyyMMddHHmmss
 */
function formatOrderDate(date) {
    const d = date || new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * Create payin order
 * POST /dgateway/ws/trans/nocard/makeOrder
 */
async function createPayin({ orderId, amount, notifyUrl, returnUrl, customerName, customerEmail, customerPhone }) {
    try {
        const businessData = {
            versionNo: 1,
            mchNo: MCH_NO,
            price: parseFloat(amount),
            orderDate: formatOrderDate(new Date()),
            tradeNo: orderId,
            notifyUrl: notifyUrl,
            callbackUrl: returnUrl || '',
            payType: '01',
            payerName: customerName || '',
            payMobile: customerPhone || '',
            payEmail: customerEmail || ''
        };

        const requestBody = buildRequest(businessData);

        console.log('[UnitedPay] Creating payin:', { orderId, amount });
        const response = await httpClient.post('/dgateway/ws/trans/nocard/makeOrder', requestBody);

        const parsed = parseResponse(response.data);

        if (parsed.success) {
            const data = parsed.data;
            if (data.status === '00') {
                return {
                    success: true,
                    payUrl: data.payUrl,
                    providerOrderId: data.transNo || orderId
                };
            } else {
                return {
                    success: false,
                    error: data.statusDesc || `Status: ${data.status}`
                };
            }
        } else {
            console.error('[UnitedPay] Payin error:', parsed.error);
            return { success: false, error: parsed.error };
        }
    } catch (error) {
        console.error('[UnitedPay] Payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payin order status
 * POST /dgateway/ws/trans/nocard/orderQuery
 */
async function queryPayin(orderId) {
    try {
        const businessData = {
            versionNo: 1,
            mchNo: MCH_NO,
            tradeNo: orderId
        };

        const requestBody = buildRequest(businessData);
        const response = await httpClient.post('/dgateway/ws/trans/nocard/orderQuery', requestBody);
        const parsed = parseResponse(response.data);

        if (parsed.success) {
            const data = parsed.data;
            return {
                success: true,
                orderId: data.tradeNo,
                providerOrderId: data.transNo,
                status: mapPayinStatus(data.status),
                amount: parseFloat(data.price) || 0,
                utr: data.utr || ''
            };
        } else {
            return { success: false, error: parsed.error };
        }
    } catch (error) {
        console.error('[UnitedPay] Query payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Create payout order
 * POST /dgateway/ws/trans/nocard/transferApply
 */
async function createPayout({ orderId, amount, accountNo, ifsc, name, phone, email, notifyUrl }) {
    try {
        const businessData = {
            versionNo: 1,
            mchNo: MCH_NO,
            price: parseFloat(amount),
            orderDate: formatOrderDate(new Date()),
            tradeNo: orderId,
            notifyUrl: notifyUrl,
            mode: 'S1',
            accBankCode: ifsc || '',
            accCardNo: accountNo || '',
            accName: name || '',
            accTel: phone || '',
            accEmail: email || '',
            purpose: 'Payment'
        };

        const requestBody = buildRequest(businessData);

        console.log('[UnitedPay] Creating payout:', { orderId, amount });
        const response = await httpClient.post('/dgateway/ws/trans/nocard/transferApply', requestBody);
        const parsed = parseResponse(response.data);

        if (parsed.success) {
            const data = parsed.data;
            if (data.status === '00') {
                return {
                    success: true,
                    providerOrderId: data.transNo,
                    status: 'processing'
                };
            } else {
                return {
                    success: false,
                    error: data.statusDesc || `Status: ${data.status}`
                };
            }
        } else {
            console.error('[UnitedPay] Payout error:', parsed.error);
            return { success: false, error: parsed.error };
        }
    } catch (error) {
        console.error('[UnitedPay] Payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payout order status
 * POST /dgateway/ws/trans/nocard/transferQuery
 */
async function queryPayout(orderId) {
    try {
        const businessData = {
            versionNo: 1,
            mchNo: MCH_NO,
            tradeNo: orderId
        };

        const requestBody = buildRequest(businessData);
        const response = await httpClient.post('/dgateway/ws/trans/nocard/transferQuery', requestBody);
        const parsed = parseResponse(response.data);

        if (parsed.success) {
            const data = parsed.data;
            return {
                success: true,
                orderId: data.tradeNo,
                providerOrderId: data.transNo,
                status: mapPayoutStatus(data.status),
                utr: data.utr || ''
            };
        } else {
            return { success: false, error: parsed.error };
        }
    } catch (error) {
        console.error('[UnitedPay] Query payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get balance
 * POST /dgateway/ws/trans/nocard/accBalQuery
 */
async function getBalance() {
    try {
        const businessData = {
            versionNo: 1,
            mchNo: MCH_NO
        };

        const requestBody = buildRequest(businessData);
        const response = await httpClient.post('/dgateway/ws/trans/nocard/accBalQuery', requestBody);
        const parsed = parseResponse(response.data);

        if (parsed.success) {
            const data = parsed.data;
            return {
                success: true,
                balance: parseFloat(data.curAvailable) || parseFloat(data.settleInAmt) || 0,
                availableBalance: parseFloat(data.curAvailable) || 0,
                settlementBalance: parseFloat(data.settleInAmt) || 0,
                creditLines: parseFloat(data.creditLines) || 0
            };
        } else {
            return { success: false, error: parsed.error };
        }
    } catch (error) {
        console.error('[UnitedPay] Balance exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Submit UTR (not supported by UnitedPay)
 */
async function submitUtr(orderId, utr) {
    return { success: false, error: 'UTR submission not supported by this channel' };
}

/**
 * Decrypt and parse a callback body
 * Returns the decrypted business data object
 */
function parseCallback(callbackBody) {
    if (!callbackBody || !callbackBody.payload) {
        return null;
    }
    try {
        const decryptedStr = aesDecrypt(callbackBody.payload);
        return JSON.parse(decryptedStr);
    } catch (e) {
        console.error('[UnitedPay] Callback decrypt error:', e.message);
        return null;
    }
}

/**
 * Map UnitedPay payin status codes to standard statuses
 * 00 = success
 * 02 = failed
 * Others = pending
 */
function mapPayinStatus(status) {
    if (status === '00') return 'success';
    if (status === '02') return 'failed';
    return 'pending';
}

/**
 * Map UnitedPay payout status codes to standard statuses
 * 00 = success
 * 01 = pending verification
 * 02 = failed
 * 09 = processing
 */
function mapPayoutStatus(status) {
    if (status === '00') return 'success';
    if (status === '02') return 'failed';
    if (status === '01' || status === '09') return 'processing';
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
    parseCallback,
    aesEncrypt,
    aesDecrypt,
    usesCustomPayPage: false,
    providerName: 'unitepay'
};
