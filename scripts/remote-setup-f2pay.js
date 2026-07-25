/**
 * Remote Setup F2Pay
 * 1. Appends F2PAY config to remote .env
 * 2. Runs the seeder to create f2pay channel in DB
 */
const { Client } = require('ssh2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const HOST = process.env.DEPLOY_HOST;
const USER = process.env.DEPLOY_USER;
const PASSWORD = process.env.DEPLOY_PASSWORD;
const REMOTE_PATH = process.env.DEPLOY_PATH || '/www/wwwroot/gaurpay.site';

const F2PAY_ENV = `
# F2PAY (RSA Signature)
F2PAY_BASE_URL=https://api.f2pay.com
F2PAY_MERCHANT_ID=F2_6173
F2PAY_MERCHANT_NAME=Vssystem
F2PAY_MERCHANT_PUBLIC_KEY=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAhGJ1Rel7TseAV3PB/7ExeG6ek+BZGZFzQ0MuWSqFRgv6G+Rq8fImxaHVczfMKMS8XSpRjBSjXVNWHhp5j8lbL8t0M2L956+ZXEDEkZ229+7BuSHhH5pXRaYGhZLvsIyXrbAXnpV8n5QVkCAL+n/joGVrSuaYsm5RtW/j9+SLhshmhO65xf7eQ39VFyNiriCpxWNPGkEx23wVZCyd++nirbPqECXVbC169QURFVIPiHTgoUqgM0o1HxPQ8DwAEha/hbccu1XDwocD0ujm6y5R2SjwehA/JbEiwDxP6RCO4Z6Zux2CcoMWV0an51O5QxoJGJhyOCTiuuTcUh5U1M6CjwIDAQAB
F2PAY_MERCHANT_PRIVATE_KEY=PLACEHOLDER_REPLACE_WITH_ACTUAL_PRIVATE_KEY
F2PAY_PLATFORM_PUBLIC_KEY=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2YC5ccCiPGsAWpn4d1lCCl/sGzZkZ56zLJOFgKQmYagdZK6Oe3UErWc2C6pe71sIkd6i0tHnEeA0wch5wg0c4j7dYhZ0e/Pb4usMjr8oBVsSmpXH9Gf2/+YPoVHvyAdxnvL3n//MpPmSaG9qXE7/OjofIcxmK58mjrvyWcwIyqS6sXKA9O+8plK2nALJ+XXD1VX1bg2D0tNnym3yE7lEFUZ0ShDWsxBIR8nwtXhFNKRQBYUfPFa6nc7YiHu80TW9WnFEIx2b31XsV0jRkhPwcqxyW7h6yY2UnzNqEfTIUeZNDgnMotuL0EFFpIU2jikm1KGFeNG2b6dZlsgiHu6roQIDAQAB
F2PAY_PAYIN_METHOD=UpiMixed
F2PAY_PAYOUT_METHOD=BANK_INR`;

const conn = new Client();

conn.on('ready', () => {
    console.log('[SSH] Connected. Setting up F2Pay on server...\n');

    // Check if F2PAY already exists in .env, if not append
    const checkCmd = `grep -c "F2PAY_MERCHANT_ID" ${REMOTE_PATH}/.env 2>/dev/null || echo "0"`;
    
    conn.exec(checkCmd, (err, stream) => {
        if (err) { console.error('[SSH] Error:', err); conn.end(); return; }
        
        let output = '';
        stream.on('data', d => output += d.toString().trim());
        stream.on('close', () => {
            if (output === '0') {
                console.log('[SSH] F2PAY config not found in .env, appending...');
                const appendCmd = `cat >> ${REMOTE_PATH}/.env << 'ENVEOF'${F2PAY_ENV}
ENVEOF`;
                conn.exec(appendCmd, (err2, stream2) => {
                    if (err2) { console.error('[SSH] Append error:', err2); conn.end(); return; }
                    stream2.on('data', d => process.stdout.write(d.toString()));
                    stream2.stderr.on('data', d => process.stderr.write(d.toString()));
                    stream2.on('close', () => {
                        console.log('[SSH] ✅ F2PAY env config appended');
                        runSeeder();
                    });
                });
            } else {
                console.log('[SSH] F2PAY config already exists in .env, skipping append');
                runSeeder();
            }
        });
    });

    function runSeeder() {
        console.log('[SSH] Running database seeder...');
        conn.exec(`cd ${REMOTE_PATH} && node src/seeders/init.js 2>&1`, (err, stream) => {
            if (err) { console.error('[SSH] Seeder error:', err); conn.end(); return; }
            stream.on('data', d => process.stdout.write(d.toString()));
            stream.stderr.on('data', d => process.stderr.write(d.toString()));
            stream.on('close', (code) => {
                console.log(`\n[SSH] Seeder completed (code ${code})`);
                reloadApp();
            });
        });
    }

    function reloadApp() {
        console.log('[SSH] Reloading PM2...');
        conn.exec(`cd ${REMOTE_PATH} && pm2 reload gaurpay-api 2>&1`, (err, stream) => {
            if (err) { console.error('[SSH] Reload error:', err); conn.end(); return; }
            stream.on('data', d => process.stdout.write(d.toString()));
            stream.stderr.on('data', d => process.stderr.write(d.toString()));
            stream.on('close', () => {
                console.log('\n[SSH] ✅ Setup complete!');
                conn.end();
            });
        });
    }
}).on('error', (err) => {
    console.error('[SSH] Connection error:', err.message);
}).connect({
    host: HOST,
    username: USER,
    password: PASSWORD
});
