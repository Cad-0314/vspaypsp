// Script to reset 2FA for all users
require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        dialect: 'mysql',
        logging: false
    }
);

async function reset2FA() {
    try {
        await sequelize.authenticate();
        console.log('Connected to database');

        // Reset 2FA for all users
        const [results] = await sequelize.query(
            "UPDATE users SET two_fa_enabled = false, two_fa_secret = NULL"
        );

        console.log('2FA has been reset for all users');
        console.log('Users can now login and set up 2FA fresh');

        await sequelize.close();
    } catch (error) {
        console.error('Error:', error.message);
    }
}

reset2FA();
