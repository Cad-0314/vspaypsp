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
F2PAY_MERCHANT_PUBLIC_KEY=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4s595uWe/4hFb/UxtDN5xlvGKCB8+Jtaopm8kY3jTDrPM4fuXH4Labu7NFu7AiKfCgcZfaWCX/TkWBtbP3y3t8vRM1oqxxfhv2iYJnGbAUSHIE5wi1P5loqj+Rj8Y34cRMOV/JYhurLI+rJaGo3CUmHwyR0hH9wlsf2dWIY1Dr2yA1Z+4umCq+xR0cjGuvGHdSr+WrSvHjtwvEwHKxKsYb1Xb2LtTDSnvSvWW7fnbv6/yk13YcNqoVkUuKo5/mX/MseW8d4Yes83gmXCQNmiI8J7eYx1k4iolNi4R6h+VUVYu3RCTZoTu3Q6mpEllkUfGyldSVfCe7NO7r9APzpSCQIDAQAB
F2PAY_MERCHANT_PRIVATE_KEY=MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDizn3m5Z7/iEVv9TG0M3nGW8YoIHz4m1qimbyRjeNMOs8zh+5cfgtpu7s0W7sCIp8KBxl9pYJf9ORYG1s/fLe3y9EzWirHF+G/aJgmcZsBRIcgTnCLU/mWiqP5GPxjfhxEw5X8liG6ssj6sloajcJSYfDJHSEf3CWx/Z1YhjUOvbIDVn7i6YKr7FHRyMa68Yd1Kv5atK8eO3C8TAcrEqxhvVdvYu1MNKe9K9Zbt+du/r/KTXdhw2qhWRS4qjn+Zf8yx5bx3hh6zzeCZcJA2aIjwnt5jHWTiKiU2LhHqH5VRVi7dEJNmhO7dDqakSWWRR8bKV1JV8J7s07uv0A/OlIJAgMBAAECggEAEBnhpT0i2vglGcwZ0bWfzP2h5SJdTNbWidmJIfolKzm3kOxy9vz5uXFa2l4yufWUPcWAQUO5LC+58ClNAoZLkpA1E0Sw6b5fx9NYjc4d12qyfxAifDmja9T+zAXCkRuYTSdnY+2Simr7ypRTwjPTGj8atWRMgDMEOA0NmQW6CYg6tGVzd6Dt8tcBL0w+6TvhORMRkQjP7a3RU4/89GnG+JycDIrZjcbkmTFXxcbhFpLKG094X1BxDvR1z3U1VkYpCj8poz3HT8+E3NGAnSnzlrKsm8XQgl2zmW94vehuK9eTsLPeeX0jSRG8c5Eo1pAm3JwGv73467HJPlkl0Rs3KQKBgQD9JiicbZ9Afr99MZlniHvaN9a1dQiMrJPb+Po6fHLms2WrxO9ELTkeP7C073pL0y7qt+QCSp9Ma4N/dOVAm+fxWqwOgsWcbDDMUPgSk4FWRbjg6yJVNhiz63UOPx72iXEngcS/eVayf5HKP3kf9+sUtYWsf3UVwNJlhePeL4F3lQKBgQDlXGL2gpWG/zR6QmZwh+Vu5lHpNFYNH2FCiTJaLqcRuwVmjA53Qxve4gp4b90oawol5Z43LCupz/S9Wram0mlnGTevJhVKT3JVtw/muDxwsqLwc7RdtP8odZuPGwsbqKCT7F+UJF9KHMRlARFzp5ipikOgS0pGu8ZryDE9PHuDpQKBgQCkVJQCT8sUQ/MsYvkxU1EK7DqN2qYtI45sOmi9dLHl/sjeQ14KxMySTUf5fIfIFxQavDrgHe7g3d4j7A8x7MMZUwHj/ZIoI7dduqX+8RABoAsOvrSv2gkZKpz3HZSM99WjjsLYhPz5rIRIZQHM9dP9woQ+4RJxh5VM4Ch2wCHsLQKBgQCYT6bEbulfUaCGxAuFFSnOYJLqm7+9TSZoafWPH8YAp0Kp275LgrxCYbd0TUz/Zz3A9t//YYzJYvjyugfrdnVaasuou1COHX4e38dmfthcOrSrmxqe0/BR7O/Vs67Huk6QjPrXxOOmsr3VGUV+mUBu7guEqhr0KARXVQUl1kFrpQKBgA8jviRHbza8oV92XA1frXChyS4rpLU2JbZm6Wtrk6UkX/Mdz5PjdwfLwnF3KrCL6dc1Ls7gGv6bHo+AkcctSVfkOte9YedNVW9e5pDkbh0+RresDnkM6jNMMPtp9e7O3SpwcYkL5FYlVGCyHVfucgntAQXCo71wCHtxFgaJBIdA
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
