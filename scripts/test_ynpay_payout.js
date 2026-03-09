const ynpayService = require('../src/services/ynpay');
const axios = require('axios');
require('dotenv').config();

async function testYnpayPayout() {
    console.log('--- Testing YNPay Payout ---');

    // Use params similar to what admin.js sends, but let's try different variations
    const testOrder = {
        orderId: 'TEST_PO_' + Date.now(),
        amount: 200,
        name: 'Rahul Kumar',
        accountNo: 'rahul@upi',
        ifsc: 'SBIN0000001',
        notifyUrl: 'https://gaurpay.site/callback/ynpay/payout'
    };

    console.log('Input Parameters:', testOrder);

    // We'll wrap the service call to intercept the request if possible, 
    // but better to just see the result first.
    try {
        const result = await ynpayService.createPayout(testOrder);
        console.log('YNPay Payout Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Test Execution Error:', error.message);
    }
}

testYnpayPayout();
