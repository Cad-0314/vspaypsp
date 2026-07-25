/**
 * Withdraw Payout Script - Rohit Axis Account
 * 
 * Withdraws from multiple channels to:
 * - Primary Account Holder: Rohit
 * - Account Number: 924010074497342
 * - IFSC Code: UTIB0002455 (Axis Bank)
 * 
 * Channels:
 * - AgPay: ₹673
 * - FirPay (FirePay): ₹4,618
 * - F2Pay: ₹443
 * - CKPay: ₹189
 * 
 * Withdraw Fee: 3% + ₹6 per channel
 * 
 * Date: 2026-07-25
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const agpay = require('../src/services/agpay');
const firpay = require('../src/services/firpay');
const ckpay = require('../src/services/ckpay');
const f2pay = require('../src/services/f2pay');

// Target bank account details
const ACCOUNT = {
    name: 'Rohit',
    accountNo: '924010074497342',
    ifsc: 'UTIB0002455',
    phone: '9999999999',
    email: 'rohit@payout.com'
};

const APP_URL = process.env.APP_URL || 'https://gaurpay.site';

// Payout configuration — full balance from each channel
const PAYOUTS = [
    {
        provider: 'agpay',
        channelName: 'AG Pay',
        amount: 673,
        service: agpay
    },
    {
        provider: 'firpay',
        channelName: 'Fire Pay',
        amount: 4618,
        service: firpay
    },
    {
        provider: 'ckpay',
        channelName: 'CK Pay',
        amount: 189,
        service: ckpay
    },
    {
        provider: 'f2pay',
        channelName: 'F2 Pay',
        amount: 443,
        service: f2pay
    }
];

// Fee calculation: 3% + ₹6
function calculateFee(amount) {
    return parseFloat((amount * 0.03 + 6).toFixed(2));
}

function calculateNet(amount) {
    return parseFloat((amount - calculateFee(amount)).toFixed(2));
}

// Generate unique order ID
function generateOrderId(prefix) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${prefix}_${timestamp}_${random}`;
}

function formatDate() {
    return new Date().toISOString();
}

// Execute a single payout
async function executePayout(config) {
    const { provider, channelName, amount, service } = config;
    const orderId = generateOrderId(`WD_${provider.toUpperCase()}`);
    const notifyUrl = `${APP_URL}/callback/${provider}/payout`;

    console.log('\n' + '─'.repeat(60));
    console.log(`  [${formatDate()}] Initiating payout from ${channelName}`);
    console.log('─'.repeat(60));
    console.log(`  Order ID     : ${orderId}`);
    console.log(`  Gross Amount : ₹${amount.toLocaleString()}`);
    console.log(`  Fee (3%+₹6)  : ₹${calculateFee(amount)}`);
    console.log(`  Net Payout   : ₹${calculateNet(amount)}`);
    console.log(`  Account      : ${ACCOUNT.accountNo}`);
    console.log(`  IFSC         : ${ACCOUNT.ifsc}`);
    console.log(`  Name         : ${ACCOUNT.name}`);
    console.log('─'.repeat(60));

    try {
        let result;

        if (provider === 'agpay') {
            result = await service.createPayout({
                orderId,
                amount,
                accountNo: ACCOUNT.accountNo,
                ifsc: ACCOUNT.ifsc,
                name: ACCOUNT.name,
                customerPhone: ACCOUNT.phone,
                notifyUrl
            });
        } else if (provider === 'firpay') {
            result = await service.createPayout({
                orderId,
                amount,
                accountNo: ACCOUNT.accountNo,
                ifsc: ACCOUNT.ifsc,
                name: ACCOUNT.name,
                customerPhone: ACCOUNT.phone,
                notifyUrl
            });
        } else if (provider === 'ckpay') {
            result = await service.createPayout({
                orderId,
                amount,
                accountNo: ACCOUNT.accountNo,
                ifsc: ACCOUNT.ifsc,
                name: ACCOUNT.name,
                notifyUrl
            });
        } else if (provider === 'f2pay') {
            result = await service.createPayout({
                orderId,
                amount,
                accountNo: ACCOUNT.accountNo,
                ifsc: ACCOUNT.ifsc,
                name: ACCOUNT.name,
                mobile: ACCOUNT.phone,
                email: ACCOUNT.email,
                notifyUrl
            });
        }

        if (result.success) {
            console.log(`  ✅ PAYOUT SUBMITTED SUCCESSFULLY`);
            console.log(`  Provider Order ID: ${result.providerOrderId || 'Pending'}`);
            console.log(`  Status: ${result.status || 'Processing'}`);
        } else {
            console.log(`  ❌ PAYOUT FAILED`);
            console.log(`  Error: ${result.error || 'Unknown error'}`);
        }

        return {
            provider,
            channelName,
            orderId,
            amount,
            fee: calculateFee(amount),
            net: calculateNet(amount),
            success: result.success,
            providerOrderId: result.providerOrderId,
            status: result.status,
            error: result.error
        };

    } catch (error) {
        console.log(`  ❌ PAYOUT EXCEPTION`);
        console.log(`  Error: ${error.message}`);

        return {
            provider,
            channelName,
            orderId,
            amount,
            fee: calculateFee(amount),
            net: calculateNet(amount),
            success: false,
            error: error.message
        };
    }
}

// Main execution
async function main() {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║      WITHDRAW PAYOUT - ROHIT AXIS BANK ACCOUNT           ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Date    : ${formatDate().padEnd(46)}║`);
    console.log(`║  Account : ${ACCOUNT.accountNo.padEnd(46)}║`);
    console.log(`║  IFSC    : ${ACCOUNT.ifsc.padEnd(46)}║`);
    console.log(`║  Name    : ${ACCOUNT.name.padEnd(46)}║`);
    console.log(`║  Fee     : 3% + ₹6 per channel                           ║`);
    console.log('╚════════════════════════════════════════════════════════════╝');

    const results = [];
    let totalGross = 0;
    let totalFee = 0;
    let totalNet = 0;
    let totalSuccess = 0;

    for (const payout of PAYOUTS) {
        const result = await executePayout(payout);
        results.push(result);
        totalGross += payout.amount;
        totalFee += result.fee;
        totalNet += result.net;
        if (result.success) totalSuccess += result.net;
    }

    // Summary
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    WITHDRAWAL SUMMARY                     ║');
    console.log('╠════════════════════════════════════════════════════════════╣');

    for (const r of results) {
        const status = r.success ? '✅ OK' : '❌ FAIL';
        console.log(`║  ${r.channelName.padEnd(10)} │ Gross: ₹${r.amount.toString().padStart(5)} │ Fee: ₹${r.fee.toString().padStart(7)} │ ${status} ║`);
        if (r.success && r.orderId) {
            console.log(`║  └─ Order: ${r.orderId.padEnd(47)}║`);
        }
        if (r.providerOrderId) {
            console.log(`║  └─ Provider: ${(r.providerOrderId || '').padEnd(43)}║`);
        }
        if (!r.success && r.error) {
            console.log(`║  └─ Error: ${(r.error || '').substring(0, 47).padEnd(47)}║`);
        }
    }

    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Total Gross     : ₹${totalGross.toLocaleString().padStart(10).padEnd(37)}║`);
    console.log(`║  Total Fees      : ₹${totalFee.toFixed(2).padStart(10).padEnd(37)}║`);
    console.log(`║  Total Net       : ₹${totalNet.toFixed(2).padStart(10).padEnd(37)}║`);
    console.log(`║  Success Amount  : ₹${totalSuccess.toFixed(2).padStart(10).padEnd(37)}║`);
    console.log('╚════════════════════════════════════════════════════════════╝');

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
