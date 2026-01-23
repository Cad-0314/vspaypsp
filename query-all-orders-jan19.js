require('dotenv').config();
const sequelize = require('./src/config/database');
const { QueryTypes } = require('sequelize');

async function checkAllOrdersJan19() {
    try {
        console.log('Connecting to database...');
        await sequelize.authenticate();
        console.log('Connected successfully!\n');

        // Check all orders on Jan 19
        const allOrdersQuery = `
            SELECT channelName, status, COUNT(*) as count, SUM(amount) as totalAmount
            FROM orders 
            WHERE DATE(createdAt) = '2026-01-19'
            GROUP BY channelName, status
            ORDER BY channelName, status;
        `;

        const summary = await sequelize.query(allOrdersQuery, { type: QueryTypes.SELECT });

        console.log('='.repeat(80));
        console.log('ALL ORDERS SUMMARY FOR JANUARY 19, 2026');
        console.log('='.repeat(80));

        if (summary.length === 0) {
            console.log('\nNo orders found for January 19, 2026.');

            // Check if there are any fendpay orders at all
            const fendpayQuery = `
                SELECT DATE(createdAt) as orderDate, status, COUNT(*) as count 
                FROM orders 
                WHERE channelName = 'fendpay'
                GROUP BY DATE(createdAt), status
                ORDER BY orderDate DESC
                LIMIT 20;
            `;

            const fendpayOrders = await sequelize.query(fendpayQuery, { type: QueryTypes.SELECT });

            console.log('\n' + '='.repeat(80));
            console.log('FENDPAY ORDERS BY DATE (Last 20 groups)');
            console.log('='.repeat(80));

            if (fendpayOrders.length === 0) {
                console.log('No fendpay orders found in the database.');
            } else {
                fendpayOrders.forEach(row => {
                    console.log(`Date: ${row.orderDate} | Status: ${row.status} | Count: ${row.count}`);
                });
            }
        } else {
            console.log('\nChannel           | Status      | Count | Total Amount');
            console.log('-'.repeat(80));
            summary.forEach(row => {
                console.log(`${row.channelName.padEnd(18)}| ${row.status.padEnd(12)}| ${String(row.count).padEnd(6)}| ₹${row.totalAmount}`);
            });
        }

        // Also check for fendpay specifically
        const fendpayQuery = `
            SELECT id, orderId, status, amount, createdAt
            FROM orders 
            WHERE channelName = 'fendpay'
            ORDER BY createdAt DESC
            LIMIT 10;
        `;

        const recentFendpay = await sequelize.query(fendpayQuery, { type: QueryTypes.SELECT });

        console.log('\n' + '='.repeat(80));
        console.log('RECENT FENDPAY ORDERS (Last 10)');
        console.log('='.repeat(80));

        if (recentFendpay.length === 0) {
            console.log('No fendpay orders found.');
        } else {
            recentFendpay.forEach((order, i) => {
                console.log(`${i + 1}. ${order.createdAt} | ${order.status} | ₹${order.amount} | ${order.orderId}`);
            });
        }

        await sequelize.close();
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

checkAllOrdersJan19();
