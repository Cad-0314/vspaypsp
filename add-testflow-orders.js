/**
 * Adjusted Mock Orders for 'testflow' Merchant
 * precisely 5 orders per minute (1 every 12 seconds)
 * ending at 2026-03-17 13:11:00 IST
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
const TOTAL_ORDERS = 1440 * 5; // 7200 orders for 24 hours
const SUCCESS_RATE = 0.635; // 63.5%

const CHANNELS = ['hdpay', 'yellow', 'payable', 'x2', 'upi super', 'cxpay', 'aapay', 'ipay', 'unitedpay'];

function generateUTR() {
    const banks = ['UBIN', 'SBIN', 'HDFC', 'ICIC', 'AXIS', 'PUNB', 'BARB'];
    const bank = banks[Math.floor(Math.random() * banks.length)];
    const num = Math.floor(Math.random() * 9000000000) + 1000000000;
    return `${bank}${num}`;
}

function generateOrderId(type) {
    const ts = Date.now() + Math.random();
    return `${type === 'payin' ? 'PI' : 'PO'}${Math.floor(ts)}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
}

async function adjustOrders() {
    try {
        await sequelize.authenticate();
        console.log('Connected.');

        // 1. Delete old orders for this merchant
        console.log('Clearing existing orders for merchant 24...');
        await sequelize.query(`DELETE FROM orders WHERE merchantId = ${MERCHANT_ID}`);

        const allOrders = [];
        // End time: 2026-03-17 13:11:00 (Local IST)
        const endTime = new Date(2026, 2, 17, 13, 11, 0); 
        let baseTime = endTime.getTime();

        console.log(`Generating 7200 orders ending at ${endTime.toLocaleString()}...`);

        for (let i = 0; i < TOTAL_ORDERS; i++) {
            const isPayin = i % 2 === 0; // 50/50 split
            const type = isPayin ? 'payin' : 'payout';
            const amount = Math.floor(Math.random() * (2000 - 100 + 1)) + 100;
            const feeRate = isPayin ? 0.05 : 0.03;
            const fee = parseFloat((amount * feeRate + (isPayin ? 0 : 6)).toFixed(2));
            const netAmount = parseFloat((amount - fee).toFixed(2));
            const status = Math.random() < SUCCESS_RATE ? 'success' : 'failed';
            const channel = CHANNELS[Math.floor(Math.random() * CHANNELS.length)];
            
            // Exactly 12 seconds per order, going backwards
            const createdAt = new Date(baseTime - (i * 12 * 1000));
            const dateStr = createdAt.getFullYear() + '-' + 
                           String(createdAt.getMonth() + 1).padStart(2, '0') + '-' + 
                           String(createdAt.getDate()).padStart(2, '0') + ' ' + 
                           String(createdAt.getHours()).padStart(2, '0') + ':' + 
                           String(createdAt.getMinutes()).padStart(2, '0') + ':' + 
                           String(createdAt.getSeconds()).padStart(2, '0');

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
                createdAt: dateStr,
                updatedAt: dateStr
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

        console.log(`Inserting ${allOrders.length} orders...`);
        const BATCH_SIZE = 500;
        for (let i = 0; i < allOrders.length; i += BATCH_SIZE) {
            const batch = allOrders.slice(i, i + BATCH_SIZE);
            const values = batch.map(o => {
                const payoutType = o.payoutType ? `'${o.payoutType}'` : 'NULL';
                const utr = o.utr ? `'${o.utr}'` : 'NULL';
                const payoutDetails = o.payoutDetails ? `'${o.payoutDetails.replace(/'/g, "\\'")}'` : 'NULL';
                return `('${o.id}', ${o.merchantId}, '${o.orderId}', '${o.channelName}', '${o.type}', ${payoutType}, ${o.amount}, ${o.fee}, ${o.netAmount}, '${o.status}', ${utr}, 'NULL', ${o.callbackSent}, ${o.callbackAttempts}, ${payoutDetails}, '${o.createdAt}', '${o.updatedAt}')`;
            }).join(',\n');

            const sql = `INSERT INTO orders (id, merchantId, orderId, channelName, type, payoutType, amount, fee, netAmount, status, utr, providerOrderId, callbackSent, callbackAttempts, payoutDetails, createdAt, updatedAt) VALUES ${values}`;
            await sequelize.query(sql);
            process.stdout.write(`\rInserted: ${Math.min(i + BATCH_SIZE, allOrders.length)}/${allOrders.length}`);
        }

        console.log('\n✅ Orders adjusted successfully.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

adjustOrders();
