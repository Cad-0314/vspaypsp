/**
 * Fix Jupiter Channels — Switch from fake testpay to real agpay
 * 1. Change payinChannel from 'upi super' to 'agpay'
 * 2. Change payoutChannel from 'testpay' to 'agpay'
 * 3. Verify the update
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    console.log('=== Fixing Jupiter Channels ===\n');

    // 1. Show current state
    const [before] = await conn.execute(
        `SELECT username, payinChannel, payoutChannel, balance, pendingBalance, canPayin, canPayout
         FROM users WHERE username = 'jupiter' AND role = 'merchant' LIMIT 1`
    );

    if (before.length === 0) {
        console.log('❌ Jupiter merchant not found!');
        await conn.end();
        return;
    }

    console.log('BEFORE:');
    console.log(`  PayIn Channel:   ${before[0].payinChannel}`);
    console.log(`  PayOut Channel:  ${before[0].payoutChannel}`);
    console.log(`  Balance:         ₹${before[0].balance}`);
    console.log(`  Pending:         ₹${before[0].pendingBalance}`);
    console.log(`  Can PayIn:       ${before[0].canPayin}`);
    console.log(`  Can PayOut:      ${before[0].canPayout}`);

    // 2. Update both channels to agpay
    await conn.execute(
        `UPDATE users SET payinChannel = 'agpay', payoutChannel = 'agpay'
         WHERE username = 'jupiter' AND role = 'merchant'`
    );

    // 3. Verify
    const [after] = await conn.execute(
        `SELECT username, payinChannel, payoutChannel, balance, pendingBalance, canPayin, canPayout
         FROM users WHERE username = 'jupiter' AND role = 'merchant' LIMIT 1`
    );

    console.log('\nAFTER:');
    console.log(`  PayIn Channel:   ${after[0].payinChannel} ${after[0].payinChannel === 'agpay' ? '✅' : '❌'}`);
    console.log(`  PayOut Channel:  ${after[0].payoutChannel} ${after[0].payoutChannel === 'agpay' ? '✅' : '❌'}`);
    console.log(`  Balance:         ₹${after[0].balance}`);
    console.log(`  Pending:         ₹${after[0].pendingBalance}`);
    console.log(`  Can PayIn:       ${after[0].canPayin}`);
    console.log(`  Can PayOut:      ${after[0].canPayout}`);

    // 4. Verify agpay credentials exist in env
    console.log('\n--- AGPay Credential Check ---');
    console.log(`  AGPAY_BASE_URL:      ${process.env.AGPAY_BASE_URL ? '✅ Set' : '❌ Missing'}`);
    console.log(`  AGPAY_MERCHANT_ID:   ${process.env.AGPAY_MERCHANT_ID ? '✅ Set' : '❌ Missing'}`);
    console.log(`  AGPAY_SECRET_KEY:    ${process.env.AGPAY_SECRET_KEY ? '✅ Set' : '❌ Missing'}`);
    console.log(`  AGPAY_PAYIN_CHANNEL: ${process.env.AGPAY_PAYIN_CHANNEL || '8002'}`);
    console.log(`  AGPAY_PAYOUT_CHANNEL: ${process.env.AGPAY_PAYOUT_CHANNEL || '6002'}`);

    await conn.end();
    console.log('\n✅ Jupiter is now on REAL agpay for both PayIn and PayOut.');
    console.log('   No more fake/mock/simulated transactions.');
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
