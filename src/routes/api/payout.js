/**
 * Payout API Routes
 * POST /api/payout/bank - Bank transfer payout
 * POST /api/payout/usdt - USDT transfer payout
 * POST /api/payout/query - Query payout status
 * POST /api/payout/check - Public payout check
 */

const express = require('express');
const router = express.Router();
const { validateMerchant } = require('../../middleware/apiAuth');
const channelRouter = require('../../services/channelRouter');
const { Order, Channel, User } = require('../../models');
const { v4: uuidv4 } = require('uuid');
const sequelize = require('../../config/database');

const APP_URL = process.env.APP_URL || 'https://payable.firestars.co';

/**
 * POST /api/payout/bank
 * Create bank transfer payout
 */
router.post('/bank', validateMerchant, async (req, res) => {
    try {
        const { orderId, amount, account, ifsc, personName, callbackUrl, param } = req.body;
        const merchant = req.merchant;

        // Fake Payout Logic if suspended
        const isFakePayout = merchant.canPayout === false;

        // Validate required fields
        if (!orderId || !amount || !account || !ifsc || !personName) {
            return res.json({
                status: 'error',
                errorCode: 'INVALID_PARAMS',
                message: 'Missing required parameters: orderId, amount, account, ifsc, personName',
                timestamp: new Date().toISOString()
            });
        }

        const payoutAmount = parseFloat(amount);
        if (isNaN(payoutAmount) || payoutAmount < 100) {
            return res.json({
                code: 0,
                msg: 'Invalid amount. Minimum is ₹100'
            });
        }

        // Check for duplicate order ID
        const existingOrder = await Order.findOne({
            where: { merchantId: merchant.id, orderId: orderId }
        });

        if (existingOrder) {
            return res.json({
                status: 'error',
                errorCode: 'DUPLICATE_ORDER',
                message: 'Duplicate order ID',
                timestamp: new Date().toISOString()
            });
        }

        // Get channel rates
        // Get channel rates with merchant override
        const channelName = merchant.payoutChannel || merchant.assignedChannel || 'aapay';
        let channel = await Channel.findOne({ where: { name: channelName, isActive: true } });

        let customRates = {};
        try { customRates = JSON.parse(merchant.channel_rates || '{}'); } catch (e) { }

        const payoutRate = customRates.payoutRate || (channel ? parseFloat(channel.payoutRate) : 3.0);
        const fixedFee = customRates.payoutFixedFee || (channel ? parseFloat(channel.payoutFixedFee) : 6.0);

        // Calculate fee: (amount * rate%) + fixed fee
        const percentageFee = (payoutAmount * payoutRate) / 100;
        const totalFee = percentageFee + fixedFee;
        const totalDeduction = payoutAmount + totalFee;

        // Check merchant balance
        const currentBalance = parseFloat(merchant.balance) || 0;
        if (currentBalance < totalDeduction) {
            return res.json({
                status: 'error',
                errorCode: 'INSUFFICIENT_BALANCE',
                message: `Insufficient balance. Required: ₹${totalDeduction.toFixed(2)}, Available: ₹${currentBalance.toFixed(2)}`,
                timestamp: new Date().toISOString()
            });
        }

        // Start transaction for balance deduction
        const t = await sequelize.transaction();

        try {
            // Deduct from merchant balance
            // If Fake: Deduct completely (no pending)
            // If Real: Move to pending
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

            await User.update(
                balanceUpdate,
                { where: { id: merchant.id }, transaction: t }
            );

            // Generate internal order ID
            const internalId = uuidv4();

            let orderData = {
                id: internalId,
                merchantId: merchant.id,
                orderId: orderId,
                channelName: channelName,
                type: 'payout',
                payoutType: 'bank',
                amount: payoutAmount,
                fee: totalFee,
                netAmount: payoutAmount,
                status: isFakePayout ? 'success' : 'processing', // Success immediately if fake
                callbackUrl: callbackUrl || merchant.callbackUrl,
                param: param,
                payoutDetails: {
                    account: account,
                    ifsc: ifsc,
                    personName: personName
                }
            };

            if (isFakePayout) {
                // Generate detailed fake UTR: 12 digits
                const fakeUtr = Math.floor(100000000000 + Math.random() * 900000000000).toString();
                orderData.utr = fakeUtr;
                orderData.providerOrderId = `FAKE_${uuidv4().substring(0, 8)}`;
            }

            // Create order
            const order = await Order.create(orderData, { transaction: t });

            if (!isFakePayout) {
                // Call upstream provider ONLY if NOT fake
                const notifyUrl = `${APP_URL}/callback/${channelName}/payout`;
                const providerResult = await channelRouter.createPayout(channelName, {
                    orderId: orderId,
                    amount: payoutAmount,
                    accountNo: account,
                    ifsc: ifsc,
                    name: personName,
                    notifyUrl: notifyUrl
                });

                if (!providerResult.success) {
                    await t.rollback();
                    return res.json({
                        code: 0,
                        msg: providerResult.error || 'Failed to create payout'
                    });
                }

                await order.update({
                    providerOrderId: providerResult.providerOrderId,
                    providerResponse: JSON.stringify(providerResult)
                }, { transaction: t });
            }

            await t.commit();

            return res.json({
                status: 'success',
                message: 'Payout submitted successfully',
                timestamp: new Date().toISOString(),
                result: {
                    merchantOrderId: orderId,
                    platformOrderId: internalId,
                    payoutAmount: payoutAmount,
                    processingFee: parseFloat(totalFee.toFixed(2)),
                    orderStatus: isFakePayout ? 'success' : 'processing',
                    utr: isFakePayout ? orderData.utr : undefined
                }
            });

        } catch (error) {
            await t.rollback();
            throw error;
        }

    } catch (error) {
        console.error('[Payout Bank] Error:', error);
        return res.status(500).json({
            code: 0,
            msg: 'Internal server error'
        });
    }
});

/**
 * POST /api/payout/usdt
 * Create USDT transfer payout
 */
router.post('/usdt', validateMerchant, async (req, res) => {
    try {
        const { orderId, amount, walletAddress, network, callbackUrl, param } = req.body;
        const merchant = req.merchant;

        // Check if payout is suspended
        if (merchant.canPayout === false) {
            return res.json({
                code: 0,
                msg: 'Payout service suspended for this merchant'
            });
        }

        // Validate required fields
        if (!orderId || !amount || !walletAddress || !network) {
            return res.json({
                code: -2,
                msg: 'Missing required parameters: orderId, amount, walletAddress, network'
            });
        }

        const payoutAmount = parseFloat(amount);
        // USDT minimum is higher
        if (isNaN(payoutAmount) || payoutAmount < 500) {
            return res.json({
                code: 0,
                msg: 'Invalid amount. Minimum is ₹500 equivalent for USDT'
            });
        }

        // Validate network
        const validNetworks = ['TRC20', 'ERC20', 'BEP20'];
        if (!validNetworks.includes(network.toUpperCase())) {
            return res.json({
                code: 0,
                msg: 'Invalid network. Supported: TRC20, ERC20, BEP20'
            });
        }

        // Check for duplicate
        const existingOrder = await Order.findOne({
            where: { merchantId: merchant.id, orderId: orderId }
        });

        if (existingOrder) {
            return res.json({
                code: 0,
                msg: 'Duplicate order ID'
            });
        }

        // USDT Conversion Logic
        // usdtRate is "INR per 1 USDT" (e.g., 100)
        let customRates = {};
        try { customRates = JSON.parse(merchant.channel_rates || '{}'); } catch (e) { }

        const usdtRate = customRates.usdtRate || 100; // Default 100
        const usdtAmount = payoutAmount / usdtRate;

        // Fee is typically 0 for USDT in this model, or included in rate
        const fee = 0;

        // Check balance
        const currentBalance = parseFloat(merchant.balance) || 0;
        if (currentBalance < payoutAmount) {
            return res.json({
                code: -3,
                msg: `Insufficient balance. Required: ₹${payoutAmount.toFixed(2)}, Available: ₹${currentBalance.toFixed(2)}`
            });
        }

        const t = await sequelize.transaction();

        try {
            // Deduct balance
            await User.update(
                {
                    balance: sequelize.literal(`balance - ${payoutAmount}`),
                    pendingBalance: sequelize.literal(`pendingBalance + ${payoutAmount}`)
                },
                { where: { id: merchant.id }, transaction: t }
            );

            const internalId = uuidv4();

            // Create order
            const order = await Order.create({
                id: internalId,
                merchantId: merchant.id,
                orderId: orderId,
                channelName: merchant.payoutChannel || merchant.assignedChannel || 'aapay',
                type: 'payout',
                payoutType: 'usdt',
                amount: payoutAmount,
                fee: fee,
                netAmount: payoutAmount,
                status: 'pending',
                callbackUrl: callbackUrl || merchant.callbackUrl,
                param: param,
                payoutDetails: {
                    walletAddress: walletAddress,
                    network: network.toUpperCase(),
                    usdtRate: usdtRate,
                    usdtAmount: usdtAmount
                }
            }, { transaction: t });

            await t.commit();

            // Note: USDT payouts may require manual processing or different API
            return res.json({
                code: 1,
                msg: 'USDT payout submitted',
                data: {
                    orderId: orderId,
                    id: internalId,
                    amount: payoutAmount,
                    fee: fee,
                    status: 'pending'
                }
            });

        } catch (error) {
            await t.rollback();
            throw error;
        }

    } catch (error) {
        console.error('[Payout USDT] Error:', error);
        return res.status(500).json({
            code: 0,
            msg: 'Internal server error'
        });
    }
});

/**
 * POST /api/payout/query
 * Query payout status (requires signature)
 */
router.post('/query', validateMerchant, async (req, res) => {
    try {
        const { orderId } = req.body;
        const merchant = req.merchant;

        if (!orderId) {
            return res.json({
                code: -2,
                msg: 'Missing orderId'
            });
        }

        const order = await Order.findOne({
            where: { merchantId: merchant.id, orderId: orderId, type: 'payout' }
        });

        if (!order) {
            return res.json({
                code: -4,
                msg: 'Order not found'
            });
        }

        return res.json({
            code: 1,
            data: {
                orderId: order.orderId,
                id: order.id,
                type: order.payoutType || 'bank',
                status: order.status,
                amount: parseFloat(order.amount),
                fee: parseFloat(order.fee),
                utr: order.utr,
                createdAt: order.createdAt.toISOString()
            }
        });

    } catch (error) {
        console.error('[Payout Query] Error:', error);
        return res.status(500).json({
            code: 0,
            msg: 'Internal server error'
        });
    }
});

/**
 * POST /api/payout/check
 * Public payout check (no signature)
 */
router.post('/check', async (req, res) => {
    try {
        const { orderId, userId } = req.body;

        if (!orderId || !userId) {
            return res.json({
                code: -2,
                msg: 'Missing orderId or userId'
            });
        }

        const merchant = await User.findOne({
            where: { apiKey: userId, role: 'merchant' }
        });

        if (!merchant) {
            return res.json({
                code: -1,
                msg: 'Invalid userId'
            });
        }

        const order = await Order.findOne({
            where: { merchantId: merchant.id, orderId: orderId, type: 'payout' }
        });

        if (!order) {
            return res.json({
                code: -4,
                msg: 'Order not found'
            });
        }

        return res.json({
            code: 1,
            data: {
                orderId: order.orderId,
                id: order.id,
                status: order.status,
                amount: parseFloat(order.amount),
                createdAt: order.createdAt.toISOString()
            }
        });

    } catch (error) {
        console.error('[Payout Check] Error:', error);
        return res.status(500).json({
            code: 0,
            msg: 'Internal server error'
        });
    }
});

module.exports = router;
