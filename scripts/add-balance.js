const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { User } = require('../src/models');

async function main() {
    try {
        const username = process.argv[2];
        const amount = parseFloat(process.argv[3]);
        const currency = process.argv[4] ? process.argv[4].toUpperCase() : 'BDT';

        if (!username || isNaN(amount)) {
            console.error('Usage: node add-balance.js <username> <amount> [currency]');
            process.exit(1);
        }

        const merchant = await User.findOne({ where: { username } });
        if (!merchant) {
            console.error(`Merchant ${username} not found!`);
            process.exit(1);
        }

        let balances = {};
        try {
            balances = JSON.parse(merchant.balances || '{}');
        } catch (e) { }

        // Add balance
        const currentBalance = parseFloat(balances[currency] || 0);
        balances[currency] = currentBalance + amount;

        merchant.balances = JSON.stringify(balances);
        
        // Also update legacy balance column for backward compatibility if it's the default currency
        if (merchant.defaultCurrency === currency) {
            merchant.balance = parseFloat(merchant.balance || 0) + amount;
        }

        await merchant.save();
        console.log(`✅ Successfully added ${amount} ${currency} to ${username}. New balance: ${balances[currency]} ${currency}`);
    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit(0);
    }
}

main();
