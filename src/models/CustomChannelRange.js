/**
 * CustomChannelRange Model
 * Stores range configurations for the Smart Channel
 * Routes payin requests to different channels based on amount
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CustomChannelRange = sequelize.define('CustomChannelRange', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    minAmount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        comment: 'Minimum amount (inclusive)'
    },
    maxAmount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        comment: 'Maximum amount (inclusive)'
    },
    channelName: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'Target channel name (e.g., aapay, cxpay)'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: 'Whether this range is active'
    },
    priority: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: 'Priority for sorting (higher = higher priority)'
    }
}, {
    tableName: 'custom_channel_ranges',
    timestamps: true
});

module.exports = CustomChannelRange;
