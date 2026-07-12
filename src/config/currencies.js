/**
 * Currency Configuration
 * Central config for all supported currencies and their geo settings.
 */

const CURRENCIES = {
    INR: {
        code: 'INR',
        symbol: '₹',
        name: 'Indian Rupee',
        nameZh: '印度卢比',
        country: 'IN',
        countryName: 'India',
        countryNameZh: '印度',
        flag: '🇮🇳',
        decimals: 2,
        minPayin: 100,
        maxPayin: 100000,
        minPayout: 100,
        maxPayout: 100000,
        usdtRate: 100,            // 1 USDT = 100 INR
        minUsdtSettlement: 200000, // Min ₹2,00,000 for USDT settlement
        payoutFields: ['account', 'ifsc', 'personName'],
        payoutLabels: {
            account: 'Bank Account Number',
            accountZh: '银行账号',
            ifsc: 'IFSC Code',
            ifscZh: 'IFSC代码',
            personName: 'Account Holder Name',
            personNameZh: '收款人姓名'
        }
    },
    PKR: {
        code: 'PKR',
        symbol: 'Rs',
        name: 'Pakistani Rupee',
        nameZh: '巴基斯坦卢比',
        country: 'PK',
        countryName: 'Pakistan',
        countryNameZh: '巴基斯坦',
        flag: '🇵🇰',
        decimals: 2,
        minPayin: 500,
        maxPayin: 500000,
        minPayout: 500,
        maxPayout: 500000,
        usdtRate: 280,            // 1 USDT = 280 PKR
        minUsdtSettlement: 100000, // Min Rs 1,00,000 for USDT settlement
        payoutFields: ['account', 'bankCode', 'personName'],
        payoutLabels: {
            account: 'Account / IBAN',
            accountZh: '账号 / IBAN',
            bankCode: 'Bank Code',
            bankCodeZh: '银行代码',
            personName: 'Account Holder Name',
            personNameZh: '收款人姓名'
        }
    },
    BDT: {
        code: 'BDT',
        symbol: '৳',
        name: 'Bangladeshi Taka',
        nameZh: '孟加拉塔卡',
        country: 'BD',
        countryName: 'Bangladesh',
        countryNameZh: '孟加拉国',
        flag: '🇧🇩',
        decimals: 2,
        minPayin: 100,
        maxPayin: 25000,
        minPayout: 100,
        maxPayout: 25000,
        usdtRate: 110,            // 1 USDT = 110 BDT
        minUsdtSettlement: 50000,  // Min ৳50,000 for USDT settlement
        payoutFields: ['account', 'bankCode', 'personName'],
        payoutLabels: {
            account: 'Mobile Wallet Number',
            accountZh: '手机钱包号码',
            bankCode: 'Wallet Provider (bkash / nagad / rocket / upay)',
            bankCodeZh: '钱包服务商 (bkash / nagad / rocket / upay)',
            personName: 'Account Holder Name',
            personNameZh: '收款人姓名'
        },
        // Bangladesh-specific: valid wallet providers for payout
        validBankCodes: ['bkash', 'nagad', 'rocket', 'upay']
    },
    IDR: {
        code: 'IDR',
        symbol: 'Rp',
        name: 'Indonesian Rupiah',
        nameZh: '印尼盾',
        country: 'ID',
        countryName: 'Indonesia',
        countryNameZh: '印度尼西亚',
        flag: '🇮🇩',
        decimals: 0,
        minPayin: 50000,
        maxPayin: 50000000,
        minPayout: 50000,
        maxPayout: 50000000,
        usdtRate: 16000,          // 1 USDT = 16,000 IDR
        minUsdtSettlement: 5000000, // Min Rp 5,000,000 for USDT settlement
        payoutFields: ['account', 'bankCode', 'personName'],
        payoutLabels: {
            account: 'Account Number',
            accountZh: '账号',
            bankCode: 'Bank Code',
            bankCodeZh: '银行代码',
            personName: 'Account Holder Name',
            personNameZh: '收款人姓名'
        }
    }
};

const SUPPORTED_CURRENCIES = Object.keys(CURRENCIES);
const DEFAULT_CURRENCY = 'INR';

/**
 * Get currency config by code
 */
function getCurrency(code) {
    return CURRENCIES[(code || '').toUpperCase()] || null;
}

/**
 * Check if currency is supported
 */
function isSupported(code) {
    return SUPPORTED_CURRENCIES.includes((code || '').toUpperCase());
}

/**
 * Get currency symbol
 */
function getSymbol(code) {
    const c = getCurrency(code);
    return c ? c.symbol : '';
}

/**
 * Format amount with currency symbol
 */
function formatAmount(amount, code) {
    const c = getCurrency(code);
    if (!c) return String(amount);
    return `${c.symbol}${parseFloat(amount).toLocaleString()}`;
}

module.exports = {
    CURRENCIES,
    SUPPORTED_CURRENCIES,
    DEFAULT_CURRENCY,
    getCurrency,
    isSupported,
    getSymbol,
    formatAmount
};
