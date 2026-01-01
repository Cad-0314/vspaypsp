const sequelize = require('./src/config/database');
const { DataTypes } = require('sequelize');

async function migrate() {
    try {
        const queryInterface = sequelize.getQueryInterface();
        const tableInfo = await queryInterface.describeTable('users');

        if (!tableInfo.telegramGroupId) {
            console.log('Adding telegramGroupId column to users table...');
            await queryInterface.addColumn('users', 'telegramGroupId', {
                type: DataTypes.STRING,
                allowNull: true,
                comment: 'Telegram Group ID for support channel'
            });
            console.log('Column added successfully.');
        } else {
            console.log('telegramGroupId column already exists.');
        }

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await sequelize.close();
    }
}

migrate();
