const sequelize = require('../config/database');
const User = require('./User');
const Channel = require('./Channel');
const Order = require('./Order');

// Define associations
User.hasMany(Order, { foreignKey: 'merchantId', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'merchantId', as: 'merchant' });

// Export all models
module.exports = {
    sequelize,
    User,
    Channel,
    Order
};
