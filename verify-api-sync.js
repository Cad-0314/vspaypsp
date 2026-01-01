const { validateMerchant } = require('./src/middleware/apiAuth');
const { User } = require('./src/models');
const crypto = require('crypto');
require('dotenv').config();

// Mock User.findOne
User.findOne = async () => ({
    id: 1,
    apiKey: 'test-key',
    apiSecret: 'test-secret',
    role: 'merchant',
    isActive: true
});

function createMockResponse() {
    return {
        statusCode: 200,
        data: null,
        status: function (code) {
            this.statusCode = code;
            return this;
        },
        json: function (data) {
            this.data = data;
            return this;
        },
        send: function (data) {
            this.data = data;
            return this;
        }
    };
}

async function runTests() {
    console.log('--- Verification: API Sync & Auth (No Deps) ---');

    // 1. Test Valid Signature
    console.log('\n[1] Testing Valid Signature...');
    const bodyFunc1 = { param1: 'value1', param2: 'value2' };
    const str1 = `param1=value1&param2=value2&secret=test-secret`;
    const sign1 = crypto.createHash('md5').update(str1).digest('hex').toUpperCase();

    const req1 = {
        headers: {
            'x-merchant-id': 'test-key',
            'x-signature': sign1
        },
        body: bodyFunc1
    };
    const res1 = createMockResponse();
    let nextCalled = false;
    const next1 = () => { nextCalled = true; };

    await validateMerchant(req1, res1, next1);

    if (nextCalled) {
        console.log('   Success: valid signature passed.');
    } else {
        console.log(`   Failed: Valid signature rejected. Status: ${res1.statusCode}`);
    }

    // 2. Test Invalid Signature (to trigger logging)
    console.log('\n[2] Testing Invalid Signature (Expect Logs)...');
    const req2 = {
        headers: {
            'x-merchant-id': 'test-key',
            'x-signature': 'INVALID_SIGNATURE'
        },
        body: bodyFunc1
    };
    const res2 = createMockResponse();

    await validateMerchant(req2, res2, () => { });

    if (res2.statusCode === 401) {
        console.log('   Success: Returned 401 as expected.');
    } else {
        console.log(`   Failed: Status ${res2.statusCode}`);
    }

    console.log('--- Verification Complete ---');
}

runTests();
