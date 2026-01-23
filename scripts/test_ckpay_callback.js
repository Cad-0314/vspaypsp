const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

// Configuration
const BASE_URL = 'http://localhost:3000'; // Adjust port if needed
const MERCHANT_ID = process.env.CKPAY_MERCHANT_ID || '10034';
const APP_KEY = process.env.CKPAY_APP_KEY || 'cBVW11lOhAFEqxN5';

// Helper to generate signature
function generateSign(fields) {
    const str = fields.join('') + APP_KEY;
    console.log('Signing string:', str);
    return crypto.createHash('md5').update(str).digest('hex').toLowerCase();
}

async function testPayinCallback() {
    console.log('\n--- Testing CKPay Payin Callback ---');
    try {
        const orderId = 'TEST_CK_PAYIN_' + Date.now();
        const amount = 100;
        const status = 80; // Success
        const providerOrderId = 'CK_PROV_' + Date.now();

        // signature=md5(accountOrder+amount+appId+orderId+status+app_key)
        const signFields = [
            orderId,
            amount,
            MERCHANT_ID,
            providerOrderId,
            status
        ];

        const signature = generateSign(signFields);

        const payload = {
            orderId: providerOrderId,
            accountOrder: orderId,
            amount: amount,
            appId: MERCHANT_ID,
            applyDate: new Date().toISOString().replace('T', ' ').split('.')[0],
            status: status,
            remark: 'Test callback',
            payUrl: 'http://example.com/pay',
            signature: signature
        };

        console.log('Payload:', JSON.stringify(payload, null, 2));

        const response = await axios.post(`${BASE_URL}/callback/ckpay/payin`, payload);
        console.log('Response status:', response.status);
        console.log('Response data:', response.data);

        if (response.data === 'OK') {
            console.log('✅ Payin Callback Test PASSED: Received OK');
        } else {
            console.error('❌ Payin Callback Test FAILED: Expected OK, got', response.data);
        }

    } catch (error) {
        console.error('❌ Payin Callback Test Error:', error.message);
        if (error.code) console.error('Error Code:', error.code);
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Data:', error.response.data);
        } else if (error.request) {
            console.error('No response received (server down?)');
        }
    }
}

async function testPayoutCallback() {
    console.log('\n--- Testing CKPay Payout Callback ---');
    try {
        const orderId = 'TEST_CK_PAYOUT_' + Date.now();
        const amount = 100;
        const status = 70; // Success
        const providerOrderId = 'CK_PROV_OUT_' + Date.now();

        // signature=md5(accountOrder+amount+appId+orderId+status+app_key)
        const signFields = [
            orderId,
            amount,
            MERCHANT_ID,
            providerOrderId,
            status
        ];

        const signature = generateSign(signFields);

        const payload = {
            orderId: providerOrderId,
            accountOrder: orderId,
            amount: amount,
            appId: MERCHANT_ID,
            applyDate: new Date().toISOString().replace('T', ' ').split('.')[0],
            status: status,
            statusDesc: 'Transaction Successful',
            signature: signature,
            utr: 'UTR123456789'
        };

        console.log('Payload:', JSON.stringify(payload, null, 2));

        const response = await axios.post(`${BASE_URL}/callback/ckpay/payout`, payload);
        console.log('Response status:', response.status);
        console.log('Response data:', response.data);

        if (response.data === 'OK') {
            console.log('✅ Payout Callback Test PASSED: Received OK');
        } else {
            console.error('❌ Payout Callback Test FAILED: Expected OK, got', response.data);
        }

    } catch (error) {
        console.error('❌ Payout Callback Test Error:', error.message);
        if (error.code) console.error('Error Code:', error.code);
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Data:', error.response.data);
        } else if (error.request) {
            console.error('No response received (server down?)');
        }
    }
}

async function run() {
    await testPayinCallback();
    await testPayoutCallback();
}

run();
