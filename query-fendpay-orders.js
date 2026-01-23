require('dotenv').config();
const sequelize = require('./src/config/database');
const { QueryTypes } = require('sequelize');

async function getFendpayOrders() {
    try {
        console.log('Connecting to database...');
        await sequelize.authenticate();
        console.log('Connected successfully!\n');

        const query = `
            SELECT 
                id, 
                orderId, 
                channelName, 
                type, 
                amount, 
                fee, 
                netAmount, 
                status, 
                utr, 
                providerOrderId,
                createdAt 
            FROM orders 
            WHERE channelName = 'fendpay' 
                AND status = 'success' 
                AND DATE(createdAt) = '2026-01-19'
            ORDER BY createdAt;
        `;

        const orders = await sequelize.query(query, { type: QueryTypes.SELECT });

        console.log('='.repeat(100));
        console.log('SUCCESSFUL FENDPAY (UPI SUPER) ORDERS FROM JANUARY 19, 2026');
        console.log('='.repeat(100));
        console.log(`Total Orders Found: ${orders.length}\n`);

        if (orders.length === 0) {
            console.log('No successful orders found for the specified date and channel.');
        } else {
            let totalAmount = 0;
            let totalNetAmount = 0;

            orders.forEach((order, index) => {
                console.log(`\n--- Order ${index + 1} ---`);
                console.log(`ID: ${order.id}`);
                console.log(`Order ID: ${order.orderId}`);
                console.log(`Channel: ${order.channelName}`);
                console.log(`Type: ${order.type}`);
                console.log(`Amount: ₹${order.amount}`);
                console.log(`Fee: ₹${order.fee}`);
                console.log(`Net Amount: ₹${order.netAmount}`);
                console.log(`Status: ${order.status}`);
                console.log(`UTR: ${order.utr || 'N/A'}`);
                console.log(`Provider Order ID: ${order.providerOrderId || 'N/A'}`);
                console.log(`Created At: ${order.createdAt}`);

                totalAmount += parseFloat(order.amount);
                totalNetAmount += parseFloat(order.netAmount);
            });

            console.log('\n' + '='.repeat(100));
            console.log('SUMMARY');
            console.log('='.repeat(100));
            console.log(`Total Orders: ${orders.length}`);
            console.log(`Total Amount: ₹${totalAmount.toFixed(2)}`);
            console.log(`Total Net Amount: ₹${totalNetAmount.toFixed(2)}`);
        }

        await sequelize.close();
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

getFendpayOrders();
