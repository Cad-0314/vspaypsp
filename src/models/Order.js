const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Order = sequelize.define('Order', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    merchantId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'FK to users table'
    },
    orderId: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: 'Merchant order ID'
    },
    channelName: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'Channel: hdpay, x2, payable'
    },
    type: {
        type: DataTypes.ENUM('payin', 'payout'),
        allowNull: false
    },
    payoutType: {
        type: DataTypes.ENUM('bank', 'usdt'),
        allowNull: true,
        comment: 'For payout orders: bank or usdt'
    },
    amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        comment: 'Original order amount'
    },
    fee: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Fee charged'
    },
    netAmount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        comment: 'Amount after fee'
    },
    status: {
        type: DataTypes.ENUM('pending', 'processing', 'success', 'failed', 'expired'),
        defaultValue: 'pending'
    },
    providerOrderId: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Upstream provider order ID'
    },
    actualChannel: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Actual channel used when routed via smart channel'
    },
    utr: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Bank UTR/reference number'
    },
    payUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Payment URL from provider'
    },
    deepLinks: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'UPI deeplinks as JSON',
        get() {
            const value = this.getDataValue('deepLinks');
            return value ? JSON.parse(value) : null;
        },
        set(value) {
            this.setDataValue('deepLinks', value ? JSON.stringify(value) : null);
        }
    },
    callbackUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: 'Merchant callback URL'
    },
    callbackSent: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    callbackAttempts: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    param: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Custom merchant parameter'
    },
    skipUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: 'Redirect URL after payment'
    },
    payoutDetails: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Bank/USDT details as JSON',
        get() {
            const value = this.getDataValue('payoutDetails');
            return value ? JSON.parse(value) : null;
        },
        set(value) {
            this.setDataValue('payoutDetails', value ? JSON.stringify(value) : null);
        }
    },
    providerResponse: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Raw provider response as JSON'
    },
    callbackData: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Callback data received as JSON'
    },
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Order expiration time'
    }
}, {
    tableName: 'orders',
    timestamps: true,
    indexes: [
        { fields: ['merchantId'] },
        { fields: ['orderId'] },
        { unique: true, fields: ['merchantId', 'orderId'] },
        { fields: ['status'] },
        { fields: ['channelName'] },
        { fields: ['type'] },
        { fields: ['createdAt'] },
        { fields: ['updatedAt'] },
        { fields: ['merchantId', 'type', 'createdAt'] },
        { fields: ['providerOrderId'] },
        { fields: ['orderId', 'type'] } // For callback lookups
    ]
});

module.exports = Order;
