const { Client } = require('ssh2'); 
const path = require('path'); 
require('dotenv').config({ path: path.join(__dirname, '.env') }); 
const conn = new Client(); 
conn.on('ready', () => {     
    console.log('SSH Connection ready. Executing remote query...');
    conn.exec(`cd /www/wwwroot/gaurpay.site && node -e "const {User}=require('./src/models'); User.findAll().then(users => console.log(users.map(u => u.username).join(', ')));"`, (err, stream) => { 
        if (err) {
            console.error('Error executing command:', err);
            conn.end();
            return;
        }
        stream.on('data', d => process.stdout.write(d.toString())); 
        stream.stderr.on('data', d => process.stderr.write(d.toString())); 
        stream.on('close', () => {
            console.log('Stream closed.');
            conn.end();
        }); 
    }); 
}).on('error', err => {
    console.error('SSH Connection error:', err);
}).connect({
    host: process.env.DEPLOY_HOST, 
    username: process.env.DEPLOY_USER, 
    password: process.env.DEPLOY_PASSWORD
});
