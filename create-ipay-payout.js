
require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

// Merchant Credentials (Provided by User)
const MERCHANT_ID = 'starEUR7VL';
const SECRET_KEY = 'f121fcdc10e44f1a876ce9333906f18f8b9e87e8df06be42fa40bd90d28457e0';

// API Configuration
// Using process.env.APP_URL but falling back to localhost if not set/empty
const BASE_URL = process.env.APP_URL || 'http://localhost:3000';

// Helper to generate random number string
function getRandomNumber(length) {
    let result = '';
    const characters = '0123456789';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

// Helper to generate random string
function getRandomString(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

// Helper to generate random name
function getRandomName() {
    const firstNames = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan', 'Rohan', 'Rahul', 'Amit', 'Sumit', 'Vikram'];
    const lastNames = ['Kumar', 'Singh', 'Sharma', 'Verma', 'Gupta', 'Malhotra', 'Bhatia', 'Patel', 'Mehta', 'Shah', 'Rao', 'Reddy'];

    const first = firstNames[Math.floor(Math.random() * firstNames.length)];
    const last = lastNames[Math.floor(Math.random() * lastNames.length)];
    return `${first} ${last}`;
}

// Helper to generate random IFSC
function getRandomIFSC() {
    const banks = ['HDFC', 'SBIN', 'ICIC', 'UTIB', 'PUNB'];
    const branch = getRandomNumber(6);
    const bank = banks[Math.floor(Math.random() * banks.length)];
    return `${bank}0${branch}`; // 4 letters + 0 + 6 digits
}

// Generate Payout Data
const payoutData = {
    amount: 200,
    account: getRandomNumber(12), // Random 12 digit account
    ifsc: getRandomIFSC(),
    personName: getRandomName(),
    orderId: `PAYOUTIPAY${Date.now()}${getRandomString(4)}`
};

// Signature Generation
function generateSignature(params, secret) {
    // 1. Sort all body parameters alphabetically by key (ASCII)
    // 2. Remove empty values and the sign field
    const keys = Object.keys(params).filter(key => key !== 'sign' && params[key] !== '' && params[key] != null);
    keys.sort();

    // 3. Join with & in key=value format
    const queryString = keys.map(key => `${key}=${params[key]}`).join('&');

    // 4. Append &secret=YOUR_MERCHANT_SECRET_KEY
    const signString = `${queryString}&secret=${secret}`;

    // 5. Hash using MD5 and convert to uppercase
    return crypto.createHash('md5').update(signString).digest('hex').toUpperCase();
}


// Create Axios Client
const client = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    httpAgent: new http.Agent({ keepAlive: true }),
    httpsAgent: new https.Agent({ keepAlive: true, rejectUnauthorized: false }) // Allow self-signed certs locally if needed
});

async function createPayout() {
    console.log('='.repeat(50));
    console.log('Creating IPay Payout Request');
    console.log('='.repeat(50));
    console.log('Target URL:', `${BASE_URL}/api/payout/bank`);
    console.log('Using APP_URL:', process.env.APP_URL);
    console.log('Merchant ID:', MERCHANT_ID);
    console.log('Payout Details:', JSON.stringify(payoutData, null, 2));

    try {
        // Prepare Payload
        const payload = {
            orderId: payoutData.orderId,
            amount: payoutData.amount,
            account: payoutData.account,
            ifsc: payoutData.ifsc,
            personName: payoutData.personName,
            callbackUrl: 'https://example.com/callback' // Dummy callback
        };

        // Generate Signature
        const signature = generateSignature(payload, SECRET_KEY);
        console.log('Generated Signature:', signature);

        // Make Request
        const response = await client.post('/api/payout/bank', payload, {
            headers: {
                'Content-Type': 'application/json',
                'x-merchant-id': MERCHANT_ID,
                'x-signature': signature
            }
        });

        console.log('\n[Response]:');
        console.log(JSON.stringify(response.data, null, 2));

        if (response.data.code === 1 || response.data.status === 'success') {
            console.log('\n✅ Payout Created Successfully!');
        } else {
            console.log('\n❌ Payout Creation Failed:', response.data.msg);
        }

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

createPayout();
