/**
 * F2Pay API Service
 * Provider for F2Pay channel (internal name: f2pay)
 * Uses RSA SHA256WithRSA signature on bizContent JSON string
 * 
 * API Endpoints:
 * - Payin:   POST /payin/inr/order/create
 * - Payout:  POST /payout/inr/order/create  (bank transfer)
 * - Payin Query:  POST /payin/query
 * - Payout Query: POST /payout/query
 * - Balance: POST /balance
 * - Callbacks: POST to notifyUrl, respond with 'success'
 * 
 * Request format:
 *   { traceId, merchantId, bizContent (JSON string), signType: 'RSA', sign }
 * 
 * Response format:
 *   { code: '0000', msg, sysTime, sign, bizContent (JSON string or object) }
 * 
 * Amount precision: 2 decimal places (e.g. "100.00")
 * INR Payin Method: UpiMixed
 * INR Payout Method: BANK_INR
 */

const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
require('dotenv').config();

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

const BASE_URL = process.env.F2PAY_BASE_URL;
const MERCHANT_ID = process.env.F2PAY_MERCHANT_ID;
const MERCHANT_PRIVATE_KEY = process.env.F2PAY_MERCHANT_PRIVATE_KEY;
const PLATFORM_PUBLIC_KEY = process.env.F2PAY_PLATFORM_PUBLIC_KEY;
const PAYIN_METHOD = process.env.F2PAY_PAYIN_METHOD || 'UpiMixed';
const PAYOUT_METHOD = process.env.F2PAY_PAYOUT_METHOD || 'BANK_INR';

const httpClient = axios.create({
    baseURL: BASE_URL,
    timeout: 60000,
    headers: { 'Content-Type': 'application/json' },
    family: 4,
    httpAgent,
    httpsAgent
});

/**
 * Format private key to PEM format (PKCS#8)
 */
function formatPrivateKey(key) {
    if (key.includes('-----BEGIN')) return key;
    const formatted = key.match(/.{1,64}/g).join('\n');
    return `-----BEGIN PRIVATE KEY-----\n${formatted}\n-----END PRIVATE KEY-----`;
}

/**
 * Format public key to PEM format
 */
function formatPublicKey(key) {
    if (key.includes('-----BEGIN')) return key;
    const formatted = key.match(/.{1,64}/g).join('\n');
    return `-----BEGIN PUBLIC KEY-----\n${formatted}\n-----END PUBLIC KEY-----`;
}

/**
 * Generate RSA SHA256 signature for F2Pay requests
 * Signs the bizContent JSON string with merchant private key
 * Returns base64-encoded signature
 */
function generateSign(bizContentStr) {
    try {
        const privateKeyPem = formatPrivateKey(MERCHANT_PRIVATE_KEY);
        const sign = crypto.createSign('SHA256');
        sign.update(bizContentStr, 'utf8');
        sign.end();
        return sign.sign(privateKeyPem, 'base64');
    } catch (error) {
        console.error('[F2Pay] Sign generation error:', error.message);
        return null;
    }
}

/**
 * Verify RSA SHA256 signature from F2Pay responses/callbacks
 * Verifies bizContent string against platform public key
 */
function verifySign(params) {
    try {
        const bizContentStr = typeof params.bizContent === 'string' 
            ? params.bizContent 
            : JSON.stringify(params.bizContent);
        const receivedSign = params.sign;
        
        if (!receivedSign || !bizContentStr) return false;
        
        const publicKeyPem = formatPublicKey(PLATFORM_PUBLIC_KEY);
        const verify = crypto.createVerify('SHA256');
        verify.update(bizContentStr, 'utf8');
        verify.end();
        return verify.verify(publicKeyPem, receivedSign, 'base64');
    } catch (error) {
        console.error('[F2Pay] Signature verification error:', error.message);
        return false;
    }
}

/**
 * Build standard F2Pay request payload
 */
function buildRequest(bizContent, traceId) {
    const bizContentStr = JSON.stringify(bizContent);
    const sign = generateSign(bizContentStr);
    
    return {
        traceId: traceId || `GP${Date.now()}`,
        merchantId: MERCHANT_ID,
        bizContent: bizContentStr,
        signType: 'RSA',
        sign: sign
    };
}

/**
 * Parse F2Pay response — bizContent may be a JSON string or object
 */
function parseResponse(response) {
    const data = response.data;
    let bizContent = data.bizContent;
    
    if (typeof bizContent === 'string') {
        try {
            bizContent = JSON.parse(bizContent);
        } catch (e) {
            // Keep as string if not valid JSON
        }
    }
    
    return {
        code: data.code,
        msg: data.msg,
        sysTime: data.sysTime,
        sign: data.sign,
        bizContent: bizContent,
        success: data.code === '0000'
    };
}

/**
 * Create payin order (collection)
 * POST /payin/inr/order/create
 */
async function createPayin({ orderId, amount, notifyUrl, returnUrl, customerIp, customerName, customerEmail, customerPhone }) {
    try {
        const bizContent = {
            amount: parseFloat(amount).toFixed(2),
            customerEmail: customerEmail || 'customer@pay.com',
            customerIpAddress: customerIp || '127.0.0.1',
            customerName: customerName || 'Customer',
            customerPhone: customerPhone || '9999999999',
            mchOrderNo: orderId,
            methodCode: PAYIN_METHOD,
            notifyUrl: notifyUrl,
            returnUrl: returnUrl || notifyUrl
        };

        const payload = buildRequest(bizContent, orderId);

        console.log('[F2Pay] Creating payin:', { orderId, amount });
        const response = await httpClient.post('/payin/inr/order/create', payload);
        const parsed = parseResponse(response);

        if (parsed.success && parsed.bizContent) {
            return {
                success: true,
                payUrl: parsed.bizContent.payUrl || '',
                providerOrderId: parsed.bizContent.platNo || orderId,
                rawResponse: parsed.bizContent
            };
        } else {
            console.error('[F2Pay] Payin error:', parsed);
            return {
                success: false,
                error: parsed.msg || `Error code: ${parsed.code}`,
                rawResponse: parsed
            };
        }
    } catch (error) {
        console.error('[F2Pay] Payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payin order status
 * POST /payin/query
 */
async function queryPayin(orderId) {
    try {
        const bizContent = { mchOrderNo: orderId };
        const payload = buildRequest(bizContent, `QPI_${orderId}`);

        const response = await httpClient.post('/payin/query', payload);
        const parsed = parseResponse(response);

        if (parsed.success && parsed.bizContent) {
            const data = parsed.bizContent;
            return {
                success: true,
                orderId: data.mchOrderNo,
                providerOrderId: data.platNo,
                status: mapPayinStatus(data.state),
                utr: data.trxId || '',
                amount: data.amount,
                actualAmount: data.actualAmount,
                feeAmount: data.feeAmount
            };
        } else {
            return { success: false, error: parsed.msg || 'Query failed' };
        }
    } catch (error) {
        console.error('[F2Pay] Query payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Create payout order (bank transfer)
 * POST /payout/inr/order/create
 * 
 * bizContent fields:
 *   amount, mchOrderNo, methodCode, notifyUrl,
 *   payeeAccountNo, payeeEmail, payeeMobile, payeeName, payeeIfsc
 */
async function createPayout({ orderId, amount, accountNo, ifsc, name, mobile, email, notifyUrl }) {
    try {
        const bizContent = {
            amount: parseFloat(amount).toFixed(2),
            mchOrderNo: orderId,
            methodCode: PAYOUT_METHOD,
            notifyUrl: notifyUrl,
            payeeAccountNo: accountNo || '',
            payeeEmail: email || 'payout@pay.com',
            payeeMobile: mobile || '9999999999',
            payeeName: name || 'User',
            payeeIfsc: ifsc || ''
        };

        const payload = buildRequest(bizContent, orderId);

        console.log('[F2Pay] Creating payout:', { orderId, amount });
        const response = await httpClient.post('/payout/inr/order/create', payload);
        const parsed = parseResponse(response);

        if (parsed.success && parsed.bizContent) {
            const data = parsed.bizContent;
            return {
                success: true,
                providerOrderId: data.platNo || orderId,
                status: mapPayoutStatus(data.state || 'Pending'),
                raw: parsed.bizContent
            };
        } else {
            console.error('[F2Pay] Payout error:', parsed);
            return {
                success: false,
                error: parsed.msg || `Error code: ${parsed.code}`,
                raw: parsed
            };
        }
    } catch (error) {
        console.error('[F2Pay] Payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payout order status
 * POST /payout/query
 */
async function queryPayout(orderId) {
    try {
        const bizContent = { mchOrderNo: orderId };
        const payload = buildRequest(bizContent, `QPO_${orderId}`);

        const response = await httpClient.post('/payout/query', payload);
        const parsed = parseResponse(response);

        if (parsed.success && parsed.bizContent) {
            const data = parsed.bizContent;
            return {
                success: true,
                orderId: data.mchOrderNo,
                providerOrderId: data.platNo,
                status: mapPayoutStatus(data.state),
                utr: data.trxId || '',
                amount: data.amount,
                feeAmount: data.feeAmount
            };
        } else {
            return { success: false, error: parsed.msg || 'Query failed' };
        }
    } catch (error) {
        console.error('[F2Pay] Query payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get balance
 * POST /balance
 */
async function getBalance() {
    try {
        const bizContent = { currency: 'INR' };
        const payload = buildRequest(bizContent, `BAL_${Date.now()}`);

        const response = await httpClient.post('/balance', payload);
        const parsed = parseResponse(response);

        if (parsed.success && parsed.bizContent) {
            const data = parsed.bizContent;
            return {
                success: true,
                balance: parseFloat(data.availiable || data.available || 0),
                total: parseFloat(data.total || 0),
                payoutPending: parseFloat(data.payoutPending || 0),
                payinToBeSettled: parseFloat(data.payinToBeSettled || 0)
            };
        } else {
            return { success: false, error: parsed.msg || 'Balance query failed' };
        }
    } catch (error) {
        console.error('[F2Pay] Balance exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Submit UTR (Order Resubmit)
 * POST /payin/inr/order/resubmit
 */
async function submitUtr(orderId, utr) {
    try {
        const bizContent = {
            mchOrderNo: orderId,
            trxId: utr
        };
        const payload = buildRequest(bizContent, `UTR_${orderId}`);

        const response = await httpClient.post('/payin/inr/order/resubmit', payload);
        const parsed = parseResponse(response);

        if (parsed.success) {
            return { success: true, status: 'submitted' };
        } else {
            return { success: false, error: parsed.msg || 'UTR submission failed' };
        }
    } catch (error) {
        console.error('[F2Pay] UTR submit exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Parse payin callback
 * F2Pay sends: { code, msg, sysTime, sign, bizContent (JSON string) }
 * bizContent contains: state, mchOrderNo, platNo, amount, actualAmount, trxId, etc.
 */
function parsePayinCallback(body, query) {
    try {
        let bizContent = body.bizContent;
        if (typeof bizContent === 'string') {
            bizContent = JSON.parse(bizContent);
        }

        return {
            orderId: bizContent.mchOrderNo,
            providerOrderId: bizContent.platNo,
            status: mapPayinStatus(bizContent.state),
            utr: bizContent.trxId || '',
            amount: parseFloat(bizContent.amount || 0),
            actualAmount: parseFloat(bizContent.actualAmount || bizContent.amount || 0),
            feeAmount: parseFloat(bizContent.feeAmount || 0),
            raw: bizContent
        };
    } catch (error) {
        console.error('[F2Pay] Parse payin callback error:', error.message);
        return null;
    }
}

/**
 * Parse payout callback
 */
function parsePayoutCallback(body, query) {
    try {
        let bizContent = body.bizContent;
        if (typeof bizContent === 'string') {
            bizContent = JSON.parse(bizContent);
        }

        return {
            orderId: bizContent.mchOrderNo,
            providerOrderId: bizContent.platNo,
            status: mapPayoutStatus(bizContent.state),
            utr: bizContent.trxId || '',
            amount: parseFloat(bizContent.amount || 0),
            raw: bizContent
        };
    } catch (error) {
        console.error('[F2Pay] Parse payout callback error:', error.message);
        return null;
    }
}

/**
 * Map F2Pay payin status to standard statuses
 * Paid = success
 * UnequalPaid = success (different amount)
 * Pending / Created = pending
 * Failed / Expired / Cancelled = failed
 */
function mapPayinStatus(state) {
    if (!state) return 'pending';
    const s = state.toLowerCase();
    if (s === 'paid' || s === 'unequalpaid') return 'success';
    if (s === 'pending' || s === 'created') return 'pending';
    return 'failed';
}

/**
 * Map F2Pay payout status to standard statuses
 * Success / Completed = success
 * Pending / Processing = processing
 * Failed / Rejected = failed
 */
function mapPayoutStatus(state) {
    if (!state) return 'processing';
    const s = state.toLowerCase();
    if (s === 'success' || s === 'completed') return 'success';
    if (s === 'pending' || s === 'processing' || s === 'created') return 'processing';
    return 'failed';
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
    parsePayinCallback,
    parsePayoutCallback,
    mapPayinStatus,
    mapPayoutStatus,
    usesCustomPayPage: false,
    providerName: 'f2pay'
};
