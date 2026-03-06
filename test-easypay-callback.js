const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const SECRET_KEY = process.env.EASYPAY_SECRET_KEY;

function generateSign(params) {
    const sortedKeys = Object.keys(params)
        .filter(k => k !== 'sign' && params[k] !== null && params[k] !== undefined && params[k] !== '')
        .sort();
    const str = sortedKeys.map(k => `${k}=${params[k]}`).join('&') + `&key=${SECRET_KEY}`;
    return crypto.createHash('md5').update(str).digest('hex').toLowerCase();
}

async function testCallback() {
    const orderId = process.argv[2] || 'TEST_PO_EP_123';

    const payload = {
        apiKey: process.env.EASYPAY_MERCHANT_ID,
        platformorderId: 'P0' + Date.now(),
        orderId: orderId,
        status: 1, // 1 for success
        statusMessage: 'SUCCESS',
        amount: '500.00',
        fee: '25.00',
        utr: 'UTR' + Date.now(),
        beneficiaryName: 'Amit Test',
        beneficiaryAccount: '357910864201',
        createTime: '14:40:25',
        cashInTime: '14:40:25'
    };

    payload.sign = generateSign(payload);

    try {
        console.log('Sending callback payload:', payload);
        const res = await axios.post('http://localhost:3000/api/callback/easypay/payout', payload);
        console.log('Response Status:', res.status);
        console.log('Response Data:', res.data);
    } catch (err) {
        console.error('Error sending callback:', err.message);
        if (err.response) {
            console.error('Response details:', err.response.data);
        }
    }
}

testCallback();
