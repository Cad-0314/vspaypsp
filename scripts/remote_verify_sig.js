/**
 * SSH into production server and verify the Jupiter merchant's apiSecret + signature
 */
const { Client } = require('ssh2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const conn = new Client();

const remoteScript = `
cd /www/wwwroot/gaurpay.site && node -e '
require("dotenv").config();
const crypto = require("crypto");
const { User } = require("./src/models");

User.findOne({ where: { apiKey: "gkMBny", role: "merchant" } }).then(m => {
    if (!m) { console.log("Merchant not found!"); process.exit(1); }

    console.log("apiSecret:", m.apiSecret);
    console.log("apiSecret length:", (m.apiSecret || "").length);

    const body = {
        ref_id: "490748656",
        webhook_url: "https://dev.ips.intelplat.ru/callback/GaurPay",
        txn_amount: "110",
        payer_email: "email@mail.ru",
        payer_name: "Test Joe",
        payer_phone: "1234567890",
        return_url: "https://your-merchant.example/return"
    };

    const filtered = {};
    Object.keys(body).forEach(k => {
        if (k !== "sign" && body[k] !== "" && body[k] != null) filtered[k] = body[k];
    });
    const sorted = Object.keys(filtered).sort();
    const query = sorted.map(k => k + "=" + filtered[k]).join("&");
    const str = query + "&secret=" + (m.apiSecret || "").trim();
    const expected = crypto.createHash("md5").update(str).digest("hex").toUpperCase();

    console.log("String to sign:", str);
    console.log("Expected:", expected);
    console.log("Client sent: 1BB7435A98FA25CE30670C168F02A6D5");
    console.log("Match:", expected === "1BB7435A98FA25CE30670C168F02A6D5");
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
