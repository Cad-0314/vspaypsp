const bcatpay = require('./src/services/bcatpay');

async function testLinks() {
    try {
        console.log('Generating Bkash link...');
        const bkashRes = await bcatpay.createPayin({
            orderId: 'TEST_BKASH_' + Date.now(),
            amount: 500,
            notifyUrl: 'https://gaurpay.site/callback/bcatpay/payin',
            returnUrl: 'https://gaurpay.site/success',
            bankCode: 'bkash'
        });
        console.log('Bkash Response:', bkashRes);

        console.log('\nGenerating Nagad link...');
        const nagadRes = await bcatpay.createPayin({
            orderId: 'TEST_NAGAD_' + Date.now(),
            amount: 500,
            notifyUrl: 'https://gaurpay.site/callback/bcatpay/payin',
            returnUrl: 'https://gaurpay.site/success',
            bankCode: 'nagad'
        });
        console.log('Nagad Response:', nagadRes);
    } catch (e) {
        console.error('Error:', e);
    }
}

testLinks();
