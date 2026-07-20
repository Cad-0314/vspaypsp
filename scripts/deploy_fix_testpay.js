/**
 * Deploy testpay fix + setup merchant for testing
 * 1. Upload fixed testpay.js to server
 * 2. Set up jupiter_test merchant on testpay channel
 * 3. Restart PM2 server
 */

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const config = {
    host: '66.23.233.13',
    port: 22,
    username: 'root',
    password: 'wgMVh6@eb256@LJ',
    keepaliveInterval: 10000,
    keepaliveCountMax: 5,
    readyTimeout: 30000
};

const remoteBase = '/var/www/vspaypsp';
const localBase = path.join(__dirname, '..');

function sshExec(conn, cmd) {
    return new Promise((resolve, reject) => {
        conn.exec(cmd, (err, stream) => {
            if (err) return reject(err);
            let stdout = '', stderr = '';
            stream.on('data', d => { stdout += d.toString(); });
            stream.stderr.on('data', d => { stderr += d.toString(); });
            stream.on('close', (code) => {
                if (code !== 0 && stderr) console.warn('[STDERR]', stderr.trim());
                resolve(stdout.trim());
            });
        });
    });
}

function uploadFile(conn, localPath, remotePath) {
    return new Promise((resolve, reject) => {
        conn.sftp((err, sftp) => {
            if (err) return reject(err);
            sftp.fastPut(localPath, remotePath, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    });
}

async function run() {
    console.log('===========================================');
    console.log('  Deploy & Setup TestPay Channel');
    console.log('===========================================\n');

    const conn = new Client();

    return new Promise((resolve, reject) => {
        conn.on('ready', async () => {
            console.log('[SSH] Connected to', config.host, '\n');

            try {
                // Step 1: Upload fixed testpay.js
                console.log('[Step 1] Uploading fixed testpay.js...');
                const localFile = path.join(localBase, 'src', 'services', 'testpay.js');
                const remoteFile = `${remoteBase}/src/services/testpay.js`;
                await uploadFile(conn, localFile, remoteFile);
                console.log('  ✓ Uploaded testpay.js');

                // Also upload the seeder to ensure testpay channel config is current
                console.log('  Uploading seeders/init.js...');
                await uploadFile(conn, path.join(localBase, 'src', 'seeders', 'init.js'), `${remoteBase}/src/seeders/init.js`);
                console.log('  ✓ Uploaded init.js');

                // Step 2: Run seeder to ensure testpay channel exists in DB
                console.log('\n[Step 2] Ensuring testpay channel exists in DB...');
                const seedOutput = await sshExec(conn, `cd ${remoteBase} && node -e "
                    const { Channel } = require('./src/models');
                    (async () => {
                        const [ch, created] = await Channel.findOrCreate({
                            where: { name: 'testpay' },
                            defaults: {
                                displayName: 'Test Pay',
                                displayNameZh: '测试支付',
                                provider: 'testpay',
                                currency: 'INR',
                                country: 'IN',
                                payinRate: 2.00,
                                payoutRate: 1.00,
                                payoutFixedFee: 5.00,
                                isActive: true,
                                minPayin: 100.00,
                                maxPayin: 500000.00,
                                minPayout: 100.00,
                                maxPayout: 500000.00,
                                usesCustomPayPage: false,
                                config: JSON.stringify({ isTestChannel: true, autoSuccess: true })
                            }
                        });
                        if (!created) {
                            await ch.update({ isActive: true });
                            console.log('UPDATED: testpay channel activated');
                        } else {
                            console.log('CREATED: testpay channel');
                        }
                        process.exit(0);
                    })().catch(e => { console.error(e.message); process.exit(1); });
                "`);
                console.log('  ', seedOutput);

                // Step 3: Assign jupiter_test to testpay channel
                console.log('\n[Step 3] Assigning jupiter_test merchant to testpay...');
                const merchantOutput = await sshExec(conn, `cd ${remoteBase} && node -e "
                    const { User } = require('./src/models');
                    (async () => {
                        const merchant = await User.findOne({ where: { username: 'jupiter_test', role: 'merchant' } });
                        if (!merchant) {
                            console.log('ERROR: jupiter_test not found');
                            process.exit(1);
                        }
                        await merchant.update({
                            payinChannel: 'testpay',
                            payoutChannel: 'testpay',
                            assignedChannel: 'testpay',
                            canPayin: true,
                            canPayout: true,
                            isActive: true
                        });
                        console.log('OK: jupiter_test -> testpay');
                        console.log('API_KEY=' + merchant.apiKey);
                        console.log('API_SECRET=' + merchant.apiSecret);
                        console.log('BALANCE=' + merchant.balance);
                        process.exit(0);
                    })().catch(e => { console.error(e.message); process.exit(1); });
                "`);
                console.log('  ', merchantOutput.split('\n').join('\n   '));

                // Parse API key and secret from output for the test
                const apiKeyMatch = merchantOutput.match(/API_KEY=(.+)/);
                const apiSecretMatch = merchantOutput.match(/API_SECRET=(.+)/);
                const balanceMatch = merchantOutput.match(/BALANCE=(.+)/);

                const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : null;
                const apiSecret = apiSecretMatch ? apiSecretMatch[1].trim() : null;
                const balance = balanceMatch ? parseFloat(balanceMatch[1]) : 0;

                // Step 4: Ensure merchant has enough balance for payout testing
                if (balance < 1000) {
                    console.log('\n[Step 4] Setting test balance (₹100,000)...');
                    const balOut = await sshExec(conn, `cd ${remoteBase} && node -e "
                        const { User } = require('./src/models');
                        (async () => {
                            const m = await User.findOne({ where: { username: 'jupiter_test', role: 'merchant' } });
                            await m.update({ balance: 100000.00 });
                            console.log('Balance set to 100000');
                            process.exit(0);
                        })().catch(e => { console.error(e.message); process.exit(1); });
                    "`);
                    console.log('  ', balOut);
                } else {
                    console.log(`\n[Step 4] Balance OK: ₹${balance.toFixed(2)}`);
                }

                // Step 5: Restart PM2
                console.log('\n[Step 5] Restarting server...');
                const restartOut = await sshExec(conn, `cd ${remoteBase} && pm2 restart all --update-env 2>&1 | tail -5`);
                console.log('  ', restartOut.split('\n').join('\n   '));

                // Wait for server to come up
                console.log('\n  Waiting 5s for server restart...');
                await new Promise(r => setTimeout(r, 5000));

                // Step 6: Test deposit via API
                if (apiKey && apiSecret) {
                    console.log('\n[Step 6] Testing V3 deposit/create via API...');
                    const crypto = require('crypto');
                    const axios = require('axios');

                    const refId = `TESTPAY_${Date.now()}`;
                    const body = {
                        ref_id: refId,
                        txn_amount: '500',
                        webhook_url: 'https://gaurpay.site/callback/testpay/payin',
                        return_url: 'https://gaurpay.site/pay/success',
                        payer_name: 'Test User',
                        payer_email: 'test@example.com',
                        payer_phone: '9999999999'
                    };

                    // Generate signature
                    const filtered = {};
                    Object.keys(body).forEach(key => {
                        if (key !== 'sign' && body[key] !== '' && body[key] != null) {
                            filtered[key] = body[key];
                        }
                    });
                    const sorted = Object.keys(filtered).sort();
                    const query = sorted.map(k => `${k}=${filtered[k]}`).join('&');
                    const str = `${query}&secret=${apiSecret}`;
                    const signature = crypto.createHash('md5').update(str).digest('hex').toUpperCase();

                    console.log(`  Merchant: jupiter_test`);
                    console.log(`  API Key: ${apiKey}`);
                    console.log(`  Ref ID: ${refId}`);
                    console.log(`  Signature: ${signature}`);

                    try {
                        const resp = await axios.post('https://gaurpay.site/v3/deposit/create', body, {
                            headers: {
                                'Accept': 'application/json',
                                'Content-Type': 'application/json',
                                'x-merchant-id': apiKey,
                                'x-signature': signature
                            },
                            timeout: 15000
                        });
                        console.log(`\n  ✓ Deposit Response (${resp.status}):`);
                        console.log('  ', JSON.stringify(resp.data, null, 2).split('\n').join('\n   '));
                    } catch (apiErr) {
                        if (apiErr.response) {
                            console.error(`\n  ✗ Deposit Error (${apiErr.response.status}):`);
                            console.error('  ', JSON.stringify(apiErr.response.data, null, 2));
                        } else {
                            console.error(`\n  ✗ Deposit Error: ${apiErr.message}`);
                        }
                    }

                    // Step 7: Test payout via API
                    console.log('\n[Step 7] Testing V3 withdraw/bank via API...');
                    const payoutRefId = `TESTPOUT_${Date.now()}`;
                    const payoutBody = {
                        ref_id: payoutRefId,
                        txn_amount: '500',
                        bank_account: '1234567890',
                        bank_code: 'SBIN0001234',
                        payee_name: 'Test Payout User',
                        webhook_url: 'https://gaurpay.site/callback/testpay/payout'
                    };

                    const filteredP = {};
                    Object.keys(payoutBody).forEach(key => {
                        if (key !== 'sign' && payoutBody[key] !== '' && payoutBody[key] != null) {
                            filteredP[key] = payoutBody[key];
                        }
                    });
                    const sortedP = Object.keys(filteredP).sort();
                    const queryP = sortedP.map(k => `${k}=${filteredP[k]}`).join('&');
                    const strP = `${queryP}&secret=${apiSecret}`;
                    const signatureP = crypto.createHash('md5').update(strP).digest('hex').toUpperCase();

                    try {
                        const resp2 = await axios.post('https://gaurpay.site/v3/withdraw/bank', payoutBody, {
                            headers: {
                                'Accept': 'application/json',
                                'Content-Type': 'application/json',
                                'x-merchant-id': apiKey,
                                'x-signature': signatureP
                            },
                            timeout: 15000
                        });
                        console.log(`\n  ✓ Payout Response (${resp2.status}):`);
                        console.log('  ', JSON.stringify(resp2.data, null, 2).split('\n').join('\n   '));
                    } catch (apiErr) {
                        if (apiErr.response) {
                            console.error(`\n  ✗ Payout Error (${apiErr.response.status}):`);
                            console.error('  ', JSON.stringify(apiErr.response.data, null, 2));
                        } else {
                            console.error(`\n  ✗ Payout Error: ${apiErr.message}`);
                        }
                    }

                    // Step 8: Wait and verify auto-callback
                    console.log('\n[Step 8] Waiting 6s for auto-callbacks...');
                    await new Promise(r => setTimeout(r, 6000));

                    // Query deposit status
                    console.log('  Querying deposit status...');
                    const queryBody = { ref_id: refId };
                    const filteredQ = {};
                    Object.keys(queryBody).forEach(key => {
                        if (key !== 'sign' && queryBody[key] !== '' && queryBody[key] != null) {
                            filteredQ[key] = queryBody[key];
                        }
                    });
                    const sortedQ = Object.keys(filteredQ).sort();
                    const queryQ = sortedQ.map(k => `${k}=${filteredQ[k]}`).join('&');
                    const strQ = `${queryQ}&secret=${apiSecret}`;
                    const signatureQ = crypto.createHash('md5').update(strQ).digest('hex').toUpperCase();

                    try {
                        const resp3 = await axios.post('https://gaurpay.site/v3/deposit/query', queryBody, {
                            headers: {
                                'Accept': 'application/json',
                                'Content-Type': 'application/json',
                                'x-merchant-id': apiKey,
                                'x-signature': signatureQ
                            },
                            timeout: 10000
                        });
                        console.log(`  ✓ Deposit Query Response:`);
                        console.log('  ', JSON.stringify(resp3.data, null, 2).split('\n').join('\n   '));
                    } catch (err) {
                        console.error(`  ✗ Query Error:`, err.response?.data || err.message);
                    }
                } else {
                    console.log('\n[Step 6-8] Skipped API tests - could not parse merchant credentials');
                }

                console.log('\n===========================================');
                console.log('  ✅ All Done!');
                console.log('===========================================');

            } catch (err) {
                console.error('\nFatal error:', err.message);
            } finally {
                conn.end();
                resolve();
            }
        });

        conn.on('error', (err) => {
            console.error('[SSH] Connection failed:', err.message);
            reject(err);
        });

        conn.connect(config);
    });
}

run().then(() => process.exit(0)).catch(() => process.exit(1));
