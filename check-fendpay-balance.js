/**
 * FendPay Balance Check Script
 */

require('dotenv').config();
const axios = require('axios');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

// Configuration
const BASE_URL = process.env.FENDPAY_BASE_URL;
const MERCHANT_ID = process.env.FENDPAY_MERCHANT_ID;
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

async function getBalance() {
    console.log('='.repeat(60));
    console.log(`Checking Balance For Merchant: ${MERCHANT_ID}`);
    console.log('='.repeat(60));

    const params = {
        merchantNumber: MERCHANT_ID
    };

    params.sign = generateSignature(params);

    try {
        const response = await httpClient.post(`${BASE_URL}/merchantQuery`, params);

        console.log('\n[Response]:');
        console.log(JSON.stringify(response.data, null, 2));

        if (response.data.code == 200) {
            const data = response.data.data;
            console.log('\n✅ BALANCE QUERY SUCCESSFUL');
            console.log(`Balance: ${data.balance}`);
            console.log(`Available Balance: ${data.availableBalance}`);
            console.log(`Processing Balance: ${data.forceBalance}`);
        } else {
            console.log('\n❌ QUERY FAILED');
            console.log(`Error: ${response.data.msg}`);
        }
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
    }
}

getBalance();
