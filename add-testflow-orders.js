/**
 * Continuous High-Frequency Mock Orders for 'testflow' Merchant
 * Payin: 5-8 per min (65% success)
 * Payout: 1-3 per min (75% success)
 * Back-seeds 24 hours and can be run continuously.
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

const MERCHANT_ID = 24; 
const CHANNELS = ['hdpay', 'yellow', 'payable', 'x2', 'upi super', 'cxpay', 'aapay', 'ipay', 'unitedpay', 'unitedpay', 'firpay', 'agpay', 'easypay', 'ynpay', 'passpay'];

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateUTR() {
    const banks = ['UBIN', 'SBIN', 'HDFC', 'ICIC', 'AXIS', 'PUNB', 'BARB'];
    const bank = banks[Math.floor(Math.random() * banks.length)];
    const num = Math.floor(Math.random() * 9000000000) + 1000000000;
    return `${bank}${num}`;
}

function generateOrderId(type) {
    const ts = Date.now();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${type === 'payin' ? 'PI' : 'PO'}${ts}${rand}`;
}

async function createMinuteOrders(minuteDate) {
    const orders = [];
    
    // Payin: 5-8 per min, ~65% success
    const payinCount = randomInt(5, 8);
    for (let i = 0; i < payinCount; i++) {
        const amount = randomInt(100, 2000);
        const fee = parseFloat((amount * 0.05).toFixed(2));
        const status = Math.random() < 0.65 ? 'success' : 'failed';
        const createdAt = new Date(minuteDate.getTime() + randomInt(0, 59999));
        const dateStr = createdAt.toISOString().slice(0, 19).replace('T', ' ');

        orders.push({
            id: uuidv4(),
            merchantId: MERCHANT_ID,
            orderId: generateOrderId('payin'),
            channelName: CHANNELS[randomInt(0, CHANNELS.length - 1)],
            type: 'payin',
            amount: amount,
            fee: fee,
            netAmount: parseFloat((amount - fee).toFixed(2)),
            status: status,
            utr: status === 'success' ? generateUTR() : null,
            callbackSent: 1,
            callbackAttempts: 1,
            createdAt: dateStr,
            updatedAt: dateStr
        });
    }

    // Payout: 1-3 per min, ~75% success
    const payoutCount = randomInt(1, 3);
    for (let i = 0; i < payoutCount; i++) {
        const amount = randomInt(100, 2000);
        const fee = parseFloat((amount * 0.03 + 6).toFixed(2));
        const status = Math.random() < 0.75 ? 'success' : 'failed';
        const createdAt = new Date(minuteDate.getTime() + randomInt(0, 59999));
        const dateStr = createdAt.toISOString().slice(0, 19).replace('T', ' ');

        orders.push({
            id: uuidv4(),
            merchantId: MERCHANT_ID,
            orderId: generateOrderId('payout'),
            channelName: CHANNELS[randomInt(0, CHANNELS.length - 1)],
            type: 'payout',
            payoutType: 'bank',
            amount: amount,
            fee: fee,
            netAmount: parseFloat((amount - fee).toFixed(2)),
            status: status,
            utr: status === 'success' ? generateUTR() : null,
            callbackSent: 1,
            callbackAttempts: 1,
            createdAt: dateStr,
            updatedAt: dateStr,
            payoutDetails: JSON.stringify({
                bankName: 'Federal Bank',
                accountNumber: `${randomInt(1000000000, 9999999999)}`,
                ifsc: 'FDRL0001234',
                accountName: 'Streaming User'
            })
        });
    }

    return orders;
}

async function startSeeding() {
    try {
        await sequelize.authenticate();
        console.log('DB Connected.');

        // 1. Clear existing orders for merchant 24
        console.log('Clearing old orders for merchant 24...');
        await sequelize.query(`DELETE FROM orders WHERE merchantId = ${MERCHANT_ID}`);

        // 2. Back-seed 24 hours
        const now = new Date();
        const startTime = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        console.log(`Back-seeding from ${startTime.toLocaleString()} to ${now.toLocaleString()}...`);

        let totalInserted = 0;
        for (let m = 0; m < 1440; m++) {
            const minuteDate = new Date(startTime.getTime() + (m * 60 * 1000));
            const batch = await createMinuteOrders(minuteDate);
            
            const values = batch.map(o => {
                const payoutType = o.payoutType ? `'${o.payoutType}'` : 'NULL';
                const utr = o.utr ? `'${o.utr}'` : 'NULL';
                const payoutDetails = o.payoutDetails ? `'${o.payoutDetails.replace(/'/g, "\\'")}'` : 'NULL';
                return `('${o.id}', ${o.merchantId}, '${o.orderId}', '${o.channelName}', '${o.type}', ${payoutType}, ${o.amount}, ${o.fee}, ${o.netAmount}, '${o.status}', ${utr}, 'NULL', ${o.callbackSent}, ${o.callbackAttempts}, ${payoutDetails}, '${o.createdAt}', '${o.updatedAt}')`;
            }).join(',\n');

            const sql = `INSERT INTO orders (id, merchantId, orderId, channelName, type, payoutType, amount, fee, netAmount, status, utr, providerOrderId, callbackSent, callbackAttempts, payoutDetails, createdAt, updatedAt) VALUES ${values}`;
            await sequelize.query(sql);
            totalInserted += batch.length;
            if (m % 60 === 0) process.stdout.write(`\rProgress: ${Math.round(m / 1440 * 100)}% (Inserted: ${totalInserted})`);
        }

        console.log(`\n✅ Back-seeding complete. Total: ${totalInserted} orders.`);
        
        // 3. Keep moving (Continuous mode - optional check)
        if (process.argv.includes('--continuous')) {
            console.log('Starting continuous generation (every 1 minute)...');
            setInterval(async () => {
                const currentMinute = new Date();
                const batch = await createMinuteOrders(currentMinute);
                // Simple singular insert for continuous
                for (const o of batch) {
                    const payoutType = o.payoutType ? `'${o.payoutType}'` : 'NULL';
                    const utr = o.utr ? `'${o.utr}'` : 'NULL';
                    const payoutDetails = o.payoutDetails ? `'${o.payoutDetails.replace(/'/g, "\\'")}'` : 'NULL';
                    const sql = `INSERT INTO orders (id, merchantId, orderId, channelName, type, payoutType, amount, fee, netAmount, status, utr, providerOrderId, callbackSent, callbackAttempts, payoutDetails, createdAt, updatedAt) VALUES ('${o.id}', ${o.merchantId}, '${o.orderId}', '${o.channelName}', '${o.type}', ${payoutType}, ${o.amount}, ${o.fee}, ${o.netAmount}, '${o.status}', ${utr}, 'NULL', ${o.callbackSent}, ${o.callbackAttempts}, ${payoutDetails}, '${o.createdAt}', '${o.updatedAt}')`;
                    await sequelize.query(sql);
                }
                console.log(`[${currentMinute.toLocaleTimeString()}] Added ${batch.length} new orders.`);
            }, 60000);
        } else {
            process.exit(0);
        }

    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

startSeeding();
