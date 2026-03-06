const easypay = require('./src/services/easypay');

async function testPayout() {
    const orderId = 'TEST_PO_EP_' + Date.now();
    console.log(`[Test] Creating EasyPay Payout with Order ID: ${orderId}`);

    const payoutData = {
        orderId: orderId,
        amount: 500,
        name: 'Amit Patel Test',
        accountNo: '357910864201', // Example format
        ifsc: 'HDFC0001234',
        notifyUrl: 'http://localhost:3000/api/callback/easypay/payout',
        customerPhone: '9876543210',
        customerEmail: 'test@example.com'
    };

    try {
        const result = await easypay.createPayout(payoutData);
        console.log('\n[Test] Payout Creation Result:', result);

        if (result.success && result.providerOrderId) {
            console.log('\n[Test] Waiting 3 seconds before querying status...');
            await new Promise(r => setTimeout(r, 3000));
            const queryRes = await easypay.queryPayout(orderId);
            console.log('\n[Test] Query Result:', queryRes);
        }
    } catch (err) {
        console.error('[Test] Execution error:', err);
    }
}

testPayout();
