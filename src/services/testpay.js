/**
 * TestPay Service - Simulated Indian Payment Channel
 * Provider for testpay channel (internal name: testpay)
 * This is a TEST/SANDBOX channel that simulates payin & payout flows
 * without calling any real upstream API.
 *
 * Payin: Auto-succeeds after creation (simulates instant UPI payment)
 * Payout: Auto-succeeds after creation (simulates instant bank transfer)
 *
 * Uses MD5 signature for callback verification (same pattern as production channels)
 */

const crypto = require('crypto');
require('dotenv').config();

const MERCHANT_ID = process.env.TESTPAY_MERCHANT_ID || 'TEST_MERCHANT_001';
const SECRET_KEY = process.env.TESTPAY_SECRET_KEY || 'test_secret_key_2026';
const AUTO_SUCCESS_DELAY_MS = parseInt(process.env.TESTPAY_AUTO_SUCCESS_DELAY_MS) || 3000;

/**
 * Generate MD5 signature for TestPay requests
 * Follows same pattern as other channels for consistency
 */
function generateSign(params) {
    const sortedKeys = Object.keys(params)
        .filter(k => k !== 'sign' && params[k] !== null && params[k] !== undefined && params[k] !== '')
        .sort();
    const str = sortedKeys.map(k => `${k}=${params[k]}`).join('&') + `&key=${SECRET_KEY}`;
    return crypto.createHash('md5').update(str).digest('hex').toLowerCase();
}

/**
 * Verify callback signature
 */
function verifySign(params) {
    const receivedSign = params.sign;
    const calculated = generateSign(params);
    return calculated === receivedSign;
}

/**
 * Generate a simulated provider order ID
 */
function generateProviderOrderId() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `TP${timestamp}${random}`.toUpperCase();
}

/**
 * Generate a simulated UTR (Unique Transaction Reference)
 */
function generateUtr() {
    const prefix = Math.random() > 0.5 ? 'UTIB' : 'SBIN';
    const num = Math.floor(100000000000 + Math.random() * 900000000000);
    return `${prefix}${num}`;
}

/**
 * Trigger auto-success callback after delay
 * Simulates upstream provider sending a callback
 */
async function triggerAutoCallback(orderId, amount, type, notifyUrl) {
    if (!notifyUrl) return;

    setTimeout(async () => {
        try {
            const axios = require('axios');
            const APP_URL = process.env.APP_URL || 'http://localhost:3000';

            const callbackPayload = {
                orderId: orderId,
                status: 'SUCCESS',
                amount: parseFloat(amount),
                realAmount: parseFloat(amount),
                utr: generateUtr(),
                platformOrderId: generateProviderOrderId(),
                mId: MERCHANT_ID,
                timestamp: Date.now()
            };
            callbackPayload.sign = generateSign(callbackPayload);

            const callbackUrl = `${APP_URL}/api/callback/testpay/${type}`;
            console.log(`[TestPay] Triggering auto-${type} callback for ${orderId} -> ${callbackUrl}`);

            await axios.post(callbackUrl, callbackPayload, {
                timeout: 10000,
                headers: { 'Content-Type': 'application/json' }
            });

            console.log(`[TestPay] Auto-${type} callback sent for ${orderId}`);
        } catch (err) {
            console.error(`[TestPay] Auto-${type} callback failed for ${orderId}:`, err.message);
        }
    }, AUTO_SUCCESS_DELAY_MS);
}

/**
 * Create payin order (simulated)
 * Returns a pay URL that points to our own test payment page
 */
async function createPayin({ orderId, amount, notifyUrl, returnUrl, customerName, customerEmail, customerPhone, customerIp }) {
    try {
        const providerOrderId = generateProviderOrderId();
        const APP_URL = process.env.APP_URL || 'http://localhost:3000';

        console.log('[TestPay] Creating simulated payin:', { orderId, amount });

        // Build a test payment page URL (uses our own paypage)
        const payUrl = `${APP_URL}/pay/test?orderId=${orderId}&amount=${amount}&channel=testpay`;

        // Schedule auto-success callback
        triggerAutoCallback(orderId, amount, 'payin', notifyUrl);

        return {
            success: true,
            payUrl: payUrl,
            providerOrderId: providerOrderId
        };
    } catch (error) {
        console.error('[TestPay] Payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payin order status (simulated)
 * Always returns success for test channel
 */
async function queryPayin(orderId) {
    try {
        console.log('[TestPay] Querying payin:', orderId);
        return {
            success: true,
            orderId: orderId,
            providerOrderId: generateProviderOrderId(),
            status: 'success',
            utr: generateUtr(),
            amount: 0,
            realAmount: 0
        };
    } catch (error) {
        console.error('[TestPay] Query payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Create payout order (simulated)
 * Auto-succeeds after configured delay
 */
async function createPayout({ orderId, amount, accountNo, ifsc, name, upi, notifyUrl, customerEmail, customerPhone, bankName }) {
    try {
        const providerOrderId = generateProviderOrderId();

        console.log('[TestPay] Creating simulated payout:', {
            orderId, amount,
            destination: upi || accountNo || 'N/A'
        });

        // Schedule auto-success callback
        triggerAutoCallback(orderId, amount, 'payout', notifyUrl);

        return {
            success: true,
            providerOrderId: providerOrderId,
            status: 'processing'
        };
    } catch (error) {
        console.error('[TestPay] Payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payout order status (simulated)
 * Always returns success for test channel
 */
async function queryPayout(orderId) {
    try {
        console.log('[TestPay] Querying payout:', orderId);
        return {
            success: true,
            orderId: orderId,
            providerOrderId: generateProviderOrderId(),
            status: 'success',
            utr: generateUtr(),
            amount: 0
        };
    } catch (error) {
        console.error('[TestPay] Query payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get balance (simulated)
 * Returns a test balance
 */
async function getBalance() {
    return {
        success: true,
        balance: 1000000.00,
        currency: 'INR',
        note: 'Test channel - simulated balance'
    };
}

/**
 * Submit UTR (simulated)
 */
async function submitUtr(orderId, utr) {
    console.log(`[TestPay] UTR submitted for ${orderId}: ${utr}`);
    return { success: true, message: 'UTR accepted (test mode)' };
}

/**
 * Map payin status
 */
function mapPayinStatus(status) {
    const statusStr = String(status).toUpperCase();
    if (statusStr === 'SUCCESS') return 'success';
    if (statusStr === 'FAIL' || statusStr === 'FAILED') return 'failed';
    return 'pending';
}

/**
 * Map payout status
 */
function mapPayoutStatus(status) {
    const statusStr = String(status).toUpperCase();
    if (statusStr === 'SUCCESS') return 'success';
    if (statusStr === 'FAIL' || statusStr === 'FAILED') return 'failed';
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
    mapPayinStatus,
    mapPayoutStatus,
    usesCustomPayPage: false,
    providerName: 'testpay'
};
