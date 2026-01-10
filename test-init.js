const { Order } = require('./src/models');
const channelRouter = require('./src/services/channelRouter');
require('dotenv').config();

async function testInit() {
    try {
        const order = await Order.findOne({ where: { channelName: 'hdpay', payUrl: null } });
        if (!order) {
            console.log('No hdpay order without payUrl found');
            return;
        }

        console.log('Testing initialization for order:', order.id);
        const APP_URL = process.env.APP_URL || 'https://payable.firestars.co';
        const notifyUrl = `${APP_URL}/callback/${order.channelName}/payin`;

        const result = await channelRouter.createPayin(order.channelName, {
            orderId: order.orderId,
            amount: parseFloat(order.amount),
            notifyUrl,
            returnUrl: order.skipUrl || `${APP_URL}/pay/success`,
            customerName: 'Customer',
            customerPhone: '9999999999',
            customerEmail: 'customer@example.com',
            customerIp: '127.0.0.1'
        });

        console.log('Result:', JSON.stringify(result, null, 2));
        process.exit(0);
    } catch (error) {
        console.error('Test Error:', error);
        process.exit(1);
    }
}

testInit();
