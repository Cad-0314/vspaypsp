/**
 * F2Pay API Service
 * Provider for X2 channel
 * Uses RSA signature with SHA256WithRSA
 */

const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
require('dotenv').config();

// Global HTTP agents for connection reuse
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

const BASE_URL = process.env.F2PAY_BASE_URL || 'https://api.f2pay.com';
const MERCHANT_ID = process.env.F2PAY_MERCHANT_ID;
const PLATFORM_PUBLIC_KEY = process.env.F2PAY_PLATFORM_PUBLIC_KEY;
const MERCHANT_PRIVATE_KEY = process.env.F2PAY_MERCHANT_PRIVATE_KEY;

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
 * Generate RSA signature using merchant private key
 */
function generateSign(bizContent) {
    try {
        const privateKey = `-----BEGIN PRIVATE KEY-----\n${MERCHANT_PRIVATE_KEY}\n-----END PRIVATE KEY-----`;
        const sign = crypto.createSign('RSA-SHA256');
        sign.update(bizContent, 'utf8');
        return sign.sign(privateKey, 'base64');
    } catch (error) {
        console.error('[F2Pay] Sign generation error:', error.message);
        return null;
    }
}

/**
 * Verify RSA signature using platform public key
 */
function verifySign(bizContent, signature) {
    try {
        const publicKey = `-----BEGIN PUBLIC KEY-----\n${PLATFORM_PUBLIC_KEY}\n-----END PUBLIC KEY-----`;
        const verify = crypto.createVerify('RSA-SHA256');
        verify.update(bizContent, 'utf8');
        return verify.verify(publicKey, signature, 'base64');
    } catch (error) {
        console.error('[F2Pay] Sign verification error:', error.message);
        return false;
    }
}

/**
 * Build F2Pay request payload
 */
function buildRequest(bizContent, traceId) {
    const bizContentStr = JSON.stringify(bizContent);
    return {
        traceId: traceId,
        merchantId: MERCHANT_ID,
        bizContent: bizContentStr,
        signType: 'RSA',
        sign: generateSign(bizContentStr)
    };
}

/**
 * Create payin order
 * @param {Object} params - { orderId, amount, notifyUrl, returnUrl, customerName, customerPhone, customerEmail, customerIp }
 * @returns {Object} - { success, payUrl, providerOrderId, deepLinks }
 */
async function createPayin({ orderId, amount, notifyUrl, returnUrl, customerName, customerPhone, customerEmail, customerIp }) {
    try {
        const bizContent = {
            amount: amount.toFixed(2),
            customerEmail: customerEmail || 'customer@example.com',
            customerIpAddress: customerIp || '127.0.0.1',
            customerName: customerName || 'Customer',
            customerPhone: customerPhone || '9999999999',
            mchOrderNo: orderId,
            methodCode: 'UpiMixed',
            notifyUrl: notifyUrl,
            returnUrl: returnUrl || notifyUrl
        };

        const payload = buildRequest(bizContent, orderId);

        console.log('[F2Pay] Creating payin:', { orderId, amount });
        const response = await httpClient.post('/payin/inr/order/create', payload);

        if (response.data.code === '0000') {
            const bizData = typeof response.data.bizContent === 'string'
                ? JSON.parse(response.data.bizContent)
                : response.data.bizContent;

            return {
                success: true,
                payUrl: bizData.payUrl,
                providerOrderId: bizData.platNo,
                mchOrderNo: bizData.mchOrderNo
            };
        } else {
            console.error('[F2Pay] Payin error:', response.data);
            return { success: false, error: response.data.msg || 'Unknown error' };
        }
    } catch (error) {
        console.error('[F2Pay] Payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Create payin order with V2 API (returns deeplinks)
 */
async function createPayinV2({ orderId, amount, notifyUrl, returnUrl, customerName, customerPhone, customerEmail, customerIp }) {
    try {
        const bizContent = {
            amount: amount.toFixed(2),
            customerEmail: customerEmail || 'customer@example.com',
            customerIpAddress: customerIp || '127.0.0.1',
            customerName: customerName || 'Customer',
            customerPhone: customerPhone || '9999999999',
            mchOrderNo: orderId,
            methodCode: 'UpiMixed',
            notifyUrl: notifyUrl,
            returnUrl: returnUrl || notifyUrl
        };

        const payload = buildRequest(bizContent, orderId);

        console.log('[F2Pay] Creating payin V2:', { orderId, amount });
        const response = await httpClient.post('/payin/inr/order/createV2', payload);

        if (response.data.code === '0000') {
            const bizData = typeof response.data.bizContent === 'string'
                ? JSON.parse(response.data.bizContent)
                : response.data.bizContent;

            // Parse accountInfo for deeplinks
            let deepLinks = {};
            if (bizData.accountInfo) {
                const accountInfo = typeof bizData.accountInfo === 'string'
                    ? JSON.parse(bizData.accountInfo)
                    : bizData.accountInfo;

                deepLinks = {
                    upi: accountInfo.upi,
                    upi_scan: accountInfo.upiScan ? `upi://pay?${accountInfo.upiScan}` : null,
                    upi_phonepe: accountInfo.upiPhonepe,
                    upi_intent: accountInfo.upiIntent ? `upi://pay?${accountInfo.upiIntent}` : null
                };
            }

            return {
                success: true,
                payUrl: bizData.payUrl,
                providerOrderId: bizData.platNo,
                mchOrderNo: bizData.mchOrderNo,
                deepLinks: deepLinks
            };
        } else {
            console.error('[F2Pay] Payin V2 error:', response.data);
            // Fallback to V1
            return createPayin({ orderId, amount, notifyUrl, returnUrl, customerName, customerPhone, customerEmail, customerIp });
        }
    } catch (error) {
        console.error('[F2Pay] Payin V2 exception:', error.message);
        // Fallback to V1
        return createPayin({ orderId, amount, notifyUrl, returnUrl, customerName, customerPhone, customerEmail, customerIp });
    }
}

/**
 * Query payin order status
 */
async function queryPayin(orderId) {
    try {
        const bizContent = { mchOrderNo: orderId };
        const payload = buildRequest(bizContent, `query_${orderId}`);

        const response = await httpClient.post('/payin/query', payload);

        if (response.data.code === '0000') {
            const bizData = typeof response.data.bizContent === 'string'
                ? JSON.parse(response.data.bizContent)
                : response.data.bizContent;

            return {
                success: true,
                orderId: bizData.mchOrderNo,
                providerOrderId: bizData.platNo,
                status: mapStatus(bizData.state),
                amount: parseFloat(bizData.amount),
                actualAmount: parseFloat(bizData.actualAmount),
                feeAmount: parseFloat(bizData.feeAmount),
                utr: bizData.trxId
            };
        } else {
            return { success: false, error: response.data.msg };
        }
    } catch (error) {
        console.error('[F2Pay] Query payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Create payout order
 */
async function createPayout({ orderId, amount, accountNo, ifsc, name, mobile, email, notifyUrl }) {
    try {
        const bizContent = {
            amount: amount.toFixed(2),
            mchOrderNo: orderId,
            methodCode: 'BANK_INR',
            notifyUrl: notifyUrl,
            payeeAccountNo: accountNo,
            payeeIfsc: ifsc,
            payeeName: name,
            payeeMobile: mobile || '9999999999',
            payeeEmail: email || 'payout@example.com'
        };

        const payload = buildRequest(bizContent, orderId);

        console.log('[F2Pay] Creating payout:', { orderId, amount });
        const response = await httpClient.post('/payout/inr/order/create', payload);

        if (response.data.code === '0000') {
            const bizData = typeof response.data.bizContent === 'string'
                ? JSON.parse(response.data.bizContent)
                : response.data.bizContent;

            return {
                success: true,
                providerOrderId: bizData.platNo,
                status: mapStatus(bizData.state || 'Processing')
            };
        } else {
            console.error('[F2Pay] Payout error:', response.data);
            return { success: false, error: response.data.msg || 'Unknown error' };
        }
    } catch (error) {
        console.error('[F2Pay] Payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payout order status
 */
async function queryPayout(orderId) {
    try {
        const bizContent = { mchOrderNo: orderId };
        const payload = buildRequest(bizContent, `payout_query_${orderId}`);

        const response = await httpClient.post('/payout/query', payload);

        if (response.data.code === '0000') {
            const bizData = typeof response.data.bizContent === 'string'
                ? JSON.parse(response.data.bizContent)
                : response.data.bizContent;

            return {
                success: true,
                orderId: bizData.mchOrderNo,
                providerOrderId: bizData.platNo,
                status: mapStatus(bizData.state),
                amount: parseFloat(bizData.amount),
                feeAmount: parseFloat(bizData.feeAmount),
                utr: bizData.trxId
            };
        } else {
            return { success: false, error: response.data.msg };
        }
    } catch (error) {
        console.error('[F2Pay] Query payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get balance
 */
async function getBalance(currency = 'INR') {
    try {
        const bizContent = { currency: currency };
        const payload = buildRequest(bizContent, `balance_${Date.now()}`);

        const response = await httpClient.post('/balance', payload);

        if (response.data.code === '0000') {
            const bizData = typeof response.data.bizContent === 'string'
                ? JSON.parse(response.data.bizContent)
                : response.data.bizContent;

            return {
                success: true,
                balance: parseFloat(bizData.availiable) || 0,
                total: parseFloat(bizData.total) || 0,
                pending: parseFloat(bizData.payoutPending) || 0
            };
        } else {
            return { success: false, error: response.data.msg };
        }
    } catch (error) {
        console.error('[F2Pay] Balance exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Submit UTR resubmit
 */
async function submitUtr(orderId, utr) {
    try {
        const bizContent = {
            mchOrderNo: orderId,
            trxId: utr
        };
        const payload = buildRequest(bizContent, `utr_${orderId}`);

        const response = await httpClient.post('/payin/inr/order/resubmit', payload);

        if (response.data.code === '0000') {
            return { success: true };
        } else {
            return { success: false, error: response.data.msg };
        }
    } catch (error) {
        console.error('[F2Pay] Submit UTR exception:', error.message);
        return { success: false, error: error.message };
    }
}

// Map F2Pay status to our standard statuses
function mapStatus(state) {
    const map = {
        'Pending': 'pending',
        'Processing': 'processing',
        'Paid': 'success',
        'UnequalPaid': 'success',
        'Success': 'success',
        'Failed': 'failed',
        'Expired': 'expired',
        'Cancelled': 'failed'
    };
    return map[state] || 'pending';
}

module.exports = {
    createPayin,
    createPayinV2,
    queryPayin,
    createPayout,
    queryPayout,
    getBalance,
    submitUtr,
    verifySign,
    // Config for channel router
    usesCustomPayPage: true, // X2 uses custom pay page with deeplinks
    providerName: 'f2pay'
};
