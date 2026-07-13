const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const bcatpay = require('../src/services/bcatpay');

async function testBcatpay() {
    console.log('Testing BCAT Pay integration...');
    console.log('-----------------------------------');
    
    console.log('\n1. Testing Balance Query:');
    try {
        const balanceRes = await bcatpay.getBalance();
        console.log('Balance Response:', JSON.stringify(balanceRes, null, 2));
    } catch (e) {
        console.error('Balance Error:', e.message);
    }
    
    console.log('\n2. Testing Payin Creation (Test Order):');
    try {
        const orderId = 'TEST_BCAT_' + Date.now();
        const payinRes = await bcatpay.createPayin({
            orderId: orderId,
            amount: 500,
            notifyUrl: 'https://gaurpay.site/callback/bcatpay/payin'
        });
        console.log('Payin Response:', JSON.stringify(payinRes, null, 2));
    } catch (e) {
        console.error('Payin Error:', e.message);
    }

    console.log('\n3. Testing Payout Creation (Test Order):');
    try {
        const payoutId = 'TEST_OUT_' + Date.now();
        const payoutRes = await bcatpay.createPayout({
            orderId: payoutId,
            amount: 500,
            name: 'John Doe',
            accountNo: '01712345678',
            ifsc: 'bkash',
            notifyUrl: 'https://gaurpay.site/callback/bcatpay/payout',
            bankName: 'bkash'
        });
        console.log('Payout Response:', JSON.stringify(payoutRes, null, 2));
    } catch (e) {
        console.error('Payout Error:', e.message);
    }
}

testBcatpay();
