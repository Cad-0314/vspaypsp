const { Order, User } = require('../src/models');
const callbackService = require('../src/services/callbackService');
const sequelize = require('../src/config/database');

async function sendInboxoCallbacks() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        // 1. Identify merchant inboxo
        const merchant = await User.findOne({ where: { username: 'inboxo' } });
        if (!merchant) {
            console.error('Merchant "inboxo" not found.');
            process.exit(1);
        }

        console.log(`Found merchant: ${merchant.username} (ID: ${merchant.id})`);

        // 2. Find all success orders for inboxo where callback might need to be sent
        // We look for status 'success'. Optionally filter by callbackSent: false if only missing ones are needed.
        // The user said "all success order", so I'll process success orders.
        const orders = await Order.findAll({
            where: {
                merchantId: merchant.id,
                status: 'success'
            },
            order: [['createdAt', 'DESC']]
        });

        if (orders.length === 0) {
            console.log('No successful orders found for merchant "inboxo".');
            process.exit(0);
        }

        console.log(`Found ${orders.length} successful orders. Starting callbacks...`);

        for (const order of orders) {
            console.log(`\n--- Processing Order: ${order.orderId} ---`);
            if (!order.callbackUrl) {
                console.warn(`Skipping order ${order.orderId}: No callbackUrl configured.`);
                continue;
            }

            try {
                const result = await callbackService.manualCallback(order.orderId);
                if (result.success) {
                    console.log(`Callback result: ${result.isOk ? 'SUCCESS' : 'FAILED RESPONSE'}`);
                    console.log(`HTTP Code: ${result.httpCode}`);
                    console.log(`Response: ${result.response}`);
                } else {
                    console.log(`Callback Error: ${result.message}`);
                }
            } catch (err) {
                console.error(`Error processing callback for ${order.orderId}:`, err.message);
            }
        }

        console.log('\nBulk callback process completed.');
        process.exit(0);
    } catch (error) {
        console.error('Execution Error:', error);
        process.exit(1);
    }
}

sendInboxoCallbacks();
