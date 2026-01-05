#!/usr/bin/env node
/**
 * HDPay Batch Payout Script
 * Run with: node scripts/hdpay-payout-batch.js
 * 
 * Makes payout requests in batch of 5000 and 2000 until balance is low
 * Stores all payouts in database for proper callback handling
 */

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');

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

// Batch amounts (in order of priority)
const BATCH_AMOUNTS = [5000, 2000];

// Minimum balance to keep (stop when balance goes below this)
const MIN_BALANCE = 1000;

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
// Database Model (Simple inline for standalone script)
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

/**
 * Generate MD5 signature for HDPay
 */
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

/**
 * Verify callback signature
 */
function verifySign(params) {
    const receivedSign = params.sign;
    const calculatedSign = generateSign(params);
    return receivedSign === calculatedSign;
}

/**
 * Generate unique order ID
 */
function generateOrderId() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `BPOUT_${timestamp}_${random}`;
}

/**
 * Get current balance
 */
async function getBalance() {
    const payload = {
        merchantId: parseInt(MERCHANT_ID)
    };
    payload.sign = generateSign(payload);

    try {
        const response = await httpClient.post('/api/payout/balance', payload);
        if (response.data.code === 200) {
            const balance = parseFloat(response.data.data) || 0;
            return { success: true, balance };
        }
        return { success: false, error: response.data.msg };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Create payout order
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
        return {
            success: response.data.code === 200,
            data: response.data.data,
            error: response.data.msg,
            rawResponse: response.data
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Query payout status
 */
async function queryPayout(orderId) {
    const payload = {
        merchantId: parseInt(MERCHANT_ID),
        merchantPayoutId: orderId
    };
    payload.sign = generateSign(payload);

    try {
        const response = await httpClient.post('/api/payout/query', payload);
        if (response.data.code === 200) {
            return { success: true, data: response.data.data };
        }
        return { success: false, error: response.data.msg };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Delay helper
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Log with timestamp
 */
function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type}] ${message}`;
    console.log(logMessage);

    // Also append to log file
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
    console.log('=========================================');
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Merchant ID: ${MERCHANT_ID}`);
    console.log(`Target Account: ${TARGET_ACCOUNT.name}`);
    console.log(`Type: ${TARGET_ACCOUNT.type === '0' ? 'Bank Transfer' : 'UPI'}`);
    console.log(`Batch Amounts: ${BATCH_AMOUNTS.join(', ')}`);
    console.log(`Min Balance: ${MIN_BALANCE}`);
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

    // Connect to database and sync table
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

    // Get initial balance
    log('Fetching initial balance...');
    const balanceResult = await getBalance();

    if (!balanceResult.success) {
        log(`Failed to get balance: ${balanceResult.error}`, 'ERROR');
        process.exit(1);
    }

    let currentBalance = balanceResult.balance;
    log(`Initial Balance: ₹${currentBalance.toFixed(2)}`);

    // Main loop
    while (currentBalance > MIN_BALANCE) {
        // Determine the best amount to use
        let payoutAmount = null;
        for (const amount of BATCH_AMOUNTS) {
            if (currentBalance >= amount + MIN_BALANCE) {
                payoutAmount = amount;
                break;
            }
        }

        if (!payoutAmount) {
            log(`Balance (₹${currentBalance.toFixed(2)}) too low for any batch amount`);
            break;
        }

        // Generate order ID
        const orderId = generateOrderId();
        stats.totalRequests++;

        log(`Creating payout #${stats.totalRequests}: ₹${payoutAmount} | Order: ${orderId}`);

        // Create payout
        const result = await createPayout(orderId, payoutAmount);

        if (result.success) {
            stats.successfulPayouts++;
            stats.totalAmount += payoutAmount;

            const orderInfo = {
                orderId,
                amount: payoutAmount,
                status: 'submitted',
                providerOrderId: result.data?.payoutId,
                time: new Date().toISOString()
            };
            stats.orders.push(orderInfo);

            // Store in database for callback handling
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
                log(`✓ Payout saved to DB: ${orderId}`, 'SUCCESS');
            } catch (dbError) {
                log(`⚠ Failed to save to DB: ${dbError.message}`, 'WARN');
            }

            log(`✓ Payout submitted: ${orderId} | Platform ID: ${result.data?.payoutId}`, 'SUCCESS');

            // Deduct from expected balance
            currentBalance -= payoutAmount;
            log(`Expected Balance: ₹${currentBalance.toFixed(2)}`);
        } else {
            stats.failedPayouts++;
            stats.orders.push({
                orderId,
                amount: payoutAmount,
                status: 'failed',
                error: result.error,
                time: new Date().toISOString()
            });

            log(`✗ Payout failed: ${result.error}`, 'ERROR');

            // Check if it's a balance error
            if (result.error && (
                result.error.toLowerCase().includes('balance') ||
                result.error.toLowerCase().includes('insufficient')
            )) {
                log('Insufficient balance detected, stopping...', 'WARN');
                break;
            }
        }

        // Refresh balance every 5 requests
        if (stats.totalRequests % 5 === 0) {
            log('Refreshing balance...');
            const refreshResult = await getBalance();
            if (refreshResult.success) {
                currentBalance = refreshResult.balance;
                log(`Actual Balance: ₹${currentBalance.toFixed(2)}`);
            }
        }

        // Delay before next request
        await delay(REQUEST_DELAY);
    }

    // Final balance check
    const finalBalance = await getBalance();

    // Print summary
    console.log('\n=========================================');
    console.log('   PAYOUT SUMMARY');
    console.log('=========================================');
    console.log(`Total Requests: ${stats.totalRequests}`);
    console.log(`Successful: ${stats.successfulPayouts}`);
    console.log(`Failed: ${stats.failedPayouts}`);
    console.log(`Total Amount Submitted: ₹${stats.totalAmount.toFixed(2)}`);
    console.log(`Final Balance: ₹${finalBalance.success ? finalBalance.balance.toFixed(2) : 'Unknown'}`);
    console.log('=========================================\n');

    // Save detailed log
    const logPath = path.join(__dirname, `payout-results-${Date.now()}.json`);
    fs.writeFileSync(logPath, JSON.stringify(stats, null, 2));
    log(`Detailed results saved to: ${logPath}`);

    // Print all orders
    console.log('\nAll Orders:');
    console.log('-'.repeat(80));
    stats.orders.forEach((order, i) => {
        console.log(`${i + 1}. ${order.orderId} | ₹${order.amount} | ${order.status} | ${order.providerOrderId || order.error || ''}`);
    });

    console.log('\n=========================================');
    console.log('   CALLBACK MONITORING');
    console.log('=========================================');
    console.log('All payouts are stored in the batch_payouts table.');
    console.log(`Callbacks will be received at: ${APP_URL}/api/callback/hdpay/payout`);
    console.log('Use: node scripts/hdpay-check-payouts.js to check final statuses');
    console.log('=========================================\n');

    // Close database connection
    await sequelize.close();
}

// Run the script
main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
