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

const NEW_TOKEN = '8596334035:AAHzGBMhCGv1VX5jvMAB-YgCo3nUqdXmv8M';
const PROJECT_DIR = '/www/wwwroot/gaurpay.site';

conn.on('ready', () => {
    console.log('Connected to server. Updating .env and deploying...');
    
    const cmds = [
        `cd ${PROJECT_DIR}`,
        // Update the telegram token in the remote .env
        `sed -i "s/^TELEGRAM_BOT_TOKEN=.*/TELEGRAM_BOT_TOKEN=${NEW_TOKEN}/" .env`,
        `git clean -fd`,
        `git reset --hard HEAD`,
        // Run the deploy script which pulls git, runs npm install, and pm2 reload
        `bash ./deploy.sh`
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
}).connect(SERVER);
