const otplib = require('otplib');

const secret = process.argv[2];
const token = process.argv[3];

if (!secret || !token) {
    console.log('Usage: node test-totp.js <secret> <token>');
    process.exit(1);
}

// Configure with window
otplib.authenticator.options = { window: 2, step: 30 };

const now = Math.floor(Date.now() / 1000);
const step = 30;

console.log('--- TOTP DIAGNOSTIC ---');
console.log('Time (Local):', new Date().toString());
console.log('Time (UTC):', new Date().toISOString());
console.log('Unix Timestamp:', now);
console.log('Secret:', secret);
console.log('Input Token:', token);

// Generate tokens for different time windows manually
const counter = Math.floor(now / step);

// Use generateToken with counter to get different windows
const generateForCounter = (c) => {
    // Temporarily change epoch to simulate different time
    const fakeTime = c * step * 1000;
    return otplib.authenticator.generate(secret);
};

console.log('\n--- Window Tokens ---');
console.log('Current Expected:', otplib.authenticator.generate(secret));

// For proper window display, let's just show what otplib.check does
const isValid = otplib.authenticator.check(token, secret);
console.log('\nIs Input Valid (with window ±2)?', isValid);

// Show all valid tokens in the current window
console.log('\n--- All tokens valid right now (window=2) ---');
for (let i = -2; i <= 2; i++) {
    const counterOffset = Math.floor((Date.now() / 1000) / step) + i;
    const tokenAtOffset = otplib.hotp.generate(secret, counterOffset);
    console.log(`Offset ${i >= 0 ? '+' : ''}${i}: ${tokenAtOffset}`);
}
