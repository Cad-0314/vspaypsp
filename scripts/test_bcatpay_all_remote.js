const { Client } = require('ssh2'); 
const path = require('path'); 
require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); 
const conn = new Client(); 
conn.on('ready', () => { 
    const script = `
require('dotenv').config();
const bcatpay = require('./src/services/bcatpay');
async function run() {
    console.log('Generating Bkash link...');
    const resBkash = await bcatpay.createPayin({
        orderId: 'TEST_BKASH_' + Date.now(),
        amount: 500,
        notifyUrl: 'https://gaurpay.site/callback/bcatpay/payin',
        returnUrl: 'https://gaurpay.site/pay/success',
        bankCode: 'bkash'
    });
    console.log('Bkash Result:', resBkash);
    
    console.log('Generating Nagad link...');
    const resNagad = await bcatpay.createPayin({
        orderId: 'TEST_NAGAD_' + Date.now(),
        amount: 500,
        notifyUrl: 'https://gaurpay.site/callback/bcatpay/payin',
        returnUrl: 'https://gaurpay.site/pay/success',
        bankCode: 'nagad'
    });
    console.log('Nagad Result:', resNagad);
    
    console.log('Generating Rocket link...');
    const resRocket = await bcatpay.createPayin({
        orderId: 'TEST_ROCKET_' + Date.now(),
        amount: 500,
        notifyUrl: 'https://gaurpay.site/callback/bcatpay/payin',
        returnUrl: 'https://gaurpay.site/pay/success',
        bankCode: 'rocket'
    });
    console.log('Rocket Result:', resRocket);
    
    console.log('Generating Upay link...');
    const resUpay = await bcatpay.createPayin({
        orderId: 'TEST_UPAY_' + Date.now(),
        amount: 500,
        notifyUrl: 'https://gaurpay.site/callback/bcatpay/payin',
        returnUrl: 'https://gaurpay.site/pay/success',
        bankCode: 'upay'
    });
    console.log('Upay Result:', resUpay);
}
run();
`;
    conn.exec(`cd /www/wwwroot/gaurpay.site && node -e "${script.replace(/\n/g, ' ')}"`, (err, stream) => { 
        stream.on('data', d => process.stdout.write(d.toString())); 
        stream.stderr.on('data', d => process.stderr.write(d.toString())); 
        stream.on('close', () => conn.end()); 
    }); 
}).connect({
    host: process.env.DEPLOY_HOST, 
    username: process.env.DEPLOY_USER, 
    password: process.env.DEPLOY_PASSWORD
});
