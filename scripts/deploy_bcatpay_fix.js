const { Client } = require('ssh2');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const conn = new Client();
const SERVER = {
    host: process.env.DEPLOY_HOST,
    port: 22,
    username: process.env.DEPLOY_USER,
    password: process.env.DEPLOY_PASSWORD
};

const PROJECT_DIR = '/www/wwwroot/gaurpay.site';
const LOCAL_FILE = path.join(__dirname, '..', 'src', 'services', 'bcatpay.js');
const REMOTE_FILE = PROJECT_DIR + '/src/services/bcatpay.js';

conn.on('ready', () => {
    console.log('Uploading bcatpay.js...');
    conn.sftp((err, sftp) => {
        if (err) throw err;
        sftp.fastPut(LOCAL_FILE, REMOTE_FILE, (err) => {
            if (err) throw err;
            console.log('File uploaded. Reloading pm2...');
            conn.exec(`cd ${PROJECT_DIR} && pm2 reload all`, (err, stream) => {
                if (err) throw err;
                stream.on('data', d => process.stdout.write(d.toString()));
                stream.stderr.on('data', d => process.stderr.write(d.toString()));
                stream.on('close', (code) => {
                    console.log(`\nPM2 reloaded with code ${code}`);
                    conn.end();
                });
            });
        });
    });
}).connect(SERVER);
