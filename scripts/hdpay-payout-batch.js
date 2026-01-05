#!/usr/bin/env node
/**
 * HDPay Batch Payout Script
 * Run with: node scripts/hdpay-payout-batch.js
 * 
 * Makes payout requests in batch of 5000 and 2000 until API returns error
 * Skips balance checking - uses API response to detect insufficient balance
 */

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Database connection
const Sequelize = require('sequelize');
const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        dialect: 'mysql',
        logging: false
    }
);

// =====================================================
// CONFIGURATION - EDIT THIS SECTION
// =====================================================
const TARGET_ACCOUNT = {
    name: 'YOUR_NAME_HERE',          // Recipient name
    type: '0',                        // 0 = Bank Transfer, 1 = UPI

    // For Bank Transfer (type = 0)
    account: 'YOUR_ACCOUNT_NUMBER',   // Bank account number
    ifsc: 'YOUR_IFSC_CODE',          // IFSC code

    // For UPI (type = 1), uncomment and set if using UPI
    // upi: 'your-upi@okaxis',
};

// Batch amounts (in order of priority - tries largest first, then smaller)
const BATCH_AMOUNTS = [5000, 2000];

// Max consecutive failures before stopping (to handle rate limits etc)
const MAX_CONSECUTIVE_FAILURES = 3;

// Delay between requests (ms) to avoid rate limiting
const REQUEST_DELAY = 2000;

// App URL for callbacks
const APP_URL = process.env.APP_URL || 'https://vspay.vip';

// =====================================================
// HDPay API Configuration
// =====================================================
const BASE_URL = process.env.HDPAY_BASE_URL || 'https://dd1688.cc';
const MERCHANT_ID = process.env.HDPAY_MERCHANT_ID;
const SECRET_KEY = process.env.HDPAY_SECRET_KEY;

// Create axios instance
const httpClient = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' }
});

// =====================================================
// Database Model
// =====================================================
const BatchPayout = sequelize.define('BatchPayout', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    orderId: { type: Sequelize.STRING(64), unique: true },
    amount: Sequelize.DECIMAL(12, 2),
    name: Sequelize.STRING(100),
    accountType: Sequelize.STRING(10),
    accountNumber: Sequelize.STRING(50),
    ifsc: Sequelize.STRING(20),
    upi: Sequelize.STRING(100),
    status: { type: Sequelize.STRING(20), defaultValue: 'submitted' },
    providerOrderId: Sequelize.STRING(64),
    utr: Sequelize.STRING(50),
    fee: Sequelize.DECIMAL(10, 2),
    callbackData: Sequelize.TEXT,
    createdAt: Sequelize.DATE,
    updatedAt: Sequelize.DATE
}, {
    tableName: 'batch_payouts',
    timestamps: true
});

// =====================================================
// Helper Functions
// =====================================================

function generateSign(params) {
    const filtered = {};
    Object.keys(params).forEach(key => {
        if (key !== 'sign' && params[key] !== '' && params[key] != null) {
            filtered[key] = params[key];
        }
    });

    const sorted = Object.keys(filtered).sort();
    const query = sorted.map(k => `${k}=${filtered[k]}`).join('&');
    const str = `${query}&key=${SECRET_KEY}`;

    return crypto.createHash('md5').update(str).digest('hex').toLowerCase();
}

function generateOrderId() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `BPOUT_${timestamp}_${random}`;
}

/**
 * Create payout order - returns response to detect balance issues
 */
async function createPayout(orderId, amount) {
    const payload = {
        merchantId: parseInt(MERCHANT_ID),
        merchantPayoutId: orderId,
        amount: String(amount),
        name: TARGET_ACCOUNT.name,
        type: TARGET_ACCOUNT.type,
        notifyUrl: `${APP_URL}/api/callback/hdpay/payout`
    };

    if (TARGET_ACCOUNT.type === '0') {
        payload.account = TARGET_ACCOUNT.account;
        payload.ifsc = TARGET_ACCOUNT.ifsc;
    } else {
        payload.upi = TARGET_ACCOUNT.upi;
    }

    payload.sign = generateSign(payload);

    try {
        const response = await httpClient.post('/api/payout/submit', payload);
        const isSuccess = response.data.code === 200;
        const errorMsg = response.data.msg || '';

        // Detect balance-related errors
        const isBalanceError = errorMsg.toLowerCase().includes('balance') ||
            errorMsg.toLowerCase().includes('insufficient') ||
            errorMsg.toLowerCase().includes('not enough') ||
            errorMsg.toLowerCase().includes('余额') ||
            response.data.code === 4001 || // Common code for insufficient balance
            response.data.code === 4002;

        return {
            success: isSuccess,
            data: response.data.data,
            error: errorMsg,
            code: response.data.code,
            isBalanceError: isBalanceError,
            rawResponse: response.data
        };
    } catch (error) {
        return { success: false, error: error.message, isBalanceError: false };
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type}] ${message}`;
    console.log(logMessage);

    fs.appendFileSync(
        path.join(__dirname, 'payout-log.txt'),
        logMessage + '\n',
        'utf8'
    );
}

// =====================================================
// Main Execution
// =====================================================

async function main() {
    console.log('=========================================');
    console.log('   HDPay Batch Payout Script');
    console.log('   (No Balance Check Mode)');
    console.log('=========================================');
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Merchant ID: ${MERCHANT_ID}`);
    console.log(`Target Account: ${TARGET_ACCOUNT.name}`);
    console.log(`Type: ${TARGET_ACCOUNT.type === '0' ? 'Bank Transfer' : 'UPI'}`);
    console.log(`Batch Amounts: ${BATCH_AMOUNTS.join(', ')}`);
    console.log(`Callback URL: ${APP_URL}/api/callback/hdpay/payout`);
    console.log('=========================================\n');

    // Validate configuration
    if (!MERCHANT_ID || !SECRET_KEY) {
        log('Missing HDPAY_MERCHANT_ID or HDPAY_SECRET_KEY in .env', 'ERROR');
        process.exit(1);
    }

    if (TARGET_ACCOUNT.name === 'YOUR_NAME_HERE') {
        log('Please configure TARGET_ACCOUNT in the script before running', 'ERROR');
        process.exit(1);
    }

    // Connect to database
    try {
        await sequelize.authenticate();
        log('Database connected');
        await BatchPayout.sync({ alter: true });
        log('BatchPayout table ready');
    } catch (error) {
        log(`Database error: ${error.message}`, 'ERROR');
        process.exit(1);
    }

    // Stats tracking
    const stats = {
        totalRequests: 0,
        successfulPayouts: 0,
        failedPayouts: 0,
        totalAmount: 0,
        orders: []
    };

    let consecutiveFailures = 0;
    let currentAmountIndex = 0;
    let keepRunning = true;

    log('Starting batch payouts (will stop on balance error)...');

    // Main loop - keeps trying until balance error or max failures
    while (keepRunning && currentAmountIndex < BATCH_AMOUNTS.length) {
        const payoutAmount = BATCH_AMOUNTS[currentAmountIndex];
        const orderId = generateOrderId();
        stats.totalRequests++;

        log(`Creating payout #${stats.totalRequests}: ₹${payoutAmount} | Order: ${orderId}`);

        const result = await createPayout(orderId, payoutAmount);

        if (result.success) {
            consecutiveFailures = 0;
            stats.successfulPayouts++;
            stats.totalAmount += payoutAmount;

            stats.orders.push({
                orderId,
                amount: payoutAmount,
                status: 'submitted',
                providerOrderId: result.data?.payoutId,
                time: new Date().toISOString()
            });

            // Store in database
            try {
                await BatchPayout.create({
                    orderId: orderId,
                    amount: payoutAmount,
                    name: TARGET_ACCOUNT.name,
                    accountType: TARGET_ACCOUNT.type === '0' ? 'bank' : 'upi',
                    accountNumber: TARGET_ACCOUNT.account || null,
                    ifsc: TARGET_ACCOUNT.ifsc || null,
                    upi: TARGET_ACCOUNT.upi || null,
                    status: 'submitted',
                    providerOrderId: result.data?.payoutId,
                    callbackData: JSON.stringify(result.rawResponse)
                });
            } catch (dbError) {
                log(`⚠ DB save error: ${dbError.message}`, 'WARN');
            }

            log(`✓ Payout submitted: ${orderId} | Platform ID: ${result.data?.payoutId}`, 'SUCCESS');

        } else {
            // Failed - check why
            log(`✗ Payout failed: ${result.error} (code: ${result.code})`, 'ERROR');

            if (result.isBalanceError) {
                log(`Balance insufficient for ₹${payoutAmount}`, 'WARN');

                // Try smaller amount
                currentAmountIndex++;
                if (currentAmountIndex < BATCH_AMOUNTS.length) {
                    log(`Trying smaller amount: ₹${BATCH_AMOUNTS[currentAmountIndex]}`, 'INFO');
                    consecutiveFailures = 0;
                } else {
                    log('No smaller amounts to try. Stopping.', 'WARN');
                    keepRunning = false;
                }
            } else {
                consecutiveFailures++;
                stats.failedPayouts++;
                stats.orders.push({
                    orderId,
                    amount: payoutAmount,
                    status: 'failed',
                    error: result.error,
                    time: new Date().toISOString()
                });

                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                    log(`${MAX_CONSECUTIVE_FAILURES} consecutive failures. Stopping.`, 'ERROR');
                    keepRunning = false;
                }
            }
        }

        if (keepRunning) {
            await delay(REQUEST_DELAY);
        }
    }

    // Print summary
    console.log('\n=========================================');
    console.log('   PAYOUT SUMMARY');
    console.log('=========================================');
    console.log(`Total Requests: ${stats.totalRequests}`);
    console.log(`Successful: ${stats.successfulPayouts}`);
    console.log(`Failed: ${stats.failedPayouts}`);
    console.log(`Total Amount Submitted: ₹${stats.totalAmount.toFixed(2)}`);
    console.log('=========================================\n');

    // Save results
    const logPath = path.join(__dirname, `payout-results-${Date.now()}.json`);
    fs.writeFileSync(logPath, JSON.stringify(stats, null, 2));
    log(`Results saved to: ${logPath}`);

    // Print all orders
    console.log('\nAll Orders:');
    console.log('-'.repeat(90));
    stats.orders.forEach((order, i) => {
        console.log(`${i + 1}. ${order.orderId} | ₹${order.amount} | ${order.status} | ${order.providerOrderId || order.error || ''}`);
    });

    console.log('\n=========================================');
    console.log('   CHECK STATUS');
    console.log('=========================================');
    console.log('Run: node scripts/hdpay-check-payouts.js');
    console.log('=========================================\n');

    await sequelize.close();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
