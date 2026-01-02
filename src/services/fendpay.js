const axios = require('axios');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const BASE_URL = process.env.FENDPAY_BASE_URL;
const MERCHANT_ID = process.env.FENDPAY_MERCHANT_ID;
const SECRET_KEY = process.env.FENDPAY_SECRET_KEY;

// Create axios instance with IPv4 enforcement
const httpClient = axios.create({
    timeout: 30000,
    family: 4, // Force IPv4
    httpAgent: new http.Agent({ keepAlive: true }),
    httpsAgent: new https.Agent({ keepAlive: true })
});

// Helper: Generate MD5 Signature
function generateSignature(params) {
    // 1. Filter empty values and 'sign'
    const keys = Object.keys(params).filter(key => key !== 'sign' && params[key] !== null && params[key] !== '' && params[key] !== undefined);

    // 2. Sort keys ASCII ascending
    keys.sort();

    // 3. Build query string: key=value&...
    const queryString = keys.map(key => `${key}=${params[key]}`).join('&');

    // 4. Append &key=SECRET
    const signString = `${queryString}&key=${SECRET_KEY}`;

    // 5. MD5 and lowercase
    return crypto.createHash('md5').update(signString).digest('hex').toLowerCase();
}

const fendpayService = {
    // PayIn (Collection)
    createPayin: async (orderData) => {
        try {
            const params = {
                merchantNumber: MERCHANT_ID,
                amount: parseFloat(orderData.amount).toFixed(2),
                outTradeNo: orderData.orderId,
                notifyUrl: `${process.env.APP_URL}/api/callback/fendpay/payin`,
                callbackUrl: `${process.env.APP_URL}/pay/status/${orderData.orderId}`
            };

            params.sign = generateSignature(params);

            console.log('[FendPay] Creating Payin:', params);
            const response = await httpClient.post(`${BASE_URL}/payment`, params);
            console.log('[FendPay] Payin Response:', response.data);

            if (response.data.code == 200) {
                const data = response.data.data;
                // Extract UPI link for deep links
                const upiLink = data.upiTxt || null;
                const deepLinks = {};

                if (upiLink) {
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
                        console.error('[FendPay] Error parsing UPI link:', err.message);
                    }
                }

                return {
                    success: true,
                    paymentUrl: data.payUrl,
                    payUrl: data.payUrl,
                    providerOrderId: data.orderNo,
                    deepLinks: deepLinks,
                    raw: response.data
                };
            } else {
                return { success: false, error: response.data.msg || 'FendPay Error' };
            }
        } catch (error) {
            console.error('[FendPay] Payin Error:', error.message);
            return { success: false, error: error.message };
        }
    },

    // Payout (Disbursement)
    createPayout: async (payoutData) => {
        try {
            const params = {
                merchantNumber: MERCHANT_ID,
                outTradeNo: payoutData.orderId,
                amount: parseFloat(payoutData.amount).toFixed(2),
                notifyUrl: `${process.env.APP_URL}/api/callback/fendpay/payout`,
                accName: payoutData.accountName,
                accNo: payoutData.accountNumber,
                ifsc: payoutData.ifscCode,
                mobileNo: '9887415157' // Fixed placeholder as per doc example/requirement if not provided
            };

            params.sign = generateSignature(params);

            console.log('[FendPay] Creating Payout:', params);
            const response = await httpClient.post(`${BASE_URL}/payout`, params);
            console.log('[FendPay] Payout Response:', response.data);

            if (response.data.code == 200) {
                return {
                    success: true,
                    providerOrderId: response.data.data.orderNo,
                    status: 'pending', // 0 = processing
                    raw: response.data
                };
            } else {
                return { success: false, error: response.data.msg || 'FendPay Error' };
            }
        } catch (error) {
            console.error('[FendPay] Payout Error:', error.message);
            return { success: false, error: error.message };
        }
    },

    // Get Balance
    getBalance: async () => {
        try {
            const params = {
                merchantNumber: MERCHANT_ID
            };
            params.sign = generateSignature(params);

            const response = await httpClient.post(`${BASE_URL}/merchantQuery`, params);

            if (response.data.code == 200) {
                return {
                    success: true,
                    balance: parseFloat(response.data.data.availableBalance),
                    raw: response.data
                };
            }
            return { success: false, error: response.data.msg };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Verify Callback Signature
    verifySignature: (params) => {
        const receivedSign = params.sign;
        if (!receivedSign) return false;

        const calculatedSign = generateSignature(params);
        return receivedSign === calculatedSign;
    }
};

module.exports = fendpayService;
