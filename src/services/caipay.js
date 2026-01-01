const axios = require('axios');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const BASE_URL = process.env.CAIPAY_BASE_URL;
const MERCHANT_ID = process.env.CAIPAY_MERCHANT_ID; // Maps to tenantId
const SECRET_KEY = process.env.CAIPAY_SECRET_KEY;
const TOKEN = process.env.CAIPAY_TOKEN;

// Create axios instance with IPv4 enforcement
const httpClient = axios.create({
    timeout: 30000,
    family: 4, // Force IPv4
    httpAgent: new http.Agent({ keepAlive: true }),
    httpsAgent: new https.Agent({ keepAlive: true })
});

// Helper: Generate MD5 Signature for CaiPay
function generateSignature(params) {
    // 1. Sort parameters by key in ASCII order
    const keys = Object.keys(params).sort();

    // 2. Concatenate non-empty values (excluding signKey)
    let concatenated = '';
    for (const key of keys) {
        if (key !== 'signKey' && params[key] !== null && params[key] !== '' && params[key] !== undefined) {
            concatenated += params[key];
        }
    }

    // 3. Append secret key
    const rawString = concatenated + SECRET_KEY;

    // 4. Generate MD5 hash
    return crypto.createHash('md5').update(rawString).digest('hex').toLowerCase();
}

const caipayService = {
    // PayIn H2H (Host-to-Host)
    createPayin: async (orderData) => {
        try {
            const params = {
                token: TOKEN,
                tenantId: MERCHANT_ID,
                amount: parseFloat(orderData.amount).toFixed(2),
                customerOrderNo: orderData.orderId,
                callbackUrl: `${process.env.APP_URL}/api/callback/caipay/payin`,
                rechargeName: orderData.customerName || 'Customer',
                rechargeEmail: orderData.customerEmail || 'customer@example.com',
                rechargePhone: orderData.customerPhone || '9999999999'
            };

            params.signKey = generateSignature(params);

            // Construct Query String for GET request
            const queryString = new URLSearchParams(params).toString();
            // Critical Change: Use H2H endpoint
            const url = `${BASE_URL}/payIn-H2H?${queryString}`;

            console.log('[CaiPay] Creating Payin H2H:', url);
            const response = await httpClient.get(url);
            console.log('[CaiPay] Payin Response:', response.data);

            if (response.data.code === 0 && response.data.ok) {
                const data = response.data.data;
                // Parse H2H response data
                // Expected: { platOrderNo, orderStatus, upi, paytm, ... }

                const deepLinks = {
                    upi: data.upi,        // "upi://pay?pn=..."
                    paytm: data.paytm,    // "paytmmp://pay?..."
                    gpay: data.gpay || null,
                    phonepe: data.phonepe || null
                };

                return {
                    success: true,
                    // Use a fallback or one of the deep links as the main payUrl if needed, 
                    // or ideally the frontend handles deepLinks. 
                    // If no explicit 'url' is returned in H2H, we might map 'upi' as payUrl for QR generation
                    payUrl: data.url || data.upi,
                    providerOrderId: data.platOrderNo,
                    deepLinks: deepLinks,
                    raw: response.data
                };
            } else {
                return { success: false, error: response.data.msg || 'CaiPay Error' };
            }
        } catch (error) {
            console.error('[CaiPay] Payin Error:', error.message);
            return { success: false, error: error.message };
        }
    },

    // Payout (Withdrawal)
    createPayout: async (payoutData) => {
        try {
            const params = {
                token: TOKEN,
                tenantId: MERCHANT_ID,
                bankAccountName: payoutData.accountName,
                bankAccountNumber: payoutData.accountNumber,
                callbackUrl: `${process.env.APP_URL}/api/callback/caipay/payout`,
                orderAmount: parseFloat(payoutData.amount).toFixed(2),
                payEmail: 'payee@example.com',
                payIfsc: payoutData.ifscCode,
                payPhone: '9999999999'
            };

            params.signKey = generateSignature(params);

            console.log('[CaiPay] Creating Payout:', params);
            const response = await httpClient.post(`${BASE_URL}/payOut`, params);
            console.log('[CaiPay] Payout Response:', response.data);

            if (response.data.code === 0 && response.data.ok) {
                return {
                    success: true,
                    providerOrderId: response.data.data.platOrderNo,
                    status: 'pending',
                    raw: response.data
                };
            } else {
                return { success: false, error: response.data.msg || 'CaiPay Error' };
            }
        } catch (error) {
            console.error('[CaiPay] Payout Error:', error.message);
            return { success: false, error: error.message };
        }
    },

    // Verify Callback Signature
    verifySignature: (params) => {
        const receivedSign = params.signKey;
        if (!receivedSign) return false;

        const calculatedSign = generateSignature(params);
        return receivedSign === calculatedSign;
    }
};

module.exports = caipayService;
