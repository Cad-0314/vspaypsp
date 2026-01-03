/**
 * Merchant Migration Script
 * Migrate merchants from old database
 */

const bcrypt = require('bcryptjs');
const { sequelize, User, Channel } = require('./src/models');

const merchantsToMigrate = [
    {
        // Merchant 1: JUGAME
        username: 'JUGAME',
        password: 'JUGAME@123', // Default password - merchant should change this
        role: 'merchant',
        apiKey: '4fb9947c-0000-0000-0000-000000000001', // Expanded UUID from short uuid
        apiSecret: 'MK_8759C8DA5E414FA6837AFC3F',
        assignedChannel: 'x2', // f2pay maps to x2 channel
        balance: 36144.00,
        pendingBalance: 0.00,
        canPayin: true,
        canPayout: true,
        callbackUrl: 'admin',
        isActive: true,
        telegramGroupId: '-1003578202393',
        two_fa_enabled: false,
        channel_rates: JSON.stringify({
            payinRate: 9.00,
            payoutRate: 3.00
        }),
        whitelistedIps: '[]'
    }
];

async function migrateMerchants() {
    try {
        console.log('Starting merchant migration...\n');

        // Sync database
        await sequelize.sync();

        for (const merchantData of merchantsToMigrate) {
            console.log(`Processing: ${merchantData.username}`);

            // Hash password
            const password_hash = await bcrypt.hash(merchantData.password, 10);
            delete merchantData.password;

            // Check if merchant already exists
            const existingMerchant = await User.findOne({
                where: { username: merchantData.username }
            });

            if (existingMerchant) {
                // Update existing merchant
                await existingMerchant.update({
                    ...merchantData,
                    password_hash
                });
                console.log(`  ✓ Updated existing merchant: ${merchantData.username}`);
            } else {
                // Create new merchant
                await User.create({
                    ...merchantData,
                    password_hash
                });
                console.log(`  ✓ Created new merchant: ${merchantData.username}`);
            }

            console.log(`    - Channel: ${merchantData.assignedChannel}`);
            console.log(`    - Balance: ₹${merchantData.balance}`);
            console.log(`    - API Key: ${merchantData.apiKey}`);
            console.log(`    - Telegram: ${merchantData.telegramGroupId}`);
        }

        console.log('\n✅ Merchant migration completed successfully!');
        console.log('\n📝 Note: Default password is USERNAME@123 - merchants should change this.');

    } catch (error) {
        console.error('Migration error:', error);
        process.exit(1);
    }
}

// Run migration
migrateMerchants().then(() => {
    process.exit(0);
}).catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
