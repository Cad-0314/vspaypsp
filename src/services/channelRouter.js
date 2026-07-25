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
const bcatpayService = require('./bcatpay');
const f2payService = require('./f2pay');

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
    gaurpay: { service: silkpayService, displayName: 'GaurPay', displayNameZh: 'GaurPay', usesCustomPayPage: false, provider: 'silkpay', currency: 'INR' },
    yellow: { service: caipayService, displayName: 'Yellow', displayNameZh: 'Yellow', usesCustomPayPage: false, provider: 'caipay', currency: 'INR' },
    'upi super': { service: fendpayService, displayName: 'UPI Super', displayNameZh: 'UPI Super', usesCustomPayPage: false, provider: 'fendpay', currency: 'INR' },
    ckpay: { service: ckpayService, displayName: 'CKPay', displayNameZh: 'CKPay', usesCustomPayPage: false, provider: 'ckpay', currency: 'INR' },
    bharatpay: { service: bharatpayService, displayName: 'BharatPay', displayNameZh: 'BharatPay', usesCustomPayPage: false, provider: 'bharatpay', currency: 'INR' },
    cxpay: { service: cxpayService, displayName: 'CX Pay', displayNameZh: 'CX Pay', usesCustomPayPage: false, provider: 'cxpay', currency: 'INR' },
    aapay: { service: aapayService, displayName: 'AA Pay', displayNameZh: 'AA Pay', usesCustomPayPage: false, provider: 'aapay', currency: 'INR' },
    ipay: { service: ipayService, displayName: 'IPay', displayNameZh: 'IPay', usesCustomPayPage: false, provider: 'ipay', currency: 'INR' },
    unitedpay: { service: unitedpayService, displayName: 'United Pay', displayNameZh: 'United Pay', usesCustomPayPage: false, provider: 'unitepay', currency: 'INR' },
    firpay: { service: firpayService, displayName: 'FirPay', displayNameZh: 'FirPay', usesCustomPayPage: false, provider: 'firpay', currency: 'INR' },
    agpay: { service: agpayService, displayName: 'AG Pay', displayNameZh: 'AG Pay', usesCustomPayPage: false, provider: 'agpay', currency: 'INR' },
    easypay: { service: easypayService, displayName: 'Easy Pay', displayNameZh: 'Easy Pay', usesCustomPayPage: false, provider: 'easypay', currency: 'INR' },
    ynpay: { service: ynpayService, displayName: 'YN Pay', displayNameZh: 'YN Pay', usesCustomPayPage: false, provider: 'ynpay', currency: 'INR' },
    passpay: { service: passpayService, displayName: 'Pass Pay', displayNameZh: 'Pass Pay', usesCustomPayPage: false, provider: 'passpay', currency: 'INR' },
    testpay: { service: testpayService, displayName: 'Test Pay', displayNameZh: '测试支付', usesCustomPayPage: false, provider: 'testpay', currency: 'INR' },
    bcatpay: { service: bcatpayService, displayName: 'BDTPay', displayNameZh: '孟加拉通道 (BDTPay)', usesCustomPayPage: false, provider: 'bcatpay', currency: 'BDT' },
    f2pay: { service: f2payService, displayName: 'F2 Pay', displayNameZh: 'F2 Pay', usesCustomPayPage: false, provider: 'f2pay', currency: 'INR' },
    smart: { service: null, displayName: 'Smart', displayNameZh: '智能支付', usesCustomPayPage: false, provider: 'smart', isSmartChannel: true, currency: 'INR' }
};

function getChannelConfig(channelName) { return channelConfig[channelName] || null; }
function getService(channelName) { const c = channelConfig[channelName]; return c ? c.service : null; }

async function createPayin(channelName, params) {
    const config = getChannelConfig(channelName);
    if (!config) return { success: false, error: 'Invalid channel' };
    if (config.isSmartChannel) {
        const customService = getCustomChannelService();
        const result = await customService.createPayin(params);
        if (result.success) {
            const actualConfig = getChannelConfig(result.actualChannel);
            result.channelName = 'smart';
            result.usesCustomPayPage = actualConfig ? actualConfig.usesCustomPayPage : false;
            result.provider = 'smart';
        }
        return result;
    }
    // Pass channelCode/bankCode through for wallet routing (BD channels)
    const result = await config.service.createPayin({
        ...params,
        channelCode: params.channelCode || params.bankCode || undefined
    });
    if (result.success) { result.channelName = channelName; result.usesCustomPayPage = config.usesCustomPayPage; result.provider = config.provider; }
    return result;
}

async function queryPayin(channelName, orderId) { const s = getService(channelName); return s ? s.queryPayin(orderId) : { success: false, error: 'Invalid channel' }; }
async function createPayout(channelName, params) {
    const s = getService(channelName);
    if (!s) return { success: false, error: 'Invalid channel' };
    // Pass channelCode through for wallet routing (BD channels)
    const r = await s.createPayout({
        ...params,
        channelCode: params.channelCode || params.bankCode || undefined
    });
    if (r.success) r.channelName = channelName;
    return r;
}
async function queryPayout(channelName, orderId) { const s = getService(channelName); return s ? s.queryPayout(orderId) : { success: false, error: 'Invalid channel' }; }
async function getBalance(channelName) { const s = getService(channelName); return s ? s.getBalance() : { success: false, error: 'Invalid channel' }; }
async function submitUtr(channelName, orderId, utr) { const s = getService(channelName); return s ? s.submitUtr(orderId, utr) : { success: false, error: 'Invalid channel' }; }
function verifyCallback(channelName, params) { const s = getService(channelName); return (s && s.verifySign) ? s.verifySign(params) : false; }

/**
 * Parse payin callback from upstream provider
 * Returns standardized: { orderId, status, utr, actualAmount, providerOrderId }
 */
function parsePayinCallback(channelName, body, query) {
    const service = getService(channelName);
    if (service && typeof service.parsePayinCallback === 'function') {
        return service.parsePayinCallback(body, query);
    }
    return null;
}

/**
 * Parse payout callback from upstream provider
 * Returns standardized: { orderId, status, utr, providerOrderId }
 */
function parsePayoutCallback(channelName, body, query) {
    const service = getService(channelName);
    if (service && typeof service.parsePayoutCallback === 'function') {
        return service.parsePayoutCallback(body, query);
    }
    return null;
}

/**
 * Get success response string for a channel callback
 */
function getCallbackSuccessResponse(channelName) {
    if (channelName === 'ckpay') return 'OK';
    if (['aapay', 'easypay', 'ynpay'].includes(channelName)) return 'SUCCESS';
    return 'success';
}

function getAllChannels() { return Object.keys(channelConfig).map(name => ({ name, ...channelConfig[name], service: undefined })); }
function getChannelsByCurrency(currency) { const cur = (currency || 'INR').toUpperCase(); return Object.keys(channelConfig).filter(name => channelConfig[name].currency === cur).map(name => ({ name, ...channelConfig[name], service: undefined })); }
function isValidChannel(channelName) { return channelConfig.hasOwnProperty(channelName); }

module.exports = {
    getChannelConfig, getService, createPayin, queryPayin, createPayout, queryPayout,
    getBalance, submitUtr, verifyCallback, parsePayinCallback, parsePayoutCallback,
    getCallbackSuccessResponse, getAllChannels, getChannelsByCurrency, isValidChannel, channelConfig
};
