const ipayService = require('./src/services/ipay');
require('dotenv').config();

async function testIntegration() {
    console.log('--- Testing IPay Integration Logic ---');
    console.log('Token:', process.env.IPAY_TOKEN);
    console.log('Secret:', process.env.IPAY_SECRET_KEY ? 'Present' : 'Missing');

    // MOCK PAYIN
    const payinData = {
        orderId: 'TEST_ORDER_123',
        amount: '100.00',
        notifyUrl: 'https://example.com/callback',
        returnUrl: 'https://example.com/return',
        customerName: 'Test User',
        customerPhone: '9876543210',
        customerEmail: 'test@example.com'
    };

    console.log('\n[Simulating createPayin]');

    // We want to see the generated signature without sending the request
    // So we'll inspect the generateSign helper directly
    const payinPayload = {
        token: process.env.IPAY_TOKEN,
        callbackUrl: payinData.notifyUrl,
        ts: '1700000000000', // Fixed TS for reproducible test
        orderAmount: payinData.amount,
        orderId: payinData.orderId,
        param: 'payment',
        payMode: 'launch',
        redirectUrl: payinData.returnUrl,
        name: payinData.customerName,
        phone: payinData.customerPhone,
        email: payinData.customerEmail
    };

    const signature = ipayService.generateSign(payinPayload);
    console.log('Payload keys (sorted):', Object.keys(payinPayload).sort().join(', '));
    console.log('Generated Signature:', signature);
    console.log('Expected behavior: Should be MD5 of sorted params + &secret=KEY, Uppercase');

    // MOCK PAYOUT
    const payoutData = {
        orderId: 'POUT_123',
        amount: '500.00',
        accountNo: '1234567890',
        ifsc: 'UTIB0001234',
        name: 'Beneficiary Name',
        notifyUrl: 'https://example.com/callback_payout'
    };

    console.log('\n[Simulating createPayout]');
    const payoutPayload = {
        amount: payoutData.amount,
        token: process.env.IPAY_TOKEN,
        callbackUrl: payoutData.notifyUrl,
        account: payoutData.accountNo,
        ifsc: payoutData.ifsc,
        ts: '1700000000000',
        orderId: payoutData.orderId,
        param: 'payout',
        personName: payoutData.name
    };

    const poutSign = ipayService.generateSign(payoutPayload);
    console.log('Payout Payload keys (sorted):', Object.keys(payoutPayload).sort().join(', '));
    console.log('Generated Payout Signature:', poutSign);

    console.log('\n--- Integration Logic Check Complete ---');
}

testIntegration();
