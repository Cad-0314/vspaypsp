/**
 * CaiPay API Service (Yellow channel)
 * Placeholder implementation
 */

const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const BASE_URL = process.env.CAIPAY_BASE_URL || '';
const MERCHANT_ID = process.env.CAIPAY_MERCHANT_ID || '';
const SECRET_KEY = process.env.CAIPAY_SECRET_KEY || '';

async function createPayin({ orderId, amount, notifyUrl }) {
    console.log('[CaiPay] Generating payin placeholder for:', orderId);
    // Returning success with no payUrl to trigger custom page or just fail if not ready
    return {
        success: false,
        error: 'CaiPay integration pending. Please configure API details in .env'
    };
}

async function queryPayin(orderId) {
    return { success: false, error: 'Not implemented' };
}

async function createPayout(params) {
    return { success: false, error: 'Not implemented' };
}

async function queryPayout(orderId) {
    return { success: false, error: 'Not implemented' };
}

async function getBalance() {
    return { success: false, error: 'Not implemented' };
}

async function submitUtr(orderId, utr) {
    return { success: false, error: 'Not implemented' };
}

function verifySign(params) {
    return false;
}

module.exports = {
    createPayin,
    queryPayin,
    createPayout,
    queryPayout,
    getBalance,
    submitUtr,
    verifySign,
    usesCustomPayPage: true,
    providerName: 'caipay'
};
