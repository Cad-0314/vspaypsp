const sequelize = require('../config/database');
const User = require('./User');
const Channel = require('./Channel');
const Order = require('./Order');
const Settlement = require('./Settlement');

// Define associations
User.hasMany(Order, { foreignKey: 'merchantId', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'merchantId', as: 'merchant' });

User.hasMany(Settlement, { foreignKey: 'merchantId', as: 'settlements' });
Settlement.belongsTo(User, { foreignKey: 'merchantId', as: 'merchant' });

// Export all models
module.exports = {
    sequelize,
    User,
    Channel,
    Order,
    Settlement
};
