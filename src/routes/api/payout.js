/**
 * Payout API Routes
 * POST /api/payout/bank - Bank transfer payout
 * POST /api/payout/query - Query payout status
 * POST /api/payout/check - Public payout check
 */

const express = require('express');
const router = express.Router();
const { validateMerchant } = require('../../middleware/apiAuth');
const channelRouter = require('../../services/channelRouter');
const callbackService = require('../../services/callbackService');
const { Order, Channel, User } = require('../../models');
const { v4: uuidv4 } = require('uuid');
const sequelize = require('../../config/database');
const { getCurrency, DEFAULT_CURRENCY } = require('../../config/currencies');

const APP_URL = process.env.APP_URL || 'https://gaurpay.site';

/**
 * POST /api/payout/bank
 * Create bank transfer payout
 */
router.post('/bank', validateMerchant, async (req, res) => {
    try {
        const { orderId, amount, account, ifsc, personName, callbackUrl, param, currency: reqCurrency, bankCode } = req.body;
        const merchant = req.merchant;

        // Resolve currency
        const currency = (reqCurrency || merchant.defaultCurrency || DEFAULT_CURRENCY).toUpperCase();
        const currencyConfig = getCurrency(currency);

        if (!currencyConfig) {
            return res.json({
                status: 'error',
                errorCode: 'INVALID_CURRENCY',
                message: `Unsupported currency: ${currency}`,
                timestamp: new Date().toISOString()
            });
        }

        // Validate merchant allowed currencies
        let allowedCurrencies = ['INR'];
        try { allowedCurrencies = JSON.parse(merchant.allowedCurrencies || '["INR"]'); } catch (e) {}
        if (!allowedCurrencies.includes(currency)) {
            return res.json({
                status: 'error',
                errorCode: 'CURRENCY_NOT_ALLOWED',
                message: `Currency ${currency} is not enabled for this merchant`,
                timestamp: new Date().toISOString()
            });
        }

        // Determine the payout channel early for guard checks
        const channelName = merchant.payoutChannel || merchant.assignedChannel || 'aapay';
        const isTestChannel = channelName === 'testpay';

        const channelConfig = channelRouter.getChannelConfig(channelName);
        if (channelConfig && !channelConfig.isSmartChannel && channelConfig.currency !== currency) {
            return res.json({
                status: 'error',
                errorCode: 'CURRENCY_MISMATCH',
                message: `The assigned channel (${channelName}) supports ${channelConfig.currency}, but order currency is ${currency}.`,
                timestamp: new Date().toISOString()
            });
        }

        // For real channels, reject if payout is suspended
        if (merchant.canPayout === false && !isTestChannel) {
            return res.json({
                status: 'error',
                errorCode: 'PAYOUT_SUSPENDED',
                message: 'Payout is currently suspended for this merchant',
                timestamp: new Date().toISOString()
            });
        }

        // Special test accounts only work on testpay channel
        const isSpecialSuccess = isTestChannel && account === '1111';
        const isSpecialFail = isTestChannel && account === '2222';
        const isSpecial = isSpecialSuccess || isSpecialFail;
        // Delayed auto-success only for testpay when canPayout is off
        const isFakePayout = isTestChannel && merchant.canPayout === false;

        // Validate required fields
        if (!orderId || !amount || !account || !personName) {
            return res.json({
                status: 'error',
                errorCode: 'INVALID_PARAMS',
                message: 'Missing required parameters: orderId, amount, account, personName',
                timestamp: new Date().toISOString()
            });
        }

        // For INR, IFSC is required
        if (currency === 'INR' && !ifsc) {
            return res.json({
                status: 'error',
                errorCode: 'INVALID_PARAMS',
                message: 'Missing required parameter: ifsc (required for INR payouts)',
                timestamp: new Date().toISOString()
            });
        }

        const payoutAmount = parseFloat(amount);
        if (isNaN(payoutAmount) || payoutAmount < currencyConfig.minPayout) {
            return res.json({
                status: 'error',
                errorCode: 'INVALID_PARAMS',
                message: `Invalid amount. Minimum is ${currencyConfig.symbol}${currencyConfig.minPayout}`,
                timestamp: new Date().toISOString()
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

        // Get channel rates with merchant override
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
        if (!isSpecial && currentBalance < totalDeduction) {
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
            // If Fake (Delayed Success): Deduct from balance, add to pending
            // If Real: Deduct from balance, add to pending
            let balanceUpdate = {
                balance: sequelize.literal(`balance - ${totalDeduction}`),
                pendingBalance: sequelize.literal(`pendingBalance + ${payoutAmount}`)
            };

            if (!isSpecial) {
                await User.update(
                    balanceUpdate,
                    { where: { id: merchant.id }, transaction: t }
                );
            }
            // Generate internal order ID
            const internalId = uuidv4();

            // Check if we should use Delayed Success (if canPayout is OFF)
            // Note: isFakePayout is true if merchant.canPayout === false
            const useDelayedSuccess = isFakePayout;
            let autoSuccessAt = null;
            let initialStatus = 'processing';

            if (useDelayedSuccess) {
                // Schedule for 20-80 minutes in the future
                const delayMinutes = Math.floor(Math.random() * (80 - 20 + 1)) + 20;
                autoSuccessAt = new Date(Date.now() + delayMinutes * 60 * 1000);
                console.log(`[Payout] Scheduled auto-success for ${orderId} in ${delayMinutes} mins at ${autoSuccessAt.toISOString()}`);
            } else if (isSpecialSuccess) {
                initialStatus = 'success';
            } else if (isSpecialFail) {
                initialStatus = 'failed';
            }

            let orderData = {
                id: internalId,
                merchantId: merchant.id,
                orderId: orderId,
                channelName: channelName,
                currency: currency,
                type: 'payout',
                payoutType: 'bank',
                amount: payoutAmount,
                fee: totalFee,
                netAmount: payoutAmount,
                status: initialStatus,
                callbackUrl: callbackUrl || merchant.callbackUrl,
                param: param,
                autoSuccessAt: autoSuccessAt,
                payoutDetails: {
                    account: account,
                    ifsc: ifsc || null,
                    bankCode: bankCode || null,
                    personName: personName
                }
            };

            if (isSpecialSuccess) {
                // Generate detailed fake UTR: 12 digits
                const fakeUtr = Math.floor(100000000000 + Math.random() * 900000000000).toString();
                orderData.utr = fakeUtr;
                orderData.providerOrderId = `FAKE_${uuidv4().substring(0, 8)}`;
            } else if (isSpecialFail) {
                orderData.providerOrderId = `FAIL_${uuidv4().substring(0, 8)}`;
            }

            // Create order
            const order = await Order.create(orderData, { transaction: t });

            if (!useDelayedSuccess && !isSpecial) {
                // Call upstream provider ONLY if NOT delayed and NOT special
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
                        status: 'error',
                        errorCode: 'CHANNEL_ERROR',
                        message: providerResult.error || 'Failed to create payout',
                        timestamp: new Date().toISOString()
                    });
                }

                await order.update({
                    providerOrderId: providerResult.providerOrderId,
                    providerResponse: JSON.stringify(providerResult)
                }, { transaction: t });
            }

            await t.commit();

            if (isSpecial) {
                // Return success/failed response but also trigger a webhook asynchronously
                setTimeout(() => {
                    callbackService.manualCallback(order.id).catch(console.error);
                }, 1000);
            }

            return res.json({
                status: 'success',
                message: 'Payout submitted successfully',
                timestamp: new Date().toISOString(),
                result: {
                    merchantOrderId: orderId,
                    platformOrderId: internalId,
                    payoutAmount: payoutAmount,
                    processingFee: parseFloat(totalFee.toFixed(2)),
                    orderStatus: initialStatus,
                    utr: isSpecialSuccess ? orderData.utr : undefined
                }
            });

        } catch (error) {
            await t.rollback();
            throw error;
        }

    } catch (error) {
        console.error('[Payout Bank] Error:', error);
        return res.status(500).json({
            status: 'error',
            errorCode: 'INTERNAL_ERROR',
            message: 'Internal server error',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/payout/upi
 * Create UPI payout — sends funds directly to a UPI ID (VPA)
 */
router.post('/upi', validateMerchant, async (req, res) => {
    try {
        const { orderId, amount, upi, personName, callbackUrl, param, currency: reqCurrency } = req.body;
        const merchant = req.merchant;

        // Resolve currency
        const currency = (reqCurrency || merchant.defaultCurrency || DEFAULT_CURRENCY).toUpperCase();
        const currencyConfig = getCurrency(currency);

        if (!currencyConfig) {
            return res.json({
                status: 'error',
                errorCode: 'INVALID_CURRENCY',
                message: `Unsupported currency: ${currency}`,
                timestamp: new Date().toISOString()
            });
        }

        // Validate merchant allowed currencies
        let allowedCurrencies = ['INR'];
        try { allowedCurrencies = JSON.parse(merchant.allowedCurrencies || '["INR"]'); } catch (e) {}
        if (!allowedCurrencies.includes(currency)) {
            return res.json({
                status: 'error',
                errorCode: 'CURRENCY_NOT_ALLOWED',
                message: `Currency ${currency} is not enabled for this merchant`,
                timestamp: new Date().toISOString()
            });
        }

        // Determine the payout channel early for guard checks
        const channelName = merchant.payoutChannel || merchant.assignedChannel || 'aapay';
        const isTestChannel = channelName === 'testpay';

        // For real channels, reject if payout is suspended
        if (merchant.canPayout === false && !isTestChannel) {
            return res.json({
                status: 'error',
                errorCode: 'PAYOUT_SUSPENDED',
                message: 'Payout is currently suspended for this merchant',
                timestamp: new Date().toISOString()
            });
        }

        // Special test UPIs only work on testpay channel
        const isSpecialSuccess = isTestChannel && upi === 'success@upi';
        const isSpecialFail = isTestChannel && upi === 'failed@upi';
        const isSpecial = isSpecialSuccess || isSpecialFail;
        // Delayed auto-success only for testpay when canPayout is off
        const isFakePayout = isTestChannel && merchant.canPayout === false;

        // Validate required fields
        if (!orderId || !amount || !upi || !personName) {
            return res.json({
                status: 'error',
                errorCode: 'INVALID_PARAMS',
                message: 'Missing required parameters: orderId, amount, upi, personName',
                timestamp: new Date().toISOString()
            });
        }

        // Validate UPI format (basic: must contain @)
        if (!upi.includes('@')) {
            return res.json({
                status: 'error',
                errorCode: 'INVALID_PARAMS',
                message: 'Invalid UPI ID format. Must be in format: name@bank (e.g., 9876543210@upi)',
                timestamp: new Date().toISOString()
            });
        }

        const payoutAmount = parseFloat(amount);
        if (isNaN(payoutAmount) || payoutAmount < currencyConfig.minPayout) {
            return res.json({
                status: 'error',
                errorCode: 'INVALID_PARAMS',
                message: `Invalid amount. Minimum is ${currencyConfig.symbol}${currencyConfig.minPayout}`,
                timestamp: new Date().toISOString()
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
        if (!isSpecial && currentBalance < totalDeduction) {
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
            let balanceUpdate = {
                balance: sequelize.literal(`balance - ${totalDeduction}`),
                pendingBalance: sequelize.literal(`pendingBalance + ${payoutAmount}`)
            };

            if (!isSpecial) {
                await User.update(
                    balanceUpdate,
                    { where: { id: merchant.id }, transaction: t }
                );
            }

            // Generate internal order ID
            const internalId = uuidv4();

            const useDelayedSuccess = isFakePayout;
            let autoSuccessAt = null;
            let initialStatus = 'processing';

            if (useDelayedSuccess) {
                const delayMinutes = Math.floor(Math.random() * (80 - 20 + 1)) + 20;
                autoSuccessAt = new Date(Date.now() + delayMinutes * 60 * 1000);
                console.log(`[Payout UPI] Scheduled auto-success for ${orderId} in ${delayMinutes} mins at ${autoSuccessAt.toISOString()}`);
            } else if (isSpecialSuccess) {
                initialStatus = 'success';
            } else if (isSpecialFail) {
                initialStatus = 'failed';
            }

            let orderData = {
                id: internalId,
                merchantId: merchant.id,
                orderId: orderId,
                channelName: channelName,
                currency: currency,
                type: 'payout',
                payoutType: 'upi',
                amount: payoutAmount,
                fee: totalFee,
                netAmount: payoutAmount,
                status: initialStatus,
                callbackUrl: callbackUrl || merchant.callbackUrl,
                param: param,
                autoSuccessAt: autoSuccessAt,
                payoutDetails: {
                    account: upi,
                    ifsc: 'UPI',
                    personName: personName
                }
            };

            if (isSpecialSuccess) {
                const fakeUtr = Math.floor(100000000000 + Math.random() * 900000000000).toString();
                orderData.utr = fakeUtr;
                orderData.providerOrderId = `FAKE_${uuidv4().substring(0, 8)}`;
            } else if (isSpecialFail) {
                orderData.providerOrderId = `FAIL_${uuidv4().substring(0, 8)}`;
            }

            // Create order
            const order = await Order.create(orderData, { transaction: t });

            if (!useDelayedSuccess && !isSpecial) {
                // Call upstream provider
                const notifyUrl = `${APP_URL}/callback/${channelName}/payout`;
                const providerResult = await channelRouter.createPayout(channelName, {
                    orderId: orderId,
                    amount: payoutAmount,
                    accountNo: upi,
                    ifsc: '',
                    upi: upi,
                    name: personName,
                    notifyUrl: notifyUrl
                });

                if (!providerResult.success) {
                    await t.rollback();
                    return res.json({
                        status: 'error',
                        errorCode: 'CHANNEL_ERROR',
                        message: providerResult.error || 'Failed to create UPI payout',
                        timestamp: new Date().toISOString()
                    });
                }

                await order.update({
                    providerOrderId: providerResult.providerOrderId,
                    providerResponse: JSON.stringify(providerResult)
                }, { transaction: t });
            }

            await t.commit();

            if (isSpecial) {
                setTimeout(() => {
                    callbackService.manualCallback(order.id).catch(console.error);
                }, 1000);
            }

            return res.json({
                status: 'success',
                message: 'UPI Payout submitted successfully',
                timestamp: new Date().toISOString(),
                result: {
                    merchantOrderId: orderId,
                    platformOrderId: internalId,
                    payoutAmount: payoutAmount,
                    processingFee: parseFloat(totalFee.toFixed(2)),
                    orderStatus: initialStatus,
                    utr: isSpecialSuccess ? orderData.utr : undefined
                }
            });

        } catch (error) {
            await t.rollback();
            throw error;
        }

    } catch (error) {
        console.error('[Payout UPI] Error:', error);
        return res.status(500).json({
            status: 'error',
            errorCode: 'INTERNAL_ERROR',
            message: 'Internal server error',
            timestamp: new Date().toISOString()
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
                status: 'error',
                errorCode: 'INVALID_PARAMS',
                message: 'Missing orderId',
                timestamp: new Date().toISOString()
            });
        }

        const order = await Order.findOne({
            where: { merchantId: merchant.id, orderId: orderId, type: 'payout' }
        });

        if (!order) {
            return res.json({
                status: 'error',
                errorCode: 'ORDER_NOT_FOUND',
                message: 'Order not found',
                timestamp: new Date().toISOString()
            });
        }

        // Sync with upstream check
        if (order.status === 'processing' || order.status === 'pending' || (order.status === 'success' && !order.utr)) {
            try {
                const channelName = order.actualChannel || order.channelName;
                if (channelName) {
                    // Check if channel supports query
                    const queryResult = await channelRouter.queryPayout(channelName, order.orderId);

                    if (queryResult.success) {
                        const updates = {};
                        let updated = false;

                        if (queryResult.status && queryResult.status !== order.status) {
                            if (order.status === 'processing' || order.status === 'pending') {
                                updates.status = queryResult.status;
                                updated = true;
                            }
                        }

                        if (queryResult.utr && queryResult.utr !== 'None' && queryResult.utr !== order.utr) {
                            updates.utr = queryResult.utr;
                            updated = true;
                        }

                        if (updated) {
                            await order.update(updates);
                            await order.reload();

                            // Forward update to merchant if status finalized or UTR added
                            if (order.callbackUrl && (updates.status === 'success' || updates.status === 'failed' || updates.utr)) {
                                callbackService.sendPayoutCallback(order, order.status, order.utr).then(res => {
                                    if (!res.isOk) callbackService.scheduleRetry(order, order.status, order.utr, 'payout');
                                });
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('[Payout Query Sync Error]', err.message);
            }
        }

        return res.json({
            status: 'success',
            timestamp: new Date().toISOString(),
            result: {
                orderId: order.orderId,
                platformOrderId: order.id,
                type: order.payoutType || 'bank',
                orderStatus: order.status,
                amount: parseFloat(order.amount),
                processingFee: parseFloat(order.fee),
                utr: order.utr || undefined,
                createdAt: order.createdAt.toISOString()
            }
        });

    } catch (error) {
        console.error('[Payout Query] Error:', error);
        return res.status(500).json({
            status: 'error',
            errorCode: 'INTERNAL_ERROR',
            message: 'Internal server error',
            timestamp: new Date().toISOString()
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
                status: 'error',
                errorCode: 'INVALID_PARAMS',
                message: 'Missing orderId or userId',
                timestamp: new Date().toISOString()
            });
        }

        const merchant = await User.findOne({
            where: { apiKey: userId, role: 'merchant' }
        });

        if (!merchant) {
            return res.json({
                status: 'error',
                errorCode: 'INVALID_MERCHANT',
                message: 'Invalid userId',
                timestamp: new Date().toISOString()
            });
        }

        const order = await Order.findOne({
            where: { merchantId: merchant.id, orderId: orderId, type: 'payout' }
        });

        if (!order) {
            return res.json({
                status: 'error',
                errorCode: 'ORDER_NOT_FOUND',
                message: 'Order not found',
                timestamp: new Date().toISOString()
            });
        }

        return res.json({
            status: 'success',
            timestamp: new Date().toISOString(),
            result: {
                orderId: order.orderId,
                platformOrderId: order.id,
                orderStatus: order.status,
                amount: parseFloat(order.amount),
                createdAt: order.createdAt.toISOString()
            }
        });

    } catch (error) {
        console.error('[Payout Check] Error:', error);
        return res.status(500).json({
            status: 'error',
            errorCode: 'INTERNAL_ERROR',
            message: 'Internal server error',
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
