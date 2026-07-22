const { Client } = require('ssh2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const conn = new Client();
const scriptContent = `
const { User, Settlement } = require('./src/models');
const sequelize = require('./src/config/database');

async function refundSettlement() {
    const t = await sequelize.transaction();
    try {
        const settlementId = '4f847707-d9be-4a11-b610-1c2017a8af80';
        const settlement = await Settlement.findOne({ where: { id: settlementId }, transaction: t });
        
        if (!settlement) {
            console.log('Settlement not found');
            await t.rollback();
            return;
        }

        if (settlement.status === 'rejected') {
            console.log('Settlement already rejected/refunded');
            await t.rollback();
            return;
        }

        const user = await User.findByPk(settlement.merchantId, { transaction: t });
        if (!user) {
            console.log('User not found');
            await t.rollback();
            return;
        }

        const amount = parseFloat(settlement.amount);
        
        user.balance = parseFloat(user.balance) + amount;
        await user.save({ transaction: t });

        settlement.status = 'rejected';
        settlement.notes = (settlement.notes || '') + ' [Refunded by Admin Request]';
        await settlement.save({ transaction: t });

        await t.commit();
        console.log(\`Successfully refunded \${amount} to user \${user.username}. New balance: \${user.balance}\`);
    } catch (error) {
        await t.rollback();
        console.error('Error refunding settlement:', error);
    }
}

refundSettlement().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
`;

conn.on('ready', () => {
    console.log('SSH Connection ready. Executing refund...');
    const cmd = `cd /www/wwwroot/gaurpay.site && cat << 'EOF' > refund.js
${scriptContent}
EOF
node refund.js && rm refund.js
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
