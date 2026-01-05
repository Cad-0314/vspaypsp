#!/usr/bin/env node
/**
 * HDPay Payout Status Checker
 * Run with: node scripts/hdpay-check-payouts.js
 * 
 * Checks the status of all batch payouts and queries HDPay API for updates
 */

const crypto = require('crypto');
const axios = require('axios');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Database connection
const Sequelize = require('sequelize');
const { DataTypes, Op } = Sequelize;
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

// HDPay Configuration
const BASE_URL = process.env.HDPAY_BASE_URL || 'https://dd1688.cc';
const MERCHANT_ID = process.env.HDPAY_MERCHANT_ID;
const SECRET_KEY = process.env.HDPAY_SECRET_KEY;

const httpClient = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' }
});

// BatchPayout model
const BatchPayout = sequelize.define('BatchPayout', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    orderId: { type: DataTypes.STRING(64), unique: true },
    amount: DataTypes.DECIMAL(12, 2),
    name: DataTypes.STRING(100),
    accountType: DataTypes.STRING(10),
    accountNumber: DataTypes.STRING(50),
    ifsc: DataTypes.STRING(20),
    upi: DataTypes.STRING(100),
    status: { type: DataTypes.STRING(20), defaultValue: 'submitted' },
    providerOrderId: DataTypes.STRING(64),
    utr: DataTypes.STRING(50),
    fee: DataTypes.DECIMAL(10, 2),
    callbackData: DataTypes.TEXT,
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
}, {
    tableName: 'batch_payouts',
    timestamps: true,
    freezeTableName: true
});

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

async function main() {
    console.log('=========================================');
    console.log('   HDPay Batch Payout Status Checker');
    console.log('=========================================\n');

    // Connect to database
    try {
        await sequelize.authenticate();
        console.log('Database connected\n');
    } catch (error) {
        console.error('Database error:', error.message);
        process.exit(1);
    }

    // Get all batch payouts
    const payouts = await BatchPayout.findAll({
        order: [['createdAt', 'DESC']]
    });

    if (payouts.length === 0) {
        console.log('No batch payouts found.');
        await sequelize.close();
        return;
    }

    console.log(`Found ${payouts.length} batch payouts\n`);

    let successCount = 0;
    let failedCount = 0;
    let pendingCount = 0;
    let totalAmount = 0;
    let successAmount = 0;

    // Summary table header
    console.log('-'.repeat(120));
    console.log(
        'Order ID'.padEnd(30) +
        'Amount'.padEnd(10) +
        'Status'.padEnd(15) +
        'UTR'.padEnd(20) +
        'Provider ID'.padEnd(25) +
        'Created'
    );
    console.log('-'.repeat(120));

    for (const payout of payouts) {
        let status = payout.status;
        let utr = payout.utr || '-';

        // If still pending, query HDPay for update
        if (status === 'submitted' || status === 'processing') {
            const result = await queryPayout(payout.orderId);
            if (result.success && result.data) {
                const apiStatus = result.data.status === '1' ? 'success' :
                    result.data.status === '2' ? 'failed' : 'processing';

                if (apiStatus !== status || result.data.utr) {
                    await payout.update({
                        status: apiStatus,
                        utr: result.data.utr || payout.utr,
                        providerOrderId: result.data.payoutId || payout.providerOrderId
                    });
                    status = apiStatus;
                    utr = result.data.utr || utr;
                }
            }
        }

        // Count stats
        totalAmount += parseFloat(payout.amount);
        if (status === 'success') {
            successCount++;
            successAmount += parseFloat(payout.amount);
        } else if (status === 'failed') {
            failedCount++;
        } else {
            pendingCount++;
        }

        // Print row
        const statusIcon = status === 'success' ? '✓' : status === 'failed' ? '✗' : '⋯';
        console.log(
            payout.orderId.padEnd(30) +
            `₹${parseFloat(payout.amount).toFixed(0)}`.padEnd(10) +
            `${statusIcon} ${status}`.padEnd(15) +
            (utr || '-').padEnd(20) +
            (payout.providerOrderId || '-').padEnd(25) +
            new Date(payout.createdAt).toLocaleString('en-IN')
        );
    }

    console.log('-'.repeat(120));
    console.log('\nSummary:');
    console.log(`  Total Payouts: ${payouts.length}`);
    console.log(`  Successful: ${successCount} (₹${successAmount.toFixed(2)})`);
    console.log(`  Failed: ${failedCount}`);
    console.log(`  Pending: ${pendingCount}`);
    console.log(`  Total Amount: ₹${totalAmount.toFixed(2)}`);

    await sequelize.close();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
