/**
 * Fix TestPay: Update jupiter merchant + run API tests
 * Direct MySQL connection - no SSH needed
 */
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

const APP_URL = process.env.APP_URL || 'https://gaurpay.site';

function generateSignature(params, secretKey) {
    const filtered = {};
    Object.keys(params).forEach(key => {
        if (key !== 'sign' && params[key] !== '' && params[key] != null) {
            filtered[key] = params[key];
        }
    });
    const sorted = Object.keys(filtered).sort();
    const query = sorted.map(k => `${k}=${filtered[k]}`).join('&');
    const str = `${query}&secret=${secretKey}`;
    return crypto.createHash('md5').update(str).digest('hex').toUpperCase();
}

async function run() {
    console.log('===========================================');
    console.log('  Fix & Test TestPay Channel (jupiter)');
    console.log('===========================================\n');

    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        connectTimeout: 10000
    });

    try {
        // Get merchant record first to get ID
        const [users] = await conn.execute(`SELECT id FROM users WHERE username = 'jupiter' AND role = 'merchant' LIMIT 1`);
        const merchant = users[0];

        // Step 1: Update jupiter to testpay for BOTH payin and payout
        console.log('\n[Step 4] Updating merchant to testpay channel and clearing IP whitelist...');
        await conn.execute(
            `UPDATE users SET payinChannel = 'testpay', payoutChannel = 'testpay', assignedChannel = 'testpay', canPayin = 1, canPayout = 1, isActive = 1, whitelistedIps = '[]' WHERE id = ?`,
            [merchant.id]
        );
        console.log('  ✓ jupiter merchant updated');

        // Step 2: Set test balance
        console.log('\n[Step 2] Setting test balance (₹100,000)...');
        await conn.execute(
            `UPDATE users SET balance = 100000.00 WHERE username = 'jupiter' AND role = 'merchant'`
        );
        console.log('  ✓ Balance set to ₹100,000');

        // Get merchant credentials
        const [rows] = await conn.execute(
            `SELECT apiKey, apiSecret, payinChannel, payoutChannel, balance FROM users WHERE username = 'jupiter' AND role = 'merchant'`
        );
        const m = rows[0];
        console.log(`\n  Merchant Config:`);
        console.log(`    API Key:     ${m.apiKey}`);
        console.log(`    PayIn:       ${m.payinChannel}`);
        console.log(`    Payout:      ${m.payoutChannel}`);
        console.log(`    Balance:     ₹${parseFloat(m.balance).toFixed(2)}`);

        await conn.end();

        // Step 3: Test V3 deposit/create
        console.log('\n[Step 3] Testing V3 deposit/create...');
        const refId = `TPTEST_${Date.now()}`;
        const depositBody = {
            ref_id: refId,
            txn_amount: '500',
            webhook_url: `${APP_URL}/callback/testpay/payin`,
            return_url: `${APP_URL}/pay/success`,
            payer_name: 'Test User',
            payer_email: 'test@example.com',
            payer_phone: '9999999999'
        };

        const depositSig = generateSignature(depositBody, m.apiSecret);
        console.log(`  Ref ID: ${refId}`);
        console.log(`  Signature: ${depositSig}`);

        try {
            const resp = await axios.post(`${APP_URL}/v3/deposit/create`, depositBody, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'x-merchant-id': m.apiKey,
                    'x-signature': depositSig
                },
                timeout: 15000
            });
            console.log(`\n  ✓ DEPOSIT Response (${resp.status}):`);
            console.log(JSON.stringify(resp.data, null, 2));
        } catch (apiErr) {
            if (apiErr.response) {
                console.error(`\n  ✗ DEPOSIT Error (${apiErr.response.status}):`);
                console.error(JSON.stringify(apiErr.response.data, null, 2));
            } else {
                console.error(`\n  ✗ DEPOSIT Error: ${apiErr.message}`);
            }
        }

        // Step 4: Test V3 withdraw/bank
        console.log('\n[Step 4] Testing V3 withdraw/bank...');
        const payoutRefId = `TPPOUT_${Date.now()}`;
        const payoutBody = {
            ref_id: payoutRefId,
            txn_amount: '500',
            bank_account: '1234567890',
            bank_code: 'SBIN0001234',
            payee_name: 'Test Payout User',
            webhook_url: `${APP_URL}/callback/testpay/payout`
        };

        const payoutSig = generateSignature(payoutBody, m.apiSecret);
        console.log(`  Ref ID: ${payoutRefId}`);

        try {
            const resp = await axios.post(`${APP_URL}/v3/withdraw/bank`, payoutBody, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'x-merchant-id': m.apiKey,
                    'x-signature': payoutSig
                },
                timeout: 15000
            });
            console.log(`\n  ✓ PAYOUT Response (${resp.status}):`);
            console.log(JSON.stringify(resp.data, null, 2));
        } catch (apiErr) {
            if (apiErr.response) {
                console.error(`\n  ✗ PAYOUT Error (${apiErr.response.status}):`);
                console.error(JSON.stringify(apiErr.response.data, null, 2));
            } else {
                console.error(`\n  ✗ PAYOUT Error: ${apiErr.message}`);
            }
        }

        // Step 5: Wait for auto-callbacks and query
        console.log('\n[Step 5] Waiting 8s for auto-callbacks...');
        await new Promise(r => setTimeout(r, 8000));

        // Query deposit status
        console.log('  Querying deposit status...');
        const qBody = { ref_id: refId };
        const qSig = generateSignature(qBody, m.apiSecret);
        try {
            const resp = await axios.post(`${APP_URL}/v3/deposit/query`, qBody, {
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'x-merchant-id': m.apiKey, 'x-signature': qSig },
                timeout: 10000
            });
            console.log(`  ✓ Deposit Query:`);
            console.log(JSON.stringify(resp.data, null, 2));
        } catch (err) {
            console.error('  ✗ Deposit Query Error:', err.response?.data || err.message);
        }

        // Query payout status
        console.log('\n  Querying payout status...');
        const qpBody = { ref_id: payoutRefId };
        const qpSig = generateSignature(qpBody, m.apiSecret);
        try {
            const resp = await axios.post(`${APP_URL}/v3/withdraw/query`, qpBody, {
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'x-merchant-id': m.apiKey, 'x-signature': qpSig },
                timeout: 10000
            });
            console.log(`  ✓ Payout Query:`);
            console.log(JSON.stringify(resp.data, null, 2));
        } catch (err) {
            console.error('  ✗ Payout Query Error:', err.response?.data || err.message);
        }

        console.log('\n===========================================');
        console.log('  ✅ All Tests Complete');
        console.log('===========================================');

    } catch (err) {
        console.error('Fatal:', err.message);
    }

    process.exit(0);
}

run();
