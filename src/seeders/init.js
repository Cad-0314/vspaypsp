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
                name: 'gaurpay',
                displayName: 'GaurPay',
                displayNameZh: 'GaurPay',
                provider: 'silkpay',
                currency: 'INR',
                country: 'IN',
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
                currency: 'INR',
                country: 'IN',
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
                currency: 'INR',
                country: 'IN',
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
                currency: 'INR',
                country: 'IN',
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
                name: 'ipay',
                displayName: 'IPay',
                displayNameZh: 'IPay',
                provider: 'ipay',
                currency: 'INR',
                country: 'IN',
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
                name: 'unitedpay',
                displayName: 'United Pay',
                displayNameZh: 'United Pay',
                provider: 'unitepay',
                currency: 'INR',
                country: 'IN',
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
                name: 'yellow',
                displayName: 'Yellow',
                displayNameZh: 'Yellow',
                provider: 'caipay',
                currency: 'INR',
                country: 'IN',
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
                name: 'upi super',
                displayName: 'UPI Super',
                displayNameZh: 'UPI Super',
                provider: 'fendpay',
                currency: 'INR',
                country: 'IN',
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
                name: 'ckpay',
                displayName: 'CKPay',
                displayNameZh: 'CKPay',
                provider: 'ckpay',
                currency: 'INR',
                country: 'IN',
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
                name: 'firpay',
                displayName: 'FirPay',
                displayNameZh: 'FirPay',
                provider: 'firpay',
                currency: 'INR',
                country: 'IN',
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
                name: 'agpay',
                displayName: 'AG Pay',
                displayNameZh: 'AG Pay',
                provider: 'agpay',
                currency: 'INR',
                country: 'IN',
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
                name: 'easypay',
                displayName: 'Easy Pay',
                displayNameZh: 'Easy Pay',
                provider: 'easypay',
                currency: 'INR',
                country: 'IN',
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
                name: 'ynpay',
                displayName: 'YN Pay',
                displayNameZh: 'YN Pay',
                provider: 'ynpay',
                currency: 'INR',
                country: 'IN',
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
                name: 'passpay',
                displayName: 'Pass Pay',
                displayNameZh: 'Pass Pay',
                provider: 'passpay',
                currency: 'INR',
                country: 'IN',
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
                name: 'testpay',
                displayName: 'Test Pay',
                displayNameZh: '测试支付',
                provider: 'testpay',
                currency: 'INR',
                country: 'IN',
                payinRate: 2.00,
                payoutRate: 1.00,
                payoutFixedFee: 5.00,
                isActive: true,
                minPayin: 100.00,
                maxPayin: 500000.00,
                minPayout: 100.00,
                maxPayout: 500000.00,
                usesCustomPayPage: false,
                config: JSON.stringify({ isTestChannel: true, autoSuccess: true })
            },
            {
                name: 'smart',
                displayName: 'Smart',
                displayNameZh: '智能支付',
                provider: 'smart',
                currency: 'INR',
                country: 'IN',
                payinRate: 5.00,
                payoutRate: 0.00, // Not used for payout
                payoutFixedFee: 0.00,
                isActive: true,
                minPayin: 100.00,
                maxPayin: 100000.00,
                minPayout: 0.00, // Not used for payout
                maxPayout: 0.00,
                usesCustomPayPage: false,
                config: JSON.stringify({ isSmartChannel: true, payinOnly: true })
            },
            // ---- F2Pay Channel ----
            {
                name: 'f2pay',
                displayName: 'F2 Pay',
                displayNameZh: 'F2 Pay',
                provider: 'f2pay',
                currency: 'INR',
                country: 'IN',
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
            // ---- PKR Channels (Placeholder) ----
            {
                name: 'pkr_channel_1',
                displayName: 'PKR Gateway',
                displayNameZh: 'PKR通道',
                provider: 'pkr_provider',
                currency: 'PKR',
                country: 'PK',
                payinRate: 5.00,
                payoutRate: 3.00,
                payoutFixedFee: 50.00,
                isActive: false,
                minPayin: 500.00,
                maxPayin: 500000.00,
                minPayout: 500.00,
                maxPayout: 500000.00,
                usesCustomPayPage: false
            },
            // ---- BDT Channels ----
            {
                name: 'bcatpay',
                displayName: 'BDTPay',
                displayNameZh: '孟加拉通道 (BDTPay)',
                provider: 'bcatpay',
                currency: 'BDT',
                country: 'BD',
                payinRate: 5.00,
                payoutRate: 1.00,
                payoutFixedFee: 0.00,
                isActive: true,
                minPayin: 100.00,
                maxPayin: 25000.00,
                minPayout: 100.00,
                maxPayout: 25000.00,
                usesCustomPayPage: false
            },
            // ---- IDR Channels (Placeholder) ----
            {
                name: 'idr_channel_1',
                displayName: 'IDR Gateway',
                displayNameZh: 'IDR通道',
                provider: 'idr_provider',
                currency: 'IDR',
                country: 'ID',
                payinRate: 5.00,
                payoutRate: 3.00,
                payoutFixedFee: 5000.00,
                isActive: false,
                minPayin: 50000.00,
                maxPayin: 50000000.00,
                minPayout: 50000.00,
                maxPayout: 50000000.00,
                usesCustomPayPage: false
            }
        ];

        for (const channelData of channels) {
            const [channel, created] = await Channel.findOrCreate({
                where: { name: channelData.name },
                defaults: channelData
            });

            if (created) {
                console.log(`Created channel: ${channelData.name} (${channelData.currency}/${channelData.country})`);
            } else {
                // Update existing channel
                await channel.update(channelData);
                console.log(`Updated channel: ${channelData.name} (${channelData.currency}/${channelData.country})`);
            }
        }

        console.log('Database seed completed!');

    } catch (error) {
        console.error('Seed error:', error);
    }
}

// Run if called directly
if (require.main === module) {
    sequelize.sync({ alter: true }).then(() => {
        seedDatabase().then(() => process.exit(0));
    });
} else {
    module.exports = seedDatabase;
}
