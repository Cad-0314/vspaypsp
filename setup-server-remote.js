/**
 * Remote Server Setup via SSH2
 * Uses ssh2 library to connect and execute commands on the VPS
 */
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const SERVER = {
    host: process.env.DEPLOY_HOST,
    port: 22,
    username: process.env.DEPLOY_USER,
    password: process.env.DEPLOY_PASSWORD
};

// Step 1: Copy SSH public key for passwordless access
// Step 2: Copy and run the setup script

function sshExec(conn, cmd) {
    return new Promise((resolve, reject) => {
        console.log(`\n>>> Executing: ${cmd.substring(0, 100)}${cmd.length > 100 ? '...' : ''}`);
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

function sftpUpload(conn, localPath, remotePath) {
    return new Promise((resolve, reject) => {
        conn.sftp((err, sftp) => {
            if (err) return reject(err);
            console.log(`\n>>> Uploading: ${path.basename(localPath)} -> ${remotePath}`);
            sftp.fastPut(localPath, remotePath, (err) => {
                if (err) return reject(err);
                console.log(`    Upload complete!`);
                resolve();
            });
        });
    });
}

async function main() {
    const conn = new Client();

    console.log('============================================');
    console.log('  GaurPay Remote Server Setup');
    console.log('============================================');
    console.log(`Connecting to ${SERVER.host}...`);

    await new Promise((resolve, reject) => {
        conn.on('ready', resolve);
        conn.on('error', reject);
        conn.connect(SERVER);
    });

    console.log('✓ Connected to server!\n');

    try {
        // Step 1: Setup SSH key for passwordless access
        console.log('======= Setting up SSH key auth =======');
        const pubKey = fs.readFileSync(
            path.join(process.env.USERPROFILE, '.ssh', 'id_rsa.pub'), 'utf8'
        ).trim();

        await sshExec(conn, `
            mkdir -p ~/.ssh && chmod 700 ~/.ssh
            if ! grep -q "${pubKey.substring(0, 40)}" ~/.ssh/authorized_keys 2>/dev/null; then
                echo "${pubKey}" >> ~/.ssh/authorized_keys
                chmod 600 ~/.ssh/authorized_keys
                echo "SSH key added successfully"
            else
                echo "SSH key already exists"
            fi
        `);

        // Step 2: Upload server-setup.sh
        console.log('\n======= Uploading setup script =======');
        const setupScriptPath = path.join(__dirname, 'server-setup.sh');
        await sftpUpload(conn, setupScriptPath, '/root/server-setup.sh');

        // Step 3: Make it executable and run it
        console.log('\n======= Running server setup =======');
        await sshExec(conn, 'chmod +x /root/server-setup.sh');

        // Run the setup script - this is the big one
        // We need to run it with a long timeout
        const result = await sshExec(conn, 'bash /root/server-setup.sh 2>&1');

        console.log('\n============================================');
        if (result.code === 0) {
            console.log('✅ Server setup completed successfully!');
        } else {
            console.log(`⚠️  Setup finished with exit code: ${result.code}`);
        }
        console.log('============================================');

        // Step 4: Verify - check PM2 status and health
        console.log('\n======= Verification =======');
        await sshExec(conn, 'pm2 status');
        await sshExec(conn, 'curl -s http://localhost:3000/health || echo "Health check pending..."');
        await sshExec(conn, 'cat /root/.gaurpay_db_pass');

    } catch (error) {
        console.error('Error during setup:', error.message);
    } finally {
        conn.end();
        console.log('\nConnection closed.');
    }
}

main().catch(console.error);
