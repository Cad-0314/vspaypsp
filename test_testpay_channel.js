/**
 * Test Script: Verify TestPay channel for Indian merchants
 * 
 * 1. Queries the DB to find a merchant using testpay channel
 * 2. Generates correct signature
 * 3. Makes a V3 deposit/create call against the live server
 * 4. Reports full results
 */

const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

const APP_URL = process.env.APP_URL || 'https://gaurpay.site';

// --- Signature helper (matches apiAuth.js) ---
function generateSignature(params, secretKey) {
    const filtered = {};
    Object.keys(params).forEach(key => {
        if (key !== 'sign' && params[key] !== '' && params[key] != null) {
            filtered[key] = params[key];
        }
    });
    const sorted = Object.keys(filtered).sort();
    const query = sorted.map(k => `${k}=${filtered[k]}`).join('&');
    const str = `${query}&secret=${secretKey}`;
    return crypto.createHash('md5').update(str).digest('hex').toUpperCase();
}

async function run() {
    console.log('===========================================');
    console.log('  TestPay Channel - Integration Test');
    console.log('===========================================\n');

    // Step 1: Find a merchant assigned to testpay from DB
    console.log('[Step 1] Querying DB for merchants on testpay channel...');
    
    let merchant = null;
    try {
        const { User } = require('./src/models');
        const { Sequelize } = require('sequelize');
        
        // Find any merchant using testpay
        const merchants = await User.findAll({
            where: {
                role: 'merchant',
                [Sequelize.Op.or]: [
                    { payinChannel: 'testpay' },
                    { assignedChannel: 'testpay' }
                ]
            },
            attributes: ['id', 'username', 'apiKey', 'apiSecret', 'payinChannel', 'payoutChannel', 'assignedChannel', 'isActive', 'canPayin']
        });

        if (merchants.length > 0) {
            merchant = merchants[0];
            console.log(`  ✓ Found merchant: ${merchant.username}`);
            console.log(`    API Key: ${merchant.apiKey}`);
            console.log(`    PayIn Channel: ${merchant.payinChannel}`);
            console.log(`    Active: ${merchant.isActive}, CanPayin: ${merchant.canPayin}`);
        } else {
            console.log('  ✗ No merchant found on testpay channel.');
            console.log('  → Checking ALL merchants to find one to test with...\n');
            
            const allMerchants = await User.findAll({
                where: { role: 'merchant' },
                attributes: ['id', 'username', 'apiKey', 'apiSecret', 'payinChannel', 'payoutChannel', 'assignedChannel', 'isActive', 'canPayin']
            });
            
            console.log('  Available merchants:');
            for (const m of allMerchants) {
                console.log(`    - ${m.username} | API Key: ${m.apiKey} | PayIn: ${m.payinChannel} | Active: ${m.isActive}`);
            }
            
            if (allMerchants.length === 0) {
                console.log('  ✗ No merchants found at all. Exiting.');
                process.exit(1);
            }
        }
    } catch (dbErr) {
        console.error('  ✗ DB query failed:', dbErr.message);
        console.log('  → Will test with direct service call instead.\n');
    }

    // Step 2: Test the testpay service directly (no network needed)
    console.log('\n[Step 2] Testing testpay service directly (local)...');
    try {
        const testpayService = require('./src/services/testpay');
        const testOrderId = `TEST_${Date.now()}`;
        
        const result = await testpayService.createPayin({
            orderId: testOrderId,
            amount: 500,
            notifyUrl: `${APP_URL}/callback/testpay/payin`,
            returnUrl: `${APP_URL}/pay/success`,
            customerName: 'Test User',
            customerEmail: 'test@example.com',
            customerPhone: '9999999999',
            customerIp: '127.0.0.1'
        });

        console.log(`  ✓ createPayin result:`, JSON.stringify(result, null, 2));

        // Test queryPayin
        const queryResult = await testpayService.queryPayin(testOrderId);
        console.log(`  ✓ queryPayin result:`, JSON.stringify(queryResult, null, 2));

        // Test getBalance
        const balanceResult = await testpayService.getBalance();
        console.log(`  ✓ getBalance result:`, JSON.stringify(balanceResult, null, 2));

        // Test payout
        const payoutResult = await testpayService.createPayout({
            orderId: `PAYOUT_${Date.now()}`,
            amount: 300,
            accountNo: '1234567890',
            ifsc: 'SBIN0001234',
            name: 'Test Payout User',
            notifyUrl: `${APP_URL}/callback/testpay/payout`
        });
        console.log(`  ✓ createPayout result:`, JSON.stringify(payoutResult, null, 2));

    } catch (serviceErr) {
        console.error(`  ✗ Service test failed:`, serviceErr.message);
    }

    // Step 3: Test via live HTTP API (if merchant found)
    if (merchant && merchant.apiKey && merchant.apiSecret) {
        console.log(`\n[Step 3] Testing V3 deposit/create via live API (${APP_URL})...`);
        
        const refId = `TESTAPI_${Date.now()}`;
        const body = {
            ref_id: refId,
            txn_amount: '500',
            webhook_url: `${APP_URL}/callback/testpay/payin`,
            return_url: `${APP_URL}/pay/success`,
            payer_name: 'Test User',
            payer_email: 'test@example.com',
            payer_phone: '9999999999'
        };

        const signature = generateSignature(body, merchant.apiSecret);
        
        console.log(`  Merchant: ${merchant.username}`);
        console.log(`  API Key: ${merchant.apiKey}`);
        console.log(`  Ref ID: ${refId}`);
        console.log(`  Signature: ${signature}`);
        console.log(`  Body:`, JSON.stringify(body, null, 2));

        try {
            const response = await axios.post(`${APP_URL}/v3/deposit/create`, body, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'x-merchant-id': merchant.apiKey,
                    'x-signature': signature
                },
                timeout: 15000
            });

            console.log(`  ✓ API Response (${response.status}):`, JSON.stringify(response.data, null, 2));
        } catch (apiErr) {
            if (apiErr.response) {
                console.error(`  ✗ API Error (${apiErr.response.status}):`, JSON.stringify(apiErr.response.data, null, 2));
            } else {
                console.error(`  ✗ API Error:`, apiErr.message);
            }
        }
    } else {
        console.log('\n[Step 3] Skipped live API test - no testpay merchant found with credentials.');
    }

    // Step 4: Verify channel registration
    console.log('\n[Step 4] Verifying testpay channel registration...');
    try {
        const channelRouter = require('./src/services/channelRouter');
        
        const config = channelRouter.getChannelConfig('testpay');
        console.log(`  Channel Config: ${config ? '✓ Registered' : '✗ NOT registered'}`);
        if (config) {
            console.log(`    Display: ${config.displayName} / ${config.displayNameZh}`);
            console.log(`    Provider: ${config.provider}`);
            console.log(`    Currency: ${config.currency}`);
        }

        const isValid = channelRouter.isValidChannel('testpay');
        console.log(`  isValidChannel: ${isValid ? '✓ true' : '✗ false'}`);

        // Check callback parsers
        const parsers = require('./src/services/callbackParsers');
        console.log(`  Payin Parser: ${parsers.payinParsers.testpay ? '✓ Registered' : '✗ NOT registered'}`);
        console.log(`  Payout Parser: ${parsers.payoutParsers.testpay ? '✓ Registered' : '✗ NOT registered'}`);
    } catch (regErr) {
        console.error(`  ✗ Registration check failed:`, regErr.message);
    }

    // Step 5: Check DB channel record
    console.log('\n[Step 5] Checking testpay channel in DB...');
    try {
        const { Channel } = require('./src/models');
        const dbChannel = await Channel.findOne({ where: { name: 'testpay' } });
        if (dbChannel) {
            console.log(`  ✓ Found in DB:`);
            console.log(`    Active: ${dbChannel.isActive}`);
            console.log(`    PayIn Rate: ${dbChannel.payinRate}%`);
            console.log(`    Payout Rate: ${dbChannel.payoutRate}%`);
            console.log(`    Min PayIn: ₹${dbChannel.minPayin} | Max: ₹${dbChannel.maxPayin}`);
            console.log(`    Min Payout: ₹${dbChannel.minPayout} | Max: ₹${dbChannel.maxPayout}`);
        } else {
            console.log(`  ✗ testpay channel NOT found in DB`);
        }
    } catch (dbErr) {
        console.error(`  ✗ DB check failed:`, dbErr.message);
    }

    console.log('\n===========================================');
    console.log('  Test Complete');
    console.log('===========================================');
    
    // Allow auto-callback setTimeout to fire before exiting
    setTimeout(() => process.exit(0), 5000);
}

run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
