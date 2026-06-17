
const caipayService = require('./src/services/caipay');
const fendpayService = require('./src/services/fendpay');
const silkpayService = require('./src/services/silkpay');
const ckpayService = require('./src/services/ckpay');
const cxpayService = require('./src/services/cxpay');
const aapayService = require('./src/services/aapay');
const ipayService = require('./src/services/ipay');
const unitedpayService = require('./src/services/unitedpay');
const bharatpayService = require('./src/services/bharatpay');
const firpayService = require('./src/services/firpay');
const agpayService = require('./src/services/agpay');
const easypayService = require('./src/services/easypay');
const ynpayService = require('./src/services/ynpay');
const passpayService = require('./src/services/passpay');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = 'https://gaurpay.site';

async function testChannels() {
    console.log('--- Starting Channel Analysis ---\n');

    const baseOrder = {
        orderId: `TEST_${Date.now()}`,
        amount: 4990.00,
        customerName: 'Test User',
        customerEmail: 'test@example.com',
        customerPhone: '9999999999',
        returnUrl: `${BASE_URL}/pay/success`
    };

    const channelsToTest = [
        { name: 'Yellow', service: caipayService, notifyPath: '/callback/yellow/payin' },
        { name: 'UPI Super', service: fendpayService, notifyPath: '/callback/fendpay/payin' },
        { name: 'GaurPay', service: silkpayService, notifyPath: '/callback/gaurpay/payin' },
        { name: 'CKPay', service: ckpayService, notifyPath: '/callback/ckpay/payin' },
        { name: 'CX Pay', service: cxpayService, notifyPath: '/callback/cxpay/payin' },
        { name: 'AA Pay', service: aapayService, notifyPath: '/callback/aapay/payin' },
        { name: 'IPay', service: ipayService, notifyPath: '/callback/ipay/payin' },
        { name: 'United Pay', service: unitedpayService, notifyPath: '/callback/unitedpay/payin' },
        { name: 'BharatPay', service: bharatpayService, notifyPath: '/callback/bharatpay/payin' },
        { name: 'FirPay', service: firpayService, notifyPath: '/callback/firpay/payin' },
        { name: 'AG Pay', service: agpayService, notifyPath: '/callback/agpay/payin' },
        { name: 'Easy Pay', service: easypayService, notifyPath: '/callback/easypay/payin' },
        { name: 'YN Pay', service: ynpayService, notifyPath: '/callback/ynpay/payin' },
        { name: 'Pass Pay', service: passpayService, notifyPath: '/callback/passpay/payin' }
    ];

    const withTimeout = (promise, ms) => {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error(`Timed out after ${ms}ms`));
            }, ms);
        });
        return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
    };

    const testPromises = channelsToTest.map(async (ch) => {
        try {
            console.log(`\nTesting ${ch.name}...`);
            const order = { ...baseOrder, notifyUrl: `${BASE_URL}${ch.notifyPath}` };
            const res = await withTimeout(ch.service.createPayin(order), 15000); // 15 seconds timeout
            console.log(`${ch.name} Result:`, JSON.stringify(res, null, 2));
            return { channel: ch.name, success: res.success, data: res, error: res.error };
        } catch (e) {
            console.error(`${ch.name} Error:`, e.message);
            return { channel: ch.name, success: false, error: e.message };
        }
    });

    const results = await Promise.all(testPromises);

    console.log('\n--- Analysis Complete ---');
    return results;
}

if (require.main === module) {
    testChannels();
}

module.exports = testChannels;

