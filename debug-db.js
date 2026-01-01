const { User, Order, Channel } = require('./src/models');
const sequelize = require('./src/config/database');

async function debug() {
    try {
        const users = await User.findAll({ attributes: ['username', 'assignedChannel'] });
        console.log('Users:', JSON.stringify(users, null, 2));

        const recentOrders = await Order.findAll({
            limit: 5,
            order: [['createdAt', 'DESC']],
            attributes: ['id', 'orderId', 'channelName', 'status', 'payUrl']
        });
        console.log('Recent Orders:', JSON.stringify(recentOrders, null, 2));

        const channels = await Channel.findAll();
        console.log('Channels in DB:', JSON.stringify(channels, null, 2));

        process.exit(0);
    } catch (error) {
        console.error('Debug Error:', error);
        process.exit(1);
    }
}

debug();
