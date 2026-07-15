const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
require('dotenv').config();

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

async function testTdid(tdid) {
    const params = {
        mcid: process.env.BCATPAY_MCH_ID,
        orderno: 'T_' + Date.now() + '_' + tdid,
        price: '500.00',
        tdid: tdid.toString(),
        callback_url: 'https://gaurpay.site/callback/bcatpay/payin',
        returnUrl: 'https://gaurpay.site/pay/success'
    };
    
    const filtered = Object.entries(params).filter(([k, v]) => v).sort(([a], [b]) => a.localeCompare(b));
    const str = filtered.map(([k, v]) => k + '=' + v + '&').join('') + 'key=' + process.env.BCATPAY_SIGN_KEY;
    params.sign = crypto.createHash('md5').update(str).digest('hex').toLowerCase();
    
    const searchParams = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) { searchParams.append(k, v); }
    
    try {
        const res = await axios.post('https://m.bcatpay.store/api/receiveOrder', searchParams.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            httpAgent,
            httpsAgent,
            timeout: 5000
        });
        
        if (res.data.code === 200) {
            console.log('\n=====================================');
            console.log('🎉 FOUND VALID TDID:', tdid);
            console.log('LINK:', res.data.data);
            console.log('=====================================\n');
            return true;
        } else {
            const msg = res.data.msg;
            if (!msg.includes('Channel disabled') && !msg.includes('non-existent')) {
                // console.log(`TDID ${tdid}: ${msg}`);
            }
        }
    } catch (err) {}
    return false;
}

async function run() {
    console.log('Starting fast scan for working TDID...');
    let found = false;
    
    // BCATPay TDIDs are usually in 3000-4000 range, or 1-500 range
    // We will scan 3000 to 4500
    
    const BATCH_SIZE = 50;
    for (let start = 3000; start <= 4500; start += BATCH_SIZE) {
        const promises = [];
        for (let i = 0; i < BATCH_SIZE; i++) {
            promises.push(testTdid(start + i));
        }
        const results = await Promise.all(promises);
        if (results.includes(true)) {
            found = true;
            // keep scanning to find others
        }
    }
    
    for (let start = 1; start <= 500; start += BATCH_SIZE) {
        const promises = [];
        for (let i = 0; i < BATCH_SIZE; i++) {
            promises.push(testTdid(start + i));
        }
        const results = await Promise.all(promises);
        if (results.includes(true)) {
            found = true;
        }
    }
    
    if (!found) {
        console.log('Could not find any working TDID.');
    } else {
        console.log('Scan complete.');
    }
}
run();
