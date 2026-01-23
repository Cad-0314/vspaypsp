const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = 'https://kspay.shop/pay';
const MERCHANT_ID = '202688888';
const SECRET_KEY = 'd09de50671a545578cb09f3a28ebd925';

function generateSignature(params) {
    const keys = Object.keys(params).filter(key => key !== 'sign' && params[key] !== null && params[key] !== '' && params[key] !== undefined);
    keys.sort();
    const queryString = keys.map(key => `${key}=${params[key]}`).join('&');
    const signString = `${queryString}&key=${SECRET_KEY}`;
    return crypto.createHash('md5').update(signString).digest('hex').toLowerCase();
}

async function checkPayoutStatus() {
    const params = {
        outTradeNo: 'PAYOUT_1769185552961_N47H94',
        merchantNumber: MERCHANT_ID
    };
    params.sign = generateSignature(params);

    console.log('Checking payout status for Order ID:', params.outTradeNo);
    console.log('Request params:', params);

    try {
        const response = await axios.post(`${BASE_URL}/queryPayout`, params);
        console.log('\n=== PAYOUT STATUS RESPONSE ===');
        console.log(JSON.stringify(response.data, null, 2));

        if (response.data.code == 200 && response.data.data) {
            const data = response.data.data;
            console.log('\n=== PARSED STATUS ===');
            console.log('Platform Order No:', data.orderNo);
            console.log('Merchant Order No:', data.outTradeNo);
            console.log('Amount:', data.amount);
            console.log('Status:', data.status === 1 ? 'SUCCESS' : data.status === 0 ? 'PROCESSING' : 'FAILED');
            console.log('UTR:', data.utr || 'N/A');
        }
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

checkPayoutStatus();
