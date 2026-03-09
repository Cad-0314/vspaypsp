const ynpayService = require('../src/services/ynpay');
require('dotenv').config();

async function checkBalance() {
    console.log('--- Checking YNPay Balance ---');
    try {
        const result = await ynpayService.getBalance();
        console.log('YNPay Balance Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }
}

checkBalance();
