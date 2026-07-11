const { Client } = require('ssh2');
const https = require('https');
const http = require('http');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ'
};

// SSH commands to check server health
const sshCommands = [
  // 1. PM2 status
  'pm2 status',
  // 2. Check recent PM2 error logs (last 30 lines)
  'pm2 logs gaurpay-api --err --lines 30 --nostream 2>&1 || true',
  // 3. Check .env APP_URL and NODE_ENV
  'grep -E "^(APP_URL|NODE_ENV|DB_DIALECT)" /var/www/vspaypsp/.env',
  // 4. Check Nginx status
  'systemctl is-active nginx',
  // 5. Check MySQL status
  'systemctl is-active mysql',
  // 6. Check SSL cert expiry
  'echo | openssl s_client -servername gaurpay.site -connect gaurpay.site:443 2>/dev/null | openssl x509 -noout -dates 2>/dev/null || echo "SSL check failed"',
  // 7. Check disk space
  'df -h / | tail -1',
  // 8. Check memory
  'free -m | head -2',
  // 9. Quick DB table count check
  'mysql -u vspay_user -pvspay_pass_789_secure vspay -e "SELECT \'channels\' as tbl, COUNT(*) as cnt FROM channels UNION ALL SELECT \'orders\', COUNT(*) FROM orders UNION ALL SELECT \'users\', COUNT(*) FROM users UNION ALL SELECT \'settlements\', COUNT(*) FROM settlements;" 2>/dev/null',
  // 10. Check channels in DB
  'mysql -u vspay_user -pvspay_pass_789_secure vspay -e "SELECT name, displayName, status, payinEnabled, payoutEnabled, feeRate FROM channels;" 2>/dev/null',
];

function runSSHCommands() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const results = [];

    conn.on('ready', () => {
      console.log('========================================');
      console.log('  SERVER HEALTH CHECK');
      console.log('========================================\n');

      let idx = 0;
      function next() {
        if (idx >= sshCommands.length) {
          conn.end();
          resolve(results);
          return;
        }
        const cmd = sshCommands[idx];
        const label = [
          'PM2 Status',
          'Recent Error Logs',
          'Environment Config',
          'Nginx Status',
          'MySQL Status',
          'SSL Certificate',
          'Disk Space',
          'Memory',
          'DB Table Counts',
          'Channels Config'
        ][idx];

        console.log(`\n--- ${label} ---`);
        let output = '';
        conn.exec(cmd, (err, stream) => {
          if (err) { console.error('Exec error:', err); idx++; next(); return; }
          stream.on('data', d => { output += d.toString(); process.stdout.write(d.toString()); });
          stream.stderr.on('data', d => { output += d.toString(); });
          stream.on('close', () => {
            results.push({ label, output: output.trim() });
            idx++;
            next();
          });
        });
      }
      next();
    }).on('error', err => {
      console.error('SSH Error:', err);
      reject(err);
    }).connect(config);
  });
}

// HTTP endpoint checks against the live domain
async function checkEndpoints() {
  const endpoints = [
    { method: 'GET', path: '/health', expect: 200 },
    { method: 'GET', path: '/auth/login', expect: 200 },
    { method: 'GET', path: '/apidocument', expect: 200 },
  ];

  console.log('\n\n========================================');
  console.log('  HTTPS ENDPOINT CHECKS (gaurpay.site)');
  console.log('========================================\n');

  for (const ep of endpoints) {
    try {
      const result = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'gaurpay.site',
          port: 443,
          path: ep.path,
          method: ep.method,
          timeout: 10000,
          headers: { 'User-Agent': 'GaurPay-HealthCheck/1.0' }
        }, (res) => {
          let body = '';
          res.on('data', d => body += d.toString());
          res.on('end', () => resolve({ status: res.statusCode, body: body.substring(0, 200) }));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
      });

      const ok = result.status === ep.expect || (result.status >= 200 && result.status < 400);
      console.log(`${ok ? '✅' : '❌'} ${ep.method} ${ep.path} => ${result.status} (expected ${ep.expect})`);
      if (ep.path === '/health') console.log(`   Response: ${result.body}`);
    } catch (err) {
      console.log(`❌ ${ep.method} ${ep.path} => ERROR: ${err.message}`);
    }
  }

  // Test API payin create (should fail with auth error, but proves route works)
  try {
    const apiResult = await new Promise((resolve, reject) => {
      const postData = JSON.stringify({ amount: 100, channel: 'gaurpay' });
      const req = https.request({
        hostname: 'gaurpay.site',
        port: 443,
        path: '/api/payin/create',
        method: 'POST',
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let body = '';
        res.on('data', d => body += d.toString());
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(postData);
      req.end();
    });

    // We expect 401 or 400 (auth required) — NOT 404 or 500
    const routeWorks = apiResult.status !== 404 && apiResult.status !== 500;
    console.log(`${routeWorks ? '✅' : '❌'} POST /api/payin/create => ${apiResult.status} (route ${routeWorks ? 'exists' : 'MISSING'})`);
    console.log(`   Response: ${apiResult.body.substring(0, 200)}`);
  } catch (err) {
    console.log(`❌ POST /api/payin/create => ERROR: ${err.message}`);
  }

  // Test V2 collection endpoint
  try {
    const apiResult = await new Promise((resolve, reject) => {
      const postData = JSON.stringify({ amount: 100 });
      const req = https.request({
        hostname: 'gaurpay.site',
        port: 443,
        path: '/v2/collection/create',
        method: 'POST',
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let body = '';
        res.on('data', d => body += d.toString());
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(postData);
      req.end();
    });

    const routeWorks = apiResult.status !== 404 && apiResult.status !== 500;
    console.log(`${routeWorks ? '✅' : '❌'} POST /v2/collection/create => ${apiResult.status} (route ${routeWorks ? 'exists' : 'MISSING'})`);
    console.log(`   Response: ${apiResult.body.substring(0, 200)}`);
  } catch (err) {
    console.log(`❌ POST /v2/collection/create => ERROR: ${err.message}`);
  }

  // Test V3 deposit endpoint
  try {
    const apiResult = await new Promise((resolve, reject) => {
      const postData = JSON.stringify({ amount: 100 });
      const req = https.request({
        hostname: 'gaurpay.site',
        port: 443,
        path: '/v3/deposit/create',
        method: 'POST',
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let body = '';
        res.on('data', d => body += d.toString());
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(postData);
      req.end();
    });

    const routeWorks = apiResult.status !== 404 && apiResult.status !== 500;
    console.log(`${routeWorks ? '✅' : '❌'} POST /v3/deposit/create => ${apiResult.status} (route ${routeWorks ? 'exists' : 'MISSING'})`);
    console.log(`   Response: ${apiResult.body.substring(0, 200)}`);
  } catch (err) {
    console.log(`❌ POST /v3/deposit/create => ERROR: ${err.message}`);
  }

  // Test payout endpoints
  try {
    const apiResult = await new Promise((resolve, reject) => {
      const postData = JSON.stringify({ amount: 100 });
      const req = https.request({
        hostname: 'gaurpay.site',
        port: 443,
        path: '/api/payout/bank',
        method: 'POST',
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let body = '';
        res.on('data', d => body += d.toString());
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(postData);
      req.end();
    });

    const routeWorks = apiResult.status !== 404 && apiResult.status !== 500;
    console.log(`${routeWorks ? '✅' : '❌'} POST /api/payout/bank => ${apiResult.status} (route ${routeWorks ? 'exists' : 'MISSING'})`);
  } catch (err) {
    console.log(`❌ POST /api/payout/bank => ERROR: ${err.message}`);
  }

  // Test balance query
  try {
    const apiResult = await new Promise((resolve, reject) => {
      const postData = JSON.stringify({});
      const req = https.request({
        hostname: 'gaurpay.site',
        port: 443,
        path: '/api/balance/query',
        method: 'POST',
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let body = '';
        res.on('data', d => body += d.toString());
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(postData);
      req.end();
    });

    const routeWorks = apiResult.status !== 404 && apiResult.status !== 500;
    console.log(`${routeWorks ? '✅' : '❌'} POST /api/balance/query => ${apiResult.status} (route ${routeWorks ? 'exists' : 'MISSING'})`);
  } catch (err) {
    console.log(`❌ POST /api/balance/query => ERROR: ${err.message}`);
  }

  // Test callback endpoints (simulate upstream provider hitting our callback)
  const callbackChannels = ['gaurpay', 'fendpay', 'caipay', 'ckpay', 'bharatpay', 'cxpay', 'aapay', 'ipay', 'unitedpay', 'firpay', 'agpay', 'easypay', 'ynpay', 'passpay', 'bcatpay'];

  console.log('\n--- Callback Route Availability ---');
  for (const ch of callbackChannels) {
    try {
      const result = await new Promise((resolve, reject) => {
        const postData = JSON.stringify({ test: true });
        const req = https.request({
          hostname: 'gaurpay.site',
          port: 443,
          path: `/callback/${ch}/payin`,
          method: 'POST',
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        }, (res) => {
          let body = '';
          res.on('data', d => body += d.toString());
          res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.write(postData);
        req.end();
      });

      // 200 = route works (even if it returns "success" with no real order)
      // 404 = route missing
      // 500 = crash
      const ok = result.status === 200;
      console.log(`${ok ? '✅' : '❌'} /callback/${ch}/payin => ${result.status}`);
    } catch (err) {
      console.log(`❌ /callback/${ch}/payin => ERROR: ${err.message}`);
    }
  }
}

async function main() {
  await runSSHCommands();
  await checkEndpoints();
  console.log('\n========================================');
  console.log('  AUDIT COMPLETE');
  console.log('========================================');
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
