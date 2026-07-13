const { Client } = require('ssh2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const conn = new Client();
const SERVER = {
    host: process.env.DEPLOY_HOST,
    port: 22,
    username: process.env.DEPLOY_USER,
    password: process.env.DEPLOY_PASSWORD
};

const PROJECT_DIR = '/www/wwwroot/gaurpay.site';
const MCH_ID = '18016';
const SIGN_KEY = 'f697b6fd81cca84d113c60f535f6ba43';

conn.on('ready', () => {
    console.log('Connected to server. Patching remote .env...');
    
    // Check if variables exist, if so replace, if not append
    const cmds = [
        `cd ${PROJECT_DIR}`,
        `if grep -q "^BCATPAY_SIGN_KEY=" .env; then sed -i "s/^BCATPAY_SIGN_KEY=.*/BCATPAY_SIGN_KEY=${SIGN_KEY}/" .env; else echo "BCATPAY_SIGN_KEY=${SIGN_KEY}" >> .env; fi`,
        `if grep -q "^BCATPAY_MCH_ID=" .env; then sed -i "s/^BCATPAY_MCH_ID=.*/BCATPAY_MCH_ID=${MCH_ID}/" .env; else echo "BCATPAY_MCH_ID=${MCH_ID}" >> .env; fi`,
        `if grep -q "^BCATPAY_BASE_URL=" .env; then echo "Base url exists"; else echo "BCATPAY_BASE_URL=https://m.bcatpay.store" >> .env; fi`,
        `if grep -q "^BCATPAY_PAYIN_CHANNEL_ID=" .env; then echo "payin exists"; else echo "BCATPAY_PAYIN_CHANNEL_ID=1" >> .env; fi`,
        `if grep -q "^BCATPAY_PAYOUT_CHANNEL_ID=" .env; then echo "payout exists"; else echo "BCATPAY_PAYOUT_CHANNEL_ID=1" >> .env; fi`,
        `pm2 reload gaurpay-api --update-env`
    ].join(' && ');

    conn.exec(cmds, (err, stream) => {
        if (err) throw err;
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.stderr.on('data', d => process.stderr.write(d.toString()));
        stream.on('close', (code) => {
            console.log(`\nEnv update finished with code ${code}`);
            conn.end();
        });
    });
}).on('error', err => {
    console.error('SSH Error:', err);
}).connect(SERVER);
