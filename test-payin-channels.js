const silkpayService = require('./src/services/silkpay');
const { v4: uuidv4 } = require('uuid');

async function testChannels() {
    console.log('--- Starting Channel Analysis ---\n');

    const dummyOrder = {
        orderId: `TEST_${Date.now()}`,
        amount: 314.00,
        customerName: 'Test User',
        customerEmail: 'test@example.com',
        customerPhone: '9999999999',
        notifyUrl: 'https://vspay.vip/api/callback/test',
        returnUrl: 'https://vspay.vip/pay/success'
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
        results.push({ channel: 'F2Pay', success: res.success, data: res, error: res.error });
    } catch (e) {
        console.error('F2Pay Error:', e.message);
        results.push({ channel: 'F2Pay', success: false, error: e.message });
    }

    // 3. CaiPay (Yellow) - H2H
    try {
        console.log('\nTesting CaiPay (Yellow)...');
        const res = await caipayService.createPayin(dummyOrder);
        console.log('CaiPay Result:', JSON.stringify(res, null, 2));
        results.push({ channel: 'CaiPay', success: res.success, data: res, error: res.error });
    } catch (e) {
        console.error('CaiPay Error:', e.message);
        results.push({ channel: 'CaiPay', success: false, error: e.message });
    }

    // 4. FendPay (UPI Super)
    try {
        console.log('\nTesting FendPay (UPI Super)...');
        const res = await fendpayService.createPayin(dummyOrder);
        console.log('FendPay Result:', JSON.stringify(res, null, 2));
        results.push({ channel: 'FendPay', success: res.success, data: res, error: res.error });
    } catch (e) {
        console.error('FendPay Error:', e.message);
        results.push({ channel: 'FendPay', success: false, error: e.message });
    }

    // 5. Silkpay (Payable)
    try {
        console.log('\nTesting Silkpay (Payable)...');
        const res = await silkpayService.createPayin(dummyOrder);
        console.log('Silkpay Result:', JSON.stringify(res, null, 2));
        results.push({ channel: 'Silkpay', success: res.success, data: res, error: res.error });
    } catch (e) {
        console.error('Silkpay Error:', e.message);
        results.push({ channel: 'Silkpay', success: false, error: e.message });
    }

    console.log('\n--- Analysis Complete ---');
    return results;
}

if (require.main === module) {
    testChannels();
}

module.exports = testChannels;
