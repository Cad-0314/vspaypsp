const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const crypto = require('crypto');

const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    password_hash: {
        type: DataTypes.STRING,
        allowNull: false
    },
    role: {
        type: DataTypes.ENUM('admin', 'merchant'),
        defaultValue: 'merchant'
    },
    two_fa_secret: {
        type: DataTypes.STRING,
        allowNull: true
    },
    two_fa_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    // Merchant API fields
    apiKey: {
        type: DataTypes.STRING(12),
        unique: true,
        comment: 'Merchant API key (x-merchant-id header) - starts with star'
    },
    apiSecret: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: 'Secret key for signature verification'
    },
    assignedChannel: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Assigned payment channel: hdpay, x2, payable'
    },
    canPayin: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: 'Whether merchant can accept payments'
    },
    canPayout: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: 'Whether merchant can process payouts'
    },
    balance: {
        type: DataTypes.DECIMAL(14, 2),
        defaultValue: 0.00,
        comment: 'Available wallet balance'
    },
    pendingBalance: {
        type: DataTypes.DECIMAL(14, 2),
        defaultValue: 0.00,
        comment: 'Pending balance (processing payouts)'
    },
    callbackUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: 'Default callback URL for webhooks'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: 'Whether merchant account is active'
    },
    channel_rates: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Custom rates override as JSON (deprecated)'
    },
    telegramGroupId: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Telegram Group ID for support channel'
    },
    whitelistedIps: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: '[]',
        comment: 'JSON array of whitelisted IP addresses for API access'
    }
}, {
    tableName: 'users',
    timestamps: true,
    hooks: {
        beforeCreate: (user) => {
            // Generate short API key (8-12 chars) starting with 'star' if not set
            if (!user.apiKey) {
                const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
                const randomLength = 4 + Math.floor(Math.random() * 5); // 4-8 random chars
                let key = 'star';
                for (let i = 0; i < randomLength; i++) {
                    key += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                user.apiKey = key;
            }
            // Generate API secret if not set
            if (!user.apiSecret) {
                user.apiSecret = crypto.randomBytes(32).toString('hex');
            }
        }
    }
});

module.exports = User;

