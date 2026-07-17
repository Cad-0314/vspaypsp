/**
 * SSH into production server and update Jupiter merchant's apiSecret
 */
const { Client } = require('ssh2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const conn = new Client();
const newSecret = '31f41612d04fb6f388e43134f57ca1209121af68671a8f4224affc16cb655';

const remoteScript = `
cd /www/wwwroot/gaurpay.site && node -e '
require("dotenv").config();
const { User } = require("./src/models");

const newSecret = "${newSecret}";

User.findOne({ where: { apiKey: "gkMBny", role: "merchant" } }).then(async m => {
    if (!m) { console.log("Merchant not found!"); process.exit(1); }

    console.log("Before apiSecret:", m.apiSecret);
    await m.update({ apiSecret: newSecret });
    console.log("After apiSecret:", newSecret);
    console.log("Updated successfully!");
    process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
'
`;

conn.on('ready', () => {
    console.log('SSH connected to production server');
    conn.exec(remoteScript, (err, stream) => {
        if (err) { console.error('Exec error:', err); conn.end(); return; }
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.stderr.on('data', d => process.stderr.write(d.toString()));
        stream.on('close', () => conn.end());
    });
});

conn.on('error', err => console.error('SSH error:', err));

conn.connect({
    host: process.env.DEPLOY_HOST,
    username: process.env.DEPLOY_USER,
    password: process.env.DEPLOY_PASSWORD
});
