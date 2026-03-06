const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { Order, User, Channel } = require('./src/models');
const easypay = require('./src/services/easypay');
const sequelize = require('./src/config/database');
require('dotenv').config();

const SECRET_KEY = process.env.EASYPAY_SECRET_KEY;
const MERCHANT_ID = process.env.EASYPAY_MERCHANT_ID;

async function runTest() {
    try {
        console.log('--- EasyPay Payout E2E Test ---');

        // 1. Find a merchant to use for the test
        const merchant = await User.findOne({ where: { role: 'merchant', isActive: true } });
        if (!merchant) {
            console.error('No active merchant found in database. Exiting.');
            process.exit(1);
        }
        console.log(`[1] Selected merchant: ${merchant.username} (ID: ${merchant.id})`);

        // 2. Ensure EasyPay channel exists
        let channel = await Channel.findOne({ where: { name: 'easypay' } });
        if (!channel) {
            console.log('EasyPay channel not found, creating it...');
            channel = await Channel.create({
                name: 'easypay',
                displayName: 'EasyPay',
                provider: 'easypay',
                isActive: true,
                payoutRate: 3.0,
                payoutFixedFee: 6.0
            });
        }

        // 3. Create a test payout order in our DB
        const testOrderId = 'TEST_EP_BPOUT_' + Date.now();
        const payoutAmount = 500;
        const totalFee = 21; // Example fee
        const internalId = uuidv4();

        console.log(`[2] Creating Order in DB with ID: ${testOrderId}`);
        const order = await Order.create({
            id: internalId,
            merchantId: merchant.id,
            orderId: testOrderId,
            channelName: 'easypay',
            type: 'payout',
            payoutType: 'bank',
            amount: payoutAmount,
            fee: totalFee,
            netAmount: payoutAmount,
            status: 'processing',
            callbackUrl: 'http://localhost:3000/api/mock/merchant_callback',
            payoutDetails: {
                account: '357910864201',
                ifsc: 'HDFC0001234',
                personName: 'Amit Test'
            }
        });

        // 4. Call EasyPay service to create payout on upstream
        const callbackUrl = 'http://localhost:3000/callback/easypay/payout';
        console.log(`[3] Sending payout request to EasyPay upstream via service...`);
        const payoutResult = await easypay.createPayout({
            orderId: testOrderId,
            amount: payoutAmount,
            name: 'Amit Test',
            accountNo: '357910864201',
            ifsc: 'HDFC0001234',
            notifyUrl: callbackUrl,
            customerPhone: '9876543210',
            customerEmail: 'test@example.com'
        });

        console.log('[EasyPay Create Payout Result]:', payoutResult);

        if (payoutResult.success) {
            await order.update({
                providerOrderId: payoutResult.providerOrderId || `PE_${Date.now()}`
            });
            console.log(`Order updated with providerOrderId: ${order.providerOrderId}`);
        } else {
            console.warn('[Warning] Upstream API call failed. Proceeding with local callback test using a mock providerOrderId.');
            await order.update({
                providerOrderId: `MOCK_PE_${Date.now()}`
            });
        }

        // 5. Simulate Upstream Callback to our webhook
        console.log(`[4] Simulating Upstream Webhook Callback to ${callbackUrl}...`);

        const payload = {
            apiKey: MERCHANT_ID,
            platformorderId: order.providerOrderId,
            orderId: testOrderId,
            status: 1, // 1 for success in EasyPay payout
            statusMessage: 'SUCCESS',
            amount: payoutAmount.toString(),
            fee: '25.00',
            utr: 'UTR_' + Date.now(),
            beneficiaryName: 'Amit Test',
            beneficiaryAccount: '357910864201',
            createTime: new Date().toISOString().split('T')[1].substring(0, 8),
            cashInTime: new Date().toISOString().split('T')[1].substring(0, 8)
        };

        payload.sign = easypay.generateSign(payload);

        let callbackRes;
        try {
            callbackRes = await axios.post(callbackUrl, payload);
            console.log(`[Callback Trigger Result]: Status = ${callbackRes.status}, Data = ${callbackRes.data}`);
        } catch (err) {
            console.error(`[Error] Failed to trigger local callback webhook (Is the server running on port 3000?). ${err.message}`);
        }

        // 6. Verify Database Status
        console.log(`[5] Verifying Order status in DB...`);
        // Wait 2 seconds for processing if callback was async
        await new Promise(r => setTimeout(r, 2000));

        const updatedOrder = await Order.findOne({ where: { id: internalId } });
        console.log(`============= Final Order Status =============`);
        console.log(`Order ID: ${updatedOrder.orderId}`);
        console.log(`Provider Order ID: ${updatedOrder.providerOrderId}`);
        console.log(`Status: ${updatedOrder.status} (Expected: success)`);
        console.log(`UTR: ${updatedOrder.utr}`);
        console.log(`==============================================`);

        if (updatedOrder.status === 'success') {
            console.log('✅ TEST PASSED: Callback received and processed successfully!');
        } else {
            console.log('❌ TEST FAILED: Order status is not success. Did the callback hit the server successfully?');
        }

    } catch (error) {
        console.error('Test execution failed:', error);
    } finally {
        await sequelize.close();
        console.log('DB Connection closed.');
    }
}

runTest();
