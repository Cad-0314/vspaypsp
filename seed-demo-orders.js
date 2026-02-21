/**
 * Seed Demo Orders
 * Inserts realistic payin & payout orders for the last 7 days (Feb 15-21, 2026)
 * Daily volume: ~1.2 CR to ~1.8 CR
 * Run: node seed-demo-orders.js
 */

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        dialect: 'mysql',
        logging: false
    }
);

// Channels to distribute orders across
const channels = ['bharatpay', 'cxpay', 'aapay', 'ipay'];

// Fee rate (5% payin, 3% payout)
const PAYIN_FEE_RATE = 0.05;
const PAYOUT_FEE_RATE = 0.03;

// Amount ranges for realistic orders (INR)
const PAYIN_AMOUNTS = [
    500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000,
    6000, 7000, 7500, 8000, 8500, 9000, 9500, 10000,
    12000, 15000, 18000, 20000, 25000, 30000, 35000, 40000, 45000, 50000
];

const PAYOUT_AMOUNTS = [
    5000, 8000, 10000, 12000, 15000, 20000, 25000, 30000, 40000, 50000
];

// Generate a random amount from the list
function randomAmount(list) {
    return list[Math.floor(Math.random() * list.length)];
}

// Generate random hour/minute/second for a given date
function randomTimeOnDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00+05:30');
    // Business hours spread: 8 AM to 11 PM IST
    const hour = 8 + Math.floor(Math.random() * 15);
    const minute = Math.floor(Math.random() * 60);
    const second = Math.floor(Math.random() * 60);
    d.setUTCHours(hour - 5, minute - 30 + 30, second); // Adjust for IST offset
    // Simpler: just set hours directly
    const result = new Date(dateStr + 'T00:00:00.000Z');
    result.setUTCHours(hour, minute, second);
    return result;
}

// Generate a fake UTR number
function generateUTR() {
    const banks = ['UBIN', 'SBIN', 'HDFC', 'ICIC', 'AXIS', 'PUNB', 'BARB'];
    const bank = banks[Math.floor(Math.random() * banks.length)];
    const num = Math.floor(Math.random() * 9000000000) + 1000000000;
    return `${bank}${num}`;
}

// Generate a merchant-style order ID
function generateOrderId() {
    const ts = Date.now() + Math.floor(Math.random() * 1000000);
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `ORD${ts}${rand}`;
}

async function seedOrders() {
    try {
        await sequelize.authenticate();
        console.log('Connected to database.');

        // First, find a valid merchantId from the users table
        const [merchants] = await sequelize.query(
            `SELECT id, username FROM users WHERE role = 'merchant' LIMIT 5`
        );

        if (merchants.length === 0) {
            // If no merchants, try admin
            const [admins] = await sequelize.query(
                `SELECT id, username FROM users LIMIT 1`
            );
            if (admins.length === 0) {
                console.error('No users found in database. Cannot create orders.');
                process.exit(1);
            }
            merchants.push(admins[0]);
        }

        console.log(`Found ${merchants.length} merchant(s):`, merchants.map(m => `${m.username} (ID: ${m.id})`));

        // Dates: Feb 15-21, 2026
        const dates = [
            '2026-02-15',
            '2026-02-16',
            '2026-02-17',
            '2026-02-18',
            '2026-02-19',
            '2026-02-20',
            '2026-02-21'
        ];

        // Target daily volumes (in INR) - between 1.2 CR and 1.8 CR
        const dailyTargets = [
            13500000,  // 1.35 CR
            15200000,  // 1.52 CR
            12800000,  // 1.28 CR
            17100000,  // 1.71 CR
            14600000,  // 1.46 CR
            16300000,  // 1.63 CR
            13900000   // 1.39 CR  (today)
        ];

        let totalInserted = 0;
        const allOrders = [];

        for (let dayIdx = 0; dayIdx < dates.length; dayIdx++) {
            const dateStr = dates[dayIdx];
            const targetVolume = dailyTargets[dayIdx];

            // 80% payin, 20% payout
            const payinTarget = Math.floor(targetVolume * 0.80);
            const payoutTarget = Math.floor(targetVolume * 0.20);

            console.log(`\n--- ${dateStr} ---`);
            console.log(`  Target Volume: ₹${(targetVolume / 10000000).toFixed(2)} CR`);
            console.log(`  Payin Target:  ₹${(payinTarget / 10000000).toFixed(2)} CR`);
            console.log(`  Payout Target: ₹${(payoutTarget / 10000000).toFixed(2)} CR`);

            // Generate PAYIN orders
            let payinAccum = 0;
            let payinCount = 0;
            while (payinAccum < payinTarget) {
                const amount = randomAmount(PAYIN_AMOUNTS);
                if (payinAccum + amount > payinTarget * 1.05) break; // Don't overshoot too much

                const fee = parseFloat((amount * PAYIN_FEE_RATE).toFixed(2));
                const netAmount = parseFloat((amount - fee).toFixed(2));
                const merchant = merchants[Math.floor(Math.random() * merchants.length)];
                const channel = channels[Math.floor(Math.random() * channels.length)];
                const createdAt = randomTimeOnDate(dateStr);

                allOrders.push({
                    id: uuidv4(),
                    merchantId: merchant.id,
                    orderId: generateOrderId(),
                    channelName: channel,
                    type: 'payin',
                    amount: amount,
                    fee: fee,
                    netAmount: netAmount,
                    status: 'success',
                    utr: generateUTR(),
                    callbackSent: true,
                    callbackAttempts: 1,
                    createdAt: createdAt,
                    updatedAt: createdAt
                });

                payinAccum += amount;
                payinCount++;
            }

            // Generate PAYOUT orders
            let payoutAccum = 0;
            let payoutCount = 0;
            while (payoutAccum < payoutTarget) {
                const amount = randomAmount(PAYOUT_AMOUNTS);
                if (payoutAccum + amount > payoutTarget * 1.05) break;

                const fee = parseFloat((amount * PAYOUT_FEE_RATE + 6).toFixed(2)); // 3% + ₹6 fixed
                const netAmount = parseFloat((amount - fee).toFixed(2));
                const merchant = merchants[Math.floor(Math.random() * merchants.length)];
                const channel = channels[Math.floor(Math.random() * channels.length)];
                const createdAt = randomTimeOnDate(dateStr);

                allOrders.push({
                    id: uuidv4(),
                    merchantId: merchant.id,
                    orderId: generateOrderId(),
                    channelName: channel,
                    type: 'payout',
                    payoutType: 'bank',
                    amount: amount,
                    fee: fee,
                    netAmount: netAmount,
                    status: 'success',
                    utr: generateUTR(),
                    callbackSent: true,
                    callbackAttempts: 1,
                    payoutDetails: JSON.stringify({
                        bankName: 'State Bank of India',
                        accountNumber: `${Math.floor(Math.random() * 9000000000) + 1000000000}`,
                        ifsc: 'SBIN0001234',
                        accountName: 'Demo User'
                    }),
                    createdAt: createdAt,
                    updatedAt: createdAt
                });

                payoutAccum += amount;
                payoutCount++;
            }

            // Also add some failed/pending for realism
            const failedCount = Math.floor(payinCount * 0.15); // ~15% failed
            for (let f = 0; f < failedCount; f++) {
                const amount = randomAmount(PAYIN_AMOUNTS);
                const fee = parseFloat((amount * PAYIN_FEE_RATE).toFixed(2));
                const netAmount = parseFloat((amount - fee).toFixed(2));
                const merchant = merchants[Math.floor(Math.random() * merchants.length)];
                const channel = channels[Math.floor(Math.random() * channels.length)];
                const createdAt = randomTimeOnDate(dateStr);

                allOrders.push({
                    id: uuidv4(),
                    merchantId: merchant.id,
                    orderId: generateOrderId(),
                    channelName: channel,
                    type: 'payin',
                    amount: amount,
                    fee: fee,
                    netAmount: netAmount,
                    status: 'failed',
                    callbackSent: true,
                    callbackAttempts: 1,
                    createdAt: createdAt,
                    updatedAt: createdAt
                });
            }

            console.log(`  Payin:  ${payinCount} orders = ₹${(payinAccum / 10000000).toFixed(2)} CR`);
            console.log(`  Payout: ${payoutCount} orders = ₹${(payoutAccum / 10000000).toFixed(2)} CR`);
            console.log(`  Failed: ${failedCount} orders (for realism)`);
            console.log(`  Total:  ₹${((payinAccum + payoutAccum) / 10000000).toFixed(2)} CR`);
        }

        console.log(`\n========================================`);
        console.log(`Total orders to insert: ${allOrders.length}`);
        console.log(`========================================\n`);

        // Batch insert in chunks of 100
        const BATCH_SIZE = 100;
        for (let i = 0; i < allOrders.length; i += BATCH_SIZE) {
            const batch = allOrders.slice(i, i + BATCH_SIZE);

            const values = batch.map(o => {
                const payoutType = o.payoutType ? `'${o.payoutType}'` : 'NULL';
                const utr = o.utr ? `'${o.utr}'` : 'NULL';
                const payoutDetails = o.payoutDetails ? `'${o.payoutDetails.replace(/'/g, "\\'")}'` : 'NULL';

                return `('${o.id}', ${o.merchantId}, '${o.orderId}', '${o.channelName}', '${o.type}', ${payoutType}, ${o.amount}, ${o.fee}, ${o.netAmount}, '${o.status}', ${utr}, 'NULL', ${o.callbackSent ? 1 : 0}, ${o.callbackAttempts}, ${payoutDetails}, '${o.createdAt.toISOString().replace('T', ' ').replace('Z', '')}', '${o.updatedAt.toISOString().replace('T', ' ').replace('Z', '')}')`;
            }).join(',\n');

            const sql = `INSERT INTO orders (id, merchantId, orderId, channelName, type, payoutType, amount, fee, netAmount, status, utr, providerOrderId, callbackSent, callbackAttempts, payoutDetails, createdAt, updatedAt) VALUES ${values}`;

            await sequelize.query(sql);
            totalInserted += batch.length;
            process.stdout.write(`\rInserted: ${totalInserted}/${allOrders.length}`);
        }

        console.log('\n\n✅ Demo orders seeded successfully!');
        console.log(`Total inserted: ${totalInserted} orders`);

        // Show summary
        const [summary] = await sequelize.query(`
            SELECT 
                DATE(createdAt) as date,
                type,
                COUNT(*) as count,
                SUM(amount) as volume
            FROM orders 
            WHERE createdAt >= '2026-02-15' AND createdAt <= '2026-02-22'
            AND status = 'success'
            GROUP BY DATE(createdAt), type
            ORDER BY date, type
        `);

        console.log('\n📊 Volume Summary (Success Only):');
        console.log('================================');
        for (const row of summary) {
            console.log(`  ${row.date} | ${row.type.padEnd(7)} | ${row.count} orders | ₹${(parseFloat(row.volume) / 10000000).toFixed(2)} CR`);
        }

        process.exit(0);

    } catch (error) {
        console.error('Error seeding orders:', error);
        process.exit(1);
    }
}

seedOrders();
