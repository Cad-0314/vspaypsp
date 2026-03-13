/**
 * PassPay API Service
 * Provider for PassPay channel (internal name: passpay)
 * Uses JSON POST requests with MD5 signature
 * 
 * API Endpoints:
 * - Payin:          POST /api/developer/order/create
 * - Payin Query:    POST /api/developer/order/query
 * - Payout:         POST /api/developer/payout/create
 * - Payout Query:   POST /api/developer/payout/query
 * - Balance:        POST /api/developer/balance/query
 * - UTR Submit:     POST /api/developer/utr/submit
 * 
 * Callbacks:
 * - Payin:  status 5=success, 6=failed, 3=processing
 * - Payout: status 5=success, 6=failed, 3=processing
 * 
 * Signature: MD5 of sorted key=value pairs + &key=SECRET (lowercase)
 * Amount format: two decimal places, e.g. "1000.00"
 */

const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
require('dotenv').config();

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

const BASE_URL = process.env.PASSPAY_BASE_URL;
const MCH_ID = process.env.PASSPAY_MCH_ID;
const SIGN_KEY = process.env.PASSPAY_SIGN_KEY;
const PAY_ID = process.env.PASSPAY_PAY_ID;

const httpClient = axios.create({
    baseURL: BASE_URL,
    timeout: 60000,
    headers: { 'Content-Type': 'application/json' },
    family: 4,
    httpAgent,
    httpsAgent
});

/**
 * Generate MD5 signature
 * 1. Filter out 'sign' field and empty/null values
 * 2. Sort parameters by ASCII key name ascending
 * 3. Concatenate as key=value&key=value
 * 4. Append &key=SIGN_KEY
 * 5. MD5 hash → lowercase hex
 */
function generateSign(params) {
    const filtered = Object.entries(params)
        .filter(([k, v]) => k !== 'sign' && v !== null && v !== undefined && v !== '')
        .sort(([a], [b]) => a.localeCompare(b));

    const str = filtered.map(([k, v]) => `${k}=${v}`).join('&') + `&key=${SIGN_KEY}`;
    return crypto.createHash('md5').update(str).digest('hex').toLowerCase();
}

/**
 * Verify callback signature
 */
function verifySign(params) {
    if (!params || !params.sign) return false;
    const calculated = generateSign(params);
    return calculated === params.sign;
}

/**
 * Create payin order (collection)
 * POST /api/developer/order/create
 */
async function createPayin({ orderId, amount, notifyUrl }) {
    try {
        const params = {
            mchid: MCH_ID,
            pay_id: PAY_ID,
            out_trade_no: orderId,
            amount: parseFloat(amount).toFixed(2),
            notify_url: notifyUrl
        };
        params.sign = generateSign(params);

        console.log('[PassPay] Creating payin:', { orderId, amount: params.amount });
        const response = await httpClient.post('/api/developer/order/create', params);

        if (response.data && response.data.data && response.data.data.status === 1) {
            const data = response.data.data;
            return {
                success: true,
                payUrl: data.pay_link || '',
                providerOrderId: data.trade_no || orderId
            };
        } else {
            console.error('[PassPay] Payin error:', response.data);
            return {
                success: false,
                error: response.data?.rMsg || response.data?.data?.msg || 'Payin creation failed'
            };
        }
    } catch (error) {
        console.error('[PassPay] Payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payin order status
 * POST /api/developer/order/query
 */
async function queryPayin(orderId) {
    try {
        const params = {
            mchid: MCH_ID,
            out_trade_no: orderId
        };
        params.sign = generateSign(params);

        const response = await httpClient.post('/api/developer/order/query', params);

        if (response.data && response.data.data) {
            const data = response.data.data;
            return {
                success: true,
                orderId: data.out_trade_no,
                status: mapPayinStatus(data.status),
                amount: parseFloat(data.amount) || 0,
                utr: data.utr || ''
            };
        } else {
            return { success: false, error: response.data?.rMsg || 'Query failed' };
        }
    } catch (error) {
        console.error('[PassPay] Payin query exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Create payout order (payment on behalf)
 * POST /api/developer/payout/create
 */
async function createPayout({ orderId, amount, name, accountNo, ifsc, notifyUrl, customerPhone }) {
    try {
        const params = {
            mchid: MCH_ID,
            out_trade_no: orderId,
            amount: parseFloat(amount).toFixed(2),
            to_holder: name || 'User',
            to_account: accountNo || '',
            to_ifsc: ifsc || '',
            to_phone_number: customerPhone || '9876543210',
            notify_url: notifyUrl
        };
        params.sign = generateSign(params);

        console.log('[PassPay] Creating payout:', { orderId, amount: params.amount });
        const response = await httpClient.post('/api/developer/payout/create', params);

        if (response.data && response.data.data && response.data.data.status === 1) {
            const data = response.data.data;
            return {
                success: true,
                providerOrderId: data.trade_no || orderId,
                status: 'processing'
            };
        } else {
            console.error('[PassPay] Payout failure response:', JSON.stringify(response.data, null, 2));
            return {
                success: false,
                error: response.data?.rMsg || response.data?.data?.msg || 'Payout creation failed'
            };
        }
    } catch (error) {
        console.error('[PassPay] Payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payout order status
 * POST /api/developer/payout/query
 */
async function queryPayout(orderId) {
    try {
        const params = {
            mchid: MCH_ID,
            out_trade_no: orderId
        };
        params.sign = generateSign(params);

        const response = await httpClient.post('/api/developer/payout/query', params);

        if (response.data && response.data.data) {
            const data = response.data.data;
            return {
                success: true,
                orderId: data.out_trade_no,
                providerOrderId: data.trade_no,
                status: mapPayoutStatus(data.status),
                utr: data.utr || ''
            };
        } else {
            return { success: false, error: response.data?.rMsg || 'Query failed' };
        }
    } catch (error) {
        console.error('[PassPay] Payout query exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get balance
 * POST /api/developer/balance/query
 */
async function getBalance() {
    try {
        const params = {
            mchid: MCH_ID
        };
        params.sign = generateSign(params);

        const response = await httpClient.post('/api/developer/balance/query', params);

        if (response.data && response.data.data) {
            const data = response.data.data;
            return {
                success: true,
                balance: parseFloat(data.available_balance) || 0,
                settleBalance: parseFloat(data.lock_balance) || 0
            };
        } else {
            return { success: false, error: response.data?.rMsg || 'Balance query failed' };
        }
    } catch (error) {
        console.error('[PassPay] Balance exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Submit UTR for payin order
 * POST /api/developer/utr/submit
 */
async function submitUtr(orderId, utr) {
    try {
        const params = {
            mchid: MCH_ID,
            out_trade_no: orderId,
            utr: utr
        };
        params.sign = generateSign(params);

        console.log('[PassPay] Submitting UTR:', { orderId, utr });
        const response = await httpClient.post('/api/developer/utr/submit', params);

        if (response.data && response.data.data && response.data.data.status === 11) {
            return { success: true, message: response.data.data.msg || 'UTR submitted successfully' };
        } else {
            return {
                success: false,
                error: response.data?.data?.msg || response.data?.rMsg || 'UTR submission failed'
            };
        }
    } catch (error) {
        console.error('[PassPay] UTR submission exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Map PassPay payin status to standard statuses
 * status: 3=processing, 5=success, 6=failed
 */
function mapPayinStatus(status) {
    const s = parseInt(status);
    switch (s) {
        case 5: return 'success';
        case 6: return 'failed';
        case 3:
        default: return 'pending';
    }
}

/**
 * Map PassPay payout status to standard statuses
 * status: 3=processing, 5=success, 6=failed
 */
function mapPayoutStatus(status) {
    const s = parseInt(status);
    switch (s) {
        case 5: return 'success';
        case 6: return 'failed';
        case 3:
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
    providerName: 'passpay'
};
