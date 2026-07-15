/**
 * Seed Jupiter Merchant
 * Indian merchant using AGPay channel for both payin and payout
 * 
 * Config:
 *   - PayIn Channel: agpay
 *   - Payout Channel: agpay
 *   - PayIn Rate: 5.5%
 *   - Payout Rate: 3%
 *   - API Key: gkMBny
 *   - Currency: INR
 *   - Status: Active
 *   - PayIn: ON, Payout: ON
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sequelize, User } = require('../src/models');

async function seedJupiter() {
    try {
        console.log('🚀 Seeding Jupiter merchant...\n');

        await sequelize.sync();

        const username = 'jupiter';
        const password = 'jupiter@777'; // Default password convention
        const apiKey = 'gkMBny';

        // Check if merchant already exists
        const existing = await User.findOne({ where: { username } });
        if (existing) {
            console.log(`⚠️  Merchant "${username}" already exists (id: ${existing.id}). Updating...`);
            
            const updates = {
                apiKey,
                payinChannel: 'agpay',
                payoutChannel: 'agpay',
                assignedChannel: 'agpay',
                canPayin: true,
                canPayout: true,
                isActive: true,
                defaultCurrency: 'INR',
                allowedCurrencies: JSON.stringify(['INR']),
                channel_rates: JSON.stringify({
                    payinRate: 5.5,
                    payoutRate: 3.0,
                    payoutFixedFee: 6.0,
                    usdtRate: 100
                })
            };

            // Ensure balances has INR key
            let balances = {};
            try { balances = JSON.parse(existing.balances || '{}'); } catch(e) {}
            if (balances.INR === undefined) balances.INR = 0;
            updates.balances = JSON.stringify(balances);

            await existing.update(updates);
            console.log(`✅ Merchant "${username}" updated successfully!\n`);
            printMerchantInfo(existing);
            return;
        }

        // Create new merchant
        const hashedPassword = await bcrypt.hash(password, 10);
        const apiSecret = crypto.randomBytes(32).toString('hex');

        const merchant = await User.create({
            username,
            password_hash: hashedPassword,
            role: 'merchant',
            apiKey,
            apiSecret,
            payinChannel: 'agpay',
            payoutChannel: 'agpay',
            assignedChannel: 'agpay',
            canPayin: true,
            canPayout: true,
            isActive: true,
            balance: 0.00,
            pendingBalance: 0.00,
            defaultCurrency: 'INR',
            allowedCurrencies: JSON.stringify(['INR']),
            balances: JSON.stringify({ INR: 0 }),
            channel_rates: JSON.stringify({
                payinRate: 5.5,
                payoutRate: 3.0,
                payoutFixedFee: 6.0,
                usdtRate: 100
            }),
            whitelistedIps: '[]'
        });

        console.log(`✅ Merchant "${username}" created successfully!\n`);
        printMerchantInfo(merchant);

    } catch (error) {
        console.error('❌ Seed error:', error);
        process.exit(1);
    }
}

function printMerchantInfo(merchant) {
    console.log('┌─────────────────────────────────────');
    console.log(`│  👤 Merchant: ${merchant.username}`);
    console.log('├─────────────────────────────────────');
    console.log(`│  🔑 API Key:      ${merchant.apiKey}`);
    console.log(`│  🔐 API Secret:   ${merchant.apiSecret ? merchant.apiSecret.substring(0, 12) + '...' : 'N/A'}`);
    console.log('├─────────────────────────────────────');
    console.log(`│  💰 Balance:      ₹0.00`);
    console.log(`│  ⏳ Pending:      ₹0.00`);
    console.log('├─────────────────────────────────────');
    console.log(`│  📥 PayIn:        agpay (5.5%)`);
    console.log(`│  📤 Payout:       agpay (3%)`);
    console.log(`│  💱 Currency:     INR`);
    console.log(`│  🟢 Status:       Active`);
    console.log('├─────────────────────────────────────');
    console.log(`│  🔒 Login:        ${merchant.username} / ${merchant.username}@777`);
    console.log('└─────────────────────────────────────\n');
}

seedJupiter().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Failed:', err);
    process.exit(1);
});
