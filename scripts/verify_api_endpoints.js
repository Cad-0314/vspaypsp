
const axios = require('axios');
const { User, sequelize } = require('../src/models');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Initial setup
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

async function getMerchant() {
    try {
        await sequelize.authenticate();
        // Find a merchant with an API key
        const merchant = await User.findOne({
            where: { role: 'merchant' }
        });

        if (!merchant || !merchant.apiKey || !merchant.apiSecret) {
            console.error('No merchant with valid credentials found.');
            process.exit(1);
        }

        // Whitelist local IP
        let ips = [];
        try {
            ips = JSON.parse(merchant.whitelistedIps || '[]');
        } catch (e) { ips = []; }

        const localIps = ['127.0.0.1', '::1'];
        let updated = false;

        localIps.forEach(ip => {
            if (!ips.includes(ip)) {
                ips.push(ip);
                updated = true;
            }
        });

        if (updated) {
            console.log('Whitelisting local IPs for verification...');
            merchant.whitelistedIps = JSON.stringify(ips);
            await merchant.save();
        }

        return merchant;
    } catch (error) {
        console.error('Database error:', error);
        process.exit(1);
    }
}

function generateSignature(params, secretKey) {
    const filtered = {};
    Object.keys(params).forEach(key => {
        if (key !== 'sign' && params[key] !== '' && params[key] != null) {
            filtered[key] = params[key];
        }
    });
    const sorted = Object.keys(filtered).sort();
    const query = sorted.map(k => `${k}=${filtered[k]}`).join('&');
    const str = `${query}&secret=${secretKey}`;
    return crypto.createHash('md5').update(str).digest('hex').toUpperCase();
}

async function verifyEndpoints() {
    console.log('--- Starting API Verification ---');
    console.log(`Target URL: ${APP_URL}`);

    const merchant = await getMerchant();
    console.log(`Using Merchant: ${merchant.username} (${merchant.id})`);
    console.log(`API Key: ${merchant.apiKey}`);

    const headers = {
        'Content-Type': 'application/json',
        'x-merchant-id': merchant.apiKey
    };

    // 1. Verify Payin Create
    console.log('\n--- 1. Testing Payin Create ---');
    const payinOrderId = `TEST_PAYIN_${Date.now()}`;
    const payinPayload = {
        orderId: payinOrderId,
        orderAmount: 200,
        customerName: 'Test User',
        customerEmail: 'test@example.com',
        customerPhone: '9876543210',
        callbackUrl: 'http://localhost:3000/callback/test',
        returnUrl: 'http://localhost:3000/return'
    };

    // Add signature
    headers['x-signature'] = generateSignature(payinPayload, merchant.apiSecret);

    try {
        const res = await axios.post(`${APP_URL}/api/payin/create`, payinPayload, { headers });
        console.log('Status:', res.status);
        if (res.data.status === 'success') {
            console.log('SUCCESS:', res.data.message);
            console.log('Payment URL:', res.data.result.paymentUrl);
        } else {
            console.log('FAILED:', res.data.message || res.data);
        }
    } catch (err) {
        console.error('ERROR:', err.message);
        if (err.response) console.error('Response:', err.response.data);
    }

    // 2. Verify Balance Query
    console.log('\n--- 2. Testing Balance Query ---');
    const balancePayload = {};
    headers['x-signature'] = generateSignature(balancePayload, merchant.apiSecret);

    try {
        const res = await axios.post(`${APP_URL}/api/balance/query`, balancePayload, { headers });
        console.log('Status:', res.status);
        if (res.data.status === 'success') {
            console.log('SUCCESS: Balance retrieved');
            console.log('Available Balance:', res.data.result.availableBalance);
        } else {
            console.log('FAILED:', res.data.message || res.data);
        }
    } catch (err) {
        console.error('ERROR:', err.message);
        if (err.code) console.error('Error Code:', err.code);
        if (err.response) {
            console.error('Response Status:', err.response.status);
            console.error('Response Data:', JSON.stringify(err.response.data, null, 2));
        }
    }

    // 3. Verify Payout Create (Bank)
    console.log('\n--- 3. Testing Payout Create (Bank) ---');
    const payoutOrderId = `TEST_PAYOUT_${Date.now()}`;
    const payoutPayload = {
        orderId: payoutOrderId,
        amount: 200,
        account: '1234567890',
        ifsc: 'SBIN0001234',
        personName: 'Test Receiver',
        callbackUrl: 'http://localhost:3000/callback/test'
    };
    headers['x-signature'] = generateSignature(payoutPayload, merchant.apiSecret);

    try {
        const res = await axios.post(`${APP_URL}/api/payout/bank`, payoutPayload, { headers });
        console.log('Status:', res.status);
        // Note: Payout might fail if balance is insufficient or service suspended
        if (res.data.code === 1 || res.data.status === 'success') {
            console.log('SUCCESS: Payout initiated');
        } else {
            console.log('FAILED (Expected if low balance):', res.data.msg || res.data.message || res.data);
        }
    } catch (err) {
        console.error('ERROR:', err.message);
        if (err.response) console.error('Response:', err.response.data);
    }

    console.log('\n--- Verification Complete ---');
    process.exit(0);
}

verifyEndpoints();
