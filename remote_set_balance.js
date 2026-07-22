const { Client } = require('ssh2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const conn = new Client();
const scriptContent = `
const { User } = require('./src/models');
const sequelize = require('./src/config/database');

async function updateBalance() {
    try {
        const username = 'jupiter';
        const user = await User.findOne({ where: { username } });
        
        if (!user) {
            console.log('User not found');
            return;
        }

        user.balance = 139479.73;
        await user.save();

        console.log(\`Successfully updated balance for user \${user.username}. New balance: \${user.balance}\`);
    } catch (error) {
        console.error('Error updating balance:', error);
    }
}

updateBalance().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
`;

conn.on('ready', () => {
    console.log('SSH Connection ready. Executing balance update...');
    const cmd = `cd /www/wwwroot/gaurpay.site && cat << 'EOF' > set_balance.js
${scriptContent}
EOF
node set_balance.js && rm set_balance.js
`;
    conn.exec(cmd, (err, stream) => {
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
