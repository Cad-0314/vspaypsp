require('dotenv').config({ path: __dirname + '/../.env' });
const { Order, User, sequelize } = require('../src/models');
const axios = require('axios');

async function testEasyPayMPOUT() {
    try {
        console.log('--- Testing MPOUT Callback for EasyPay ---');

        // 1. Find Admin
        const admin = await User.findOne({ where: { role: 'admin' } });
        if (!admin) {
            console.error('Admin not found');
            process.exit(1);
        }

        const initialBalance = parseFloat(admin.balance);
        console.log(`Admin Initial Balance: ${initialBalance}`);

        // 2. Create MPOUT Order
        const orderId = `MPOUT${Date.now()}TEST`;
        console.log(`Creating test order: ${orderId}`);

        const order = await Order.create({
            merchantId: admin.id,
            orderId: orderId,
            channelName: 'easypay',
            type: 'payout',
            payoutType: 'bank',
            amount: 100,
            netAmount: 100,
            fee: 5,
            status: 'processing',
            payoutDetails: {
                bankName: 'Test Bank',
                accountNumber: '1234567890',
                ifsc: 'TEST0001',
                accountHolderName: 'Test User'
            }
        });

        console.log(`Order created with status: ${order.status}`);

        // 3. Simulate EasyPay Payout Callback
        const callbackPayload = {
            orderId: orderId,
            status: 1,
            amount: '100.00',
            realAmount: '100.00',
            platformOrderId: `EASYPAY_${Date.now()}`,
            utr: `UTR${Date.now()}`
        };

        console.log('Sending callback payload:', callbackPayload);

        const response = await axios.post(`http://localhost:${process.env.PORT || 3000}/callback/easypay/payout`, callbackPayload);

        console.log(`Callback Response Status: ${response.status}`);
        console.log(`Callback Response Body: ${JSON.stringify(response.data)}`);

        // 4. Verify Order Status
        const updatedOrder = await Order.findOne({ where: { orderId: orderId } });
        console.log(`Updated Order Status: ${updatedOrder.status}`);
        console.log(`Updated Order UTR: ${updatedOrder.utr}`);

        if (updatedOrder.status !== 'success') {
            console.error('❌ MPOUT callback failed to update status to success');
        } else {
            console.log('✅ MPOUT callback updated status correctly');
        }

        // 5. Verify Admin Balance (should be untouched)
        const updatedAdmin = await User.findOne({ where: { role: 'admin' } });
        console.log(`Admin Final Balance: ${parseFloat(updatedAdmin.balance)}`);

        if (parseFloat(updatedAdmin.balance) !== initialBalance) {
            console.error('❌ MPOUT callback erroneously affected admin balance!');
        } else {
            console.log('✅ Admin balance remained untouched.');
        }

    } catch (e) {
        console.error('Test Failed:', e.message);
        if (e.response) {
            console.error('Response Status:', e.response.status);
            console.error('Response Data:', e.response.data);
        } else if (e.request) {
            console.error('No response received (server might not be running on that port).');
        } else {
            console.error('Axios Error:', e);
        }
    } finally {
        await sequelize.close();
        process.exit();
    }
}

testEasyPayMPOUT();
