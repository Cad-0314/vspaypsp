const { Op } = require('sequelize');
const { Order, User, sequelize } = require('../models');

/**
 * Get aggregated stats for a user (or global if userId is null)
 */
async function getStats(userId = null) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const where = {};
    if (userId) where.merchantId = userId;

    // Helper to get sum
    const getSum = async (type, dateFrom, dateTo, status = 'success') => {
        const query = {
            where: {
                ...where,
                type,
                status,
                createdAt: { [Op.gte]: dateFrom, [Op.lt]: dateTo }
            }
        };
        const sum = await Order.sum('amount', query);
        return parseFloat(sum || 0);
    };

    // Helper to get count
    const getCount = async (type, dateFrom, dateTo, status = 'success') => {
        const query = {
            where: {
                ...where,
                type,
                status,
                createdAt: { [Op.gte]: dateFrom, [Op.lt]: dateTo }
            }
        };
        return await Order.count(query);
    };

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Load booster config safely
    let booster = { enabled: false, payinCountBoost: 0, payinVolumeBoost: 0 };
    try {
        const fs = require('fs');
        const path = require('path');
        const configPath = path.join(__dirname, '../../config/booster.json');
        if (fs.existsSync(configPath)) {
            booster = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (e) {
        console.error('Failed to load booster config:', e);
    }

    let todayPayinVolume = await getSum('payin', today, tomorrow);
    let todayPayinSuccess = await getCount('payin', today, tomorrow, 'success');
    let todayPayinFailed = await getCount('payin', today, tomorrow, 'failed');
    let todayPayinPending = await getCount('payin', today, tomorrow, 'pending');

    // Apply Boost if enabled
    if (booster.enabled) {
        // Smart Mode: Ensure Rate is between 53% and 65% (Randomized)
        // Rate = Success / (Success + Failed + Pending)
        const totalOps = todayPayinSuccess + todayPayinFailed + todayPayinPending;
        let currentRate = totalOps > 0 ? (todayPayinSuccess / totalOps) * 100 : 0;

        // Generate random target between 53 and 65
        const minRate = 53;
        const maxRate = 65;
        const targetRate = Math.floor(Math.random() * (maxRate - minRate + 1)) + minRate;

        if (totalOps > 0 && currentRate < targetRate) {
            // Formula to find required extra success (X) to meet target rate (R)
            // (S + X) / (T + X) = R
            // X = (R * T - S) / (1 - R)

            const R = targetRate / 100;
            const S = todayPayinSuccess;
            const T = totalOps;

            let X = (R * T - S) / (1 - R);
            X = Math.max(0, Math.ceil(X));

            // Add fake success count
            todayPayinSuccess += X;
        }
    }

    const todayStats = {
        payin: todayPayinVolume,
        payout: await getSum('payout', today, tomorrow),
        payinSuccessCount: todayPayinSuccess,
        payinFailedCount: todayPayinFailed,
        payinPendingCount: todayPayinPending,
        payoutSuccessCount: await getCount('payout', today, tomorrow, 'success'),
        payoutFailedCount: await getCount('payout', today, tomorrow, 'failed')
    };

    const yesterdayStats = {
        payin: await getSum('payin', yesterday, today),
        payout: await getSum('payout', yesterday, today),
        payinSuccessCount: await getCount('payin', yesterday, today, 'success'),
        payinFailedCount: await getCount('payin', yesterday, today, 'failed'),
        payinPendingCount: await getCount('payin', yesterday, today, 'pending'),
        payoutSuccessCount: await getCount('payout', yesterday, today, 'success'),
        payoutFailedCount: await getCount('payout', yesterday, today, 'failed')
    };

    return {
        today: todayStats,
        yesterday: yesterdayStats
    };
}

/**
 * Get chart data for last 7 days
 */
async function getChartData(userId = null) {
    const days = 7;
    const labels = [];
    const payinData = [];
    const payoutData = [];

    const where = {};
    if (userId) where.merchantId = userId;

    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);

        const nextD = new Date(d);
        nextD.setDate(d.getDate() + 1);

        labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

        // Payin Sum
        const pIn = await Order.sum('amount', {
            where: {
                ...where,
                type: 'payin',
                status: 'success',
                createdAt: { [Op.gte]: d, [Op.lt]: nextD }
            }
        });
        payinData.push(parseFloat(pIn || 0));

        // Payout Sum
        const pOut = await Order.sum('amount', {
            where: {
                ...where,
                type: 'payout',
                status: 'success',
                createdAt: { [Op.gte]: d, [Op.lt]: nextD }
            }
        });
        payoutData.push(parseFloat(pOut || 0));
    }

    return { labels, payinData, payoutData };
}

module.exports = { getStats, getChartData };
