/**
 * CallbackRetry Model
 * DB-backed retry queue for merchant callbacks
 * Survives PM2 restarts, deploys, and crashes
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CallbackRetry = sequelize.define('CallbackRetry', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    orderId: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: 'Merchant order ID'
    },
    orderUuid: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'Internal order UUID (FK to orders.id)'
    },
    type: {
        type: DataTypes.ENUM('payin', 'payout'),
        allowNull: false,
        comment: 'Order type'
    },
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'Order status to send in callback (success/failed)'
    },
    utr: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'UTR to include in callback'
    },
    attempts: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: 'Number of retry attempts made'
    },
    maxAttempts: {
        type: DataTypes.INTEGER,
        defaultValue: 5,
        comment: 'Maximum retry attempts'
    },
    nextRetryAt: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'When to attempt the next retry'
    },
    lastError: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Last error message from failed attempt'
    },
    completedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When the callback was successfully delivered'
    }
}, {
    tableName: 'callback_retries',
    timestamps: true,
    indexes: [
        { fields: ['nextRetryAt', 'completedAt'] },
        { fields: ['orderUuid'] },
        { fields: ['completedAt'] }
    ]
});

module.exports = CallbackRetry;
