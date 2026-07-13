const { Client } = require('ssh2'); 
const path = require('path'); 
require('dotenv').config({ path: path.join(__dirname, '.env') }); 
const conn = new Client(); 
conn.on('ready', () => { 
    conn.sftp((err, sftp) => {
        if (err) throw err;
        sftp.fastPut('brute_tdid2.js', '/www/wwwroot/gaurpay.site/brute_tdid2.js', (err) => {
            if (err) throw err;
            conn.exec('cd /www/wwwroot/gaurpay.site && node brute_tdid2.js', (err, stream) => { 
                stream.on('data', d => process.stdout.write(d.toString())); 
                stream.stderr.on('data', d => process.stderr.write(d.toString())); 
                stream.on('close', () => conn.end()); 
            }); 
        });
    });
}).connect({
    host: process.env.DEPLOY_HOST, 
    username: process.env.DEPLOY_USER, 
    password: process.env.DEPLOY_PASSWORD
});
