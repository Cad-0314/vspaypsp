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
const ipayService = require('./ipay');
const unitedpayService = require('./unitedpay');
const firpayService = require('./firpay');
const agpayService = require('./agpay');
const easypayService = require('./easypay');
const ynpayService = require('./ynpay');
const passpayService = require('./passpay');
const testpayService = require('./testpay');

// Lazy load customChannel to avoid circular dependency
let customChannelService = null;
function getCustomChannelService() {
    if (!customChannelService) {
        customChannelService = require('./customChannel');
    }
    return customChannelService;
}

// Channel to provider mapping
const channelConfig = {

    gaurpay: {
        service: silkpayService,
        displayName: 'GaurPay',
        displayNameZh: 'GaurPay',
        usesCustomPayPage: false,
        provider: 'silkpay',
        currency: 'INR'
    },
    yellow: {
        service: caipayService,
        displayName: 'Yellow',
        displayNameZh: 'Yellow',
        usesCustomPayPage: false,
        provider: 'caipay',
        currency: 'INR'
    },
    'upi super': {
        service: fendpayService,
        displayName: 'UPI Super',
        displayNameZh: 'UPI Super',
        usesCustomPayPage: false,
        provider: 'fendpay',
        currency: 'INR'
    },
    ckpay: {
        service: ckpayService,
        displayName: 'CKPay',
        displayNameZh: 'CKPay',
        usesCustomPayPage: false,
        provider: 'ckpay',
        currency: 'INR'
    },
    bharatpay: {
        service: bharatpayService,
        displayName: 'BharatPay',
        displayNameZh: 'BharatPay',
        usesCustomPayPage: false,
        provider: 'bharatpay',
        currency: 'INR'
    },
    cxpay: {
        service: cxpayService,
        displayName: 'CX Pay',
        displayNameZh: 'CX Pay',
        usesCustomPayPage: false,
        provider: 'cxpay',
        currency: 'INR'
    },
    aapay: {
        service: aapayService,
        displayName: 'AA Pay',
        displayNameZh: 'AA Pay',
        usesCustomPayPage: false,
        provider: 'aapay',
        currency: 'INR'
    },
    ipay: {
        service: ipayService,
        displayName: 'IPay',
        displayNameZh: 'IPay',
        usesCustomPayPage: false,
        provider: 'ipay',
        currency: 'INR'
    },
    unitedpay: {
        service: unitedpayService,
        displayName: 'United Pay',
        displayNameZh: 'United Pay',
        usesCustomPayPage: false,
        provider: 'unitepay',
        currency: 'INR'
    },
    firpay: {
        service: firpayService,
        displayName: 'FirPay',
        displayNameZh: 'FirPay',
        usesCustomPayPage: false,
        provider: 'firpay',
        currency: 'INR'
    },
    agpay: {
        service: agpayService,
        displayName: 'AG Pay',
        displayNameZh: 'AG Pay',
        usesCustomPayPage: false,
        provider: 'agpay',
        currency: 'INR'
    },
    easypay: {
        service: easypayService,
        displayName: 'Easy Pay',
        displayNameZh: 'Easy Pay',
        usesCustomPayPage: false,
        provider: 'easypay',
        currency: 'INR'
    },
    ynpay: {
        service: ynpayService,
        displayName: 'YN Pay',
        displayNameZh: 'YN Pay',
        usesCustomPayPage: false,
        provider: 'ynpay',
        currency: 'INR'
    },
    passpay: {
        service: passpayService,
        displayName: 'Pass Pay',
        displayNameZh: 'Pass Pay',
        usesCustomPayPage: false,
        provider: 'passpay',
        currency: 'INR'
    },
    testpay: {
        service: testpayService,
        displayName: 'Test Pay',
        displayNameZh: '测试支付',
        usesCustomPayPage: false,
        provider: 'testpay',
        currency: 'INR'
    },
    smart: {
        service: null, // Uses lazy loading via getCustomChannelService()
        displayName: 'Smart',
        displayNameZh: '智能支付',
        usesCustomPayPage: false, // Depends on underlying channel
        provider: 'smart',
        isSmartChannel: true,
        currency: 'INR'
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

    let result;

    // Special handling for smart channel (range-based routing)
    if (config.isSmartChannel) {
        const customService = getCustomChannelService();
        result = await customService.createPayin(params);

        if (result.success) {
            // Get the actual underlying channel's config
            const actualConfig = getChannelConfig(result.actualChannel);
            result.channelName = 'smart';
            result.usesCustomPayPage = actualConfig ? actualConfig.usesCustomPayPage : false;
            result.provider = 'smart';
        }
        return result;
    }

    const service = config.service;

    result = await service.createPayin(params);

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
 * Get channels filtered by currency
 */
function getChannelsByCurrency(currency) {
    const cur = (currency || 'INR').toUpperCase();
    return Object.keys(channelConfig)
        .filter(name => channelConfig[name].currency === cur)
        .map(name => ({
            name,
            ...channelConfig[name],
            service: undefined
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
    getChannelsByCurrency,
    isValidChannel,
    channelConfig
};
