/**
 * Debug Jupiter merchant signature validation
 * Reproduces the exact request from the client to verify the issue
 */

const crypto = require('crypto');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { sequelize, User } = require('../src/models');

async function debugSignature() {
    try {
        await sequelize.authenticate();

        // Find Jupiter merchant by API key
        const merchant = await User.findOne({ where: { apiKey: 'gkMBny', role: 'merchant' } });
        if (!merchant) {
            console.log('❌ Merchant with apiKey "gkMBny" not found!');
            return;
        }

        console.log('=== MERCHANT INFO ===');
        console.log('Username:', merchant.username);
        console.log('API Key:', merchant.apiKey);
        console.log('API Secret (full):', merchant.apiSecret);
        console.log('API Secret length:', (merchant.apiSecret || '').length);
        console.log('');

        // The exact request body from the client
        const body = {
            ref_id: "490748653",
            webhook_url: "https://dev.ips.intelplat.ru/callback/GaurPay",
            txn_amount: "110",
            payer_email: "email@mail.ru",
            payer_name: "Test Joe",
            payer_phone: "1234567890",
            return_url: "https://your-merchant.example/return"
        };

        console.log('=== REQUEST BODY ===');
        console.log(JSON.stringify(body, null, 2));
        console.log('');

        // Our signature algorithm (from apiAuth.js)
        const filtered = {};
        Object.keys(body).forEach(key => {
            if (key !== 'sign' && body[key] !== '' && body[key] != null) {
                filtered[key] = body[key];
            }
        });
        const sorted = Object.keys(filtered).sort();
        const query = sorted.map(k => `${k}=${filtered[k]}`).join('&');
        const str = `${query}&secret=${(merchant.apiSecret || '').trim()}`;

        console.log('=== OUR SIGNATURE CALCULATION ===');
        console.log('Sorted keys:', sorted);
        console.log('String to sign:', str);
        const expectedSign = crypto.createHash('md5').update(str).digest('hex').toUpperCase();
        console.log('Expected signature:', expectedSign);
        console.log('');

        // Client's signature
        const clientSig = 'D09C9969DCB5400ABAB75B0712DD2F4F';
        console.log('=== CLIENT SIGNATURE ===');
        console.log('Client sent:', clientSig);
        console.log('Match:', expectedSign === clientSig);
        console.log('');

        // Client's reported sign string (uses &secret= at the end with their secret)
        const clientSecretFromSignString = '31f41612d04fb6f388e43134f57ca1209121af68671a8f4224affc16cb655';
        console.log('=== CLIENT SECRET (from their sign string) ===');
        console.log('Client secret:', clientSecretFromSignString);
        console.log('Client secret length:', clientSecretFromSignString.length);
        console.log('');

        // Verify using client's reported secret
        const clientStr = `${query}&secret=${clientSecretFromSignString}`;
        const clientCalcSign = crypto.createHash('md5').update(clientStr).digest('hex').toUpperCase();
        console.log('Using client secret, sign string:', clientStr);
        console.log('Using client secret, MD5:', clientCalcSign);
        console.log('Client sig match with their secret:', clientCalcSign === clientSig);
        console.log('');

        // Check if secrets match
        console.log('=== COMPARISON ===');
        console.log('DB Secret == Client Secret:', (merchant.apiSecret || '').trim() === clientSecretFromSignString);
        if ((merchant.apiSecret || '').trim() !== clientSecretFromSignString) {
            console.log('⚠️  MISMATCH! The merchant apiSecret in the DB does NOT match what the client is using!');
            console.log('   DB secret:     ', (merchant.apiSecret || '').trim());
            console.log('   Client secret: ', clientSecretFromSignString);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

debugSignature();
