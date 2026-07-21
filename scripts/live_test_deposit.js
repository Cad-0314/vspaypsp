/**
 * Live test: hit gaurpay.site/v3/deposit/create with the same request the client sends
 */
const crypto = require('crypto');
const https = require('https');

const secret = '31f41612d04fb6f388e43134f57ca1209121af68671a8f4224affc16cb655';
const merchantId = 'gkMBny';

const body = {
    ref_id: 'test_live_' + Date.now(),
    webhook_url: 'https://dev.ips.intelplat.ru/callback/GaurPay',
    txn_amount: '110',
    payer_email: 'email@mail.ru',
    payer_name: 'Test Joe',
    payer_phone: '1234567890',
    return_url: 'https://your-merchant.example/return'
};

// Generate signature exactly like apiAuth.js expects
const filtered = {};
Object.keys(body).forEach(k => {
    if (k !== 'sign' && body[k] !== '' && body[k] != null) filtered[k] = body[k];
});
const sorted = Object.keys(filtered).sort();
const query = sorted.map(k => `${k}=${filtered[k]}`).join('&');
const str = `${query}&secret=${secret}`;
const signature = crypto.createHash('md5').update(str).digest('hex').toUpperCase();

console.log('=== REQUEST ===');
console.log('URL: POST https://gaurpay.site/v3/deposit/create');
console.log('x-merchant-id:', merchantId);
console.log('x-signature:', signature);
console.log('Body:', JSON.stringify(body, null, 2));
console.log('Sign string:', str);
console.log('');

const postData = JSON.stringify(body);

const options = {
    hostname: 'gaurpay.site',
    path: '/v3/deposit/create',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-merchant-id': merchantId,
        'x-signature': signature,
        'Content-Length': Buffer.byteLength(postData)
    }
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('=== RESPONSE ===');
        console.log('Status:', res.statusCode);
        try {
            const parsed = JSON.parse(data);
            console.log('Body:', JSON.stringify(parsed, null, 2));
            if (parsed.code === -1 && parsed.msg === 'Invalid signature') {
                console.log('\n❌ STILL FAILING - signature rejected');
            } else {
                console.log('\n✅ SIGNATURE ACCEPTED - request went through!');
            }
        } catch (e) {
            console.log('Raw:', data);
        }
    });
});

req.on('error', e => console.error('Request error:', e.message));
req.write(postData);
req.end();
