/**
 * Custom Channel (Smart Channel) Service
 * Routes payin requests to different channels based on amount ranges
 * Configured via admin panel CustomChannelRange settings
 */

const { CustomChannelRange } = require('../models');
const channelRouter = require('./channelRouter');
const { Op } = require('sequelize');

/**
 * Find the matching range for a given amount
 * @param {number} amount - Transaction amount
 * @returns {Promise<CustomChannelRange|null>} - Matching range or null
 */
async function findMatchingRange(amount) {
    const range = await CustomChannelRange.findOne({
        where: {
            minAmount: { [Op.lte]: amount },
            maxAmount: { [Op.gte]: amount },
            isActive: true
        },
        order: [
            ['priority', 'DESC'],
            ['minAmount', 'ASC']
        ]
    });
    return range;
}

/**
 * Create payin order via smart channel routing
 * @param {Object} params - Payin parameters
 * @returns {Promise<Object>} - Result with actualChannel info
 */
async function createPayin(params) {
    const amount = parseFloat(params.amount);

    // Find matching range for this amount
    const range = await findMatchingRange(amount);

    if (!range) {
        return {
            success: false,
            error: `No channel configured for amount ₹${amount}. Please configure ranges in admin panel.`
        };
    }

    const targetChannel = range.channelName;

    // Get the target channel config
    const channelConfig = channelRouter.getChannelConfig(targetChannel);
    if (!channelConfig) {
        return {
            success: false,
            error: `Target channel "${targetChannel}" is not available`
        };
    }

    // IMPORTANT: Modify notifyUrl to point to actual channel's callback endpoint
    // This ensures callbacks are received and processed correctly
    const APP_URL = process.env.APP_URL || 'https://payable.firestars.co';
    const modifiedParams = {
        ...params,
        notifyUrl: `${APP_URL}/callback/${targetChannel}/payin`
    };

    console.log(`[SmartChannel] Routing amount ₹${amount} to ${targetChannel} (range: ${range.minAmount}-${range.maxAmount})`);

    // Delegate to the actual channel
    const result = await channelConfig.service.createPayin(modifiedParams);

    if (result.success) {
        // Add routing info to result
        result.actualChannel = targetChannel;
        result.routedBy = 'smart';
        result.rangeId = range.id;
    }

    return result;
}

/**
 * Query payin order status
 * Note: For smart channel orders, the actual channel is stored in the order
 * This function is a fallback - normally queries go through the stored actualChannel
 */
async function queryPayin(orderId, actualChannel) {
    if (actualChannel) {
        const channelConfig = channelRouter.getChannelConfig(actualChannel);
        if (channelConfig && channelConfig.service) {
            return channelConfig.service.queryPayin(orderId);
        }
    }
    return { success: false, error: 'Cannot query smart channel order without actualChannel' };
}

/**
 * Get balance - Smart channel aggregates balances from all configured channels
 */
async function getBalance() {
    try {
        // Get unique channels from active ranges
        const ranges = await CustomChannelRange.findAll({
            where: { isActive: true },
            attributes: ['channelName'],
            group: ['channelName']
        });

        const balances = {};
        let totalBalance = 0;

        for (const range of ranges) {
            const channelConfig = channelRouter.getChannelConfig(range.channelName);
            if (channelConfig && channelConfig.service && channelConfig.service.getBalance) {
                try {
                    const result = await channelConfig.service.getBalance();
                    if (result.success) {
                        balances[range.channelName] = result.balance;
                        totalBalance += parseFloat(result.balance || 0);
                    }
                } catch (e) {
                    console.error(`[SmartChannel] Failed to get balance for ${range.channelName}:`, e.message);
                }
            }
        }

        return {
            success: true,
            balance: totalBalance,
            channelBalances: balances
        };
    } catch (error) {
        console.error('[SmartChannel] Balance error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get all active ranges
 */
async function getRanges() {
    return CustomChannelRange.findAll({
        where: { isActive: true },
        order: [['minAmount', 'ASC']]
    });
}

/**
 * Verify callback signature - delegates to actual channel
 * Note: For callbacks, we use the actualChannel stored in the order
 */
function verifySign(params, actualChannel) {
    if (actualChannel) {
        const channelConfig = channelRouter.getChannelConfig(actualChannel);
        if (channelConfig && channelConfig.service && channelConfig.service.verifySign) {
            return channelConfig.service.verifySign(params);
        }
    }
    return true; // Default to true if can't verify
}

module.exports = {
    createPayin,
    queryPayin,
    getBalance,
    getRanges,
    findMatchingRange,
    verifySign
};
