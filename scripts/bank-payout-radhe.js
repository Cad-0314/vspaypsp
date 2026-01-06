/**
 * Bank Payout Script - Radhe Account
 * 
 * This script initiates bank payouts from:
 * - F2Pay (X2 channel): ₹40,500 net
 * - Silkpay (Payable channel): ₹14,500 net
 * 
 * Target Account:
 * - Account No: 9250024712
 * - IFSC: KKBK0000958
 * - Name: Radhe
 * 
 * Date: 2026-01-06
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const f2pay = require('../src/services/f2pay');
const silkpay = require('../src/services/silkpay');

// Target account details
const ACCOUNT_DETAILS = {
    accountNo: '9250024712',
    ifsc: 'KKBK0000958',
    name: 'Radhe',
    mobile: '9999999999',
    email: 'radhe@payout.com'
};

// Payout configuration
const PAYOUTS = [
    {
        provider: 'f2pay',
        channelName: 'X2',
        amount: 40500,
        service: f2pay
    },
    {
        provider: 'silkpay',
        channelName: 'Payable',
        amount: 14500,
        service: silkpay
    }
];

// Generate unique order ID
function generateOrderId(prefix) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${prefix}${timestamp}${random}`;
}

// Format date for logging
function formatDate() {
    return new Date().toISOString();
}

// Main payout function
async function executePayout(payoutConfig) {
    const { provider, channelName, amount, service } = payoutConfig;
    const orderId = generateOrderId(`PAYOUT_${provider.toUpperCase()}_`);
    const notifyUrl = `${process.env.APP_URL}/api/callback/${provider}/payout`;

    console.log('\n' + '='.repeat(60));
    console.log(`[${formatDate()}] Initiating payout from ${channelName} (${provider})`);
    console.log('='.repeat(60));
    console.log(`Order ID: ${orderId}`);
    console.log(`Amount: ₹${amount.toLocaleString()}`);
    console.log(`Account: ${ACCOUNT_DETAILS.accountNo}`);
    console.log(`IFSC: ${ACCOUNT_DETAILS.ifsc}`);
    console.log(`Name: ${ACCOUNT_DETAILS.name}`);
    console.log('-'.repeat(60));

    try {
        let result;

        if (provider === 'f2pay') {
            // F2Pay payout
            result = await service.createPayout({
                orderId: orderId,
                amount: amount,
                accountNo: ACCOUNT_DETAILS.accountNo,
                ifsc: ACCOUNT_DETAILS.ifsc,
                name: ACCOUNT_DETAILS.name,
                mobile: ACCOUNT_DETAILS.mobile,
                email: ACCOUNT_DETAILS.email,
                notifyUrl: notifyUrl
            });
        } else if (provider === 'silkpay') {
            // Silkpay payout
            result = await service.createPayout({
                orderId: orderId,
                amount: amount,
                bankNo: ACCOUNT_DETAILS.accountNo,
                accountNo: ACCOUNT_DETAILS.accountNo,
                ifsc: ACCOUNT_DETAILS.ifsc,
                name: ACCOUNT_DETAILS.name,
                accountName: ACCOUNT_DETAILS.name,
                notifyUrl: notifyUrl
            });
        }

        if (result.success) {
            console.log(`✅ PAYOUT SUBMITTED SUCCESSFULLY`);
            console.log(`Provider Order ID: ${result.providerOrderId || 'Pending'}`);
            console.log(`Status: ${result.status || 'Processing'}`);
            if (result.raw) {
                console.log(`Raw Response:`, JSON.stringify(result.raw, null, 2));
            }
        } else {
            console.log(`❌ PAYOUT FAILED`);
            console.log(`Error: ${result.error || 'Unknown error'}`);
            if (result.raw) {
                console.log(`Raw Response:`, JSON.stringify(result.raw, null, 2));
            }
        }

        return {
            provider,
            channelName,
            orderId,
            amount,
            success: result.success,
            providerOrderId: result.providerOrderId,
            status: result.status,
            error: result.error,
            raw: result.raw
        };

    } catch (error) {
        console.log(`❌ PAYOUT EXCEPTION`);
        console.log(`Error: ${error.message}`);

        return {
            provider,
            channelName,
            orderId,
            amount,
            success: false,
            error: error.message
        };
    }
}

// Main execution
async function main() {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║           BANK PAYOUT SCRIPT - RADHE ACCOUNT               ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Date: ${formatDate().padEnd(51)}║`);
    console.log(`║  Account: ${ACCOUNT_DETAILS.accountNo.padEnd(48)}║`);
    console.log(`║  IFSC: ${ACCOUNT_DETAILS.ifsc.padEnd(51)}║`);
    console.log(`║  Name: ${ACCOUNT_DETAILS.name.padEnd(51)}║`);
    console.log('╚════════════════════════════════════════════════════════════╝');

    const results = [];
    let totalRequested = 0;
    let totalSuccess = 0;

    for (const payout of PAYOUTS) {
        const result = await executePayout(payout);
        results.push(result);
        totalRequested += payout.amount;
        if (result.success) {
            totalSuccess += payout.amount;
        }
    }

    // Summary
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                      PAYOUT SUMMARY                        ║');
    console.log('╠════════════════════════════════════════════════════════════╣');

    for (const result of results) {
        const status = result.success ? '✅ SUCCESS' : '❌ FAILED';
        console.log(`║  ${result.channelName.padEnd(10)} | ₹${result.amount.toLocaleString().padStart(10)} | ${status.padEnd(15)} ║`);
        if (result.success && result.orderId) {
            console.log(`║  └─ Order ID: ${result.orderId.padEnd(43)}║`);
        }
        if (result.providerOrderId) {
            console.log(`║  └─ Provider ID: ${result.providerOrderId.padEnd(40)}║`);
        }
    }

    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Total Requested: ₹${totalRequested.toLocaleString().padStart(10).padEnd(38)}║`);
    console.log(`║  Total Submitted: ₹${totalSuccess.toLocaleString().padStart(10).padEnd(38)}║`);
    console.log('╚════════════════════════════════════════════════════════════╝');

    // Return results for further processing if needed
    return results;
}

// Execute
main()
    .then(results => {
        console.log('\n[Script completed]');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error.message);
        process.exit(1);
    });
