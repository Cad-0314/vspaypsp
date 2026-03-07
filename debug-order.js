const { Order, User } = require('./src/models');

async function debugOrder() {
    try {
        const order = await Order.findOne({
            where: { orderId: 'altpay-test4' },
            include: [{ model: User, as: 'merchant' }]
        });

        if (order) {
            console.log('Order Found:');
            console.log(JSON.stringify(order, null, 2));
        } else {
            console.log('Order not found.');
            // Search for merchant by API secret provided if possible? 
            // No, better search by username if we had it.
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

debugOrder();
