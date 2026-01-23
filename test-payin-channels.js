const hdpayService = require('./src/services/hdpay');
const f2payService = require('./src/services/f2pay');
const caipayService = require('./src/services/caipay');
const fendpayService = require('./src/services/fendpay');
const silkpayService = require('./src/services/silkpay');
const ckpayService = require('./src/services/ckpay');
const cxpayService = require('./src/services/cxpay');
const { v4: uuidv4 } = require('uuid');

async function testChannels() {
    console.log('--- Starting Channel Analysis ---\n');

    const dummyOrder = {
        orderId: `TEST_${Date.now()}`,
        amount: 314.00,
        customerName: 'Test User',
        customerEmail: 'test@example.com',
        customerPhone: '9999999999',
        notifyUrl: 'https://payable.firestars.co/api/callback/test',
        returnUrl: 'https://payable.firestars.co/pay/success'
    };

    const results = [];

    // 1. HDPay
    try {
        console.log('Testing HDPay...');
        const res = await hdpayService.createPayin(dummyOrder);
        console.log('HDPay Result:', JSON.stringify(res, null, 2));
        results.push({ channel: 'HDPay', success: res.success, data: res, error: res.error });
    } catch (e) {
        console.error('HDPay Error:', e.message);
        results.push({ channel: 'HDPay', success: false, error: e.message });
    }

    // 2. F2Pay (X2)
    try {
        console.log('\nTesting F2Pay (X2)...');
        // F2Pay requires notifyUrl. Ensure it's passed.
        const res = await f2payService.createPayin(dummyOrder);
        console.log('F2Pay Result:', JSON.stringify(res, null, 2));
        results.push({ channel: 'X2', success: res.success, data: res, error: res.error });
    } catch (e) {
        console.error('F2Pay Error:', e.message);
        results.push({ channel: 'X2', success: false, error: e.message });
    }

    // 3. CaiPay (Yellow) - H2H
    try {
        console.log('\nTesting CaiPay (Yellow)...');
        const res = await caipayService.createPayin(dummyOrder);
        console.log('CaiPay Result:', JSON.stringify(res, null, 2));
        results.push({ channel: 'Yellow', success: res.success, data: res, error: res.error });
    } catch (e) {
        console.error('CaiPay Error:', e.message);
        results.push({ channel: 'Yellow', success: false, error: e.message });
    }

    // 4. FendPay (UPI Super)
    try {
        console.log('\nTesting FendPay (UPI Super)...');
        const res = await fendpayService.createPayin(dummyOrder);
        console.log('FendPay Result:', JSON.stringify(res, null, 2));
        results.push({ channel: 'UPI Super', success: res.success, data: res, error: res.error });
    } catch (e) {
        console.error('FendPay Error:', e.message);
        results.push({ channel: 'UPI Super', success: false, error: e.message });
    }

    // 5. Silkpay (Payable)
    try {
        console.log('\nTesting Silkpay (Payable)...');
        const res = await silkpayService.createPayin(dummyOrder);
        console.log('Silkpay Result:', JSON.stringify(res, null, 2));
        results.push({ channel: 'Payable', success: res.success, data: res, error: res.error });
    } catch (e) {
        console.error('Silkpay Error:', e.message);
        results.push({ channel: 'Payable', success: false, error: e.message });
    }

    // 6. CKPay
    try {
        console.log('\nTesting CKPay...');
        const res = await ckpayService.createPayin(dummyOrder);
        console.log('CKPay Result:', JSON.stringify(res, null, 2));
        results.push({ channel: 'CKPay', success: res.success, data: res, error: res.error });
    } catch (e) {
        console.error('CKPay Error:', e.message);
        results.push({ channel: 'CKPay', success: false, error: e.message });
    }

    // 7. CXPay
    try {
        console.log('\nTesting CXPay...');
        const res = await cxpayService.createPayin(dummyOrder);
        console.log('CXPay Result:', JSON.stringify(res, null, 2));
        results.push({ channel: 'CX Pay', success: res.success, data: res, error: res.error });
    } catch (e) {
        console.error('CXPay Error:', e.message);
        results.push({ channel: 'CX Pay', success: false, error: e.message });
    }

    console.log('\n--- Analysis Complete ---');
    return results;
}

if (require.main === module) {
    testChannels();
}

module.exports = testChannels;

