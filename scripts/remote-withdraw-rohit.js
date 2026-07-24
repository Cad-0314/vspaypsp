/**
 * Remote Withdraw Script
 * 
 * Copies the withdraw script to the server and runs it there
 * (Required because channel APIs whitelist the server IP only)
 */
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const HOST = process.env.DEPLOY_HOST;
const USER = process.env.DEPLOY_USER;
const PASSWORD = process.env.DEPLOY_PASSWORD;
const REMOTE_PATH = process.env.DEPLOY_PATH || '/www/wwwroot/gaurpay.site';

const conn = new Client();

conn.on('ready', () => {
    console.log('[SSH] Connected to server. Running withdrawal script...\n');
    
    // Run the script on the remote server using node
    const cmd = `cd ${REMOTE_PATH} && node scripts/withdraw-rohit-axis.js 2>&1`;
    
    conn.exec(cmd, (err, stream) => {
        if (err) {
            console.error('[SSH] Exec error:', err);
            conn.end();
            return;
        }
        
        let output = '';
        
        stream.on('data', (data) => {
            const str = data.toString();
            output += str;
            process.stdout.write(str);
        });
        
        stream.stderr.on('data', (data) => {
            process.stderr.write(data.toString());
        });
        
        stream.on('close', (code) => {
            console.log(`\n[SSH] Script exited with code ${code}`);
            conn.end();
        });
    });
}).on('error', (err) => {
    console.error('[SSH] Connection error:', err.message);
}).connect({
    host: HOST,
    username: USER,
    password: PASSWORD
});
