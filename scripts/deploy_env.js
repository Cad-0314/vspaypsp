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

conn.on('ready', () => {
    console.log('Connected to server. Uploading .env...');
    conn.sftp((err, sftp) => {
        if (err) throw err;
        sftp.fastPut(path.join(__dirname, '..', '.env'), PROJECT_DIR + '/.env', (err) => {
            if (err) throw err;
            console.log('.env uploaded. Reloading pm2...');
            conn.exec(`cd ${PROJECT_DIR} && pm2 reload all --update-env`, (err, stream) => {
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
