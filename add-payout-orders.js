/**
 * Add more payout orders to bring payout ratio to ~55% of total volume
 * Currently payout is ~20-25%, need to add more payout entries
 */
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { Sequelize } = require('sequelize');

const sq = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST, dialect: 'mysql', logging: false
});

const channels = ['bharatpay', 'cxpay', 'aapay', 'ipay'];
const PAYOUT_AMOUNTS = [5000, 8000, 10000, 12000, 15000, 20000, 25000, 30000, 40000, 50000];

function randomAmount() { return PAYOUT_AMOUNTS[Math.floor(Math.random() * PAYOUT_AMOUNTS.length)]; }
function generateUTR() {
    const banks = ['UBIN', 'SBIN', 'HDFC', 'ICIC', 'AXIS'];
    return banks[Math.floor(Math.random() * banks.length)] + (Math.floor(Math.random() * 9000000000) + 1000000000);
}

(async () => {
    await sq.authenticate();
    console.log('Connected.\n');

    // Get current daily volumes
    const [rows] = await sq.query(`
        SELECT DATE(createdAt) as d, type, SUM(amount) as vol
        FROM orders
        WHERE createdAt >= '2026-02-15' AND createdAt < '2026-02-22' AND status='success'
        GROUP BY DATE(createdAt), type ORDER BY d, type
    `);

    // Group by date
    const daily = {};
    for (const r of rows) {
        if (!daily[r.d]) daily[r.d] = { payin: 0, payout: 0 };
        daily[r.d][r.type] = parseFloat(r.vol);
    }

    const merchantIds = [5, 9, 11, 12, 13];
    let totalInserted = 0;

    for (const [dateStr, vols] of Object.entries(daily)) {
        const payin = vols.payin;
        const currentPayout = vols.payout;
        const total = payin + currentPayout;
        const currentRatio = (currentPayout / total * 100).toFixed(1);

        // Target: payout should be 55% of total
        // payout_new / (payin + payout_new) = 0.55
        // payout_new = 0.55 * payin / 0.45
        const targetPayout = (0.55 / 0.45) * payin;
        const additionalNeeded = Math.max(0, targetPayout - currentPayout);

        if (additionalNeeded <= 0) {
            console.log(`${dateStr}: Already at ${currentRatio}% payout, skipping.`);
            continue;
        }

        console.log(`${dateStr}: Payin ₹${(payin / 1e7).toFixed(2)}CR | Payout ₹${(currentPayout / 1e7).toFixed(2)}CR (${currentRatio}%) → Need ₹${(additionalNeeded / 1e7).toFixed(2)}CR more payout`);

        // Generate payout orders
        let accum = 0;
        const orders = [];
        while (accum < additionalNeeded) {
            const amount = randomAmount();
            if (accum + amount > additionalNeeded * 1.03) break;

            const fee = parseFloat((amount * 0.03 + 6).toFixed(2));
            const net = parseFloat((amount - fee).toFixed(2));
            const merchant = merchantIds[Math.floor(Math.random() * merchantIds.length)];
            const channel = channels[Math.floor(Math.random() * channels.length)];

            // Random time on that date
            const d = new Date(dateStr + 'T00:00:00.000Z');
            d.setUTCHours(8 + Math.floor(Math.random() * 15), Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));
            const ts = d.toISOString().replace('T', ' ').replace('Z', '');

            orders.push(`('${uuidv4()}', ${merchant}, 'ORD${Date.now()}${Math.random().toString(36).substring(2, 6).toUpperCase()}', '${channel}', 'payout', 'bank', ${amount}, ${fee}, ${net}, 'success', '${generateUTR()}', 1, 1, '${JSON.stringify({ bankName: 'State Bank of India', accountNumber: '' + (Math.floor(Math.random() * 9e9) + 1e9), ifsc: 'SBIN0001234', accountName: 'Demo User' }).replace(/'/g, "\\'")}', '${ts}', '${ts}')`);
            accum += amount;
        }

        // Batch insert
        if (orders.length > 0) {
            const BATCH = 100;
            for (let i = 0; i < orders.length; i += BATCH) {
                const batch = orders.slice(i, i + BATCH);
                await sq.query(`INSERT INTO orders (id, merchantId, orderId, channelName, type, payoutType, amount, fee, netAmount, status, utr, callbackSent, callbackAttempts, payoutDetails, createdAt, updatedAt) VALUES ${batch.join(',\n')}`);
            }
            totalInserted += orders.length;
            const newTotal = payin + currentPayout + accum;
            const newRatio = ((currentPayout + accum) / newTotal * 100).toFixed(1);
            console.log(`  → Added ${orders.length} payout orders (₹${(accum / 1e7).toFixed(2)}CR). New payout ratio: ${newRatio}%`);
        }
    }

    // Final summary
    console.log(`\n✅ Inserted ${totalInserted} additional payout orders.\n`);

    const [summary] = await sq.query(`
        SELECT DATE(createdAt) as d, type, COUNT(*) as cnt, SUM(amount) as vol
        FROM orders WHERE createdAt >= '2026-02-15' AND createdAt < '2026-02-22' AND status='success'
        GROUP BY DATE(createdAt), type ORDER BY d, type
    `);

    console.log('📊 Updated Volume Summary:');
    console.log('==========================');
    let lastDate = '';
    for (const r of summary) {
        if (r.d !== lastDate) { lastDate = r.d; }
        console.log(`  ${r.d} | ${r.type.padEnd(7)} | ${String(r.cnt).padStart(5)} orders | ₹${(parseFloat(r.vol) / 1e7).toFixed(2)} CR`);
    }

    // Show ratios
    console.log('\n📊 Payout Ratios:');
    const grouped = {};
    for (const r of summary) {
        if (!grouped[r.d]) grouped[r.d] = {};
        grouped[r.d][r.type] = parseFloat(r.vol);
    }
    for (const [d, v] of Object.entries(grouped)) {
        const total = (v.payin || 0) + (v.payout || 0);
        const ratio = ((v.payout || 0) / total * 100).toFixed(1);
        console.log(`  ${d}: Payout ${ratio}% of total ₹${(total / 1e7).toFixed(2)} CR`);
    }

    process.exit(0);
})();
