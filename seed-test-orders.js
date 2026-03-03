/**
 * Seed Test Orders for Merchant Demo Flow (v4)
 * 
 * Dashboard success rate formula (merchant.ejs line 1928):
 *   success / (success + failed)  — pending is NOT included
 *
 * Target metrics:
 * - Payin success volume today: ~₹70,00,000 (70 lakh)
 * - Payout success volume today: ~₹20,00,000 (20 lakh)
 * - Pending payin orders: 376
 * - Success rate: ~63%  =>  38/(38+22) = 63.3% → rounds to 63%
 * - Yesterday payin success: ~₹2,00,00,000 (2 crore)
 * - Merchant available balance: ₹15,00,000
 */

const { sequelize, Order, User } = require('./src/models');
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');

const CHANNELS = ['gaurpay', 'bharatpay', 'cxpay', 'aapay', 'ipay', 'unitedpay'];

function randomChannel() {
    return CHANNELS[Math.floor(Math.random() * CHANNELS.length)];
}

function randomAmount(min, max) {
    return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

/** Random time today (midnight to now) */
function randomTimeToday() {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    return new Date(todayStart.getTime() + Math.random() * (now.getTime() - todayStart.getTime()));
}

/** Random time yesterday */
function randomTimeYesterday() {
    const now = new Date();
    const yesterdayStart = new Date(now);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterdayStart);
    yesterdayEnd.setHours(23, 59, 59, 999);
    return new Date(yesterdayStart.getTime() + Math.random() * (yesterdayEnd.getTime() - yesterdayStart.getTime()));
}

function generateOrderId(prefix, index) {
    return `${prefix}${Date.now()}${index.toString().padStart(4, '0')}`;
}

async function seedTestOrders() {
    try {
        await sequelize.authenticate();
        console.log('Connected to database.');

        const merchant = await User.findOne({ where: { role: 'merchant' } });
        if (!merchant) {
            console.error('No merchant user found!');
            process.exit(1);
        }
        console.log(`Using merchant: ${merchant.username} (ID: ${merchant.id})`);

        // Delete ALL existing orders for this merchant
        const deleted = await Order.destroy({
            where: { merchantId: merchant.id }
        });
        console.log(`Deleted ALL ${deleted} existing orders.`);

        // Update merchant balance
        await merchant.update({ balance: 1500000.00 });
        console.log(`Updated balance to ₹15,00,000`);

        const feeRate = 0.05;
        const orders = [];

        // ============================================================
        // TODAY'S PAYIN ORDERS
        // ============================================================
        // Success rate = success / (success + failed) = 63%
        // 38 / (38 + 22) = 38/60 = 63.3% → .toFixed(0) = 63%
        // Pending: 376 (not included in rate calc)
        // ============================================================

        console.log('\n--- TODAY PAYIN ---');

        // 38 Successful payin orders = ~₹70,00,000
        const successPayinAmounts = [];
        let successPayinTotal = 0;
        const targetSuccessPayin = 7000000;

        for (let i = 0; i < 37; i++) {
            const amt = randomAmount(120000, 250000);
            successPayinAmounts.push(amt);
            successPayinTotal += amt;
        }
        successPayinAmounts.push(parseFloat(Math.max(10000, targetSuccessPayin - successPayinTotal).toFixed(2)));

        for (let i = 0; i < successPayinAmounts.length; i++) {
            const amount = successPayinAmounts[i];
            const fee = parseFloat((amount * feeRate).toFixed(2));
            const netAmount = parseFloat((amount - fee).toFixed(2));
            const createdAt = randomTimeToday();
            orders.push({
                id: uuidv4(), merchantId: merchant.id, orderId: generateOrderId('PI', i),
                channelName: randomChannel(), type: 'payin', amount, fee, netAmount,
                status: 'success', providerOrderId: `UP${Date.now()}${i}`,
                utr: `UTR${Math.floor(Math.random() * 9000000000) + 1000000000}`,
                callbackSent: true, callbackAttempts: 1, createdAt,
                updatedAt: new Date(createdAt.getTime() + Math.random() * 600000)
            });
        }
        console.log(`  Success: ${successPayinAmounts.length} orders`);

        // 22 Failed payin orders
        for (let i = 0; i < 22; i++) {
            const amount = randomAmount(30000, 100000);
            const fee = parseFloat((amount * feeRate).toFixed(2));
            const netAmount = parseFloat((amount - fee).toFixed(2));
            const createdAt = randomTimeToday();
            orders.push({
                id: uuidv4(), merchantId: merchant.id, orderId: generateOrderId('PF', i),
                channelName: randomChannel(), type: 'payin', amount, fee, netAmount,
                status: 'failed', providerOrderId: `UP${Date.now()}F${i}`,
                callbackSent: true, callbackAttempts: 1, createdAt,
                updatedAt: new Date(createdAt.getTime() + Math.random() * 300000)
            });
        }
        console.log(`  Failed: 22 orders`);

        // 376 Pending payin orders
        for (let i = 0; i < 376; i++) {
            const amount = randomAmount(500, 5000);
            const fee = parseFloat((amount * feeRate).toFixed(2));
            const netAmount = parseFloat((amount - fee).toFixed(2));
            const createdAt = randomTimeToday();
            orders.push({
                id: uuidv4(), merchantId: merchant.id, orderId: generateOrderId('PP', i),
                channelName: randomChannel(), type: 'payin', amount, fee, netAmount,
                status: 'pending', providerOrderId: `UP${Date.now()}P${i}`,
                callbackSent: false, callbackAttempts: 0, createdAt,
                updatedAt: createdAt,
                expiresAt: new Date(createdAt.getTime() + 30 * 60000)
            });
        }
        console.log(`  Pending: 376 orders`);

        // ============================================================
        // TODAY'S PAYOUT ORDERS
        // ============================================================

        console.log('\n--- TODAY PAYOUT ---');

        // 28 Success payout = ~₹20,00,000
        const successPayoutAmounts = [];
        let successPayoutTotal = 0;
        const targetSuccessPayout = 2000000;

        for (let i = 0; i < 27; i++) {
            const amt = randomAmount(40000, 100000);
            successPayoutAmounts.push(amt);
            successPayoutTotal += amt;
        }
        successPayoutAmounts.push(parseFloat(Math.max(10000, targetSuccessPayout - successPayoutTotal).toFixed(2)));

        for (let i = 0; i < successPayoutAmounts.length; i++) {
            const amount = successPayoutAmounts[i];
            const fee = parseFloat((amount * 0.03 + 6).toFixed(2));
            const netAmount = parseFloat((amount - fee).toFixed(2));
            const createdAt = randomTimeToday();
            orders.push({
                id: uuidv4(), merchantId: merchant.id, orderId: generateOrderId('PO', i),
                channelName: randomChannel(), type: 'payout', payoutType: 'bank',
                amount, fee, netAmount, status: 'success',
                providerOrderId: `UPO${Date.now()}${i}`,
                utr: `PUTR${Math.floor(Math.random() * 9000000000) + 1000000000}`,
                callbackSent: true, callbackAttempts: 1,
                payoutDetails: JSON.stringify({
                    accountName: `Account ${i + 1}`,
                    accountNumber: `${Math.floor(Math.random() * 9000000000) + 1000000000}`,
                    ifscCode: `SBIN000${Math.floor(Math.random() * 9000) + 1000}`,
                    bankName: ['SBI', 'HDFC', 'ICICI', 'Axis', 'PNB'][i % 5]
                }),
                createdAt,
                updatedAt: new Date(createdAt.getTime() + Math.random() * 600000)
            });
        }
        console.log(`  Success: ${successPayoutAmounts.length} orders`);

        // 4 Failed payout
        for (let i = 0; i < 4; i++) {
            const amount = randomAmount(20000, 60000);
            const fee = parseFloat((amount * 0.03 + 6).toFixed(2));
            const netAmount = parseFloat((amount - fee).toFixed(2));
            const createdAt = randomTimeToday();
            orders.push({
                id: uuidv4(), merchantId: merchant.id, orderId: generateOrderId('POF', i),
                channelName: randomChannel(), type: 'payout', payoutType: 'bank',
                amount, fee, netAmount, status: 'failed',
                providerOrderId: `UPO${Date.now()}F${i}`,
                callbackSent: true, callbackAttempts: 1,
                payoutDetails: JSON.stringify({
                    accountName: `Failed Account ${i + 1}`,
                    accountNumber: `${Math.floor(Math.random() * 9000000000) + 1000000000}`,
                    ifscCode: `HDFC000${Math.floor(Math.random() * 9000) + 1000}`,
                    bankName: 'HDFC'
                }),
                createdAt,
                updatedAt: new Date(createdAt.getTime() + Math.random() * 300000)
            });
        }
        console.log(`  Failed: 4 orders`);

        // 2 Processing payout
        for (let i = 0; i < 2; i++) {
            const amount = randomAmount(30000, 50000);
            const fee = parseFloat((amount * 0.03 + 6).toFixed(2));
            const netAmount = parseFloat((amount - fee).toFixed(2));
            const createdAt = randomTimeToday();
            orders.push({
                id: uuidv4(), merchantId: merchant.id, orderId: generateOrderId('POP', i),
                channelName: randomChannel(), type: 'payout', payoutType: 'bank',
                amount, fee, netAmount, status: 'processing',
                providerOrderId: `UPO${Date.now()}P${i}`,
                callbackSent: false, callbackAttempts: 0,
                payoutDetails: JSON.stringify({
                    accountName: `Processing ${i + 1}`,
                    accountNumber: `${Math.floor(Math.random() * 9000000000) + 1000000000}`,
                    ifscCode: `ICIC000${Math.floor(Math.random() * 9000) + 1000}`,
                    bankName: 'ICICI'
                }),
                createdAt, updatedAt: createdAt
            });
        }
        console.log(`  Processing: 2 orders`);

        // ============================================================
        // YESTERDAY'S PAYIN ORDERS — ~₹2,00,00,000 (2 crore)
        // ============================================================

        console.log('\n--- YESTERDAY PAYIN ---');

        const yesterdayPayinAmounts = [];
        let yesterdayPayinTotal = 0;
        const targetYesterday = 20000000; // 2 crore
        const numYesterdayOrders = 80;

        for (let i = 0; i < numYesterdayOrders - 1; i++) {
            const amt = randomAmount(150000, 350000);
            yesterdayPayinAmounts.push(amt);
            yesterdayPayinTotal += amt;
        }
        yesterdayPayinAmounts.push(parseFloat(Math.max(10000, targetYesterday - yesterdayPayinTotal).toFixed(2)));

        for (let i = 0; i < yesterdayPayinAmounts.length; i++) {
            const amount = yesterdayPayinAmounts[i];
            const fee = parseFloat((amount * feeRate).toFixed(2));
            const netAmount = parseFloat((amount - fee).toFixed(2));
            const createdAt = randomTimeYesterday();
            orders.push({
                id: uuidv4(), merchantId: merchant.id,
                orderId: generateOrderId('YPI', i),
                channelName: randomChannel(), type: 'payin', amount, fee, netAmount,
                status: 'success', providerOrderId: `YUP${Date.now()}${i}`,
                utr: `YUTR${Math.floor(Math.random() * 9000000000) + 1000000000}`,
                callbackSent: true, callbackAttempts: 1, createdAt,
                updatedAt: new Date(createdAt.getTime() + Math.random() * 600000)
            });
        }
        console.log(`  Success: ${yesterdayPayinAmounts.length} orders`);

        // Some yesterday failed for realism
        for (let i = 0; i < 30; i++) {
            const amount = randomAmount(50000, 150000);
            const fee = parseFloat((amount * feeRate).toFixed(2));
            const netAmount = parseFloat((amount - fee).toFixed(2));
            const createdAt = randomTimeYesterday();
            orders.push({
                id: uuidv4(), merchantId: merchant.id,
                orderId: generateOrderId('YPF', i),
                channelName: randomChannel(), type: 'payin', amount, fee, netAmount,
                status: 'failed', providerOrderId: `YUP${Date.now()}F${i}`,
                callbackSent: true, callbackAttempts: 1, createdAt,
                updatedAt: new Date(createdAt.getTime() + Math.random() * 300000)
            });
        }
        console.log(`  Failed: 30 orders`);

        // Yesterday payout for chart data
        for (let i = 0; i < 20; i++) {
            const amount = randomAmount(40000, 120000);
            const fee = parseFloat((amount * 0.03 + 6).toFixed(2));
            const netAmount = parseFloat((amount - fee).toFixed(2));
            const createdAt = randomTimeYesterday();
            orders.push({
                id: uuidv4(), merchantId: merchant.id,
                orderId: generateOrderId('YPO', i),
                channelName: randomChannel(), type: 'payout', payoutType: 'bank',
                amount, fee, netAmount, status: 'success',
                providerOrderId: `YUPO${Date.now()}${i}`,
                utr: `YPUTR${Math.floor(Math.random() * 9000000000) + 1000000000}`,
                callbackSent: true, callbackAttempts: 1,
                payoutDetails: JSON.stringify({
                    accountName: `Y Account ${i + 1}`,
                    accountNumber: `${Math.floor(Math.random() * 9000000000) + 1000000000}`,
                    ifscCode: `SBIN000${Math.floor(Math.random() * 9000) + 1000}`,
                    bankName: ['SBI', 'HDFC', 'ICICI'][i % 3]
                }),
                createdAt,
                updatedAt: new Date(createdAt.getTime() + Math.random() * 600000)
            });
        }
        console.log(`  Yesterday payout success: 20 orders`);

        // ============================================================
        // Insert all
        // ============================================================
        console.log(`\nInserting ${orders.length} total orders...`);

        // Insert in batches to avoid issues
        const batchSize = 100;
        for (let i = 0; i < orders.length; i += batchSize) {
            const batch = orders.slice(i, i + batchSize);
            await Order.bulkCreate(batch, { ignoreDuplicates: true });
            console.log(`  Batch ${Math.floor(i / batchSize) + 1} inserted (${batch.length} orders)`);
        }

        // ============================================================
        // Summary
        // ============================================================
        const todayPayinSuccess = orders.filter(o => o.type === 'payin' && o.status === 'success' && o.orderId.startsWith('PI'));
        const todayPayinFailed = orders.filter(o => o.type === 'payin' && o.status === 'failed' && o.orderId.startsWith('PF'));
        const todayPayinPending = orders.filter(o => o.type === 'payin' && o.status === 'pending');
        const todayPayoutSuccess = orders.filter(o => o.type === 'payout' && o.status === 'success' && o.orderId.startsWith('PO'));
        const yesterdayPayinSuccess = orders.filter(o => o.type === 'payin' && o.status === 'success' && o.orderId.startsWith('YPI'));

        const rateTotal = todayPayinSuccess.length + todayPayinFailed.length;
        const successRate = ((todayPayinSuccess.length / rateTotal) * 100).toFixed(0);
        const payinVol = todayPayinSuccess.reduce((s, o) => s + o.amount, 0);
        const payoutVol = todayPayoutSuccess.reduce((s, o) => s + o.amount, 0);
        const yesterdayVol = yesterdayPayinSuccess.reduce((s, o) => s + o.amount, 0);

        console.log('\n========================================');
        console.log('         TEST DATA SUMMARY');
        console.log('========================================');
        console.log(`Merchant: ${merchant.username} (ID: ${merchant.id})`);
        console.log(`Balance: ₹15,00,000`);
        console.log('');
        console.log('TODAY PAYIN:');
        console.log(`  Success: ${todayPayinSuccess.length} orders = ₹${payinVol.toLocaleString('en-IN')}`);
        console.log(`  Failed:  ${todayPayinFailed.length} orders`);
        console.log(`  Pending: ${todayPayinPending.length} orders`);
        console.log(`  Rate: ${todayPayinSuccess.length}/(${todayPayinSuccess.length}+${todayPayinFailed.length}) = ${successRate}%`);
        console.log('');
        console.log('TODAY PAYOUT:');
        console.log(`  Success: ${todayPayoutSuccess.length} orders = ₹${payoutVol.toLocaleString('en-IN')}`);
        console.log('');
        console.log('YESTERDAY PAYIN:');
        console.log(`  Success: ${yesterdayPayinSuccess.length} orders = ₹${yesterdayVol.toLocaleString('en-IN')}`);
        console.log('========================================');

        process.exit(0);

    } catch (error) {
        console.error('Error seeding test orders:', error);
        process.exit(1);
    }
}

seedTestOrders();
