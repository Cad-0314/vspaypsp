const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Channel = sequelize.define('Channel', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: 'Channel identifier: hdpay, x2, payable'
    },
    displayName: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'Display name for UI'
    },
    displayNameZh: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Chinese display name'
    },
    provider: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'Backend provider: hdpay, f2pay, silkpay'
    },
    payinRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 5.00,
        comment: 'Payin fee percentage (e.g., 5.00 = 5%)'
    },
    payoutRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 3.00,
        comment: 'Payout fee percentage (e.g., 3.00 = 3%)'
    },
    payoutFixedFee: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 6.00,
        comment: 'Fixed payout fee in INR'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: 'Whether channel is active'
    },
    minPayin: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 100.00,
        comment: 'Minimum payin amount'
    },
    maxPayin: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: 100000.00,
        comment: 'Maximum payin amount'
    },
    minPayout: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 100.00,
        comment: 'Minimum payout amount'
    },
    maxPayout: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: 100000.00,
        comment: 'Maximum payout amount'
    },
    usesCustomPayPage: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: 'Whether to use custom pay page with deeplinks'
    },
    config: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Additional channel config as JSON'
    }
}, {
    tableName: 'channels',
    timestamps: true
});

module.exports = Channel;
