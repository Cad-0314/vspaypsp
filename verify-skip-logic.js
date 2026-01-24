const { Order } = require('./src/models');
const sequelize = require('./src/config/database');
const { Op } = require('sequelize');
require('dotenv').config();

async function testSkipLogic() {
    console.log('--- Testing Callback Skipping Logic ---');

    // 1. Manually check if .env variables are loaded
    console.log('Config:', {
        ENABLED: process.env.CALLBACK_SKIP_ENABLED,
        PERCENT: process.env.CALLBACK_SKIP_PERCENT,
        WINDOW: process.env.CALLBACK_SKIP_WINDOW_MINS,
        ORDER_THRESHOLD: process.env.CALLBACK_SKIP_ORDER_THRESHOLD,
        RATE_THRESHOLD: process.env.CALLBACK_SKIP_RATE_THRESHOLD
    });

    try {
        const now = new Date();
        const startTime = new Date(now - (parseInt(process.env.CALLBACK_SKIP_WINDOW_MINS) || 10) * 60 * 1000);

        // 2. Query actual stats from DB to see if thresholds would be met
        const stats = await Order.findAll({
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
                [sequelize.literal(`SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)`), 'successCount']
            ],
            where: {
                type: 'payin',
                createdAt: { [Op.gte]: startTime }
            },
            raw: true
        });

        const total = parseInt(stats[0].total) || 0;
        const successCount = parseInt(stats[0].successCount) || 0;
        const rate = total > 0 ? (successCount / total) * 100 : 0;

        console.log('Current Real Stats:', {
            totalOrders: total,
            successCount: successCount,
            successRate: rate.toFixed(2) + '%'
        });

        const orderThreshold = parseInt(process.env.CALLBACK_SKIP_ORDER_THRESHOLD) || 30;
        const rateThreshold = parseInt(process.env.CALLBACK_SKIP_RATE_THRESHOLD) || 50;

        if (total > orderThreshold && rate > rateThreshold) {
            console.log('SUCCESS: Thresholds are currently MET in the real DB.');
        } else {
            console.log(`NOTE: Thresholds NOT met. (Need >${orderThreshold} orders and >${rateThreshold}% success rate)`);
        }

        console.log('\n--- Code Verification ---');
        console.log('Please check src/routes/api/callbacks.js for the following:');
        console.log('1. getRecentSkipStats() uses 30s cache.');
        console.log('2. shouldSkipCallback() implements Math.random() < skipPercent.');
        console.log('3. isSkipped check is added in router.post("/:channel/payin").');

    } catch (error) {
        console.error('Test error:', error);
    } finally {
        await sequelize.close();
    }
}

testSkipLogic();
