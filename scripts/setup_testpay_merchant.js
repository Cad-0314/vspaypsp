/**
 * Fix TestPay Channel for Merchant Testing
 * 
 * 1. Assigns jupiter_test merchant to testpay channel (payin + payout)
 * 2. Ensures testpay channel is active in DB
 * 3. Runs on remote server via SSH
 */

const { Client } = require('ssh2');
require('dotenv').config();

const SERVER = {
    host: process.env.DEPLOY_HOST || '139.180.135.210',
    port: parseInt(process.env.DEPLOY_PORT) || 22,
    username: process.env.DEPLOY_USER || 'root',
    password: process.env.DEPLOY_PASSWORD
};

const PROJECT_DIR = process.env.DEPLOY_PATH || '/var/www/vspaypsp';

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

async function run() {
    console.log('===========================================');
    console.log('  Fix TestPay Channel for Merchant Testing');
    console.log('===========================================\n');

    const conn = new Client();

    return new Promise((resolve, reject) => {
        conn.on('ready', async () => {
            console.log('[SSH] Connected to server\n');

            try {
                // Step 1: Ensure testpay channel exists and is active
                console.log('[Step 1] Ensuring testpay channel is active...');
                const channelScript = `
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
                            console.log('Channel updated: testpay (activated)');
                        } else {
                            console.log('Channel created: testpay');
                        }
                        process.exit(0);
                    })().catch(e => { console.error(e.message); process.exit(1); });
                `;
                const b64_1 = Buffer.from(channelScript).toString('base64');
                const out1 = await sshExec(conn, `cd ${PROJECT_DIR} && echo "${b64_1}" | base64 -d | node -`);
                console.log('  ', out1 || '✓ Done');

                // Step 2: Assign jupiter_test to testpay for both payin and payout
                console.log('\n[Step 2] Assigning jupiter_test to testpay channel...');
                const merchantScript = `
                    const { User } = require('./src/models');
                    (async () => {
                        const merchant = await User.findOne({ where: { username: 'jupiter_test', role: 'merchant' } });
                        if (!merchant) {
                            console.log('ERROR: jupiter_test merchant not found');
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
                        
                        console.log('SUCCESS: jupiter_test assigned to testpay');
                        console.log('  API Key: ' + merchant.apiKey);
                        console.log('  API Secret: ' + merchant.apiSecret);
                        console.log('  PayIn Channel: testpay');
                        console.log('  Payout Channel: testpay');
                        console.log('  canPayin: true');
                        console.log('  canPayout: true');
                        console.log('  Balance: ' + merchant.balance);
                        process.exit(0);
                    })().catch(e => { console.error(e.message); process.exit(1); });
                `;
                const b64_2 = Buffer.from(merchantScript).toString('base64');
                const out2 = await sshExec(conn, `cd ${PROJECT_DIR} && echo "${b64_2}" | base64 -d | node -`);
                console.log('  ', out2.split('\n').join('\n   '));

                // Step 3: Give merchant some test balance if balance is 0
                console.log('\n[Step 3] Ensuring test merchant has balance for payout testing...');
                const balanceScript = `
                    const { User } = require('./src/models');
                    (async () => {
                        const merchant = await User.findOne({ where: { username: 'jupiter_test', role: 'merchant' } });
                        if (!merchant) { console.log('ERROR: merchant not found'); process.exit(1); }
                        
                        const balance = parseFloat(merchant.balance) || 0;
                        if (balance < 1000) {
                            await merchant.update({ balance: 100000.00 });
                            console.log('Balance set to ₹100,000 for testing (was ₹' + balance.toFixed(2) + ')');
                        } else {
                            console.log('Balance OK: ₹' + balance.toFixed(2));
                        }
                        process.exit(0);
                    })().catch(e => { console.error(e.message); process.exit(1); });
                `;
                const b64_3 = Buffer.from(balanceScript).toString('base64');
                const out3 = await sshExec(conn, `cd ${PROJECT_DIR} && echo "${b64_3}" | base64 -d | node -`);
                console.log('  ', out3);

                console.log('\n✅ TestPay channel setup complete!');
                console.log('   Merchant jupiter_test can now test payin and payout.');

            } catch (err) {
                console.error('Error:', err.message);
            } finally {
                conn.end();
                resolve();
            }
        });

        conn.on('error', (err) => {
            console.error('[SSH] Connection error:', err.message);
            reject(err);
        });

        conn.connect(SERVER);
    });
}

run().then(() => process.exit(0)).catch(() => process.exit(1));
