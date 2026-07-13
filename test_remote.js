const { Client } = require('ssh2'); 
const path = require('path'); 
require('dotenv').config({ path: path.join(__dirname, '.env') }); 
const conn = new Client(); 
conn.on('ready', () => { 
    const script = `const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();
const { User } = require('./src/models');
async function test() {
    try {
        const merchant = await User.findOne({ where: { role: 'merchant' } });
        if (!merchant) throw new Error('No merchant found');
        const params = {
            ref_id: 'TEST_' + Date.now(),
            txn_amount: 500,
            webhook_url: 'https://gaurpay.site/hook',
            return_url: 'https://gaurpay.site/return',
            payer_name: 'Test',
            metadata: 'bkash',
            currency: 'BDT'
        };
        const filtered = {};
        Object.keys(params).forEach(key => {
            if (key !== 'sign' && params[key] !== '' && params[key] != null) {
                filtered[key] = params[key];
            }
        });
        const sorted = Object.keys(filtered).sort();
        const query = sorted.map(k => k+'='+filtered[k]).join('&');
        const str = query + '&secret=' + (merchant.apiSecret || '').trim();
        const sign = crypto.createHash('md5').update(str).digest('hex').toUpperCase();
        
        const res = await axios.post('http://localhost:3000/v3/deposit/create', params, { 
            headers: { 
                'x-merchant-id': merchant.apiKey,
                'x-signature': sign
            } 
        });
        console.log('RESPONSE:', res.data);
    } catch (e) {
        console.error('ERROR:', e.response ? e.response.data : e.message);
    }
    process.exit(0);
}
test();`;
    
    conn.exec(`cd /www/wwwroot/gaurpay.site && echo ${Buffer.from(script).toString('base64')} | base64 -d > test2.js && node test2.js`, (err, stream) => { 
        stream.on('data', d => process.stdout.write(d.toString())); 
        stream.stderr.on('data', d => process.stderr.write(d.toString())); 
        stream.on('close', () => conn.end()); 
    }); 
}).connect({
    host: process.env.DEPLOY_HOST, 
    username: process.env.DEPLOY_USER, 
    password: process.env.DEPLOY_PASSWORD
});
