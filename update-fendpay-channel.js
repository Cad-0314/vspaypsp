require('dotenv').config();
const { Op } = require('sequelize');
const sequelize = require('./src/config/database');
const Channel = require('./src/models/Channel');

async function updateChannels() {
    try {
        console.log('Updating channels...\n');

        // 1. Deactivate all channels except UPI Super (fendpay)
        const deactivated = await Channel.update(
            { isActive: false },
            { where: { name: { [Op.ne]: 'upi super' } } }
        );
        console.log(`Deactivated ${deactivated[0]} channels`);

        // 2. Update UPI Super with new max amounts and bank config
        const bankConfig = {
            defaultPayoutName: 'Rohit',
            defaultPayoutAccount: '924010074497342',
            defaultPayoutIfsc: 'UTIB0002455'
        };

        const updated = await Channel.update(
            {
                maxPayin: 6000,
                maxPayout: 6000,
                config: JSON.stringify(bankConfig)
            },
            { where: { name: 'upi super' } }
        );
        console.log(`Updated UPI Super channel: ${updated[0]} rows affected`);

        // 3. Display updated channels
        const channels = await Channel.findAll({ raw: true });
        console.log('\nUpdated channels:');
        channels.forEach(ch => {
            console.log(`- ${ch.name}: isActive=${ch.isActive}, maxPayin=${ch.maxPayin}, maxPayout=${ch.maxPayout}`);
            if (ch.config) {
                console.log(`  Config: ${ch.config}`);
            }
        });

        await sequelize.close();
        console.log('\nDone!');
    } catch (error) {
        console.error('Error:', error.message);
        await sequelize.close();
        process.exit(1);
    }
}

updateChannels();
