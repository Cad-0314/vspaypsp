/**
 * Database Seeder
 * Initialize channels and default admin
 */

const { sequelize, User, Channel } = require('../models');

async function seedDatabase() {
    try {
        console.log('Starting database seed...');

        // Seed Channels
        const channels = [

            {
                name: 'payable',
                displayName: 'Payable',
                displayNameZh: 'Payable',
                provider: 'silkpay',
                payinRate: 5.00,
                payoutRate: 3.00,
                payoutFixedFee: 6.00,
                isActive: true,
                minPayin: 100.00,
                maxPayin: 100000.00,
                minPayout: 100.00,
                maxPayout: 100000.00,
                usesCustomPayPage: true
            },
            {
                name: 'bharatpay',
                displayName: 'BharatPay',
                displayNameZh: 'BharatPay',
                provider: 'bharatpay',
                payinRate: 5.00,
                payoutRate: 3.00,
                payoutFixedFee: 6.00,
                isActive: true,
                minPayin: 100.00,
                maxPayin: 100000.00,
                minPayout: 100.00,
                maxPayout: 100000.00,
                usesCustomPayPage: false
            },
            {
                name: 'cxpay',
                displayName: 'CX Pay',
                displayNameZh: 'CX Pay',
                provider: 'cxpay',
                payinRate: 5.00,
                payoutRate: 3.00,
                payoutFixedFee: 6.00,
                isActive: true,
                minPayin: 100.00,
                maxPayin: 100000.00,
                minPayout: 100.00,
                maxPayout: 100000.00,
                usesCustomPayPage: false
            },
            {
                name: 'aapay',
                displayName: 'AA Pay',
                displayNameZh: 'AA Pay',
                provider: 'aapay',
                payinRate: 5.00,
                payoutRate: 3.00,
                payoutFixedFee: 6.00,
                isActive: true,
                minPayin: 100.00,
                maxPayin: 100000.00,
                minPayout: 100.00,
                maxPayout: 100000.00,
                usesCustomPayPage: false
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
                // Update existing channel
                await channel.update(channelData);
                console.log(`Updated channel: ${channelData.name}`);
            }
        }

        console.log('Database seed completed!');

    } catch (error) {
        console.error('Seed error:', error);
    }
}

// Run if called directly
if (require.main === module) {
    sequelize.sync().then(() => {
        seedDatabase().then(() => process.exit(0));
    });
} else {
    module.exports = seedDatabase;
}
