const { Channel } = require('./src/models');
const sequelize = require('./src/config/database');

async function migrate() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        const channels = [
            {
                name: 'yellow',
                displayName: 'Yellow',
                displayNameZh: 'Yellow',
                provider: 'caipay',
                payinRate: 5.0,
                payoutRate: 3.0,
                payoutFixedFee: 6.0,
                isActive: true,
                usesCustomPayPage: true
            },
            {
                name: 'upi super',
                displayName: 'UPI Super',
                displayNameZh: 'UPI Super',
                provider: 'fendpay',
                payinRate: 5.0,
                payoutRate: 3.0,
                payoutFixedFee: 6.0,
                isActive: true,
                usesCustomPayPage: true
            }
        ];

        for (const channelData of channels) {
            const [channel, created] = await Channel.findOrCreate({
                where: { name: channelData.name },
                defaults: channelData
            });

            if (created) {
                console.log(`Created channel: ${channelData.name}`);
            } else {
                console.log(`Channel already exists: ${channelData.name}`);
                // Update if exists to ensure config is correct
                await channel.update(channelData);
                console.log(`Updated channel: ${channelData.name}`);
            }
        }

        console.log('Migration complete.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
