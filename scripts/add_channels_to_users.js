const sequelize = require('../src/config/database');
const { DataTypes } = require('sequelize');

async function addChannels() {
    try {
        const queryInterface = sequelize.getQueryInterface();
        const tableInfo = await queryInterface.describeTable('users');

        if (!tableInfo.payinChannel) {
            console.log('Adding payinChannel column...');
            await queryInterface.addColumn('users', 'payinChannel', {
                type: DataTypes.STRING(50),
                allowNull: true,
                comment: 'Assigned channel for Payins'
            });
            console.log('payinChannel added.');
        } else {
            console.log('payinChannel already exists.');
        }

        if (!tableInfo.payoutChannel) {
            console.log('Adding payoutChannel column...');
            await queryInterface.addColumn('users', 'payoutChannel', {
                type: DataTypes.STRING(50),
                allowNull: true,
                comment: 'Assigned channel for Payouts'
            });
            console.log('payoutChannel added.');
        } else {
            console.log('payoutChannel already exists.');
        }

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

addChannels();
