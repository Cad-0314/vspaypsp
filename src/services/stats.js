const { Op } = require('sequelize');
const { Order, User, sequelize } = require('../models');

// Booster config cache (60s TTL instead of reading from disk every call)
let boosterCache = { config: null, loadedAt: 0 };
const BOOSTER_CACHE_TTL = 60000; // 60 seconds

function getBoosterConfig() {
    const now = Date.now();
    if (boosterCache.config && (now - boosterCache.loadedAt) < BOOSTER_CACHE_TTL) {
        return boosterCache.config;
    }

    try {
        const fs = require('fs');
        const path = require('path');
        const configPath = path.join(__dirname, '../../config/booster.json');
        if (fs.existsSync(configPath)) {
            boosterCache.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } else {
            boosterCache.config = { enabled: false, payinCountBoost: 0, payinVolumeBoost: 0 };
        }
    } catch (e) {
        console.error('Failed to load booster config:', e);
        boosterCache.config = { enabled: false, payinCountBoost: 0, payinVolumeBoost: 0 };
    }

    boosterCache.loadedAt = now;
    return boosterCache.config;
}

/**
 * Get aggregated stats for a user (or global if userId is null)
 * Consolidated: 8 queries → 2 queries (today + yesterday)
 * @param {number|null} userId - Filter by merchant, or null for global
 * @param {string|null} currency - Filter by currency (e.g. 'INR'), or null for all
 */
async function getStats(userId = null, currency = null) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const baseWhere = {};
    if (userId) baseWhere.merchantId = userId;
    if (currency) baseWhere.currency = currency.toUpperCase();

    // Single query for today's stats — grouped by type and status
    const todayRaw = await Order.findAll({
        attributes: [
            'type',
            'status',
            [sequelize.fn('COUNT', sequelize.col('id')), 'cnt'],
            [sequelize.fn('SUM', sequelize.col('amount')), 'total']
        ],
        where: {
            ...baseWhere,
            createdAt: { [Op.gte]: today, [Op.lt]: tomorrow }
        },
        group: ['type', 'status'],
        raw: true
    });

    // Single query for yesterday's stats
    const yesterdayRaw = await Order.findAll({
        attributes: [
            'type',
            'status',
            [sequelize.fn('COUNT', sequelize.col('id')), 'cnt'],
            [sequelize.fn('SUM', sequelize.col('amount')), 'total']
        ],
        where: {
            ...baseWhere,
            createdAt: { [Op.gte]: yesterday, [Op.lt]: today }
        },
        group: ['type', 'status'],
        raw: true
    });

    // Helper to extract values from grouped results
    function extract(rows, type, status) {
        const row = rows.find(r => r.type === type && r.status === status);
        return {
            count: parseInt(row?.cnt || 0),
            sum: parseFloat(row?.total || 0)
        };
    }

    function sumByType(rows, type) {
        return rows
            .filter(r => r.type === type && r.status === 'success')
            .reduce((acc, r) => acc + parseFloat(r.total || 0), 0);
    }

    let todayPayinSuccess = extract(todayRaw, 'payin', 'success').count;
    const todayPayinFailed = extract(todayRaw, 'payin', 'failed').count;
    const todayPayinPending = extract(todayRaw, 'payin', 'pending').count;
    let todayPayinVolume = sumByType(todayRaw, 'payin');

    // Apply Boost if enabled
    const booster = getBoosterConfig();
    if (booster.enabled) {
        const totalOps = todayPayinSuccess + todayPayinFailed + todayPayinPending;
        let currentRate = totalOps > 0 ? (todayPayinSuccess / totalOps) * 100 : 0;

        const minRate = 53;
        const maxRate = 65;
        const targetRate = Math.floor(Math.random() * (maxRate - minRate + 1)) + minRate;

        if (totalOps > 0 && currentRate < targetRate) {
            const R = targetRate / 100;
            const S = todayPayinSuccess;
            const T = totalOps;
            let X = (R * T - S) / (1 - R);
            X = Math.max(0, Math.ceil(X));
            todayPayinSuccess += X;
        }
    }

    const todayStats = {
        payin: todayPayinVolume,
        payout: sumByType(todayRaw, 'payout'),
        payinSuccessCount: todayPayinSuccess,
        payinFailedCount: todayPayinFailed,
        payinPendingCount: todayPayinPending,
        payoutSuccessCount: extract(todayRaw, 'payout', 'success').count,
        payoutFailedCount: extract(todayRaw, 'payout', 'failed').count
    };

    const yesterdayStats = {
        payin: sumByType(yesterdayRaw, 'payin'),
        payout: sumByType(yesterdayRaw, 'payout'),
        payinSuccessCount: extract(yesterdayRaw, 'payin', 'success').count,
        payinFailedCount: extract(yesterdayRaw, 'payin', 'failed').count,
        payinPendingCount: extract(yesterdayRaw, 'payin', 'pending').count,
        payoutSuccessCount: extract(yesterdayRaw, 'payout', 'success').count,
        payoutFailedCount: extract(yesterdayRaw, 'payout', 'failed').count
    };

    return {
        today: todayStats,
        yesterday: yesterdayStats
    };
}

/**
 * Get chart data for last N days
 * Consolidated: 14 queries → 1 query using GROUP BY DATE
 * @param {number|null} userId
 * @param {number} days
 * @param {string|null} currency
 */
async function getChartData(userId = null, days = 7, currency = null) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);

    const baseWhere = { status: 'success' };
    if (userId) baseWhere.merchantId = userId;
    if (currency) baseWhere.currency = currency.toUpperCase();

    // Single query for all days — grouped by date and type
    const raw = await Order.findAll({
        attributes: [
            [sequelize.fn('DATE', sequelize.col('createdAt')), 'day'],
            'type',
            [sequelize.fn('SUM', sequelize.col('amount')), 'total']
        ],
        where: {
            ...baseWhere,
            createdAt: { [Op.gte]: startDate }
        },
        group: [sequelize.fn('DATE', sequelize.col('createdAt')), 'type'],
        raw: true
    });

    // Build lookup map: "YYYY-MM-DD" -> { payin: X, payout: Y }
    const dataMap = {};
    for (const row of raw) {
        const dayKey = String(row.day);
        if (!dataMap[dayKey]) dataMap[dayKey] = { payin: 0, payout: 0 };
        dataMap[dayKey][row.type] = parseFloat(row.total || 0);
    }

    // Build ordered arrays
    const labels = [];
    const payinData = [];
    const payoutData = [];

    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);

        labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

        const dayKey = d.toISOString().slice(0, 10); // YYYY-MM-DD
        const entry = dataMap[dayKey] || { payin: 0, payout: 0 };
        payinData.push(entry.payin);
        payoutData.push(entry.payout);
    }

    return { labels, payinData, payoutData };
}

module.exports = { getStats, getChartData };
