/**
 * CKPay API Service
 * Provider for CKPay channel (internal name: ckpay)
 * Uses MD5 signature: md5(concatenated_fields + app_key)
 */

const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
require('dotenv').config();

// Shared agents for connection reuse
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

const BASE_URL = process.env.CKPAY_BASE_URL;
const MERCHANT_ID = process.env.CKPAY_MERCHANT_ID;
const APP_KEY = process.env.CKPAY_APP_KEY;

// Create axios instance with connection reuse
const httpClient = axios.create({
    baseURL: BASE_URL,
    timeout: 60000, // 60 seconds as recommended by docs
    headers: { 'Content-Type': 'application/json' },
    family: 4,
    httpAgent,
    httpsAgent
});

/**
 * Generate MD5 signature for CKPay requests
 * Signature = md5(field1+field2+...+app_key) - no separators, concatenated in specific order
 */
function generateSign(fields) {
    const str = fields.join('') + APP_KEY;
    return crypto.createHash('md5').update(str).digest('hex').toLowerCase();
}

/**
 * Verify callback signature
 * Callback signature: md5(accountOrder+amount+appId+orderId+status+app_key)
 */
function verifySign(params) {
    const fields = [
        params.accountOrder,
        params.amount,
        params.appId,
        params.orderId,
        params.status
    ];
    const calculated = generateSign(fields);
    return calculated === params.signature;
}

/**
 * Format date as yyyy-MM-dd HH:mm:ss
 */
function formatTimestamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/**
 * Create payin order
 * @param {Object} params - { orderId, amount, notifyUrl, playerIp?, accountUser? }
 * @returns {Object} - { success, payUrl, providerOrderId }
 */
async function createPayin({ orderId, amount, notifyUrl, playerIp = '127.0.0.1', accountUser = 'user' }) {
    try {
        const timestamp = formatTimestamp();

        // Signature: md5(accountOrder+amount+appId+notifyUrl+timestamp+app_key)
        const signFields = [orderId, amount, MERCHANT_ID, notifyUrl, timestamp];
        const signature = generateSign(signFields);

        const payload = {
            appId: MERCHANT_ID,
            accountOrder: orderId,
            timestamp: timestamp,
            notifyUrl: notifyUrl,
            amount: parseInt(amount),
            playerIp: playerIp,
            accountUser: accountUser,
            signature: signature
        };

        console.log('[CKPay] Creating payin:', { orderId, amount });
        const response = await httpClient.post('/gateway/common/api/order', payload);

        if (response.data.code === 0) {
            const data = response.data.data;
            return {
                success: true,
                payUrl: data.payUrl,
                providerOrderId: data.orderId,
                status: data.status
            };
        } else {
            console.error('[CKPay] Payin error:', response.data);
            return {
                success: false,
                error: response.data.desc || `Error code: ${response.data.code}`
            };
        }
    } catch (error) {
        console.error('[CKPay] Payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payin order status (using batch query with single order)
 */
async function queryPayin(orderId) {
    try {
        const timestamp = Date.now().toString();
        const orderType = '1'; // 1=payin

        // Signature: md5(appId+timestamp+orderType+app_key)
        const signFields = [MERCHANT_ID, timestamp, orderType];
        const signature = generateSign(signFields);

        const params = new URLSearchParams({
            appId: MERCHANT_ID,
            accountOrders: orderId,
            timestamp: timestamp,
            orderType: orderType,
            signature: signature
        });

        const response = await httpClient.get(`/gateway/common/api/batchQueryOrders?${params.toString()}`);

        if (response.data.code === 0 && response.data.data.orderResultList?.length > 0) {
            const order = response.data.data.orderResultList[0];
            return {
                success: true,
                orderId: order.accountOrder,
                providerOrderId: order.orderId,
                status: mapPayinStatus(order.status)
            };
        } else {
            return { success: false, error: response.data.desc || 'Order not found' };
        }
    } catch (error) {
        console.error('[CKPay] Query payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Create payout order
 * @param {Object} params - { orderId, amount, accountNo, ifsc, name, notifyUrl }
 */
async function createPayout({ orderId, amount, accountNo, ifsc, name, upi, notifyUrl }) {
    try {
        const timestamp = formatTimestamp();
        const payType = upi ? 2 : 1; // 1=bank, 2=vpa

        // Build fields for signature (alphabetically ordered in concatenation)
        // signature=md5(accountOrder+amount+appId+bankCardName+bankCardNo+bankIfsc+bankName+notifyUrl+payType+payeeName+payeePhone+timestamp+vpaAddress+app_key)
        const bankCardName = name || '';
        const bankCardNo = accountNo || '';
        const bankIfsc = ifsc || '';
        const bankName = ''; // Not always required
        const payeeName = name || '';
        const payeePhone = '';
        const vpaAddress = upi || '';

        const signFields = [
            orderId,           // accountOrder
            amount,            // amount
            MERCHANT_ID,       // appId
            bankCardName,      // bankCardName
            bankCardNo,        // bankCardNo
            bankIfsc,          // bankIfsc
            bankName,          // bankName
            notifyUrl,         // notifyUrl
            payType,           // payType
            payeeName,         // payeeName
            payeePhone,        // payeePhone
            timestamp,         // timestamp
            vpaAddress         // vpaAddress
        ];
        const signature = generateSign(signFields);

        const payload = {
            appId: MERCHANT_ID,
            accountOrder: orderId,
            timestamp: timestamp,
            notifyUrl: notifyUrl,
            amount: parseInt(amount),
            payType: payType,
            payeeName: payeeName,
            payeePhone: payeePhone,
            bankCardName: bankCardName,
            bankCardNo: bankCardNo,
            bankName: bankName,
            bankIfsc: bankIfsc,
            vpaAddress: vpaAddress,
            signature: signature
        };

        // Remove empty fields
        Object.keys(payload).forEach(key => {
            if (payload[key] === '' || payload[key] === null || payload[key] === undefined) {
                delete payload[key];
            }
        });

        console.log('[CKPay] Creating payout:', { orderId, amount, payType });
        const response = await httpClient.post('/gateway/common/api/trans', payload);

        if (response.data.code === 0) {
            const data = response.data.data;
            return {
                success: true,
                providerOrderId: data.orderId,
                status: 'processing'
            };
        } else {
            console.error('[CKPay] Payout error:', response.data);
            return {
                success: false,
                error: response.data.desc || `Error code: ${response.data.code}`
            };
        }
    } catch (error) {
        console.error('[CKPay] Payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payout order status
 */
async function queryPayout(orderId) {
    try {
        const timestamp = Date.now().toString();
        const orderType = '2'; // 2=payout

        const signFields = [MERCHANT_ID, timestamp, orderType];
        const signature = generateSign(signFields);

        const params = new URLSearchParams({
            appId: MERCHANT_ID,
            accountOrders: orderId,
            timestamp: timestamp,
            orderType: orderType,
            signature: signature
        });

        const response = await httpClient.get(`/gateway/common/api/batchQueryOrders?${params.toString()}`);

        if (response.data.code === 0 && response.data.data.orderResultList?.length > 0) {
            const order = response.data.data.orderResultList[0];
            return {
                success: true,
                orderId: order.accountOrder,
                providerOrderId: order.orderId,
                status: mapPayoutStatus(order.status)
            };
        } else {
            return { success: false, error: response.data.desc || 'Order not found' };
        }
    } catch (error) {
        console.error('[CKPay] Query payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get balance
 */
async function getBalance() {
    try {
        const timestamp = Date.now().toString();

        // Signature: md5(appId+timestamp+app_key)
        const signFields = [MERCHANT_ID, timestamp];
        const signature = generateSign(signFields);

        const params = new URLSearchParams({
            appId: MERCHANT_ID,
            timestamp: timestamp,
            signature: signature
        });

        const response = await httpClient.get(`/gateway/common/api/queryBalance?${params.toString()}`);

        if (response.data.code === 0) {
            const data = response.data.data;
            return {
                success: true,
                balance: parseFloat(data.balance) || 0,
                availableBalance: parseFloat(data.availableBalance) || 0
            };
        } else {
            return { success: false, error: response.data.desc || 'Balance query failed' };
        }
    } catch (error) {
        console.error('[CKPay] Balance exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Submit UTR (not supported by CKPay based on docs)
 */
async function submitUtr(orderId, utr) {
    return { success: false, error: 'UTR submission not supported by this channel' };
}

// Map CKPay status codes to standard statuses
// 10=processing, 60=failed, 70/80=success
function mapPayinStatus(status) {
    if (status === 70 || status === 80) return 'success';
    if (status === 60) return 'failed';
    return 'pending';
}

function mapPayoutStatus(status) {
    if (status === 70) return 'success';
    if (status === 60) return 'failed';
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
    // Config for channel router
    usesCustomPayPage: false, // CKPay returns payUrl for direct redirect
    providerName: 'ckpay'
};
