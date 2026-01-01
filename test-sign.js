const crypto = require('crypto');

// Merchant credentials (from get-merchant.js output)
const MERCHANT_ID = '80a2c5b2-315a-4a3a-8b2f-8493fd5d7e09';
const SECRET_KEY = 'dcf1e06922e5b38e48c1f06560dad18d9ff89b4771e6ca3bb7eeadeb427bee55';

// Example request body from ourapi.txt
const body = {
    "orderId": "TEST-" + Date.now(),
    "orderAmount": 500,
    "callbackUrl": "https://mysite.com/webhook",
    "skipUrl": "https://mysite.com/success"
};

/**
 * Signature function from ourapi.txt
 */
function generateSignatureDoc(params, secretKey) {
    const filtered = {};
    Object.keys(params).forEach(key => {
        if (key !== 'sign' && params[key] !== '' && params[key] != null) {
            filtered[key] = params[key];
        }
    });
    const sorted = Object.keys(filtered).sort();
    const query = sorted.map(k => `${k}=${filtered[k]}`).join('&');
    const str = `${query}&secret=${secretKey}`;
    console.log('--- Documentation Calculation ---');
    console.log(`String to hash: ${str}`);
    return crypto.createHash('md5').update(str).digest('hex').toUpperCase();
}

/**
 * Signature function from apiAuth.js
 */
function generateSignatureImpl(params, secretKey) {
    const filtered = {};
    Object.keys(params).forEach(key => {
        if (key !== 'sign' && params[key] !== '' && params[key] != null) {
            filtered[key] = params[key];
        }
    });

    const sorted = Object.keys(filtered).sort();
    const query = sorted.map(k => `${k}=${filtered[k]}`).join('&');
    const str = `${query}&secret=${secretKey}`;
    console.log('--- Implementation Calculation ---');
    console.log(`String to hash: ${str}`);

    return crypto.createHash('md5').update(str).digest('hex').toUpperCase();
}

const sigDoc = generateSignatureDoc(body, SECRET_KEY);
const sigImpl = generateSignatureImpl(body, SECRET_KEY);

console.log(`\nDoc Signature:  ${sigDoc}`);
console.log(`Impl Signature: ${sigImpl}`);

if (sigDoc === sigImpl) {
    console.log('\nSUCCESS: Signatures match!');
} else {
    console.log('\nFAILURE: Signatures do not match!');
}

// Test what happens if orderAmount is a string vs number
console.log('\n--- Testing Decimal Representation ---');
const bodyWithDecimal = { ...body, orderAmount: 500.00 };
const sigWithInt = generateSignatureImpl(body, SECRET_KEY);
const sigWithDecimal = generateSignatureImpl(bodyWithDecimal, SECRET_KEY);

console.log(`Int Sig:     ${sigWithInt}`);
console.log(`Decimal Sig: ${sigWithDecimal}`);

if (sigWithInt === sigWithDecimal) {
    console.log('500 and 500.00 match in JS.');
} else {
    console.log('500 and 500.00 DO NOT match.');
}

// What if it's 500.10?
const bodyWithPoint1 = { ...body, orderAmount: 500.10 };
const sigWithPoint1 = generateSignatureImpl(bodyWithPoint1, SECRET_KEY);
console.log(`String to hash for 500.10 in JS: ...orderAmount=${bodyWithPoint1.orderAmount}...`);
// (500.10).toString() is "500.1" in JS
