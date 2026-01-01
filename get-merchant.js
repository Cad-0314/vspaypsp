const { User } = require('./src/models');
const sequelize = require('./src/config/database');

async function getMerchant() {
    try {
        await sequelize.authenticate();
        const merchant = await User.findOne({ where: { role: 'merchant' } });
        if (merchant) {
            console.log('--- Merchant Credentials ---');
            console.log(`apiKey (x-merchant-id): ${merchant.apiKey}`);
            console.log(`apiSecret: ${merchant.apiSecret}`);
        } else {
            console.log('No merchant found.');
        }
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

getMerchant();
