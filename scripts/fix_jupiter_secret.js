/**
 * Update Jupiter merchant's apiSecret to match the client's secret
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { sequelize, User } = require('../src/models');

async function updateSecret() {
    try {
        await sequelize.authenticate();

        const clientSecret = '31f41612d04fb6f388e43134f57ca1209121af68671a8f4224affc16cb655';
        const merchant = await User.findOne({ where: { apiKey: 'gkMBny', role: 'merchant' } });

        if (!merchant) {
            console.log('❌ Merchant not found');
            return;
        }

        console.log('Before:', merchant.apiSecret);
        await merchant.update({ apiSecret: clientSecret });
        console.log('After:', clientSecret);
        console.log('✅ Jupiter apiSecret updated successfully!');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

updateSecret();
