/**
 * Quick diagnostic: check admin user state and fetch PM2 logs
 */
const { Client } = require('ssh2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SERVER = {
    host: process.env.DEPLOY_HOST,
    port: 22,
    username: process.env.DEPLOY_USER,
    password: process.env.DEPLOY_PASSWORD
};

function sshExec(conn, cmd) {
    return new Promise((resolve, reject) => {
        conn.exec(cmd, (err, stream) => {
            if (err) return reject(err);
            let stdout = '';
            stream.on('data', (data) => { stdout += data.toString(); process.stdout.write(data.toString()); });
            stream.stderr.on('data', (data) => process.stderr.write(data.toString()));
            stream.on('close', (code) => resolve({ stdout, code }));
        });
    });
}

async function main() {
    const conn = new Client();
    await new Promise((resolve, reject) => {
        conn.on('ready', resolve);
        conn.on('error', reject);
        conn.connect(SERVER);
    });
    console.log('✓ Connected\n');

    // 1. Check admin user in DB
    console.log('=== Admin User State ===');
    await sshExec(conn, `cd /www/wwwroot/gaurpay.site && node -e "
        const { User } = require('./src/models');
        (async () => {
            const admin = await User.findOne({ where: { role: 'admin' } });
            if (admin) {
                console.log('ID:', admin.id);
                console.log('Username:', admin.username);
                console.log('Role:', admin.role);
                console.log('2FA Enabled:', admin.two_fa_enabled);
                console.log('2FA Secret:', admin.two_fa_secret ? 'SET (' + admin.two_fa_secret.length + ' chars)' : 'NULL');
                console.log('isActive:', admin.isActive);
            } else {
                console.log('No admin user found!');
            }
            process.exit(0);
        })();
    "`);

    // 2. Check recent PM2 logs for auth-related entries
    console.log('\n\n=== Recent PM2 Logs (last 30 lines) ===');
    await sshExec(conn, `pm2 logs gaurpay-api --lines 30 --nostream 2>&1`);

    // 3. Check session store config
    console.log('\n\n=== DB Tables ===');
    await sshExec(conn, `cd /www/wwwroot/gaurpay.site && node -e "
        const { sequelize } = require('./src/models');
        (async () => {
            const [results] = await sequelize.query('SHOW TABLES');
            console.log('Tables:', results.map(r => Object.values(r)[0]).join(', '));
            
            // Check users table columns
            const [cols] = await sequelize.query('DESCRIBE users');
            console.log('\\nUser columns:');
            cols.forEach(c => console.log('  ' + c.Field + ' (' + c.Type + ') ' + (c.Null === 'YES' ? 'nullable' : 'required')));
            
            process.exit(0);
        })();
    "`);

    conn.end();
}

main().catch(console.error);
