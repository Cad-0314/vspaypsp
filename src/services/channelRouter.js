/**
 * Channel Router Service
 * Routes requests to appropriate provider based on channel name
 */


const silkpayService = require('./silkpay');
const caipayService = require('./caipay');
const fendpayService = require('./fendpay');
const ckpayService = require('./ckpay');
const bharatpayService = require('./bharatpay');
const cxpayService = require('./cxpay');
const aapayService = require('./aapay');

// Channel to provider mapping
const channelConfig = {

    payable: {
        service: silkpayService,
        displayName: 'Payable',
        displayNameZh: 'Payable',
        usesCustomPayPage: true,
        provider: 'silkpay'
    },
    yellow: {
        service: caipayService,
        displayName: 'Yellow',
        displayNameZh: 'Yellow',
        usesCustomPayPage: true,
        provider: 'caipay'
    },
    'upi super': {
        service: fendpayService,
        displayName: 'UPI Super',
        displayNameZh: 'UPI Super',
        usesCustomPayPage: true,
        provider: 'fendpay'
    },
    ckpay: {
        service: ckpayService,
        displayName: 'CKPay',
        displayNameZh: 'CKPay',
        usesCustomPayPage: false,
        provider: 'ckpay'
    },
    bharatpay: {
        service: bharatpayService,
        displayName: 'BharatPay',
        displayNameZh: 'BharatPay',
        usesCustomPayPage: false,
        provider: 'bharatpay'
    },
    cxpay: {
        service: cxpayService,
        displayName: 'CX Pay',
        displayNameZh: 'CX Pay',
        usesCustomPayPage: false,
        provider: 'cxpay'
    },
    aapay: {
        service: aapayService,
        displayName: 'AA Pay',
        displayNameZh: 'AA Pay',
        usesCustomPayPage: false,
        provider: 'aapay'
    }
};

/**
 * Get channel configuration
 */
function getChannelConfig(channelName) {
    return channelConfig[channelName] || null;
}

/**
 * Get service for a channel
 */
function getService(channelName) {
    const config = channelConfig[channelName];
    return config ? config.service : null;
}

/**
 * Create payin order via appropriate channel
 */
async function createPayin(channelName, params) {
    const config = getChannelConfig(channelName);
    if (!config) {
        return { success: false, error: 'Invalid channel' };
    }

    const service = config.service;
    let result;

    // For X2 (f2pay), try V2 first to get deeplinks
    if (channelName === 'x2' && service.createPayinV2) {
        result = await service.createPayinV2(params);
    } else {
        result = await service.createPayin(params);
    }

    if (result.success) {
        result.channelName = channelName;
        result.usesCustomPayPage = config.usesCustomPayPage;
        result.provider = config.provider;
    }

    return result;
}

/**
 * Query payin order status
 */
async function queryPayin(channelName, orderId) {
    const service = getService(channelName);
    if (!service) {
        return { success: false, error: 'Invalid channel' };
    }
    return service.queryPayin(orderId);
}

/**
 * Create payout order via appropriate channel
 */
async function createPayout(channelName, params) {
    const service = getService(channelName);
    if (!service) {
        return { success: false, error: 'Invalid channel' };
    }

    const result = await service.createPayout(params);
    if (result.success) {
        result.channelName = channelName;
    }
    return result;
}

/**
 * Query payout order status
 */
async function queryPayout(channelName, orderId) {
    const service = getService(channelName);
    if (!service) {
        return { success: false, error: 'Invalid channel' };
    }
    return service.queryPayout(orderId);
}

/**
 * Get channel balance
 */
async function getBalance(channelName) {
    const service = getService(channelName);
    if (!service) {
        return { success: false, error: 'Invalid channel' };
    }
    return service.getBalance();
}

/**
 * Submit UTR for payin
 */
async function submitUtr(channelName, orderId, utr) {
    const service = getService(channelName);
    if (!service) {
        return { success: false, error: 'Invalid channel' };
    }
    return service.submitUtr(orderId, utr);
}

/**
 * Verify callback signature
 */
function verifyCallback(channelName, params) {
    const service = getService(channelName);
    if (!service || !service.verifySign) {
        return false;
    }
    return service.verifySign(params);
}

/**
 * Get all available channels
 */
function getAllChannels() {
    return Object.keys(channelConfig).map(name => ({
        name,
        ...channelConfig[name],
        service: undefined // Don't expose service object
    }));
}

/**
 * Check if channel exists and is valid
 */
function isValidChannel(channelName) {
    return channelConfig.hasOwnProperty(channelName);
}

module.exports = {
    getChannelConfig,
    getService,
    createPayin,
    queryPayin,
    createPayout,
    queryPayout,
    getBalance,
    submitUtr,
    verifyCallback,
    getAllChannels,
    isValidChannel,
    channelConfig
};
