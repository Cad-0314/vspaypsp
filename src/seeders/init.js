const sequelize = require('../config/database');
const User = require('../models/User');
const bcrypt = require('bcrypt');
require('dotenv').config();

const seed = async () => {
    try {
        await sequelize.sync({ force: true }); // Reset DB for fresh start
        console.log('Database synced');

        const hashedPassword = await bcrypt.hash('password123', 10);

        await User.bulkCreate([
            {
                username: 'admin',
                password_hash: hashedPassword,
                role: 'admin',
                two_fa_enabled: false
            },
            {
                username: 'merchant',
                password_hash: hashedPassword,
                role: 'merchant',
                two_fa_enabled: false,
                channel_rates: JSON.stringify({ hdpay: 0.05, f2pay: 0.03 })
            }
        ]);

        console.log('Seed data inserted');
        process.exit();
    } catch (err) {
        console.error('Error seeding data:', err);
        process.exit(1);
    }
};

seed();
