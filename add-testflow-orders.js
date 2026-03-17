/**
 * Authentic Mock Orders for 'testflow' Merchant
 * Total orders: 250 for 24 hours
 * Distribution: Non-uniform (Peak/Quiet hours)
 * Success Rate: Strictly 62-64% with local variance
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
const TOTAL_ORDERS = 250; 
const TARGET_SUCCESS_RATE = 0.63; // 63%
const TOTAL_SUCCESSES = Math.round(TOTAL_ORDERS * TARGET_SUCCESS_RATE); // ~158

const CHANNELS = ['hdpay', 'yellow', 'payable', 'x2', 'upi super', 'cxpay', 'aapay', 'ipay', 'unitedpay'];

const HOURLY_WEIGHTS = [
    5, 3, 2, 1, 1, 2, 5, 8, 12, 15, 
    18, 20, 22, 20, 18, 16, 18, 20, 
    22, 25, 20, 15, 10, 8           
];

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

async function refineForRealism() {
    try {
        await sequelize.authenticate();
        console.log('Connected.');

        console.log('Clearing existing orders for merchant 24...');
        await sequelize.query(`DELETE FROM orders WHERE merchantId = ${MERCHANT_ID}`);

        const allOrders = [];
        const endTime = new Date(2026, 2, 17, 13, 14, 0).getTime();
        const startTime = endTime - (24 * 60 * 60 * 1000);

        const totalWeight = HOURLY_WEIGHTS.reduce((a, b) => a + b, 0);
        let ordersCreated = 0;

        // Pre-create status array to ensure exact success rate
        const statuses = new Array(TOTAL_ORDERS).fill('failed');
        for (let s = 0; s < TOTAL_SUCCESSES; s++) statuses[s] = 'success';
        // Shuffle statuses
        for (let s = statuses.length - 1; s > 0; s--) {
            const j = Math.floor(Math.random() * (s + 1));
            [statuses[s], statuses[j]] = [statuses[j], statuses[s]];
        }

        console.log(`Generating 250 authentic orders with peak/quiet hours and 63% success rate...`);

        for (let i = 0; i < 24; i++) {
            const currentHourTime = startTime + (i * 60 * 60 * 1000);
            const targetHour = new Date(currentHourTime).getHours();
            const hourOrderCount = i === 23 ? TOTAL_ORDERS - ordersCreated : Math.round((HOURLY_WEIGHTS[targetHour] / totalWeight) * TOTAL_ORDERS);

            for (let j = 0; j < hourOrderCount; j++) {
                if (ordersCreated >= TOTAL_ORDERS) break;

                const isPayin = Math.random() < 0.5;
                const type = isPayin ? 'payin' : 'payout';
                const amount = Math.floor(Math.random() * (2000 - 100 + 1)) + 100;
                const feeRate = isPayin ? 0.05 : 0.03;
                const fee = parseFloat((amount * feeRate + (isPayin ? 0 : 6)).toFixed(2));
                const netAmount = parseFloat((amount - fee).toFixed(2));
                const status = statuses[ordersCreated];
                const channel = CHANNELS[Math.floor(Math.random() * CHANNELS.length)];
                
                const randomMinute = Math.floor(Math.random() * 60);
                const randomSecond = Math.floor(Math.random() * 60);
                const createdAt = new Date(currentHourTime);
                createdAt.setMinutes(randomMinute);
                createdAt.setSeconds(randomSecond);
                
                if (createdAt.getTime() > endTime && i < 23) continue; 

                const dateStr = createdAt.toISOString().slice(0, 19).replace('T', ' ');

                allOrders.push({
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
                    updatedAt: dateStr,
                    payoutType: type === 'payout' ? 'bank' : null,
                    payoutDetails: type === 'payout' ? JSON.stringify({
                        bankName: 'Axis Bank',
                        accountNumber: `${Math.floor(Math.random() * 9000000000) + 1000000000}`,
                        ifsc: 'UTIB0001234',
                        accountName: 'Test Account'
                    }) : null
                });
                ordersCreated++;
            }
        }

        // Sort by createdAt
        allOrders.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        console.log(`Inserting ${allOrders.length} orders...`);
        const BATCH_SIZE = 50;
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

        console.log(`\n✅ Done. Final Success Rate: ${((allOrders.filter(o => o.status === 'success').length / allOrders.length) * 100).toFixed(2)}%`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

refineForRealism();
