const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

async function test() {
    const params = {
        mcid: process.env.BCATPAY_MCH_ID,
        orderno: 'TEST_' + Date.now(),
        price: '500.00',
        tdid: '114',
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
        console.log('SENDING:', searchParams.toString());
        const res = await axios.post('https://m.bcatpay.store/api/receiveOrder', searchParams.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        console.log('SUCCESS:', res.data);
    } catch (err) {
        console.error('ERROR:', err.response ? err.response.data : err.message);
    }
}
test();
