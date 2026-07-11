/**
 * Run seeder on production server
 * Ensures all channels exist in the database
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

function sshExec(conn, cmd) {
    return new Promise((resolve, reject) => {
        conn.exec(cmd, (err, stream) => {
            if (err) return reject(err);
            let stdout = '';
            stream.on('data', (data) => {
                const text = data.toString();
                stdout += text;
                process.stdout.write(text);
            });
            stream.stderr.on('data', (data) => process.stderr.write(data.toString()));
            stream.on('close', (code) => resolve({ stdout, code }));
        });
    });
}

async function main() {
    const conn = new Client();
    console.log('Connecting to server...');

    await new Promise((resolve, reject) => {
        conn.on('ready', resolve);
        conn.on('error', reject);
        conn.connect(SERVER);
    });

    console.log('✓ Connected! Running seeder...\n');

    const result = await sshExec(conn, `cd ${PROJECT_DIR} && node src/seeders/init.js`);

    console.log(result.code === 0 ? '\n✅ Seeder complete!' : `\n⚠️ Exit code: ${result.code}`);
    conn.end();
}

main().catch(console.error);
