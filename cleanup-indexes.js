/**
 * Cleanup duplicate indexes from users and orders tables
 * Run this once to fix the "Too many keys" error
 */
require('dotenv').config();
const { sequelize } = require('./src/models');

async function cleanupIndexes() {
    console.log('Starting index cleanup...\n');

    try {
        // Get all indexes from users table
        const [userIndexes] = await sequelize.query('SHOW INDEX FROM users');
        const uniqueUserIndexes = [...new Set(userIndexes.map(r => r.Key_name))];
        console.log(`Found ${uniqueUserIndexes.length} indexes on users table`);

        // Drop duplicate username indexes (keep original)
        for (const indexName of uniqueUserIndexes) {
            if (indexName.startsWith('username_') || indexName.startsWith('apiKey_')) {
                console.log(`  Dropping duplicate index: ${indexName}`);
                try {
                    await sequelize.query(`ALTER TABLE users DROP INDEX \`${indexName}\``);
                } catch (e) {
                    console.log(`    Failed to drop ${indexName}: ${e.message}`);
                }
            }
        }

        // Get all indexes from orders table
        try {
            const [orderIndexes] = await sequelize.query('SHOW INDEX FROM orders');
            const uniqueOrderIndexes = [...new Set(orderIndexes.map(r => r.Key_name))];
            console.log(`\nFound ${uniqueOrderIndexes.length} indexes on orders table`);

            // Drop duplicate indexes
            for (const indexName of uniqueOrderIndexes) {
                // Keep PRIMARY, orderId, status, merchantId, createdAt but remove duplicates
                if (/_\d+$/.test(indexName)) { // matches _2, _3, etc.
                    console.log(`  Dropping duplicate index: ${indexName}`);
                    try {
                        await sequelize.query(`ALTER TABLE orders DROP INDEX \`${indexName}\``);
                    } catch (e) {
                        console.log(`    Failed to drop ${indexName}: ${e.message}`);
                    }
                }
            }
        } catch (e) {
            console.log('Orders table check skipped:', e.message);
        }

        // Verify final count
        const [finalUserIndexes] = await sequelize.query('SHOW INDEX FROM users');
        const finalUniqueUserIndexes = [...new Set(finalUserIndexes.map(r => r.Key_name))];
        console.log(`\n✅ Cleanup complete! Users table now has ${finalUniqueUserIndexes.length} indexes`);
        console.log('Remaining indexes:', finalUniqueUserIndexes.join(', '));

    } catch (error) {
        console.error('Cleanup failed:', error);
    } finally {
        await sequelize.close();
    }
}

cleanupIndexes();
