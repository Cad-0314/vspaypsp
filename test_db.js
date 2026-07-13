const { Client } = require('ssh2'); 
const path = require('path'); 
require('dotenv').config({ path: path.join(__dirname, '.env') }); 
const conn = new Client(); 
conn.on('ready', () => { 
    const script = `const { Channel } = require('./src/models');
async function test() {
    const c = await Channel.findOne({ where: { name: 'bcatpay' }});
    console.log('CHANNEL:', c ? c.toJSON() : null);
    process.exit(0);
}
test();`;
    
    conn.exec(`cd /www/wwwroot/gaurpay.site && echo ${Buffer.from(script).toString('base64')} | base64 -d > test6.js && node test6.js`, (err, stream) => { 
        stream.on('data', d => process.stdout.write(d.toString())); 
        stream.stderr.on('data', d => process.stderr.write(d.toString())); 
        stream.on('close', () => conn.end()); 
    }); 
}).connect({
    host: process.env.DEPLOY_HOST, 
    username: process.env.DEPLOY_USER, 
    password: process.env.DEPLOY_PASSWORD
});
