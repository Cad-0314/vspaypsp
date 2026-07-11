/**
 * Create Admin User on Production Server
 * Connects via SSH and runs a Node.js command to create the admin
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

const PROJECT_DIR = process.env.DEPLOY_PATH || '/www/wwwroot/gaurpay.site';

// Admin credentials
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'Gaur@2026#Secure';

function sshExec(conn, cmd) {
    return new Promise((resolve, reject) => {
        console.log(`\n>>> Executing: ${cmd.substring(0, 120)}${cmd.length > 120 ? '...' : ''}`);
        conn.exec(cmd, (err, stream) => {
            if (err) return reject(err);
            let stdout = '';
            let stderr = '';
            stream.on('data', (data) => {
                const text = data.toString();
                stdout += text;
                process.stdout.write(text);
            });
            stream.stderr.on('data', (data) => {
                const text = data.toString();
                stderr += text;
                process.stderr.write(text);
            });
            stream.on('close', (code) => {
                resolve({ stdout, stderr, code });
            });
        });
    });
}

async function main() {
    const conn = new Client();

    console.log('============================================');
    console.log('  Create Admin User - Production');
    console.log('============================================');
    console.log(`Connecting to ${SERVER.host}...`);

    await new Promise((resolve, reject) => {
        conn.on('ready', resolve);
        conn.on('error', reject);
        conn.connect(SERVER);
    });

    console.log('✓ Connected!\n');

    try {
        // Create admin via Node.js on the server
        const createAdminScript = `
            cd ${PROJECT_DIR} && node -e "
                const bcrypt = require('bcryptjs');
                const { User, sequelize } = require('./src/models');

                (async () => {
                    try {
                        await sequelize.authenticate();
                        console.log('DB connected');

                        // Check if admin already exists
                        const existing = await User.findOne({ where: { username: '${ADMIN_USERNAME}' } });
                        if (existing) {
                            console.log('Admin user already exists! Resetting password...');
                            const hash = await bcrypt.hash('${ADMIN_PASSWORD}', 10);
                            await existing.update({ password_hash: hash, role: 'admin' });
                            console.log('Admin password reset successfully!');
                            console.log('Username: ${ADMIN_USERNAME}');
                            console.log('Role: ' + existing.role);
                        } else {
                            const hash = await bcrypt.hash('${ADMIN_PASSWORD}', 10);
                            const admin = await User.create({
                                username: '${ADMIN_USERNAME}',
                                password_hash: hash,
                                role: 'admin',
                                isActive: true
                            });
                            console.log('Admin user created successfully!');
                            console.log('Username: ${ADMIN_USERNAME}');
                            console.log('Role: admin');
                            console.log('ID: ' + admin.id);
                        }

                        await sequelize.close();
                        process.exit(0);
                    } catch (err) {
                        console.error('Error:', err.message);
                        process.exit(1);
                    }
                })();
            "
        `;

        const result = await sshExec(conn, createAdminScript);

        console.log('\n============================================');
        if (result.code === 0) {
            console.log('✅ Admin user ready!');
            console.log(`   Username: ${ADMIN_USERNAME}`);
            console.log(`   Password: ${ADMIN_PASSWORD}`);
            console.log(`   Login at: https://gaurpay.site`);
        } else {
            console.log(`⚠️  Finished with exit code: ${result.code}`);
        }
        console.log('============================================');

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        conn.end();
        console.log('\nConnection closed.');
    }
}

main().catch(console.error);
