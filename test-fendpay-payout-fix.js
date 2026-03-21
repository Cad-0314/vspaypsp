require('dotenv').config();
const fendpayService = require('./src/services/fendpay');
const assert = require('assert');

// Mock httpClient
const mockHttpClient = {
    post: async (url, params) => {
        console.log(`[Mock HTTP] POST to ${url}`);
        console.log('[Mock HTTP] Params:', JSON.stringify(params, null, 2));
        return { data: { code: 200, msg: 'success', data: { orderNo: 'TEST_PROVIDER_ID', status: '0' } } };
    }
};

// Manually inject mock
// We need to access the private httpClient or redefine the service for testing
// Since fendpayService is already exported, we can't easily swap the internal httpClient 
// unless we modify fendpay.js to allow injection, or use a tool like proxyquire.
// For simplicity, I'll just temporarily modify fendpay.js to export httpClient or 
// just check if the code runs without errors and logs the correct params in my terminal.

async function runTests() {
    console.log('--- Testing FendPay Payout Fix ---');

    // Test Case 1: Admin Route Keys
    const adminData = {
        orderId: 'MPOUT_ADMIN_123',
        amount: 500,
        accountNumber: '123456789',
        ifsc: 'BKID0001234',
        accountHolderName: 'Admin Test User',
        channel: 'upi super'
    };

    console.log('\nTest Case 1: Admin Data');
    try {
        // We will just observe the console logs from fendpay.js
        await fendpayService.createPayout(adminData);
    } catch (err) {
        console.error('Test Case 1 failed:', err.message);
    }

    // Test Case 2: API v1 Keys
    const apiV1Data = {
        orderId: 'API_V1_123',
        amount: '1000.00',
        accountNo: '987654321',
        ifsc: 'HDFC0001111',
        name: 'V1 Test User'
    };

    console.log('\nTest Case 2: API V1 Data');
    try {
        await fendpayService.createPayout(apiV1Data);
    } catch (err) {
        console.error('Test Case 2 failed:', err.message);
    }

    // Test Case 3: API v2 Keys
    const apiV2Data = {
        orderId: 'API_V2_456',
        amount: 2000,
        account: '555666777',
        ifsc_code: 'ICIC0002222',
        personName: 'V2 Test User'
    };

    console.log('\nTest Case 3: API V2 Data');
    try {
        await fendpayService.createPayout(apiV2Data);
    } catch (err) {
        console.error('Test Case 3 failed:', err.message);
    }

    console.log('\n--- Tests Completed ---');
}

runTests();
