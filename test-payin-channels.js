const hdpayService = require('./src/services/hdpay');
const f2payService = require('./src/services/f2pay');
const caipayService = require('./src/services/caipay');
const fendpayService = require('./src/services/fendpay');
const silkpayService = require('./src/services/silkpay');
const ckpayService = require('./src/services/ckpay');
const cxpayService = require('./src/services/cxpay');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = 'https://payable.firestars.co';

async function testChannels() {
    console.log('--- Starting Channel Analysis ---\n');

    const baseOrder = {
        orderId: `TEST_${Date.now()}`,
        amount: 314.00,
        customerName: 'Test User',
        customerEmail: 'test@example.com',
        customerPhone: '9999999999',
        returnUrl: `${BASE_URL}/pay/success`
    };

    const results = [];

    // 1. HDPay
    try {
        console.log('Testing HDPay...');
        const order = { ...baseOrder, notifyUrl: `${BASE_URL}/callback/hdpay/payin` };
        const res = await hdpayService.createPayin(order);
        console.log('HDPay Result:', JSON.stringify(res, null, 2));
        results.push({ channel: 'HDPay', success: res.success, data: res, error: res.error });
    } catch (e) {
        console.error('HDPay Error:', e.message);
        results.push({ channel: 'HDPay', success: false, error: e.message });
    }

    // 2. F2Pay (X2)
    try {
        console.log('\nTesting F2Pay (X2)...');
        const order = { ...baseOrder, notifyUrl: `${BASE_URL}/callback/x2/payin` };
        const res = await f2payService.createPayin(order);
        console.log('F2Pay Result:', JSON.stringify(res, null, 2));
        results.push({ channel: 'X2', success: res.success, data: res, error: res.error });
    } catch (e) {
        console.error('F2Pay Error:', e.message);
        results.push({ channel: 'X2', success: false, error: e.message });
    }

    // 3. CaiPay (Yellow) - H2H
    try {
        console.log('\nTesting CaiPay (Yellow)...');
        const order = { ...baseOrder, notifyUrl: `${BASE_URL}/callback/yellow/payin` };
        const res = await caipayService.createPayin(order);
        console.log('CaiPay Result:', JSON.stringify(res, null, 2));
        results.push({ channel: 'Yellow', success: res.success, data: res, error: res.error });
    } catch (e) {
        console.error('CaiPay Error:', e.message);
        results.push({ channel: 'Yellow', success: false, error: e.message });
    }

    // 4. FendPay (UPI Super)
    try {
        console.log('\nTesting FendPay (UPI Super)...');
        const order = { ...baseOrder, notifyUrl: `${BASE_URL}/callback/fendpay/payin` };
        const res = await fendpayService.createPayin(order);
        console.log('FendPay Result:', JSON.stringify(res, null, 2));
        results.push({ channel: 'UPI Super', success: res.success, data: res, error: res.error });
    } catch (e) {
        console.error('FendPay Error:', e.message);
        results.push({ channel: 'UPI Super', success: false, error: e.message });
    }

    // 5. Silkpay (Payable)
    try {
        console.log('\nTesting Silkpay (Payable)...');
        const order = { ...baseOrder, notifyUrl: `${BASE_URL}/callback/payable/payin` };
        const res = await silkpayService.createPayin(order);
        console.log('Silkpay Result:', JSON.stringify(res, null, 2));
        results.push({ channel: 'Payable', success: res.success, data: res, error: res.error });
    } catch (e) {
        console.error('Silkpay Error:', e.message);
        results.push({ channel: 'Payable', success: false, error: e.message });
    }

    // 6. CKPay
    try {
        console.log('\nTesting CKPay...');
        const order = { ...baseOrder, notifyUrl: `${BASE_URL}/callback/ckpay/payin` };
        const res = await ckpayService.createPayin(order);
        console.log('CKPay Result:', JSON.stringify(res, null, 2));
        results.push({ channel: 'CKPay', success: res.success, data: res, error: res.error });
    } catch (e) {
        console.error('CKPay Error:', e.message);
        results.push({ channel: 'CKPay', success: false, error: e.message });
    }

    // 7. CXPay
    try {
        console.log('\nTesting CXPay...');
        const order = { ...baseOrder, notifyUrl: `${BASE_URL}/callback/cxpay/payin` };
        const res = await cxpayService.createPayin(order);
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


