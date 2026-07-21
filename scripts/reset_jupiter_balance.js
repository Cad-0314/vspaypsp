/**
 * Reset Jupiter Balance Script
 * 1. Verify Jupiter is on agpay (not testpay)
 * 2. Set balance and pendingBalance to 0
 * 3. Check canPayout and canPayin status
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

    console.log('=== Jupiter Merchant Audit ===\n');

    // 1. Get Jupiter's current config
    const [rows] = await conn.execute(
        `SELECT id, username, apiKey, payinChannel, payoutChannel, balance, pendingBalance, canPayin, canPayout, channel_rates, allowedCurrencies, defaultCurrency
         FROM users WHERE username = 'jupiter' AND role = 'merchant' LIMIT 1`
    );

    if (rows.length === 0) {
        // Try jupiter_test
        const [rows2] = await conn.execute(
            `SELECT id, username, apiKey, payinChannel, payoutChannel, balance, pendingBalance, canPayin, canPayout, channel_rates
             FROM users WHERE username LIKE '%jupiter%' AND role = 'merchant'`
        );
        if (rows2.length === 0) {
            console.log('❌ No Jupiter merchant found!');
            await conn.end();
            return;
        }
        console.log('Found Jupiter-related merchants:');
        rows2.forEach(r => {
            console.log(`  - ${r.username}: payin=${r.payinChannel}, payout=${r.payoutChannel}, balance=${r.balance}, pending=${r.pendingBalance}`);
        });
        await conn.end();
        return;
    }

    const jupiter = rows[0];
    console.log('Current Jupiter Config:');
    console.log(`  Username:        ${jupiter.username}`);
    console.log(`  ID:              ${jupiter.id}`);
    console.log(`  API Key:         ${jupiter.apiKey}`);
    console.log(`  PayIn Channel:   ${jupiter.payinChannel}`);
    console.log(`  PayOut Channel:  ${jupiter.payoutChannel}`);
    console.log(`  Balance:         ₹${jupiter.balance}`);
    console.log(`  Pending Balance: ₹${jupiter.pendingBalance}`);
    console.log(`  Can PayIn:       ${jupiter.canPayin}`);
    console.log(`  Can PayOut:      ${jupiter.canPayout}`);
    console.log(`  Channel Rates:   ${jupiter.channel_rates}`);
    console.log(`  Currency:        ${jupiter.defaultCurrency}`);
    console.log(`  Allowed:         ${jupiter.allowedCurrencies}`);

    // 2. Check if channels are real (agpay)
    const payinOk = jupiter.payinChannel === 'agpay';
    const payoutOk = jupiter.payoutChannel === 'agpay';
    console.log(`\n--- Channel Verification ---`);
    console.log(`  PayIn on agpay:  ${payinOk ? '✅ YES' : '⚠️ NO (' + jupiter.payinChannel + ')'}`);
    console.log(`  PayOut on agpay: ${payoutOk ? '✅ YES' : '⚠️ NO (' + jupiter.payoutChannel + ')'}`);

    // 3. Reset balance and pending to 0
    console.log(`\n--- Resetting Balance ---`);
    console.log(`  Old Balance:     ₹${jupiter.balance}`);
    console.log(`  Old Pending:     ₹${jupiter.pendingBalance}`);

    await conn.execute(
        `UPDATE users SET balance = 0, pendingBalance = 0 WHERE username = 'jupiter' AND role = 'merchant'`
    );

    // Verify
    const [verify] = await conn.execute(
        `SELECT balance, pendingBalance FROM users WHERE username = 'jupiter' AND role = 'merchant' LIMIT 1`
    );
    console.log(`  New Balance:     ₹${verify[0].balance}`);
    console.log(`  New Pending:     ₹${verify[0].pendingBalance}`);
    console.log(`  ✅ Jupiter balances reset to 0`);

    await conn.end();
    console.log('\nDone.');
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
