const otplib = require('otplib');

const secret = process.argv[2];
const token = process.argv[3];

if (!secret || !token) {
    console.log('Usage: node test-totp.js <secret> <token>');
    process.exit(1);
}

otplib.authenticator.options = { window: 1 };

console.log('--- TOTP DIAGNOSTIC ---');
console.log('Time (Local):', new Date().toString());
console.log('Time (UTC):', new Date().toISOString());
console.log('Secret:', secret);
console.log('Input Token:', token);

const expected = otplib.authenticator.generate(secret);
console.log('Expected Token (Now):', expected);

const isValid = otplib.authenticator.check(token, secret);
console.log('Is Valid?', isValid);

const prev = otplib.authenticator.generate(secret, Date.now() - 30000);
const next = otplib.authenticator.generate(secret, Date.now() + 30000);
console.log('Prev Window Token:', prev);
console.log('Next Window Token:', next);
