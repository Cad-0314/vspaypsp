/**
 * Seed extra orders for March 12-13, 2026
 * Adds more volume to match existing days
 */

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const sequelize = require('../src/config/database');
const { User, Order } = require('../src/models');

const CHANNELS = ['aapay', 'yellow', 'ckpay', 'bharatpay', 'cxpay', 'ipay', 'unitedpay', 'firpay', 'agpay', 'easypay', 'ynpay', 'gaurpay', 'upi super'];
const PAYIN_RATE = 0.05;
const PAYOUT_RATE = 0.03;
const PAYOUT_FIXED = 6;

function oddAmount(min, max) {
    let val = min + Math.random() * (max - min);
    val = Math.round(val);
    if (val % 2 === 0) val += 1;
    return val;
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function fakeUtr() {
    const prefixes = ['UTR', 'IMPS', 'UPI', 'NEFT'];
    return `${pick(prefixes)}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

async function seed() {
    await sequelize.authenticate();
    console.log('Connected to database');

    const merchants = await User.findAll({ where: { role: 'merchant' }, attributes: ['id', 'payinChannel', 'payoutChannel'] });
    const merchantIds = merchants.map(m => m.id);
    console.log(`Found ${merchants.length} merchants`);

    // Daily targets (varying volumes to look realistic)
    const days = [
        { date: new Date(2026, 2, 12), payinTarget: 7300000, payoutTarget: 4700000 },  // Mar 12 - 0.73 CR / 0.47 CR
        { date: new Date(2026, 2, 13), payinTarget: 6700000, payoutTarget: 3900000 },  // Mar 13 - 0.67 CR / 0.39 CR
    ];

    const allOrders = [];

    for (const day of days) {
        const dayStart = day.date;
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59);

        let payinTotal = 0;
        let payoutTotal = 0;
        let dayOrders = 0;

        // Payin orders
        while (payinTotal < day.payinTarget) {
            const amount = oddAmount(1001, 49999);
            const fee = Math.round(amount * PAYIN_RATE * 100) / 100;
            const netAmount = amount - fee;
            const merchantId = pick(merchantIds);
            const merchant = merchants.find(m => m.id === merchantId);
            const channel = merchant.payinChannel || pick(CHANNELS);

            const hourOffset = 8 + Math.random() * 14; // 8 AM to 10 PM
            const date = new Date(dayStart.getTime() + hourOffset * 3600000);

            const roll = Math.random();
            const status = roll < 0.71 ? 'success' : roll < 0.89 ? 'failed' : 'expired';

            allOrders.push({
                id: uuidv4(),
                merchantId,
                orderId: `ORD${Date.now().toString(36)}${Math.random().toString(36).substring(2, 7)}`.toUpperCase(),
                channelName: channel,
                type: 'payin',
                amount, fee, netAmount, status,
                utr: status === 'success' ? fakeUtr() : null,
                callbackSent: status === 'success',
                callbackAttempts: status === 'success' ? 1 : 0,
                createdAt: date,
                updatedAt: date
            });
            payinTotal += amount;
            dayOrders++;
        }

        // Payout orders
        while (payoutTotal < day.payoutTarget) {
            const amount = oddAmount(5001, 99999);
            const fee = Math.round((amount * PAYOUT_RATE + PAYOUT_FIXED) * 100) / 100;
            const netAmount = amount - fee;
            const merchantId = pick(merchantIds);
            const merchant = merchants.find(m => m.id === merchantId);
            const channel = merchant.payoutChannel || pick(CHANNELS);

            const hourOffset = 9 + Math.random() * 12;
            const date = new Date(dayStart.getTime() + hourOffset * 3600000);

            const roll = Math.random();
            const status = roll < 0.73 ? 'success' : roll < 0.90 ? 'failed' : 'expired';

            allOrders.push({
                id: uuidv4(),
                merchantId,
                orderId: `POT${Date.now().toString(36)}${Math.random().toString(36).substring(2, 7)}`.toUpperCase(),
                channelName: channel,
                type: 'payout',
                payoutType: 'bank',
                amount, fee, netAmount, status,
                utr: status === 'success' ? fakeUtr() : null,
                callbackSent: status === 'success',
                callbackAttempts: status === 'success' ? 1 : 0,
                payoutDetails: JSON.stringify({ bankName: 'SBI', accountNumber: '30100' + oddAmount(10000000, 99999999), ifsc: 'SBIN000' + oddAmount(1000, 9999), holderName: 'User' }),
                createdAt: date,
                updatedAt: date
            });
            payoutTotal += amount;
            dayOrders++;
        }

        console.log(`  Mar ${dayStart.getDate()}: ${dayOrders} orders (₹${(payinTotal/10000000).toFixed(2)} CR payin, ₹${(payoutTotal/10000000).toFixed(2)} CR payout)`);
    }

    // Bulk insert
    console.log(`\nInserting ${allOrders.length} orders...`);
    const CHUNK = 500;
    for (let i = 0; i < allOrders.length; i += CHUNK) {
        await Order.bulkCreate(allOrders.slice(i, i + CHUNK), { ignoreDuplicates: true });
        process.stdout.write(`  ${Math.min(i + CHUNK, allOrders.length)}/${allOrders.length}\r`);
    }

    console.log(`\n✅ Done! Added ${allOrders.length} orders for Mar 7-11`);
    process.exit(0);
}

seed().catch(err => { console.error('Failed:', err); process.exit(1); });
