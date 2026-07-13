const { Client } = require('ssh2'); 
const path = require('path'); 
require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); 
const conn = new Client(); 
conn.on('ready', () => { 
    const script = `
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

async function testTdid(tdid) {
    const params = {
        mcid: process.env.BCATPAY_MCH_ID,
        orderno: 'TEST_' + Date.now() + '_' + tdid,
        price: '5000',
        tdid: tdid.toString(),
        callback_url: 'https://gaurpay.site/callback/bcatpay/payin',
        returnUrl: 'https://gaurpay.site/pay/success'
    };

    const filtered = Object.entries(params).filter(([k, v]) => v).sort(([a], [b]) => a.localeCompare(b));
    const str = filtered.map(([k, v]) => k + '=' + v + '&').join('') + 'key=' + process.env.BCATPAY_SIGN_KEY;
    params.sign = crypto.createHash('md5').update(str).digest('hex').toLowerCase();

    const searchParams = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        searchParams.append(k, v);
    }

    try {
        const res = await axios.post('https://m.bcatpay.store/api/receiveOrder', searchParams.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        if (res.data.code === 200) {
            console.log('SUCCESS for tdid', tdid, res.data);
            return true;
        }
    } catch (err) {}
    return false;
}

async function run() {
    const promises = [];
    for (let i = 1; i <= 500; i++) {
        promises.push(testTdid(i).then(ok => {
            if (ok) console.log('FOUND VALID TDID:', i);
        }));
        if (i % 50 === 0) {
            await Promise.all(promises);
            promises.length = 0;
        }
    }
    await Promise.all(promises);
    console.log('DONE SCANNING');
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
