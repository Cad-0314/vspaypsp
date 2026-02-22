require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { Sequelize } = require('sequelize');

const sq = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST, dialect: 'mysql', logging: false
});

(async () => {
    await sq.authenticate();
    const id = uuidv4();
    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
    const amount = 7967;
    const fee = (amount * 0.05).toFixed(2);
    const net = (amount - fee).toFixed(2);
    const utr = 'SBIN' + (Math.floor(Math.random() * 9000000000) + 1000000000);
    const orderId = 'ORD' + Date.now();

    await sq.query(
        `INSERT INTO orders (id, merchantId, orderId, channelName, type, amount, fee, netAmount, status, utr, callbackSent, callbackAttempts, createdAt, updatedAt)
         VALUES ('${id}', 5, '${orderId}', 'bharatpay', 'payin', ${amount}, ${fee}, ${net}, 'success', '${utr}', 1, 1, '${now}', '${now}')`
    );
    console.log('Done! Inserted payin order for ₹7,967');
    process.exit(0);
})();
