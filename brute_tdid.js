const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

async function testTdid(tdid) {
    const params = {
        mcid: process.env.BCATPAY_MCH_ID,
        orderno: 'TEST_' + Date.now() + '_' + tdid,
        price: '500.00',
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
        } else {
            // console.log('FAILED tdid', tdid, res.data.msg);
        }
    } catch (err) {
        // console.error('ERROR tdid', tdid, err.message);
    }
    return false;
}

async function run() {
    for (let i = 1; i <= 200; i++) {
        const ok = await testTdid(i);
        if (ok) {
            console.log('FOUND VALID TDID:', i);
        }
        await new Promise(r => setTimeout(r, 50));
    }
    console.log('DONE SCANNING 1-200');
}
run();
