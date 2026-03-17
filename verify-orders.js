const sequelize = require('./src/config/database');

async function verify() {
    try {
        await sequelize.authenticate();
        const [rows] = await sequelize.query("SELECT COUNT(*) as total, MIN(createdAt) as start, MAX(createdAt) as end FROM orders WHERE merchantId = 24");
        console.log('Verification Summary:', rows[0]);

        const [lastMin] = await sequelize.query(`
            SELECT COUNT(*) as count 
            FROM orders 
            WHERE merchantId = 24 
              AND createdAt >= DATE_SUB('2026-03-17 13:11:00', INTERVAL 1 MINUTE)
        `);
        console.log('Orders in last 1 minute:', lastMin[0].count);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
verify();
