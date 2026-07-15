/**
 * BCATPAY API Service
 * Provider for BCATPAY channel (internal name: bcatpay, UI name: BDTPay)
 * Uses POST requests with x-www-form-urlencoded and MD5 signature
 * 
 * API Endpoints:
 * - Payin:          POST /api/receiveOrder
 * - Payin Query:    POST /api/queryorder
 * - UTR Submit:     POST /api/backUtr
 * - Payout:         POST /api/payment
 * - Payout Query:   POST /api/querypayment
 * - Balance:        POST /api/queryPrice
 */

const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
require('dotenv').config();

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

const BASE_URL = process.env.BCATPAY_BASE_URL;
const MCH_ID = process.env.BCATPAY_MCH_ID;
const SIGN_KEY = process.env.BCATPAY_SIGN_KEY;
const PAYIN_CHANNEL_ID = process.env.BCATPAY_PAYIN_CHANNEL_ID || '3885';
const PAYOUT_CHANNEL_ID = process.env.BCATPAY_PAYOUT_CHANNEL_ID || '3886';

// Per-wallet channel IDs from BCAT dashboard
// bKash: Collect=3883, Pay=3884 | Nagad: Collect=3885, Pay=3886
const WALLET_CHANNELS = {
    bkash:  { payin: '3883', payout: '3884' },
    nagad:  { payin: '3885', payout: '3886' },
    rocket: { payin: PAYIN_CHANNEL_ID, payout: PAYOUT_CHANNEL_ID },  // fallback to default
    upay:   { payin: PAYIN_CHANNEL_ID, payout: PAYOUT_CHANNEL_ID }   // fallback to default
};

const httpClient = axios.create({
    baseURL: BASE_URL,
    timeout: 60000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    family: 4,
    httpAgent,
    httpsAgent
});

/**
 * Generate MD5 signature
 * 1. Filter out 'sign' field and empty/null values
 * 2. Sort parameters by key alphabetically ascending (ksort)
 * 3. Concatenate as key=value&
 * 4. Append key=SIGN_KEY
 * 5. MD5 hash
 */
function generateSign(params) {
    const filtered = Object.entries(params)
        .filter(([k, v]) => k !== 'sign' && v !== null && v !== undefined && v !== '')
        .sort(([a], [b]) => a.localeCompare(b));

    const str = filtered.map(([k, v]) => `${k}=${v}&`).join('') + `key=${SIGN_KEY}`;
    return crypto.createHash('md5').update(str).digest('hex').toLowerCase();
}

/**
 * Verify callback signature
 */
function verifySign(params) {
    if (!params || !params.sign) return false;
    const calculated = generateSign(params);
    return calculated === params.sign.toLowerCase();
}

/**
 * Helper to post Form Url Encoded
 */
async function postForm(endpoint, params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            searchParams.append(key, value);
        }
    }
    return httpClient.post(BASE_URL + endpoint, searchParams.toString()).catch(e => { console.log('AXIOS ERR RESPONSE=', e.response && e.response.data); throw e; });
}

/**
 * Create payin order (collection)
 * POST /api/receiveOrder
 */
async function createPayin({ orderId, amount, notifyUrl, returnUrl, param, bankCode, channelCode }) {
    try {
        // channelCode is the preferred alias; bankCode is fallback
        const wallet = (channelCode || bankCode || '').toLowerCase();
        const tdid = (WALLET_CHANNELS[wallet] && WALLET_CHANNELS[wallet].payin) || PAYIN_CHANNEL_ID;

        const params = {
            mcid: MCH_ID,
            orderno: orderId,
            price: parseFloat(amount).toFixed(2),
            tdid: tdid,
            callback_url: notifyUrl,
            returnUrl: returnUrl || notifyUrl
        };
        params.sign = generateSign(params);

        console.log('[BCATPAY] Creating payin:', { orderId, amount: params.price, wallet, tdid });
        const response = await postForm('/api/receiveOrder', params);

        if (response.data && response.data.code === 200) {
            const data = response.data;
            return {
                success: true,
                payUrl: data.data || '', // Data field contains the payment link
                providerOrderId: data.ordersn || orderId,
                channelCode: wallet || undefined,
                extra: {
                    account_number: data.account_number,
                    account_name: data.account_name,
                    qrcode: data.qrcode,
                    bankName: data.bankName,
                    bankCode: data.bankCode
                }
            };
        } else {
            console.error('[BCATPAY] Payin error:', response.data);
            return {
                success: false,
                error: response.data?.msg || 'Payin creation failed'
            };
        }
    } catch (error) {
        console.error('[BCATPAY] Payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payin order status
 * POST /api/queryorder
 */
async function queryPayin(orderId) {
    const { Order } = require('../models');
    const order = await Order.findOne({ where: { orderId: orderId } });
    const ordersn = order && order.providerResponse ? JSON.parse(order.providerResponse).providerOrderId : orderId;
    // The query requires ordersn, so we expect the platform's order number or we just use orderId if mapped
    // Note: bcatpay requires the platform's ordersn. We should try to query.
    try {
        const params = {
            mcid: MCH_ID,
            ordersn: ordersn
        };
        params.sign = generateSign(params);

        const response = await postForm('/api/queryorder', params);

        if (response.data && response.data.code === 200) {
            const data = response.data.data;
            return {
                success: true,
                orderId: data.orderno,
                providerOrderId: data.ordersn,
                status: mapPayinStatus(data.status),
                amount: parseFloat(data.price) || 0,
                utr: data.utr || ''
            };
        } else {
            return { success: false, error: response.data?.msg || 'Query failed' };
        }
    } catch (error) {
        console.error('[BCATPAY] Payin query exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Submit UTR for payin order
 * POST /api/backUtr
 */
async function submitUtr(orderId, utr) {
    const { Order } = require('../models');
    const order = await Order.findOne({ where: { orderId: orderId } });
    const ordersn = order && order.providerResponse ? JSON.parse(order.providerResponse).providerOrderId : orderId;
    try {
        const params = {
            mcid: MCH_ID,
            utr: utr,
            ordersn: ordersn // Expecting the platform's ordersn
        };
        params.sign = generateSign(params);

        console.log('[BCATPAY] Submitting UTR:', { orderId, utr });
        const response = await postForm('/api/backUtr', params);

        if (response.data && response.data.code === 200) {
            return { success: true, message: response.data.msg || 'UTR submitted successfully' };
        } else {
            return {
                success: false,
                error: response.data?.msg || 'UTR submission failed'
            };
        }
    } catch (error) {
        console.error('[BCATPAY] UTR submission exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Create payout order (payment agent)
 * POST /api/payment
 */
async function createPayout({ orderId, amount, name, accountNo, ifsc, notifyUrl, bankName, channelCode }) {
    try {
        // channelCode is the preferred alias; bankName/ifsc are fallbacks
        const walletProvider = (channelCode || bankName || ifsc || 'nagad').toLowerCase();
        const validProviders = ['bkash', 'nagad', 'rocket', 'upay'];
        const normalizedProvider = validProviders.includes(walletProvider) ? walletProvider : 'nagad';

        // Auto-route payout channel by wallet provider
        const tdid = (WALLET_CHANNELS[normalizedProvider] && WALLET_CHANNELS[normalizedProvider].payout) || PAYOUT_CHANNEL_ID;

        const params = {
            mcid: MCH_ID,
            orderno: orderId,
            type: 1, // 1: bank card/MFS payment, 2: cryptocurrency payment
            price: Math.floor(parseFloat(amount)), // Must be an integer
            tdid: tdid,
            zh: accountNo || '',
            mc: name || 'User',
            bankName: normalizedProvider, // BCAT API requires exact: nagad, bkash, rocket, or upay
            bankCode: normalizedProvider, // Use same as bankName for Bangladesh
            callback_url: notifyUrl
        };
        params.sign = generateSign(params);

        console.log('[BCATPAY] Creating payout:', { orderId, amount: params.price, wallet: normalizedProvider, tdid });
        const response = await postForm('/api/payment', params);

        if (response.data && response.data.code === 200) {
            return {
                success: true,
                providerOrderId: response.data.ordersn || orderId,
                channelCode: normalizedProvider,
                status: 'processing'
            };
        } else {
            console.error('[BCATPAY] Payout failure response:', response.data);
            return {
                success: false,
                error: response.data?.msg || 'Payout creation failed'
            };
        }
    } catch (error) {
        console.error('[BCATPAY] Payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payout order status
 * POST /api/querypayment
 */
async function queryPayout(orderId) {
    const { Order } = require('../models');
    const order = await Order.findOne({ where: { orderId: orderId } });
    const ordersn = order && order.providerResponse ? JSON.parse(order.providerResponse).providerOrderId : orderId;
    try {
        const params = {
            mcid: MCH_ID,
            ordersn: orderId
        };
        params.sign = generateSign(params);

        const response = await postForm('/api/querypayment', params);

        if (response.data && response.data.code === 200) {
            const data = response.data.data;
            return {
                success: true,
                orderId: data.orderno,
                providerOrderId: data.ordersn,
                status: mapPayoutStatus(data.status),
                utr: ''
            };
        } else {
            return { success: false, error: response.data?.msg || 'Query failed' };
        }
    } catch (error) {
        console.error('[BCATPAY] Payout query exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get balance
 * POST /api/queryPrice
 */
async function getBalance() {
    try {
        const params = {
            mcid: MCH_ID
        };
        params.sign = generateSign(params);

        const response = await postForm('/api/queryPrice', params);

        if (response.data && response.data.code === 200) {
            const data = response.data.data;
            return {
                success: true,
                balance: parseFloat(data.price) || 0,
                settleBalance: parseFloat(data.dongjie) || 0 // Frozen balance
            };
        } else {
            return { success: false, error: response.data?.msg || 'Balance query failed' };
        }
    } catch (error) {
        console.error('[BCATPAY] Balance exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Map BCATPAY payin status to standard statuses
 * status: 0 Pending, 1 Paid, 2 Refund received, 3 Failed
 */
function mapPayinStatus(status) {
    const s = parseInt(status);
    switch (s) {
        case 1: return 'success';
        case 3: return 'failed';
        case 0:
        default: return 'pending';
    }
}

/**
 * Map BCATPAY payout status to standard statuses
 * status: 0 In progress, 1 Paid, 2 Rejected
 */
function mapPayoutStatus(status) {
    const s = parseInt(status);
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
    mapPayinStatus,
    mapPayoutStatus,
    usesCustomPayPage: false,
    providerName: 'bcatpay'
};
