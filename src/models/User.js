const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

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
    channel_rates: {
        type: DataTypes.TEXT, // Storing as JSON string for simplicity
        allowNull: true
    }
}, {
    tableName: 'users',
    timestamps: true
});

module.exports = User;
