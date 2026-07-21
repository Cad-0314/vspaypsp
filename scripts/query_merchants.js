/**
 * Quick DB query to find all merchants 
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        connectTimeout: 10000
    });

    console.log('=== ALL MERCHANTS ===');
    const [rows] = await conn.execute(
        'SELECT id, username, apiKey, apiSecret, role, payinChannel, payoutChannel, assignedChannel, balance, canPayin, canPayout, isActive FROM users WHERE role = "merchant"'
    );
    
    for (const r of rows) {
        console.log(`\n--- ${r.username} ---`);
        console.log(`  ID:          ${r.id}`);
        console.log(`  API Key:     ${r.apiKey}`);
        console.log(`  API Secret:  ${r.apiSecret}`);
        console.log(`  PayIn:       ${r.payinChannel}`);
        console.log(`  Payout:      ${r.payoutChannel}`);
        console.log(`  Assigned:    ${r.assignedChannel}`);
        console.log(`  Balance:     ₹${parseFloat(r.balance || 0).toFixed(2)}`);
        console.log(`  Active:      ${r.isActive}`);
        console.log(`  CanPayin:    ${r.canPayin}`);
        console.log(`  CanPayout:   ${r.canPayout}`);
    }

    console.log('\n=== ALL CHANNELS ===');
    const [channels] = await conn.execute('SELECT name, isActive, currency FROM channels');
    for (const c of channels) {
        console.log(`  ${c.name} | Active: ${c.isActive} | ${c.currency}`);
    }

    await conn.end();
})();
