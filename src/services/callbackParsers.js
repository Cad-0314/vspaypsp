/**
 * Channel Callback Parsers
 * Centralized callback parsing logic for all payment channels
 * Each function returns: { orderId, status, utr, actualAmount, providerOrderId }
 * This module is loaded by individual channel services to add parsePayinCallback/parsePayoutCallback
 */

// ============================================
// SILKPAY / GAURPAY
// ============================================
function silkpayParsePayin(body) {
    return {
        orderId: body.mOrderId || body.orderId,
        status: body.status === 1 || body.status === '1' ? 'success' :
            body.status === 2 || body.status === '2' ? 'failed' : 'pending',
        utr: body.utr || body.bankRef || '',
        actualAmount: parseFloat(body.actualAmount || body.amount) || 0,
        providerOrderId: body.sysOrderId || body.tradeNo || ''
    };
}

function silkpayParsePayout(body) {
    return {
        orderId: body.mOrderId || body.orderId,
        status: body.status === 2 || body.status === '2' ? 'success' :
            body.status === 3 || body.status === '3' ? 'failed' : 'processing',
        utr: body.utr || body.bankRef || '',
        providerOrderId: body.payOrderId || body.sysOrderId || body.tradeNo || ''
    };
}

// ============================================
// FENDPAY / UPI SUPER
// ============================================
function fendpayParsePayin(body) {
    return {
        orderId: body.outTradeNo,
        status: body.status === '1' || body.status === 1 ? 'success' : 'failed',
        utr: body.utr || '',
        actualAmount: parseFloat(body.amount) || 0,
        providerOrderId: body.orderNo || ''
    };
}

function fendpayParsePayout(body) {
    return {
        orderId: body.outTradeNo,
        status: body.status == 1 ? 'success' : body.status == 0 ? 'processing' : 'failed',
        utr: body.utr || '',
        providerOrderId: body.orderNo || ''
    };
}

// ============================================
// CAIPAY / YELLOW
// ============================================
function caipayParsePayin(body) {
    return {
        orderId: body.customerOrderNo,
        status: body.orderStatus === 'SUCCESS' ? 'success' : 'failed',
        utr: body.payUtrNo || '',
        actualAmount: parseFloat(body.orderAmount) || 0,
        providerOrderId: body.platOrderNo || ''
    };
}

function caipayParsePayout(body) {
    return {
        orderId: body.customerOrderNo,
        status: body.orderStatus === 'SUCCESS' ? 'success' : 'failed',
        utr: body.payUtrNo || '',
        providerOrderId: body.platOrderNo || ''
    };
}

// ============================================
// CKPAY
// ============================================
function ckpayParsePayin(body) {
    const isSuccess = [70, 80, '70', '80'].includes(body.status);
    return {
        orderId: body.accountOrder,
        status: isSuccess ? 'success' : [60, '60'].includes(body.status) ? 'failed' : 'pending',
        utr: body.utr || '',
        actualAmount: parseFloat(body.amount) || 0,
        providerOrderId: body.orderId || ''
    };
}

function ckpayParsePayout(body) {
    return {
        orderId: body.accountOrder,
        status: [70, '70'].includes(body.status) ? 'success' :
            [60, '60'].includes(body.status) ? 'failed' : 'processing',
        utr: body.utr || '',
        providerOrderId: body.orderId || ''
    };
}

// ============================================
// BHARATPAY
// ============================================
function bharatpayParsePayin(body) {
    const bharatpayService = require('./bharatpay');
    const callbackData = bharatpayService.parseCallback(body);
    const creditInfo = callbackData.channelCreditOrderSimpleInfo || callbackData;
    const paymentInfo = callbackData.channelPaymentRecordSimpleInfo || {};
    return {
        orderId: body.sourceNo || creditInfo.merchantSourceNo,
        status: creditInfo.processCode === 30 ? 'success' :
            creditInfo.processCode === 40 ? 'failed' : 'pending',
        utr: paymentInfo.utr || '',
        actualAmount: parseFloat(creditInfo.fiatAmount || body.amount) || 0,
        providerOrderId: String(creditInfo.id || '')
    };
}

function bharatpayParsePayout(body) {
    const bharatpayService = require('./bharatpay');
    const callbackData = bharatpayService.parseCallback(body);
    const debitInfo = callbackData.channelDebitOrderSimpleInfo || callbackData;
    const paymentInfo = callbackData.channelPaymentRecordSimpleInfo || {};
    return {
        orderId: body.sourceNo || debitInfo.merchantSourceNo,
        status: debitInfo.processCode === 30 ? 'success' :
            [40, 60].includes(debitInfo.processCode) ? 'failed' : 'processing',
        utr: paymentInfo.utr || '',
        providerOrderId: String(debitInfo.id || '')
    };
}

// ============================================
// CXPAY
// ============================================
function cxpayParsePayin(body) {
    return {
        orderId: body.orderId,
        status: body.status === 1 || body.status === '1' ? 'success' :
            body.status === 2 || body.status === '2' ? 'failed' : 'pending',
        utr: body.utr || '',
        actualAmount: parseFloat(body.amount) || 0,
        providerOrderId: body.platOrderId || ''
    };
}

function cxpayParsePayout(body) {
    return {
        orderId: body.orderId,
        status: body.status === 1 || body.status === '1' ? 'success' :
            body.status === 2 || body.status === '2' ? 'failed' : 'processing',
        utr: body.utr || '',
        providerOrderId: body.platOrderId || ''
    };
}

// ============================================
// AAPAY
// ============================================
function aapayParsePayin(body) {
    return {
        orderId: body.orderId,
        status: body.status === 'SUCCESS' ? 'success' : body.status === 'FAIL' ? 'failed' : 'pending',
        utr: body.utr || '',
        actualAmount: parseFloat(body.realAmount || body.amount) || 0,
        providerOrderId: body.platformOrderId || ''
    };
}

function aapayParsePayout(body) {
    const statusNum = parseInt(body.status);
    return {
        orderId: body.orderId,
        status: statusNum === 1 ? 'success' : statusNum === -1 ? 'failed' : 'processing',
        utr: body.utr || '',
        providerOrderId: body.platformOrderId || ''
    };
}

// ============================================
// IPAY
// ============================================
function ipayParsePayin(body) {
    return {
        orderId: body.orderId,
        status: body.status === '1' || body.status === 1 ? 'success' : 'failed',
        utr: '',
        actualAmount: parseFloat(body.amount) || 0,
        providerOrderId: body.orderId || ''
    };
}

function ipayParsePayout(body) {
    return {
        orderId: body.orderId,
        status: body.status === '1' || body.status === 1 ? 'success' :
            body.status === '2' || body.status === 2 ? 'failed' : 'processing',
        utr: body.utr || '',
        providerOrderId: body.orderId || ''
    };
}

// ============================================
// UNITEDPAY
// ============================================
function unitedpayParsePayin(body) {
    const unitedpayService = require('./unitedpay');
    const callbackData = unitedpayService.parseCallback(body);
    if (!callbackData) return null;
    return {
        orderId: callbackData.tradeNo,
        status: callbackData.status === '00' ? 'success' :
            callbackData.status === '02' ? 'failed' : 'pending',
        utr: callbackData.utr || '',
        actualAmount: parseFloat(callbackData.price) || 0,
        providerOrderId: callbackData.transNo || ''
    };
}

function unitedpayParsePayout(body) {
    const unitedpayService = require('./unitedpay');
    const callbackData = unitedpayService.parseCallback(body);
    if (!callbackData) return null;
    return {
        orderId: callbackData.tradeNo,
        status: callbackData.status === '00' ? 'success' :
            callbackData.status === '02' ? 'failed' : 'processing',
        utr: callbackData.utr || '',
        providerOrderId: callbackData.transNo || ''
    };
}

// ============================================
// FIRPAY
// ============================================
function firpayParsePayin(body) {
    return {
        orderId: body.outTradeNo,
        status: body.status === '1' || body.status === 1 ? 'success' : 'failed',
        utr: body.utr || '',
        actualAmount: parseFloat(body.amount) || 0,
        providerOrderId: body.orderNo || ''
    };
}

function firpayParsePayout(body) {
    return {
        orderId: body.outTradeNo,
        status: body.status === 1 || body.status === '1' ? 'success' :
            body.status === 0 || body.status === '0' ? 'processing' : 'failed',
        utr: body.utr || '',
        providerOrderId: body.orderNo || ''
    };
}

// ============================================
// AGPAY
// ============================================
function agpayParsePayin(body, query) {
    const cb = (query && Object.keys(query).length > 0) ? query : body;
    return {
        orderId: cb.mchOrderNo,
        status: parseInt(cb.orderState) === 2 ? 'success' :
            parseInt(cb.orderState) === 3 ? 'failed' : 'pending',
        utr: cb.utr || '',
        actualAmount: cb.payAmount ? parseFloat(cb.payAmount) / 100 : 0,
        providerOrderId: cb.orderNo || ''
    };
}

function agpayParsePayout(body, query) {
    const cb = (query && Object.keys(query).length > 0) ? query : body;
    return {
        orderId: cb.mchOrderNo,
        status: parseInt(cb.orderState) === 2 ? 'success' :
            parseInt(cb.orderState) === 3 ? 'failed' : 'processing',
        utr: cb.utr || '',
        providerOrderId: cb.orderNo || ''
    };
}

// ============================================
// EASYPAY
// ============================================
function easypayParsePayin(body) {
    return {
        orderId: body.orderId,
        status: body.status === 'SUCCESS' ? 'success' : body.status === 'FAIL' ? 'failed' : 'pending',
        utr: body.utr || '',
        actualAmount: parseFloat(body.realAmount || body.amount) || 0,
        providerOrderId: body.platformOrderId || body.platformorderId || ''
    };
}

function easypayParsePayout(body) {
    const statusNum = parseInt(body.status);
    return {
        orderId: body.orderId,
        status: statusNum === 1 ? 'success' : statusNum === -1 ? 'failed' : 'processing',
        utr: body.utr || '',
        providerOrderId: body.platformorderId || body.platformOrderId || ''
    };
}

// ============================================
// YNPAY
// ============================================
function ynpayParsePayin(body) {
    const ynpayService = require('./ynpay');
    if (!ynpayService.verifySign(body)) return null; // signature failed
    const callbackData = ynpayService.parseCallback(body);
    if (!callbackData) return null;
    return {
        orderId: callbackData.mchOrderId,
        status: parseInt(callbackData.state) === 1 ? 'success' : 'pending',
        utr: callbackData.utr || '',
        actualAmount: callbackData.amount ? parseFloat(callbackData.amount) / 100 : 0,
        providerOrderId: callbackData.transactionId || ''
    };
}

function ynpayParsePayout(body) {
    const ynpayService = require('./ynpay');
    if (!ynpayService.verifySign(body)) return null;
    const callbackData = ynpayService.parseCallback(body);
    if (!callbackData) return null;
    const txStatus = parseInt(callbackData.transactionStatus);
    return {
        orderId: callbackData.mchOrderId,
        status: txStatus === 1 ? 'success' : txStatus === 2 ? 'failed' : 'processing',
        utr: callbackData.utr || '',
        providerOrderId: callbackData.transactionId || ''
    };
}

// ============================================
// PASSPAY
// ============================================
function passpayParsePayin(body) {
    const statusVal = parseInt(body.status);
    return {
        orderId: body.out_trade_no,
        status: statusVal === 5 ? 'success' : statusVal === 6 ? 'failed' : 'pending',
        utr: body.utr || '',
        actualAmount: parseFloat(body.real_amount || body.amount) || 0,
        providerOrderId: body.trade_no || ''
    };
}

function passpayParsePayout(body) {
    const statusVal = parseInt(body.status);
    return {
        orderId: body.out_trade_no,
        status: statusVal === 5 ? 'success' : statusVal === 6 ? 'failed' : 'processing',
        utr: body.utr || '',
        providerOrderId: body.trade_no || ''
    };
}

// ============================================
// TESTPAY
// ============================================
function testpayParsePayin(body) {
    return {
        orderId: body.orderId,
        status: body.status === 'SUCCESS' ? 'success' : body.status === 'FAIL' ? 'failed' : 'pending',
        utr: body.utr || '',
        actualAmount: parseFloat(body.realAmount || body.amount) || 0,
        providerOrderId: body.platformOrderId || ''
    };
}

function testpayParsePayout(body) {
    return {
        orderId: body.orderId,
        status: body.status === 'SUCCESS' ? 'success' : body.status === 'FAIL' ? 'failed' : 'processing',
        utr: body.utr || '',
        providerOrderId: body.platformOrderId || ''
    };
}

// ============================================
// BCATPAY
// ============================================
function bcatpayParsePayin(body) {
    const bcatpayService = require('./bcatpay');
    if (!bcatpayService.verifySign(body)) return null;
    const statusVal = parseInt(body.status);
    return {
        orderId: body.orderno,
        status: statusVal === 1 ? 'success' : statusVal === 3 ? 'failed' : 'pending',
        utr: body.utr || '',
        actualAmount: parseFloat(body.price) || 0,
        providerOrderId: body.ordersn || ''
    };
}

function bcatpayParsePayout(body) {
    const bcatpayService = require('./bcatpay');
    if (!bcatpayService.verifySign(body)) return null;
    const statusVal = parseInt(body.status);
    return {
        orderId: body.orderno,
        status: statusVal === 1 ? 'success' : statusVal === 2 ? 'failed' : 'processing',
        utr: '',
        providerOrderId: body.ordersn || ''
    };
}

// ============================================
// Export lookup maps for channelRouter
// ============================================
module.exports = {
    // Payin parsers by channel name (includes aliases)
    payinParsers: {
        gaurpay: silkpayParsePayin, silkpay: silkpayParsePayin,
        fendpay: fendpayParsePayin, 'upi super': fendpayParsePayin,
        caipay: caipayParsePayin, yellow: caipayParsePayin,
        ckpay: ckpayParsePayin,
        bharatpay: bharatpayParsePayin,
        cxpay: cxpayParsePayin,
        aapay: aapayParsePayin,
        ipay: ipayParsePayin,
        unitedpay: unitedpayParsePayin,
        firpay: firpayParsePayin,
        agpay: agpayParsePayin,
        easypay: easypayParsePayin,
        ynpay: ynpayParsePayin,
        passpay: passpayParsePayin,
        testpay: testpayParsePayin,
        bcatpay: bcatpayParsePayin
    },
    // Payout parsers by channel name
    payoutParsers: {
        gaurpay: silkpayParsePayout, silkpay: silkpayParsePayout,
        fendpay: fendpayParsePayout, 'upi super': fendpayParsePayout,
        caipay: caipayParsePayout, yellow: caipayParsePayout,
        ckpay: ckpayParsePayout,
        bharatpay: bharatpayParsePayout,
        cxpay: cxpayParsePayout,
        aapay: aapayParsePayout,
        ipay: ipayParsePayout,
        unitedpay: unitedpayParsePayout,
        firpay: firpayParsePayout,
        agpay: agpayParsePayout,
        easypay: easypayParsePayout,
        ynpay: ynpayParsePayout,
        passpay: passpayParsePayout,
        testpay: testpayParsePayout,
        bcatpay: bcatpayParsePayout
    }
};
