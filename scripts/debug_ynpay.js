const crypto = require('crypto');
require('dotenv').config();

const APP_ID = process.env.YNPAY_APP_ID;
const APP_SECRET = process.env.YNPAY_APP_SECRET;
const IV = process.env.YNPAY_IV;

function decryptContent(encryptedStr) {
    try {
        const keyBuf = Buffer.from(APP_SECRET, 'utf8');
        const ivBuf = Buffer.alloc(16);
        Buffer.from(IV, 'utf8').copy(ivBuf);

        const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuf, ivBuf);
        decipher.setAutoPadding(true);
        let decrypted = decipher.update(encryptedStr, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch (e) {
        console.error('Decryption failed:', e.message);
        return null;
    }
}

function generateSign(content, timestamp) {
    const str = `appSecret=${APP_SECRET}&channel=${APP_ID}&content=${content}&timestamp=${timestamp}`;
    return crypto.createHash('md5').update(str).digest('hex').toLowerCase();
}

const payload = {
    "channel": "10190",
    "content": "cVdiYDf5Aq4NS4dl/io9FWdrcgZBTddT4/azvvDhR5d6J9OzRNccrCiUX8mW9u9issTGcQs53/7XdvKLoX3Vapvmvum8rCa6uefJHso8wlXBxHrwsXCYm4QBBRvgCOp5m0XNPBoQlM5Ruc0uFIyNpeuetE8oMJ3OXS5bE9g2AVahU6c1VUwELzIM0qluQOli1BxpZL6Z3ZvzX27I0/2jhh1Sd9G2nRAqOnejZ1qlCqlvekVLXk3+eCZ0zSYacXHh2Z1ahTkm/aibNE4N8tKvmzj+AgKC8EJ+VEasW0pGyCrifqqTU2t9pVRAV+YBzE44PZQO5JtLqj7kUhgCenNRyxDEH4qIR5tGA+iSTPSHYqZWfScmF89oUcUukwV0sstXI9/OWONvWCYNTtcvvbZzjsBhBTBQ3E/OEuvObgbuoK+dNbcmI5NVn22VOgDFrfOfD20WdJhS9Q4hkD5e6M8Wnw==",
    "timestamp": "1773067888209",
    "sign": "a27f3a1658ec015c3cb66943c93caf34"
};

console.log('--- Testing YNPay Decryption ---');
console.log('App ID:', APP_ID);
console.log('App Secret:', APP_SECRET);
console.log('IV:', IV);

const decrypted = decryptContent(payload.content);
console.log('Decrypted content:', decrypted);

const calculatedSign = generateSign(payload.content, payload.timestamp);
console.log('Calculated Sign:', calculatedSign);
console.log('Provided Sign:  ', payload.sign);
console.log('Sign Match:     ', calculatedSign === payload.sign);
