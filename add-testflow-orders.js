/**
 * Add Mock Orders for 'testflow' Merchant
 * Over the last 24 hours (2026-03-16 13:30 to 2026-03-17 13:30)
 * Total orders: ~7,200 (5 orders per minute)
 * Ratio: 50% Payin, 50% Payout
 * Amount: 100 - 2000 INR
 * Success Rate: 62% - 64%
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

const MERCHANT_ID = 24; // testflow
const START_TIME = new Date('2026-03-16T13:30:00Z');
const END_TIME = new Date('2026-03-17T13:30:00Z');
const TOTAL_MINUTES = 24 * 60;
const ORDERS_PER_MINUTE = 5;
const TOTAL_ORDERS = TOTAL_MINUTES * ORDERS_PER_MINUTE;

const CHANNELS = ['hdpay', 'yellow', 'payable', 'x2', 'upi super', 'cxpay', 'aapay', 'ipay', 'unitedpay'];

function randomInRange(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateUTR() {
    const banks = ['UBIN', 'SBIN', 'HDFC', 'ICIC', 'AXIS', 'PUNB', 'BARB'];
    const bank = banks[Math.floor(Math.random() * banks.length)];
    const num = Math.floor(Math.random() * 9000000000) + 1000000000;
    return `${bank}${num}`;
}

function generateOrderId(type) {
    const ts = Date.now() + Math.floor(Math.random() * 1000000);
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${type === 'payin' ? 'PI' : 'PO'}${ts}${rand}`;
}

async function addOrders() {
    try {
        await sequelize.authenticate();
        console.log('Connected to database.');

        const allOrders = [];
        const successRate = 0.62 + (Math.random() * 0.02); // 62% to 64%
        
        console.log(`Targeting Success Rate: ${(successRate * 100).toFixed(2)}%`);
        console.log(`Generating ~${TOTAL_ORDERS} orders...`);

        for (let i = 0; i < TOTAL_ORDERS; i++) {
            const isPayin = Math.random() < 0.5;
            const type = isPayin ? 'payin' : 'payout';
            const amount = randomInRange(100, 2000);
            const feeRate = isPayin ? 0.05 : 0.03;
            const fee = parseFloat((amount * feeRate + (isPayin ? 0 : 6)).toFixed(2));
            const netAmount = parseFloat((amount - fee).toFixed(2));
            const status = Math.random() < successRate ? 'success' : 'failed';
            const channel = CHANNELS[Math.floor(Math.random() * CHANNELS.length)];
            
            // Distribute across the 24 hours
            const randomOffset = Math.floor(Math.random() * TOTAL_MINUTES * 60 * 1000);
            const createdAt = new Date(START_TIME.getTime() + randomOffset);
            
            const order = {
                id: uuidv4(),
                merchantId: MERCHANT_ID,
                orderId: generateOrderId(type),
                channelName: channel,
                type: type,
                amount: amount,
                fee: fee,
                netAmount: netAmount,
                status: status,
                utr: status === 'success' ? generateUTR() : null,
                callbackSent: 1,
                callbackAttempts: 1,
                createdAt: createdAt,
                updatedAt: createdAt
            };

            if (type === 'payout') {
                order.payoutType = 'bank';
                order.payoutDetails = JSON.stringify({
                    bankName: 'HDFC Bank',
                    accountNumber: `${Math.floor(Math.random() * 9000000000) + 1000000000}`,
                    ifsc: 'HDFC0001234',
                    accountName: 'Test Flow User'
                });
            }

            allOrders.push(order);
        }

        // Sort by createdAt for chronological insertion (optional but nice)
        allOrders.sort((a, b) => a.createdAt - b.createdAt);

        console.log(`Inserting ${allOrders.length} orders...`);

        const BATCH_SIZE = 500;
        let totalInserted = 0;

        for (let i = 0; i < allOrders.length; i += BATCH_SIZE) {
            const batch = allOrders.slice(i, i + BATCH_SIZE);
            const values = batch.map(o => {
                const payoutType = o.payoutType ? `'${o.payoutType}'` : 'NULL';
                const utr = o.utr ? `'${o.utr}'` : 'NULL';
                const payoutDetails = o.payoutDetails ? `'${o.payoutDetails.replace(/'/g, "\\'")}'` : 'NULL';
                const createdAt = o.createdAt.toISOString().slice(0, 19).replace('T', ' ');
                const updatedAt = o.updatedAt.toISOString().slice(0, 19).replace('T', ' ');

                return `('${o.id}', ${o.merchantId}, '${o.orderId}', '${o.channelName}', '${o.type}', ${payoutType}, ${o.amount}, ${o.fee}, ${o.netAmount}, '${o.status}', ${utr}, 'NULL', ${o.callbackSent}, ${o.callbackAttempts}, ${payoutDetails}, '${createdAt}', '${updatedAt}')`;
            }).join(',\n');

            const sql = `INSERT INTO orders (id, merchantId, orderId, channelName, type, payoutType, amount, fee, netAmount, status, utr, providerOrderId, callbackSent, callbackAttempts, payoutDetails, createdAt, updatedAt) VALUES ${values}`;
            await sequelize.query(sql);
            totalInserted += batch.length;
            process.stdout.write(`\rInserted: ${totalInserted}/${allOrders.length}`);
        }

        console.log('\n\n✅ Mock orders for testflow created successfully!');
        
        // Final verification summary
        const [summary] = await sequelize.query(`
            SELECT 
                type,
                status,
                COUNT(*) as count,
                AVG(amount) as avg_amount
            FROM orders 
            WHERE merchantId = ${MERCHANT_ID} 
              AND createdAt >= '${START_TIME.toISOString().slice(0, 19).replace('T', ' ')}'
            GROUP BY type, status
        `);
        console.table(summary);

        process.exit(0);
    } catch (error) {
        console.error('Error adding orders:', error);
        process.exit(1);
    }
}

addOrders();
