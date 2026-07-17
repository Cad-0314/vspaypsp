const { Client } = require('ssh2'); 
const path = require('path'); 
require('dotenv').config({ path: path.join(__dirname, '.env') }); 
const conn = new Client(); 
conn.on('ready', () => {     
    console.log('SSH Connection ready. Executing remote balance update...');
    const script = `
        const { User } = require('./src/models');
        async function run() {
            const username = 'BGB88C';
            const amount = 0;
            const merchant = await User.findOne({ where: { username } });
            if (!merchant) {
                console.log('Merchant not found on remote.');
                process.exit(1);
            }
            let balances = {};
            try { balances = JSON.parse(merchant.balances || '{}'); } catch(e){}
            
            // Set all balances to 0 or just BDT? The user said "set BGB88C balance to zero".
            // I'll set BDT to 0 since that was what we added.
            balances['BDT'] = 0;
            merchant.balances = JSON.stringify(balances);
            
            if (merchant.defaultCurrency === 'BDT') {
                merchant.balance = 0;
            }
            
            await merchant.save();
            console.log('✅ Successfully set BDT balance to 0 for BGB88C on remote server!');
            process.exit(0);
        }
        run();
    `;
    const b64 = Buffer.from(script).toString('base64');
    
    conn.exec(`cd /www/wwwroot/gaurpay.site && echo "${b64}" | base64 -d > set_bal_temp.js && node set_bal_temp.js && rm set_bal_temp.js`, (err, stream) => { 
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
