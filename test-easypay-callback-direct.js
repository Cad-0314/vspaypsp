const express = require('express');
const axios = require('axios');
require('dotenv').config();
const { sequelize, Order, User } = require('./src/models');
const callbackRoutes = require('./src/routes/api/callbacks');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/callback', callbackRoutes);

const PORT = 3005;

app.listen(PORT, async () => {
    console.log(`[Test] Server running on port ${PORT}`);

    await sequelize.authenticate();

    // Find a merchant to assign the order to
    const merchant = await User.findOne({ where: { role: 'merchant' } });
    if (!merchant) {
        console.error('No merchant found to create test order');
        process.exit(1);
    }

    // Create a dummy order in the DB
    const orderId = 'TEST_PO_EP_' + Date.now();
    try {
        await Order.create({
            orderId: orderId,
            merchantId: merchant.id,
            type: 'payout',
            amount: 500,
            fee: 25,
            netAmount: 475,
            status: 'processing',
            channel: 'easypay',
            channelName: 'easypay',
            callbackUrl: 'http://localhost:3005/dummy/callback'
        });
        console.log(`[Test] Created test order ${orderId} in database for merchant ${merchant.id}`);
    } catch (err) {
        console.error('[Test] Error creating test order:', err.message);
        process.exit(1);
    }

    const SECRET_KEY = process.env.EASYPAY_SECRET_KEY;
    function generateSign(params) {
        const sortedKeys = Object.keys(params)
            .filter(k => k !== 'sign' && params[k] !== null && params[k] !== undefined && params[k] !== '')
            .sort();
        const str = sortedKeys.map(k => `${k}=${params[k]}`).join('&') + `&key=${SECRET_KEY}`;
        return crypto.createHash('md5').update(str).digest('hex').toLowerCase();
    }

    const payload = {
        apiKey: process.env.EASYPAY_MERCHANT_ID,
        platformorderId: 'P0' + Date.now(),
        orderId: orderId,
        status: 1,
        statusMessage: 'SUCCESS',
        amount: '500.00',
        fee: '25.00',
        utr: 'UTR' + Date.now(),
        beneficiaryName: 'Amit Test',
        beneficiaryAccount: '357910864201',
        createTime: '2026-03-01',
        cashInTime: '14:40:25'
    };

    payload.sign = generateSign(payload);

    try {
        console.log('[Test] Sending callback payload via HTTP POST...');
        const res = await axios.post(`http://localhost:${PORT}/api/callback/easypay/payout`, payload);
        console.log('[Test] Callback Response Status:', res.status, res.data);

        // Wait a bit, then check DB
        setTimeout(async () => {
            const updated = await Order.findOne({ where: { orderId } });
            console.log('[Test] Order status in DB after callback:', updated ? updated.status : 'not found');
            console.log('[Test] Order UTR in DB after callback:', updated ? updated.utr : 'not found');
            process.exit(0);
        }, 1500);
    } catch (err) {
        console.error('[Test] Test error:', err.message);
        process.exit(1);
    }
});
