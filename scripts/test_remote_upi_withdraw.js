const { Client } = require('ssh2');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ',
  readyTimeout: 10000
};

const scriptContent = `
const axios = require('axios');
const crypto = require('crypto');
const { User, sequelize } = require('./src/models');
require('dotenv').config();

function generateSignature(params, secretKey) {
    const filtered = {};
    Object.keys(params).forEach(key => {
        if (key !== 'sign' && params[key] !== '' && params[key] != null) {
            filtered[key] = params[key];
        }
    });
    const sorted = Object.keys(filtered).sort();
    const query = sorted.map(k => \`\${k}=\${filtered[k]}\`).join('&');
    const str = \`\${query}&secret=\${secretKey}\`;
    return crypto.createHash('md5').update(str).digest('hex').toUpperCase();
}

async function test() {
  try {
    // Find spectrapayp2p merchant
    const merchant = await User.findOne({ where: { username: 'spectrapayp2p' } });
    if (!merchant) {
      console.log('Merchant spectrapayp2p not found!');
      process.exit(1);
    }
    
    // We temp increase balance if needed to prevent balance check error
    const originalBalance = parseFloat(merchant.balance);
    if (originalBalance < 500) {
      console.log('Increasing balance for test...');
      await merchant.update({ balance: 1000.00 });
    }
    
    const payload = {
      ref_id: 'payout_order_test_' + Date.now(),
      txn_amount: 400.00,
      payee_name: 'Dont Pay Test',
      webhook_url: 'https://api.spectra-pay.com/webhook/gaurpay-p2p',
      metadata: 'order_spectra_test',
      upi_id: 'test_order_no_payment@ybl'
    };

    const signature = generateSignature(payload, merchant.apiSecret);
    
    const headers = {
      'Content-Type': 'application/json',
      'x-merchant-id': merchant.apiKey,
      'x-signature': signature
    };

    console.log('Sending test request to POST http://localhost:3000/v3/withdraw/upi...');
    const res = await axios.post('http://localhost:3000/v3/withdraw/upi', payload, { headers });
    console.log('Response status:', res.status);
    console.log('Response body:', JSON.stringify(res.data, null, 2));

    // Restore original balance if we changed it
    if (originalBalance < 500) {
      console.log('Restoring original balance...');
      await merchant.update({ balance: originalBalance });
    }

  } catch (err) {
    console.error('Test execution failed:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', JSON.stringify(err.response.data, null, 2));
    }
  }
  process.exit(0);
}

test();
`;

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH Connected. Executing UPI payout test on the server...\n');
  
  conn.exec(`cat << 'EOF' > /var/www/vspaypsp/test_remote_upi.js\n${scriptContent}\nEOF\ncd /var/www/vspaypsp && node test_remote_upi.js && rm -f test_remote_upi.js`, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    let output = '';
    stream.on('data', d => { output += d.toString(); });
    stream.stderr.on('data', d => { output += d.toString(); });
    stream.on('close', () => {
      console.log(output);
      conn.end();
    });
  });
}).on('error', err => {
  console.error('SSH Error:', err);
  process.exit(1);
}).connect(config);
