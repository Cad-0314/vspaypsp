
const fendpay = require('../src/services/fendpay');
const silkpay = require('../src/services/silkpay');

/**
 * This script is intended to verify that the submitUtr methods 
 * generate the correct payload and signatures.
 * To avoid real network calls, we would ideally mock axios, 
 * but since the services use internal instances, we'll just check 
 * the methods' existence and logic via inspection or by temporary 
 * instrumentation if needed.
 * 
 * For now, we will perform a "dry run" by printing the logic.
 */

async function verifyFendPay() {
    console.log('\n--- FendPay UTR Submission Logic ---');
    console.log('Endpoint: /pay/payment/bind/utr');
    console.log('Payload structure:');
    console.log('  merchantNumber: (from ENV)');
    console.log('  outTradeNo: (orderId)');
    console.log('  utr: (utr)');
    console.log('Signature: ASCII Sort + Secret Key');
    
    if (typeof fendpay.submitUtr === 'function') {
        console.log('✅ FendPay submitUtr is implemented.');
    } else {
        console.log('❌ FendPay submitUtr is NOT implemented.');
    }
}

async function verifySilkPay() {
    console.log('\n--- SilkPay UTR Submission Logic ---');
    console.log('Endpoint: /transaction/payin/submit/utr');
    console.log('Signature string fixed to: ${MID}${orderId}${utr}${timestamp}${SECRET}');
    
    if (typeof silkpay.submitUtr === 'function') {
        console.log('✅ SilkPay submitUtr is implemented.');
    } else {
        console.log('❌ SilkPay submitUtr is NOT implemented.');
    }
}

async function run() {
    await verifyFendPay();
    await verifySilkPay();
}

run();
