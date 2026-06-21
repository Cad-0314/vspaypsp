const { Client } = require('ssh2');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ',
  readyTimeout: 10000
};

// Fix .env via sed, then restart PM2 and verify login works
const envFixes = [
  "sed -i 's|^APP_URL=.*|APP_URL=https://gaurpay.site|' /var/www/vspaypsp/.env",
  "sed -i 's|^NODE_ENV=.*|NODE_ENV=production|' /var/www/vspaypsp/.env",
  "sed -i 's|^DB_DIALECT=.*|DB_DIALECT=mysql|' /var/www/vspaypsp/.env",
  "sed -i '/^DB_STORAGE=/d' /var/www/vspaypsp/.env",
  "sed -i 's|^# DB_HOST=.*|DB_HOST=127.0.0.1|' /var/www/vspaypsp/.env",
  "sed -i 's|^# DB_USER=.*|DB_USER=vspay_user|' /var/www/vspaypsp/.env",
  "sed -i 's|^# DB_PASSWORD=.*|DB_PASSWORD=vspay_pass_789_secure|' /var/www/vspaypsp/.env",
  "sed -i 's|^# DB_NAME=.*|DB_NAME=vspay|' /var/www/vspaypsp/.env",
];

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected.\n');
  
  // Step 1: Fix .env
  console.log('Step 1: Fixing .env...');
  const allSedCmds = envFixes.join(' && ');
  conn.exec(allSedCmds, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('close', () => {
      console.log('  .env fixed\n');
      
      // Verify
      conn.exec('grep -E "^(APP_URL|NODE_ENV|DB_DIALECT|DB_HOST|DB_USER|DB_NAME)" /var/www/vspaypsp/.env', (err, stream) => {
        if (err) { conn.end(); return; }
        let output = '';
        stream.on('data', d => { output += d.toString(); });
        stream.on('close', () => {
          console.log('  Verified:\n  ' + output.trim().split('\n').join('\n  '));
          
          // Step 2: Restart PM2
          console.log('\nStep 2: Restarting PM2...');
          conn.exec('cd /var/www/vspaypsp && pm2 restart ecosystem.config.js --update-env 2>&1', (err, stream) => {
            if (err) { conn.end(); return; }
            let pm2out = '';
            stream.on('data', d => { pm2out += d.toString(); });
            stream.on('close', () => {
              console.log(pm2out.trim());
              
              // Step 3: Wait and verify
              console.log('\nStep 3: Waiting 8s then verifying...');
              setTimeout(() => {
                conn.exec('curl -s http://localhost:3000/health && echo "" && tail -5 /var/www/vspaypsp/logs/pm2-out-0.log', (err, stream) => {
                  if (err) { conn.end(); return; }
                  let verifyOut = '';
                  stream.on('data', d => { verifyOut += d.toString(); });
                  stream.on('close', () => {
                    console.log(verifyOut.trim());
                    console.log('\n✅ Done! Try logging in now.');
                    conn.end();
                    process.exit(0);
                  });
                });
              }, 8000);
            });
          });
        });
      });
    });
    stream.on('data', () => {});
  });
}).on('error', err => {
  console.error('SSH Error:', err);
  process.exit(1);
}).connect(config);
