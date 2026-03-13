/**
 * Seed realistic order data
 * 
 * Targets:
 *   Last year:  ~1.7 CR payin (success), ~1.0 CR payout (success)
 *   Today:      ~0.8 CR payin total, ~0.5 CR payout total, 68% success rate
 *   All amounts are odd numbers to look realistic
 */

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const sequelize = require('../src/config/database');
const { User, Order } = require('../src/models');

const CHANNELS = ['aapay', 'yellow', 'ckpay', 'bharatpay', 'cxpay', 'ipay', 'unitedpay', 'firpay', 'agpay', 'easypay', 'ynpay', 'gaurpay', 'upi super'];
const PAYIN_RATE = 0.05;
const PAYOUT_RATE = 0.03;
const PAYOUT_FIXED = 6;

// Generate odd-looking realistic amount between min and max
function oddAmount(min, max) {
    let val = min + Math.random() * (max - min);
    val = Math.round(val);
    if (val % 2 === 0) val += 1; // make odd
    return val;
}

// Random element from array
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Generate a fake UTR
function fakeUtr() {
    const prefixes = ['UTR', 'IMPS', 'UPI', 'NEFT'];
    return `${pick(prefixes)}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

// Random date in a range
function randomDate(start, end) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function seed() {
    await sequelize.authenticate();
    console.log('Connected to database');

    // Get merchants
    const merchants = await User.findAll({ where: { role: 'merchant' }, attributes: ['id', 'username', 'payinChannel', 'payoutChannel'] });
    if (merchants.length === 0) {
        console.log('No merchants found, creating a default one is not possible. Please add merchants first.');
        process.exit(1);
    }
    const merchantIds = merchants.map(m => m.id);
    console.log(`Found ${merchants.length} merchants: ${merchants.map(m => m.username).join(', ')}`);

    const orders = [];
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yearAgo = new Date(now);
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);

    // ============================================================
    // PART 1: Historical orders (last year, spread across months)
    // Target: ~1.7 CR payin success, ~1.0 CR payout success
    // ============================================================
    let histPayinTotal = 0;
    let histPayoutTotal = 0;
    const TARGET_HIST_PAYIN = 17000000;   // 1.7 CR
    const TARGET_HIST_PAYOUT = 10000000;  // 1.0 CR

    console.log('\nGenerating historical payin orders...');
    while (histPayinTotal < TARGET_HIST_PAYIN) {
        const amount = oddAmount(1001, 49999);
        const fee = Math.round(amount * PAYIN_RATE * 100) / 100;
        const netAmount = amount - fee;
        const merchantId = pick(merchantIds);
        const merchant = merchants.find(m => m.id === merchantId);
        const channel = merchant.payinChannel || pick(CHANNELS);
        const date = randomDate(yearAgo, todayStart);
        
        // 75% success for historical
        const roll = Math.random();
        const status = roll < 0.75 ? 'success' : roll < 0.88 ? 'failed' : 'expired';

        orders.push({
            id: uuidv4(),
            merchantId,
            orderId: `ORD${Date.now().toString(36)}${Math.random().toString(36).substring(2, 7)}`.toUpperCase(),
            channelName: channel,
            type: 'payin',
            amount,
            fee,
            netAmount,
            status,
            utr: status === 'success' ? fakeUtr() : null,
            callbackSent: status === 'success',
            callbackAttempts: status === 'success' ? 1 : 0,
            createdAt: date,
            updatedAt: date
        });

        if (status === 'success') histPayinTotal += amount;
    }
    console.log(`  Generated ${orders.length} historical payin orders (₹${(histPayinTotal / 10000000).toFixed(2)} CR success)`);

    const payinCount = orders.length;
    console.log('Generating historical payout orders...');
    while (histPayoutTotal < TARGET_HIST_PAYOUT) {
        const amount = oddAmount(5001, 99999);
        const fee = Math.round((amount * PAYOUT_RATE + PAYOUT_FIXED) * 100) / 100;
        const netAmount = amount - fee;
        const merchantId = pick(merchantIds);
        const merchant = merchants.find(m => m.id === merchantId);
        const channel = merchant.payoutChannel || pick(CHANNELS);
        const date = randomDate(yearAgo, todayStart);

        const roll = Math.random();
        const status = roll < 0.72 ? 'success' : roll < 0.90 ? 'failed' : 'expired';

        orders.push({
            id: uuidv4(),
            merchantId,
            orderId: `POT${Date.now().toString(36)}${Math.random().toString(36).substring(2, 7)}`.toUpperCase(),
            channelName: channel,
            type: 'payout',
            payoutType: 'bank',
            amount,
            fee,
            netAmount,
            status,
            utr: status === 'success' ? fakeUtr() : null,
            callbackSent: status === 'success',
            callbackAttempts: status === 'success' ? 1 : 0,
            payoutDetails: JSON.stringify({ bankName: 'HDFC Bank', accountNumber: '50100' + oddAmount(10000000, 99999999), ifsc: 'HDFC000' + oddAmount(1000, 9999), holderName: 'Test User' }),
            createdAt: date,
            updatedAt: date
        });

        if (status === 'success') histPayoutTotal += amount;
    }
    console.log(`  Generated ${orders.length - payinCount} historical payout orders (₹${(histPayoutTotal / 10000000).toFixed(2)} CR success)`);

    // ============================================================
    // PART 2: Today's orders
    // Target: ~0.8 CR payin, ~0.5 CR payout, 68% success rate
    // ============================================================
    const TARGET_TODAY_PAYIN = 8000000;    // 0.8 CR
    const TARGET_TODAY_PAYOUT = 5000000;   // 0.5 CR
    const SUCCESS_RATE = 0.68;

    let todayPayinTotal = 0;
    let todayPayinSuccess = 0;
    let todayPayinFail = 0;
    const todayPayinStart = orders.length;

    console.log('\nGenerating today payin orders...');
    while (todayPayinTotal < TARGET_TODAY_PAYIN) {
        const amount = oddAmount(1001, 49999);
        const fee = Math.round(amount * PAYIN_RATE * 100) / 100;
        const netAmount = amount - fee;
        const merchantId = pick(merchantIds);
        const merchant = merchants.find(m => m.id === merchantId);
        const channel = merchant.payinChannel || pick(CHANNELS);

        // Random time today between 00:00 and now
        const hourOffset = Math.random() * (now.getHours() + now.getMinutes() / 60);
        const date = new Date(todayStart.getTime() + hourOffset * 3600000);

        // Enforce ~68% success rate
        const currentTotal = todayPayinSuccess + todayPayinFail;
        let status;
        if (currentTotal === 0) {
            status = 'success';
        } else {
            const currentRate = todayPayinSuccess / (currentTotal + 1);
            if (currentRate < SUCCESS_RATE - 0.02) {
                status = 'success';
            } else if (currentRate > SUCCESS_RATE + 0.02) {
                status = Math.random() < 0.5 ? 'failed' : 'expired';
            } else {
                status = Math.random() < SUCCESS_RATE ? 'success' : (Math.random() < 0.6 ? 'failed' : 'expired');
            }
        }

        orders.push({
            id: uuidv4(),
            merchantId,
            orderId: `TPI${Date.now().toString(36)}${Math.random().toString(36).substring(2, 7)}`.toUpperCase(),
            channelName: channel,
            type: 'payin',
            amount,
            fee,
            netAmount,
            status,
            utr: status === 'success' ? fakeUtr() : null,
            callbackSent: status === 'success',
            callbackAttempts: status === 'success' ? 1 : 0,
            createdAt: date,
            updatedAt: date
        });

        todayPayinTotal += amount;
        if (status === 'success') todayPayinSuccess++;
        else todayPayinFail++;
    }
    const todayPayinCount = orders.length - todayPayinStart;
    const actualPayinRate = ((todayPayinSuccess / (todayPayinSuccess + todayPayinFail)) * 100).toFixed(1);
    console.log(`  Generated ${todayPayinCount} today payin orders (₹${(todayPayinTotal / 10000000).toFixed(2)} CR, ${actualPayinRate}% success)`);

    let todayPayoutTotal = 0;
    const todayPayoutStart = orders.length;

    console.log('Generating today payout orders...');
    while (todayPayoutTotal < TARGET_TODAY_PAYOUT) {
        const amount = oddAmount(5001, 99999);
        const fee = Math.round((amount * PAYOUT_RATE + PAYOUT_FIXED) * 100) / 100;
        const netAmount = amount - fee;
        const merchantId = pick(merchantIds);
        const merchant = merchants.find(m => m.id === merchantId);
        const channel = merchant.payoutChannel || pick(CHANNELS);

        const hourOffset = Math.random() * (now.getHours() + now.getMinutes() / 60);
        const date = new Date(todayStart.getTime() + hourOffset * 3600000);

        const roll = Math.random();
        const status = roll < 0.70 ? 'success' : roll < 0.88 ? 'failed' : 'pending';

        orders.push({
            id: uuidv4(),
            merchantId,
            orderId: `TPO${Date.now().toString(36)}${Math.random().toString(36).substring(2, 7)}`.toUpperCase(),
            channelName: channel,
            type: 'payout',
            payoutType: 'bank',
            amount,
            fee,
            netAmount,
            status,
            utr: status === 'success' ? fakeUtr() : null,
            callbackSent: status === 'success',
            callbackAttempts: status === 'success' ? 1 : 0,
            payoutDetails: JSON.stringify({ bankName: 'SBI', accountNumber: '30100' + oddAmount(10000000, 99999999), ifsc: 'SBIN000' + oddAmount(1000, 9999), holderName: 'Payout User' }),
            createdAt: date,
            updatedAt: date
        });

        todayPayoutTotal += amount;
    }
    const todayPayoutCount = orders.length - todayPayoutStart;
    console.log(`  Generated ${todayPayoutCount} today payout orders (₹${(todayPayoutTotal / 10000000).toFixed(2)} CR)`);

    // ============================================================
    // Bulk insert in chunks
    // ============================================================
    console.log(`\nTotal orders to insert: ${orders.length}`);
    const CHUNK = 500;
    for (let i = 0; i < orders.length; i += CHUNK) {
        const chunk = orders.slice(i, i + CHUNK);
        await Order.bulkCreate(chunk, { ignoreDuplicates: true });
        process.stdout.write(`  Inserted ${Math.min(i + CHUNK, orders.length)}/${orders.length}\r`);
    }

    console.log('\n\n✅ Seed complete!');
    console.log(`   Historical: ₹${(histPayinTotal / 10000000).toFixed(2)} CR payin, ₹${(histPayoutTotal / 10000000).toFixed(2)} CR payout`);
    console.log(`   Today:      ₹${(todayPayinTotal / 10000000).toFixed(2)} CR payin, ₹${(todayPayoutTotal / 10000000).toFixed(2)} CR payout`);
    console.log(`   Today success rate: ${actualPayinRate}%`);

    process.exit(0);
}

seed().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});
