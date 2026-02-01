/**
 * V2 Transfer API Routes
 * POST /v2/transfer/bank - Bank transfer payout
 * POST /v2/transfer/status - Query transfer status
 */

const express = require('express');
const router = express.Router();

const { validateMerchant } = require('../../../middleware/apiAuth');
const channelRouter = require('../../../services/channelRouter');
const { Order, Channel, User } = require('../../../models');
const { v4: uuidv4 } = require('uuid');
const sequelize = require('../../../config/database');

const APP_URL = process.env.APP_URL || 'https://payable.firestars.co';

// Helper function to build standard response
function buildResponse(success, code, message, data = null) {
    const response = {
        success,
        code,
        message,
        timestamp: new Date().toISOString()
    };
    if (data) response.data = data;
    return response;
}

// Helper function to build error response
function buildError(code, message, errors = null) {
    const response = {
        success: false,
        code,
        message,
        timestamp: new Date().toISOString()
    };
    if (errors) response.errors = errors;
    return response;
}

/**
 * POST /v2/transfer/bank
 * Create bank transfer payout
 */
router.post('/bank', validateMerchant, async (req, res) => {
    try {
        const {
            merchant_order_id,
            amount,
            account_number,
            ifsc_code,
            beneficiary_name,
            notify_url,
            extra_data
        } = req.body;

        const merchant = req.merchant;

        // Fake Payout Logic if suspended
        const isFakePayout = merchant.canPayout === false;

        // Validate required fields
        const errors = [];
        if (!merchant_order_id) errors.push({ field: 'merchant_order_id', message: 'Order ID is required' });
        if (!amount) errors.push({ field: 'amount', message: 'Amount is required' });
        if (!account_number) errors.push({ field: 'account_number', message: 'Account number is required' });
        if (!ifsc_code) errors.push({ field: 'ifsc_code', message: 'IFSC code is required' });
        if (!beneficiary_name) errors.push({ field: 'beneficiary_name', message: 'Beneficiary name is required' });
        if (!notify_url) errors.push({ field: 'notify_url', message: 'Notification URL is required' });

        if (errors.length > 0) {
            return res.json(buildError('MISSING_PARAMS', 'Required parameters missing', errors));
        }

        const payoutAmount = parseFloat(amount);
        if (isNaN(payoutAmount) || payoutAmount < 100) {
            return res.json(buildError('INVALID_AMOUNT', 'Amount must be at least 100'));
        }

        // Check for duplicate
        const existingOrder = await Order.findOne({
            where: { merchantId: merchant.id, orderId: merchant_order_id }
        });

        if (existingOrder) {
            return res.json(buildError('DUPLICATE_ORDER', 'Order ID already exists'));
        }

        // Get channel rates
        const channelName = merchant.payoutChannel || merchant.assignedChannel || 'aapay';
        let channel = await Channel.findOne({ where: { name: channelName, isActive: true } });

        let customRates = {};
        try { customRates = JSON.parse(merchant.channel_rates || '{}'); } catch (e) { }

        const feeRate = customRates.payoutRate || (channel ? channel.payoutRate : 3);
        const fixedFee = customRates.payoutFixedFee || (channel ? channel.payoutFixedFee : 6);
        const totalFee = (payoutAmount * feeRate / 100) + fixedFee;
        const totalDeduction = payoutAmount + totalFee;

        // Check balance
        const currentBalance = parseFloat(merchant.balance);
        if (currentBalance < totalDeduction) {
            return res.json(buildError('INSUFFICIENT_BALANCE',
                `Insufficient balance. Required: ₹${totalDeduction.toFixed(2)}, Available: ₹${currentBalance.toFixed(2)}`));
        }

        // Start transaction
        const t = await sequelize.transaction();

        try {
            // Deduct from merchant balance
            let balanceUpdate = {};
            if (isFakePayout) {
                balanceUpdate = {
                    balance: sequelize.literal(`balance - ${totalDeduction}`)
                };
            } else {
                balanceUpdate = {
                    balance: sequelize.literal(`balance - ${totalDeduction}`),
                    pendingBalance: sequelize.literal(`pendingBalance + ${payoutAmount}`)
                };
            }

            await User.update(balanceUpdate, { where: { id: merchant.id }, transaction: t });

            // Generate internal order ID
            const internalId = uuidv4();

            let orderData = {
                id: internalId,
                merchantId: merchant.id,
                orderId: merchant_order_id,
                channelName: channelName,
                type: 'payout',
                payoutType: 'bank',
                amount: payoutAmount,
                fee: totalFee,
                status: isFakePayout ? 'success' : 'processing',
                callbackUrl: notify_url,
                param: extra_data || '',
                accountNo: account_number,
                ifsc: ifsc_code,
                personName: beneficiary_name
            };

            if (isFakePayout) {
                const fakeUtr = `FAKE${Date.now()}${Math.floor(Math.random() * 1000)}`;
                orderData.utr = fakeUtr;
                orderData.providerOrderId = `FAKE_${uuidv4().substring(0, 8)}`;
            }

            // Create order
            const order = await Order.create(orderData, { transaction: t });

            if (!isFakePayout) {
                // Call upstream provider
                const notifyUrl = `${APP_URL}/callback/${channelName}/payout`;

                const providerResult = await channelRouter.createPayout(channelName, {
                    orderId: merchant_order_id,
                    amount: payoutAmount,
                    account: account_number,
                    ifsc: ifsc_code,
                    personName: beneficiary_name,
                    notifyUrl: notifyUrl
                });

                await order.update({
                    providerOrderId: providerResult.providerOrderId,
                    providerResponse: JSON.stringify(providerResult)
                }, { transaction: t });
            }

            await t.commit();

            // Calculate estimated completion
            const estimatedCompletion = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

            return res.json(buildResponse(true, 'SUCCESS', 'Transfer initiated', {
                merchant_order_id: merchant_order_id,
                platform_order_id: internalId,
                amount: parseFloat(payoutAmount.toFixed(2)),
                processing_fee: parseFloat(totalFee.toFixed(2)),
                status: isFakePayout ? 'completed' : 'processing',
                transaction_ref: isFakePayout ? orderData.utr : undefined,
                estimated_completion: estimatedCompletion.toISOString()
            }));

        } catch (error) {
            await t.rollback();
            throw error;
        }

    } catch (error) {
        console.error('[V2 Transfer Bank] Error:', error);
        return res.status(500).json(buildError('INTERNAL_ERROR', 'Internal server error'));
    }
});

/**
 * POST /v2/transfer/status
 * Query transfer order status
 */
router.post('/status', validateMerchant, async (req, res) => {
    try {
        const { merchant_order_id } = req.body;
        const merchant = req.merchant;

        if (!merchant_order_id) {
            return res.json(buildError('MISSING_PARAMS', 'merchant_order_id is required'));
        }

        const order = await Order.findOne({
            where: { merchantId: merchant.id, orderId: merchant_order_id, type: 'payout' }
        });

        if (!order) {
            return res.json(buildError('ORDER_NOT_FOUND', 'Transfer order not found'));
        }

        // Map status
        const statusMap = {
            'pending': 'pending',
            'processing': 'processing',
            'success': 'completed',
            'failed': 'failed'
        };

        return res.json(buildResponse(true, 'SUCCESS', 'Transfer status retrieved', {
            merchant_order_id: order.orderId,
            platform_order_id: order.id,
            type: order.payoutType || 'bank',
            status: statusMap[order.status] || order.status,
            amount: parseFloat(order.amount),
            processing_fee: parseFloat(order.fee),
            transaction_ref: order.utr || null,
            beneficiary_name: order.personName || null,
            account_number: order.accountNo ? `****${order.accountNo.slice(-4)}` : null,
            created_at: order.createdAt.toISOString(),
            completed_at: order.status === 'success' ? order.updatedAt.toISOString() : null
        }));

    } catch (error) {
        console.error('[V2 Transfer Status] Error:', error);
        return res.status(500).json(buildError('INTERNAL_ERROR', 'Internal server error'));
    }
});

module.exports = router;
