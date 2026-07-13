const { Client } = require('ssh2'); 
const path = require('path'); 
require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); 
const conn = new Client(); 
conn.on('ready', () => { 
    const script = `
require('dotenv').config();
const bcatpay = require('./src/services/bcatpay');
async function run() {
    console.log('Running createPayin...');
    const res = await bcatpay.createPayin({
        orderId: 'TEST_' + Date.now(),
        amount: 5000,
        notifyUrl: 'https://gaurpay.site/callback/bcatpay/payin',
        returnUrl: 'https://gaurpay.site/pay/success'
    });
    console.log('Result:', res);
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
