const { Client } = require('ssh2');
const path = require('path');
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
    console.log('Connected to server. Deploying...');
    
    const cmds = [
        `cd ${PROJECT_DIR}`,
        `git reset --hard HEAD`,
        `git pull origin main`,
        `npm install --production`,
        `pm2 reload gaurpay-api --update-env`
    ].join(' && ');

    conn.exec(cmds, (err, stream) => {
        if (err) throw err;
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.stderr.on('data', d => process.stderr.write(d.toString()));
        stream.on('close', (code) => {
            console.log(`\nDeployment finished with code ${code}`);
            conn.end();
        });
    });
}).on('error', err => {
    console.error('SSH Error:', err);
}).connect(SERVER);
