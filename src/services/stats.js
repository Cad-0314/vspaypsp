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

    const todayStats = {
        payin: await getSum('payin', today, tomorrow),
        payout: await getSum('payout', today, tomorrow),
        payinSuccessCount: await getCount('payin', today, tomorrow, 'success'),
        payinFailedCount: await getCount('payin', today, tomorrow, 'failed'),
        payinPendingCount: await getCount('payin', today, tomorrow, 'pending'),
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
