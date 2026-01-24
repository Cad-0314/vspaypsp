/**
 * FendPay Payout Application Script
 * Amount: 6000 INR
 * Beneficiary: Rohit
 * Account: 924010074497342
 * IFSC: UTIB0002455
 */

require('dotenv').config();
const axios = require('axios');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

// FendPay Configuration
const BASE_URL = process.env.FENDPAY_BASE_URL;
const MERCHANT_ID = process.env.FENDPAY_MERCHANT_ID;
const SECRET_KEY = process.env.FENDPAY_SECRET_KEY;

// Payout Details
const PAYOUT_DETAILS = {
    amount: '6000.00',
    accountName: 'Rohit',
    accountNumber: '924010074497342',
    ifscCode: 'UTIB0002455',
    mobileNo: '9887415157'
};

// Create axios instance with IPv4 enforcement
const httpClient = axios.create({
    timeout: 30000,
    family: 4,
    httpAgent: new http.Agent({ keepAlive: true }),
    httpsAgent: new https.Agent({ keepAlive: true })
});

// Generate unique order ID
function generateOrderId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `PAYOUT_${timestamp}_${random}`;
}

// Generate MD5 Signature
function generateSignature(params) {
    const keys = Object.keys(params).filter(key => key !== 'sign' && params[key] !== null && params[key] !== '' && params[key] !== undefined);
    keys.sort();
    const queryString = keys.map(key => `${key}=${params[key]}`).join('&');
    const signString = `${queryString}&key=${SECRET_KEY}`;
    return crypto.createHash('md5').update(signString).digest('hex').toLowerCase();
}

// Apply Payout
async function applyPayout() {
    const orderId = generateOrderId();

    console.log('='.repeat(60));
    console.log('FendPay Payout Application');
    console.log('='.repeat(60));
    console.log(`Order ID: ${orderId}`);
    console.log(`Amount: ₹${PAYOUT_DETAILS.amount}`);
    console.log(`Account Name: ${PAYOUT_DETAILS.accountName}`);
    console.log(`Account Number: ${PAYOUT_DETAILS.accountNumber}`);
    console.log(`IFSC Code: ${PAYOUT_DETAILS.ifscCode}`);
    console.log('='.repeat(60));

    const params = {
        merchantNumber: MERCHANT_ID,
        outTradeNo: orderId,
        amount: PAYOUT_DETAILS.amount,
        notifyUrl: `${process.env.APP_URL}/callback/fendpay/payout`,
        accName: PAYOUT_DETAILS.accountName,
        accNo: PAYOUT_DETAILS.accountNumber,
        ifsc: PAYOUT_DETAILS.ifscCode,
        mobileNo: PAYOUT_DETAILS.mobileNo
    };

    params.sign = generateSignature(params);

    console.log('\n[Request Params]:');
    console.log(JSON.stringify(params, null, 2));

    try {
        console.log('\n[Sending Request...]');
        const response = await httpClient.post(`${BASE_URL}/payout`, params);

        console.log('\n[Response]:');
        console.log(JSON.stringify(response.data, null, 2));

        if (response.data.code == 200) {
            console.log('\n✅ PAYOUT SUBMITTED SUCCESSFULLY');
            console.log(`Platform Order No: ${response.data.data.orderNo}`);
            console.log(`Status: ${response.data.data.status === '0' ? 'Processing' : 'Check Status'}`);
        } else {
            console.log('\n❌ PAYOUT FAILED');
            console.log(`Error: ${response.data.msg}`);
        }
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

// Run
applyPayout();
