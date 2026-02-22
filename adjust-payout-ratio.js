/**
 * Adjust payout orders so payout is ~35% of total (payin always > payout)
 * Deletes excess payout orders to bring ratio down
 */
require('dotenv').config();
const { Sequelize } = require('sequelize');

const sq = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST, dialect: 'mysql', logging: false
});

(async () => {
    await sq.authenticate();
    console.log('Connected.\n');

    const dates = ['2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21'];
    const TARGET_PAYOUT_RATIO = 0.35; // 35% payout, 65% payin

    let totalDeleted = 0;

    for (const dateStr of dates) {
        const nextDate = new Date(dateStr + 'T00:00:00Z');
        nextDate.setUTCDate(nextDate.getUTCDate() + 1);
        const nextDateStr = nextDate.toISOString().split('T')[0];

        // Get current volumes
        const [vols] = await sq.query(`
            SELECT type, SUM(amount) as vol, COUNT(*) as cnt
            FROM orders
            WHERE createdAt >= '${dateStr}' AND createdAt < '${nextDateStr}' AND status='success'
            GROUP BY type
        `);

        let payin = 0, payout = 0;
        for (const v of vols) {
            if (v.type === 'payin') payin = parseFloat(v.vol);
            if (v.type === 'payout') payout = parseFloat(v.vol);
        }

        const total = payin + payout;
        const currentRatio = (payout / total * 100).toFixed(1);

        // Target payout = TARGET_PAYOUT_RATIO * payin / (1 - TARGET_PAYOUT_RATIO)
        const targetPayout = (TARGET_PAYOUT_RATIO / (1 - TARGET_PAYOUT_RATIO)) * payin;
        const excessPayout = payout - targetPayout;

        if (excessPayout <= 0) {
            console.log(`${dateStr}: Payout ${currentRatio}% - already OK`);
            continue;
        }

        console.log(`${dateStr}: Payin ₹${(payin / 1e7).toFixed(2)}CR | Payout ₹${(payout / 1e7).toFixed(2)}CR (${currentRatio}%) → Need to remove ₹${(excessPayout / 1e7).toFixed(2)}CR payout`);

        // Get payout order IDs to delete (newest first, so we remove the ones we just added)
        const [payoutOrders] = await sq.query(`
            SELECT id, amount FROM orders
            WHERE createdAt >= '${dateStr}' AND createdAt < '${nextDateStr}'
            AND status='success' AND type='payout'
            ORDER BY updatedAt DESC
        `);

        let removedAmount = 0;
        const idsToDelete = [];
        for (const order of payoutOrders) {
            if (removedAmount >= excessPayout) break;
            idsToDelete.push(`'${order.id}'`);
            removedAmount += parseFloat(order.amount);
        }

        if (idsToDelete.length > 0) {
            // Delete in batches of 200
            for (let i = 0; i < idsToDelete.length; i += 200) {
                const batch = idsToDelete.slice(i, i + 200);
                await sq.query(`DELETE FROM orders WHERE id IN (${batch.join(',')})`);
            }
            totalDeleted += idsToDelete.length;
            const newPayout = payout - removedAmount;
            const newTotal = payin + newPayout;
            const newRatio = (newPayout / newTotal * 100).toFixed(1);
            console.log(`  → Deleted ${idsToDelete.length} orders (₹${(removedAmount / 1e7).toFixed(2)}CR). New payout ratio: ${newRatio}%`);
        }
    }

    console.log(`\n✅ Deleted ${totalDeleted} excess payout orders.\n`);

    // Final summary
    const [summary] = await sq.query(`
        SELECT DATE(createdAt) as d, type, COUNT(*) as cnt, SUM(amount) as vol
        FROM orders WHERE createdAt >= '2026-02-15' AND createdAt < '2026-02-22' AND status='success'
        GROUP BY DATE(createdAt), type ORDER BY d, type
    `);

    console.log('📊 Final Volume Summary:');
    console.log('========================');
    const grouped = {};
    for (const r of summary) {
        if (!grouped[r.d]) grouped[r.d] = {};
        grouped[r.d][r.type] = { cnt: r.cnt, vol: parseFloat(r.vol) };
    }
    for (const [d, v] of Object.entries(grouped)) {
        const pi = v.payin || { cnt: 0, vol: 0 };
        const po = v.payout || { cnt: 0, vol: 0 };
        const total = pi.vol + po.vol;
        const ratio = (po.vol / total * 100).toFixed(1);
        console.log(`  ${d} | Payin ₹${(pi.vol / 1e7).toFixed(2)}CR (${pi.cnt}) | Payout ₹${(po.vol / 1e7).toFixed(2)}CR (${po.cnt}) | Total ₹${(total / 1e7).toFixed(2)}CR | Payout ${ratio}%`);
    }

    process.exit(0);
})();
