/**
 * HDPay API Service
 * Provider for HDPay channel
 * Uses MD5 signature: MD5(sorted_params + &key=SECRET)
 */

const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
require('dotenv').config();

// Shared agents for connection reuse
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

const BASE_URL = process.env.HDPAY_BASE_URL || 'https://dd1688.cc';
const MERCHANT_ID = process.env.HDPAY_MERCHANT_ID;
const SECRET_KEY = process.env.HDPAY_SECRET_KEY;

// Create axios instance with IPv4 enforcement
const httpClient = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
    family: 4, // Force IPv4
    httpAgent,
    httpsAgent
});

/**
 * Generate MD5 signature for HDPay requests
 * Sort params alphabetically, join with &, append &key=SECRET, MD5 lowercase
 */
function generateSign(params) {
    const filtered = {};
    Object.keys(params).forEach(key => {
        if (key !== 'sign' && params[key] !== '' && params[key] != null) {
            filtered[key] = params[key];
        }
    });

    const sorted = Object.keys(filtered).sort();
    const query = sorted.map(k => `${k}=${filtered[k]}`).join('&');
    const str = `${query}&key=${SECRET_KEY}`;

    return crypto.createHash('md5').update(str).digest('hex').toLowerCase();
}

/**
 * Verify callback signature
 */
function verifySign(params) {
    const receivedSign = params.sign;
    const calculatedSign = generateSign(params);
    return receivedSign === calculatedSign;
}

/**
 * Create payin order
 * @param {Object} params - { orderId, amount, notifyUrl, name?, mobile?, email?, deeplink? }
 * @returns {Object} - { success, payUrl, orderId, deeplink, providerOrderId }
 */
async function createPayin({ orderId, amount, notifyUrl, name, mobile, email, deeplink = true }) {
    try {
        const payload = {
            merchantId: parseInt(MERCHANT_ID),
            merchantOrderId: orderId,
            amount: String(amount),
            notifyUrl: notifyUrl,
            deeplink: deeplink
        };

        if (name) payload.name = name;
        if (mobile) payload.mobile = mobile;
        if (email) payload.email = email;

        payload.sign = generateSign(payload);

        console.log('[HDPay] Creating payin:', { orderId, amount });
        const response = await httpClient.post('/api/payin/submit', payload);

        if (response.data.code === 200) {
            const data = response.data.data;

            // Map single deeplink to standard format
            const deepLinks = {};
            const upiLink = data.deeplink || null;

            if (upiLink) {
                deepLinks.upi = upiLink;
                deepLinks.upi_scan = upiLink;
                deepLinks.upi_intent = upiLink;

                // Parse UPI link to extract parameters
                try {
                    const upiUrl = new URL(upiLink);
                    const pa = upiUrl.searchParams.get('pa') || '';
                    const pn = upiUrl.searchParams.get('pn') || '';
                    const tr = upiUrl.searchParams.get('tr') || '';
                    const am = upiUrl.searchParams.get('am') || '';
                    const cu = upiUrl.searchParams.get('cu') || 'INR';
                    const tn = upiUrl.searchParams.get('tn') || '';

                    // Generate Paytm link
                    deepLinks.upi_paytm = `paytmmp://cash_wallet?pa=${pa}&pn=${encodeURIComponent(pn)}&tr=${tr}&am=${am}&cu=${cu}&tn=${tn}&featuretype=money_transfer`;

                    // Generate GPay link
                    deepLinks.upi_gpay = `gpay://upi/pay?pa=${pa}&pn=${encodeURIComponent(tn)}&tr=${tr}&tid=${tr}&am=${am}&cu=${cu}&tn=${tn}`;

                    // Generate PhonePe link (base64 encoded payload)
                    const phonePePayload = {
                        contact: {
                            cbsName: "",
                            nickName: "",
                            type: "VPA",
                            vpa: pa
                        },
                        p2pPaymentCheckoutParams: {
                            checkoutType: "DEFAULT",
                            initialAmount: Math.round(parseFloat(am) * 100),
                            note: tn,
                            isByDefaultKnownContact: true,
                            disableViewHistory: true,
                            shouldShowMaskedNumber: true,
                            shouldShowUnsavedContactBanner: false,
                            showKeyboard: true,
                            allowAmountEdit: false,
                            disableNotesEdit: true,
                            currency: "INR",
                            showQrCodeOption: false,
                            enableSpeechToText: false,
                            transactionContext: "p2p",
                            isRecurring: false
                        }
                    };
                    const base64Payload = Buffer.from(JSON.stringify(phonePePayload)).toString('base64');
                    deepLinks.upi_phonepe = `phonepe://native?data=${base64Payload}&id=p2ppayment`;

                } catch (err) {
                    console.error('[HDPay] Error parsing UPI link:', err.message);
                }
            }

            return {
                success: true,
                payUrl: data.payUrl,
                providerOrderId: data.orderId,
                deepLinks: deepLinks,
                channelId: data.channelId,
                status: data.status
            };
        } else {
            console.error('[HDPay] Payin error:', response.data);
            return { success: false, error: response.data.msg || 'Unknown error' };
        }
    } catch (error) {
        console.error('[HDPay] Payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payin order status
 */
async function queryPayin(orderId) {
    try {
        const payload = {
            merchantId: parseInt(MERCHANT_ID),
            merchantOrderId: orderId
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/api/payin/status', payload);

        if (response.data.code === 200) {
            const data = response.data.data;
            return {
                success: true,
                orderId: data.merchantOrderId,
                providerOrderId: data.orderId,
                status: mapPayinStatus(data.status),
                message: data.message
            };
        } else {
            return { success: false, error: response.data.msg };
        }
    } catch (error) {
        console.error('[HDPay] Query payin exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Create payout order
 * @param {Object} params - { orderId, amount, type (0=bank, 1=upi), name, account?, ifsc?, upi?, notifyUrl }
 */
async function createPayout({ orderId, amount, type = 0, name, account, ifsc, upi, notifyUrl }) {
    try {
        const payload = {
            merchantId: parseInt(MERCHANT_ID),
            merchantPayoutId: orderId,
            amount: String(amount),
            name: name,
            type: String(type)
        };

        if (type === 0 || type === '0') {
            // Bank transfer
            payload.account = account;
            payload.ifsc = ifsc;
        } else {
            // UPI transfer
            payload.upi = upi;
        }

        if (notifyUrl) payload.notifyUrl = notifyUrl;

        payload.sign = generateSign(payload);

        console.log('[HDPay] Creating payout:', { orderId, amount, type });
        const response = await httpClient.post('/api/payout/submit', payload);

        if (response.data.code === 200) {
            const data = response.data.data;
            return {
                success: true,
                providerOrderId: data.payoutId,
                status: mapPayoutStatus(data.status),
                utr: data.utr
            };
        } else {
            console.error('[HDPay] Payout error:', response.data);
            return { success: false, error: response.data.msg || 'Unknown error' };
        }
    } catch (error) {
        console.error('[HDPay] Payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Query payout order status
 */
async function queryPayout(orderId) {
    try {
        const payload = {
            merchantId: parseInt(MERCHANT_ID),
            merchantPayoutId: orderId
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/api/payout/query', payload);

        if (response.data.code === 200) {
            const data = response.data.data;
            return {
                success: true,
                orderId: data.merchantPayoutId,
                providerOrderId: data.payoutId,
                status: mapPayoutStatus(data.status),
                utr: data.utr,
                amount: data.amount
            };
        } else {
            return { success: false, error: response.data.msg };
        }
    } catch (error) {
        console.error('[HDPay] Query payout exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get balance
 */
async function getBalance() {
    try {
        const payload = {
            merchantId: parseInt(MERCHANT_ID)
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/api/payout/balance', payload);

        if (response.data.code === 200) {
            return {
                success: true,
                balance: parseFloat(response.data.data) || 0
            };
        } else {
            return { success: false, error: response.data.msg };
        }
    } catch (error) {
        console.error('[HDPay] Balance exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Check UTR
 */
async function checkUtr(utr) {
    try {
        const payload = {
            merchantId: parseInt(MERCHANT_ID),
            utr: utr
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/api/payin/utr/check', payload);

        if (response.data.code === 200) {
            const data = response.data.data;
            return {
                success: true,
                utr: data.utr,
                amount: data.amount,
                status: data.status,
                matchOrderId: data.matchOrderId
            };
        } else {
            return { success: false, error: response.data.msg };
        }
    } catch (error) {
        console.error('[HDPay] Check UTR exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Submit/Fix UTR
 */
async function submitUtr(orderId, utr) {
    try {
        const payload = {
            merchantId: parseInt(MERCHANT_ID),
            merchantOrderId: orderId,
            utr: utr
        };
        payload.sign = generateSign(payload);

        const response = await httpClient.post('/api/payin/utr/fix', payload);

        if (response.data.code === 200) {
            return { success: true };
        } else {
            return { success: false, error: response.data.msg };
        }
    } catch (error) {
        console.error('[HDPay] Submit UTR exception:', error.message);
        return { success: false, error: error.message };
    }
}

// Map HDPay status codes to our standard statuses
function mapPayinStatus(status) {
    const map = { '0': 'pending', '1': 'success', '2': 'failed' };
    return map[status] || 'pending';
}

function mapPayoutStatus(status) {
    const map = { '0': 'processing', '1': 'success', '2': 'failed' };
    return map[status] || 'processing';
}

module.exports = {
    createPayin,
    queryPayin,
    createPayout,
    queryPayout,
    getBalance,
    checkUtr,
    submitUtr,
    verifySign,
    generateSign,
    // Config for channel router
    usesCustomPayPage: false, // HDPay redirects to their page
    providerName: 'hdpay'
};
