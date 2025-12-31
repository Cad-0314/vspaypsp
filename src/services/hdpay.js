/**
 * HDPay API Service
 * Provider for HDPay channel
 * Uses MD5 signature: MD5(sorted_params + &key=SECRET)
 */

const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const BASE_URL = process.env.HDPAY_BASE_URL || 'https://dd1688.cc';
const MERCHANT_ID = process.env.HDPAY_MERCHANT_ID;
const SECRET_KEY = process.env.HDPAY_SECRET_KEY;

// Create axios instance with IPv4 enforcement
const httpClient = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
    family: 4 // Force IPv4
});

/**
 * Generate MD5 signature for HDPay requests
 * Sort params alphabetically, join with &, append &key=SECRET, MD5 lowercase
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
    const str = `${query}&key=${SECRET_KEY}`;

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
 * @param {Object} params - { orderId, amount, notifyUrl, name?, mobile?, email?, deeplink? }
 * @returns {Object} - { success, payUrl, orderId, deeplink, providerOrderId }
 */
async function createPayin({ orderId, amount, notifyUrl, name, mobile, email, deeplink = true }) {
    try {
        const payload = {
            merchantId: parseInt(MERCHANT_ID),
            merchantOrderId: orderId,
            amount: String(amount),
            notifyUrl: notifyUrl,
            deeplink: deeplink
        };

        if (name) payload.name = name;
        if (mobile) payload.mobile = mobile;
        if (email) payload.email = email;

        payload.sign = generateSign(payload);

        console.log('[HDPay] Creating payin:', { orderId, amount });
        const response = await httpClient.post('/api/payin/submit', payload);

        if (response.data.code === 200) {
            const data = response.data.data;

            // Map single deeplink to standard format
            const deepLinks = {};
            if (data.deeplink) {
                deepLinks.upi = data.deeplink;
                deepLinks.upi_scan = data.deeplink;
            }

            return {
                success: true,
                payUrl: data.payUrl,
                providerOrderId: data.orderId,
                deepLinks: deepLinks,
                channelId: data.channelId,
                status: data.status
            };
        } else {
            console.error('[HDPay] Payin error:', response.data);
            return { success: false, error: response.data.msg || 'Unknown error' };
        }
    } catch (error) {
        console.error('[HDPay] Payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payin order status
 */
async function queryPayin(orderId) {
    try {
        const payload = {
            merchantId: parseInt(MERCHANT_ID),
            merchantOrderId: orderId
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/api/payin/status', payload);

        if (response.data.code === 200) {
            const data = response.data.data;
            return {
                success: true,
                orderId: data.merchantOrderId,
                providerOrderId: data.orderId,
                status: mapPayinStatus(data.status),
                message: data.message
            };
        } else {
            return { success: false, error: response.data.msg };
        }
    } catch (error) {
        console.error('[HDPay] Query payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Create payout order
 * @param {Object} params - { orderId, amount, type (0=bank, 1=upi), name, account?, ifsc?, upi?, notifyUrl }
 */
async function createPayout({ orderId, amount, type = 0, name, account, ifsc, upi, notifyUrl }) {
    try {
        const payload = {
            merchantId: parseInt(MERCHANT_ID),
            merchantPayoutId: orderId,
            amount: String(amount),
            name: name,
            type: String(type)
        };

        if (type === 0 || type === '0') {
            // Bank transfer
            payload.account = account;
            payload.ifsc = ifsc;
        } else {
            // UPI transfer
            payload.upi = upi;
        }

        if (notifyUrl) payload.notifyUrl = notifyUrl;

        payload.sign = generateSign(payload);

        console.log('[HDPay] Creating payout:', { orderId, amount, type });
        const response = await httpClient.post('/api/payout/submit', payload);

        if (response.data.code === 200) {
            const data = response.data.data;
            return {
                success: true,
                providerOrderId: data.payoutId,
                status: mapPayoutStatus(data.status),
                utr: data.utr
            };
        } else {
            console.error('[HDPay] Payout error:', response.data);
            return { success: false, error: response.data.msg || 'Unknown error' };
        }
    } catch (error) {
        console.error('[HDPay] Payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payout order status
 */
async function queryPayout(orderId) {
    try {
        const payload = {
            merchantId: parseInt(MERCHANT_ID),
            merchantPayoutId: orderId
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/api/payout/query', payload);

        if (response.data.code === 200) {
            const data = response.data.data;
            return {
                success: true,
                orderId: data.merchantPayoutId,
                providerOrderId: data.payoutId,
                status: mapPayoutStatus(data.status),
                utr: data.utr,
                amount: data.amount
            };
        } else {
            return { success: false, error: response.data.msg };
        }
    } catch (error) {
        console.error('[HDPay] Query payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get balance
 */
async function getBalance() {
    try {
        const payload = {
            merchantId: parseInt(MERCHANT_ID)
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/api/payout/balance', payload);

        if (response.data.code === 200) {
            return {
                success: true,
                balance: parseFloat(response.data.data) || 0
            };
        } else {
            return { success: false, error: response.data.msg };
        }
    } catch (error) {
        console.error('[HDPay] Balance exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Check UTR
 */
async function checkUtr(utr) {
    try {
        const payload = {
            merchantId: parseInt(MERCHANT_ID),
            utr: utr
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/api/payin/utr/check', payload);

        if (response.data.code === 200) {
            const data = response.data.data;
            return {
                success: true,
                utr: data.utr,
                amount: data.amount,
                status: data.status,
                matchOrderId: data.matchOrderId
            };
        } else {
            return { success: false, error: response.data.msg };
        }
    } catch (error) {
        console.error('[HDPay] Check UTR exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Submit/Fix UTR
 */
async function submitUtr(orderId, utr) {
    try {
        const payload = {
            merchantId: parseInt(MERCHANT_ID),
            merchantOrderId: orderId,
            utr: utr
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/api/payin/utr/fix', payload);

        if (response.data.code === 200) {
            return { success: true };
        } else {
            return { success: false, error: response.data.msg };
        }
    } catch (error) {
        console.error('[HDPay] Submit UTR exception:', error.message);
        return { success: false, error: error.message };
    }
}

// Map HDPay status codes to our standard statuses
function mapPayinStatus(status) {
    const map = { '0': 'pending', '1': 'success', '2': 'failed' };
    return map[status] || 'pending';
}

function mapPayoutStatus(status) {
    const map = { '0': 'processing', '1': 'success', '2': 'failed' };
    return map[status] || 'processing';
}

module.exports = {
    createPayin,
    queryPayin,
    createPayout,
    queryPayout,
    getBalance,
    checkUtr,
    submitUtr,
    verifySign,
    generateSign,
    // Config for channel router
    usesCustomPayPage: false, // HDPay redirects to their page
    providerName: 'hdpay'
};
