/**
 * Silkpay API Service
 * Provider for Payable channel
 */

const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
require('dotenv').config();

// Global keep-alive agents
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

const BASE_URL = process.env.SILKPAY_BASE_URL || 'https://api.silkpay.ai';
const MID = process.env.SILKPAY_MID;
const SECRET = process.env.SILKPAY_SECRET;

// Create axios instance
const httpClient = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
    family: 4,
    httpAgent,
    httpsAgent
});

/**
 * Generate MD5 signature for Silkpay
 */
function generateSign(params) {
    const filtered = {};
    Object.keys(params).forEach(key => {
        if (key !== 'sign' && params[key] !== '' && params[key] != null) {
            filtered[key] = params[key];
        }
    });

    const sorted = Object.keys(filtered).sort();
    const query = sorted.map(k => `${k}=${filtered[k]}`).join('&');
    const str = `${query}&key=${SECRET}`;

    return crypto.createHash('md5').update(str).digest('hex').toLowerCase();
}

/**
 * Verify callback signature
 */
function verifySign(params) {
    const receivedSign = params.sign;
    const calculatedSign = generateSign(params);
    return receivedSign === calculatedSign;
}

/**
 * Create payin order
 */
async function createPayin({ orderId, amount, notifyUrl, returnUrl, customerName, customerPhone, customerEmail }) {
    try {
        const payload = {
            mid: MID,
            orderId: orderId,
            amount: amount.toFixed(2),
            notifyUrl: notifyUrl,
            returnUrl: returnUrl || notifyUrl,
            customerName: customerName || 'Customer',
            customerPhone: customerPhone || '9999999999',
            customerEmail: customerEmail || 'customer@example.com',
            payMethod: 'UPI'
        };

        payload.sign = generateSign(payload);

        console.log('[Silkpay] Creating payin:', { orderId, amount });
        console.log('[Silkpay] Target URL:', `${BASE_URL}/api/v1/payin/create`);
        const response = await httpClient.post('/api/v1/payin/create', payload);

        if (response.data.code === 0 || response.data.code === 200 || response.data.success) {
            const data = response.data.data || response.data;

            // Build deeplinks from UPI data if available
            const deepLinks = {};
            if (data.upiId) {
                const upiParams = `pa=${data.upiId}&pn=Payment&am=${amount}&cu=INR&tn=${orderId}`;
                deepLinks.upi = data.upiId;
                deepLinks.upi_scan = `upi://pay?${upiParams}`;
                deepLinks.upi_phonepe = `phonepe://pay?${upiParams}`;
                deepLinks.upi_gpay = `tez://upi/pay?${upiParams}`;
                deepLinks.upi_paytm = `paytmmp://pay?${upiParams}`;
            }

            return {
                success: true,
                payUrl: data.payUrl || data.paymentUrl,
                providerOrderId: data.orderId || data.tradeNo,
                deepLinks: deepLinks,
                upiId: data.upiId
            };
        } else {
            console.error('[Silkpay] Payin error:', response.data);
            return { success: false, error: response.data.msg || response.data.message || 'Unknown error' };
        }
    } catch (error) {
        console.error('[Silkpay] Payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payin order status
 */
async function queryPayin(orderId) {
    try {
        const payload = {
            mid: MID,
            orderId: orderId
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/api/v1/payin/query', payload);

        if (response.data.code === 0 || response.data.code === 200) {
            const data = response.data.data || response.data;
            return {
                success: true,
                orderId: data.orderId,
                providerOrderId: data.tradeNo,
                status: mapStatus(data.status),
                amount: parseFloat(data.amount),
                actualAmount: parseFloat(data.actualAmount || data.amount),
                utr: data.utr || data.bankRef
            };
        } else {
            return { success: false, error: response.data.msg };
        }
    } catch (error) {
        console.error('[Silkpay] Query payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Create payout order
 */
async function createPayout({ orderId, amount, accountNo, ifsc, name, mobile, notifyUrl }) {
    try {
        const payload = {
            mid: MID,
            orderId: orderId,
            amount: amount.toFixed(2),
            notifyUrl: notifyUrl,
            accountNo: accountNo,
            ifsc: ifsc,
            accountName: name,
            mobile: mobile || '9999999999'
        };

        payload.sign = generateSign(payload);

        console.log('[Silkpay] Creating payout:', { orderId, amount });
        const response = await httpClient.post('/api/v1/payout/create', payload);

        if (response.data.code === 0 || response.data.code === 200 || response.data.success) {
            const data = response.data.data || response.data;
            return {
                success: true,
                providerOrderId: data.tradeNo || data.orderId,
                status: 'processing'
            };
        } else {
            console.error('[Silkpay] Payout error:', response.data);
            return { success: false, error: response.data.msg || 'Unknown error' };
        }
    } catch (error) {
        console.error('[Silkpay] Payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payout order status
 */
async function queryPayout(orderId) {
    try {
        const payload = {
            mid: MID,
            orderId: orderId
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/api/v1/payout/query', payload);

        if (response.data.code === 0 || response.data.code === 200) {
            const data = response.data.data || response.data;
            return {
                success: true,
                orderId: data.orderId,
                providerOrderId: data.tradeNo,
                status: mapStatus(data.status),
                amount: parseFloat(data.amount),
                utr: data.utr || data.bankRef
            };
        } else {
            return { success: false, error: response.data.msg };
        }
    } catch (error) {
        console.error('[Silkpay] Query payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get balance
 */
async function getBalance() {
    try {
        const payload = {
            mid: MID
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/api/v1/balance', payload);

        if (response.data.code === 0 || response.data.code === 200) {
            const data = response.data.data || response.data;
            return {
                success: true,
                balance: parseFloat(data.balance || data.availableBalance) || 0
            };
        } else {
            return { success: false, error: response.data.msg };
        }
    } catch (error) {
        console.error('[Silkpay] Balance exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Submit UTR
 */
async function submitUtr(orderId, utr) {
    try {
        const payload = {
            mid: MID,
            orderId: orderId,
            utr: utr
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/api/v1/payin/utr', payload);

        if (response.data.code === 0 || response.data.code === 200) {
            return { success: true };
        } else {
            return { success: false, error: response.data.msg };
        }
    } catch (error) {
        console.error('[Silkpay] Submit UTR exception:', error.message);
        return { success: false, error: error.message };
    }
}

// Map status to standard
function mapStatus(status) {
    if (typeof status === 'number') {
        const map = { 0: 'pending', 1: 'success', 2: 'failed', 3: 'expired' };
        return map[status] || 'pending';
    }
    const strMap = {
        'pending': 'pending',
        'processing': 'processing',
        'success': 'success',
        'paid': 'success',
        'failed': 'failed',
        'expired': 'expired'
    };
    return strMap[String(status).toLowerCase()] || 'pending';
}

module.exports = {
    createPayin,
    queryPayin,
    createPayout,
    queryPayout,
    getBalance,
    submitUtr,
    verifySign,
    // Config for channel router
    usesCustomPayPage: true, // Payable uses custom pay page
    providerName: 'silkpay'
};
