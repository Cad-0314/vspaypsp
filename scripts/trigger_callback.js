/**
 * Look up order 490748688 and trigger a callback
 */
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

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
    console.log('  Trigger Callback for Order 490748688');
    console.log('===========================================\n');

    let conn;
    try {
        conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            connectTimeout: 10000
        });

        const orderId = '490748688';
        console.log(`[Step 1] Looking up order: ${orderId}...`);
        
        // Search by orderId or providerOrderId
        const [orders] = await conn.execute(
            'SELECT * FROM orders WHERE orderId = ? OR providerOrderId = ?',
            [orderId, orderId]
        );

        if (orders.length === 0) {
            console.error(`  ✗ Order ${orderId} not found in the database.`);
            return;
        }

        const order = orders[0];
        console.log(`  ✓ Found Order (ID: ${order.id}, Type: ${order.type})`);
        console.log(`    Status:        ${order.status}`);
        console.log(`    Amount:        ${order.amount}`);
        console.log(`    Callback URL:  ${order.callbackUrl}`);
        console.log(`    Merchant ID:   ${order.merchantId}`);
        
        if (!order.callbackUrl) {
            console.error(`  ✗ Order does not have a callbackUrl defined.`);
            return;
        }

        // Get merchant details for secret
        const [users] = await conn.execute(
            'SELECT username, apiSecret FROM users WHERE id = ?',
            [order.merchantId]
        );
        
        if (users.length === 0) {
            console.error(`  ✗ Merchant ID ${order.merchantId} not found.`);
            return;
        }
        const merchant = users[0];
        
        // Build payload matching callbackService.js exact format
        const payload = {
            orderId: order.orderId,
            amount: parseFloat(order.amount).toFixed(2),
            status: order.status === 'success' ? 'SUCCESS' : 'FAIL',
            utr: order.utr || '',
            param: order.param || ''
        };

        payload.sign = generateSignature(payload, merchant.apiSecret);

        console.log('\n[Step 2] Sending Callback...');
        console.log(`  URL: ${order.callbackUrl}`);
        console.log(`  Payload:`, JSON.stringify(payload, null, 2));

        try {
            const resp = await axios.post(order.callbackUrl, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });
            console.log(`\n  ✓ Callback Response (${resp.status}):`);
            if (typeof resp.data === 'object') {
                console.log(JSON.stringify(resp.data, null, 2));
            } else {
                console.log('  ' + resp.data);
            }
        } catch (err) {
            if (err.response) {
                console.error(`\n  ✗ Callback Failed (${err.response.status}):`);
                if (typeof err.response.data === 'object') {
                    console.error(JSON.stringify(err.response.data, null, 2));
                } else {
                    console.error('  ' + err.response.data);
                }
            } else {
                console.error(`\n  ✗ Callback Failed: ${err.message}`);
            }
        }

    } catch (err) {
        console.error('Fatal:', err.message);
    } finally {
        if (conn) await conn.end();
        process.exit(0);
    }
}

run();
