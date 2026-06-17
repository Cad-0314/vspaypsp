/**
 * Seed only the testpay channel into the database
 * Run: node seed-testpay.js
 */
const { sequelize, Channel } = require('./src/models');

async function seedTestPay() {
    try {
        await sequelize.sync(); // sync without alter

        const testpayData = {
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
        };

        const [channel, created] = await Channel.findOrCreate({
            where: { name: 'testpay' },
            defaults: testpayData
        });

        if (created) {
            console.log('✅ Created testpay channel successfully');
        } else {
            await channel.update(testpayData);
            console.log('✅ Updated existing testpay channel');
        }

        console.log('Channel details:', JSON.stringify(channel.toJSON(), null, 2));
        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding testpay:', error.message);
        process.exit(1);
    }
}

seedTestPay();
