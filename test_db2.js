const { Client } = require('ssh2'); 
const path = require('path'); 
require('dotenv').config({ path: path.join(__dirname, '.env') }); 
const conn = new Client(); 
conn.on('ready', () => { 
    const script = `
const { Order } = require('./src/models');
Order.findOne({where:{id:'009faf12-5be8-4359-a615-c98c8dd0edce'}}).then(o => {
    console.log(o ? JSON.stringify(o.toJSON(), null, 2) : 'NOT FOUND');
}).catch(e => console.error(e));
`;
    conn.exec(`cd /www/wwwroot/gaurpay.site && node -e "${script.replace(/\n/g, ' ')}"`, (err, stream) => { 
        stream.on('data', d => process.stdout.write(d.toString())); 
        stream.stderr.on('data', d => process.stderr.write(d.toString())); 
        stream.on('close', () => conn.end()); 
    }); 
}).connect({
    host: process.env.DEPLOY_HOST, 
    username: process.env.DEPLOY_USER, 
    password: process.env.DEPLOY_PASSWORD
});
