/**
 * FendPay Payout Status Check Script
 */

require('dotenv').config();
const axios = require('axios');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

// Configuration
const BASE_URL = process.env.FENDPAY_BASE_URL;
const SECRET_KEY = process.env.FENDPAY_SECRET_KEY;

// Create axios instance with IPv4 enforcement
const httpClient = axios.create({
    timeout: 30000,
    family: 4,
    httpAgent: new http.Agent({ keepAlive: true }),
    httpsAgent: new https.Agent({ keepAlive: true })
});

// Generate MD5 Signature
function generateSignature(params) {
    const keys = Object.keys(params).filter(key => key !== 'sign' && params[key] !== null && params[key] !== '' && params[key] !== undefined);
    keys.sort();
    const queryString = keys.map(key => `${key}=${params[key]}`).join('&');
    const signString = `${queryString}&key=${SECRET_KEY}`;
    return crypto.createHash('md5').update(signString).digest('hex').toLowerCase();
}

async function checkStatus(merchantId, orderId) {
    console.log('='.repeat(60));
    console.log(`Checking Status For Order: ${orderId}`);
    console.log(`Merchant ID: ${merchantId}`);
    console.log('='.repeat(60));

    const params = {
        merchantNumber: merchantId,
        outTradeNo: orderId
    };

    params.sign = generateSignature(params);

    try {
        const response = await httpClient.post(`${BASE_URL}/queryPayout`, params);

        console.log('\n[Response]:');
        console.log(JSON.stringify(response.data, null, 2));

        if (response.data.code == 200) {
            const data = response.data.data;
            let statusText = 'Unknown';
            if (data.status == 0) statusText = 'Processing (0)';
            else if (data.status == 1) statusText = 'Success (1)';
            else statusText = `Failed (${data.status})`;

            console.log('\n✅ QUERY SUCCESSFUL');
            console.log(`Status: ${statusText}`);
            console.log(`UTR: ${data.utr || 'N/A'}`);
            console.log(`Platform Order No: ${data.orderNo}`);
        } else {
            console.log('\n❌ QUERY FAILED');
            console.log(`Error: ${response.data.msg}`);
        }
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
    }
}

// Get arguments from command line
const orderId = process.argv[2];
const merchantId = process.argv[3] || process.env.FENDPAY_MERCHANT_ID;

if (!orderId) {
    console.log('Usage: node check-fendpay-status.js <orderId> [merchantId]');
    process.exit(1);
}

checkStatus(merchantId, orderId);
