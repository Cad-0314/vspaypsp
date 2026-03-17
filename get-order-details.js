const { Order, User } = require('./src/models');
const { Op } = require('sequelize');

async function getOrderDetails() {
    const orderNumber = 'A6540314004807fac349';
    try {
        const order = await Order.findOne({
            where: {
                [Op.or]: [
                    { orderId: orderNumber },
                    { providerOrderId: orderNumber },
                    { utr: orderNumber }
                ]
            },
            include: [{ model: User, as: 'merchant' }]
        });

        if (order) {
            console.log('Order Found:');
            console.log(JSON.stringify(order, null, 2));
        } else {
            console.log(`Order ${orderNumber} not found.`);
        }
    } catch (error) {
        console.error('Error searching for order:', error);
    } finally {
        process.exit();
    }
}

getOrderDetails();
