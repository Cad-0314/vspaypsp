const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ',
  readyTimeout: 10000,
  keepaliveInterval: 5000
};

// Files to upload (the missing proxyManager.js that causes the crash)
const filesToUpload = [
  {
    local: path.join(__dirname, '..', 'src', 'services', 'proxyManager.js'),
    remote: '/var/www/vspaypsp/src/services/proxyManager.js'
  }
];

// Production .env fixes to apply via sed commands
const envFixes = [
  "sed -i 's|^APP_URL=.*|APP_URL=https://gaurpay.site|' /var/www/vspaypsp/.env",
  "sed -i 's|^NODE_ENV=.*|NODE_ENV=production|' /var/www/vspaypsp/.env",
  "sed -i 's|^DB_DIALECT=.*|DB_DIALECT=mysql|' /var/www/vspaypsp/.env",
  "sed -i 's|^DB_STORAGE=.*||' /var/www/vspaypsp/.env",
  "sed -i 's|^# DB_HOST=.*|DB_HOST=127.0.0.1|' /var/www/vspaypsp/.env",
  "sed -i 's|^# DB_USER=.*|DB_USER=vspay_user|' /var/www/vspaypsp/.env",
  "sed -i 's|^# DB_PASSWORD=.*|DB_PASSWORD=vspay_pass_789_secure|' /var/www/vspaypsp/.env",
  "sed -i 's|^# DB_NAME=.*|DB_NAME=vspay|' /var/www/vspaypsp/.env",
];

const conn = new Client();

conn.on('ready', () => {
  console.log('SSH connection established.\n');

  // Step 1: Upload missing proxyManager.js
  conn.sftp((err, sftp) => {
    if (err) { console.error('SFTP error:', err); process.exit(1); }

    let idx = 0;
    function uploadNext() {
      if (idx >= filesToUpload.length) {
        console.log('\n--- Step 2: Fixing .env for production ---');
        const allSedCmds = envFixes.join(' && ');
        conn.exec(allSedCmds, (err, stream) => {
          if (err) { console.error('sed error:', err); conn.end(); return; }
          stream.on('data', d => process.stdout.write(d.toString()));
          stream.stderr.on('data', d => process.stderr.write(d.toString()));
          stream.on('close', () => {
            console.log('  ✅ .env fixed (APP_URL, NODE_ENV, DB to MySQL)\n');

            // Verify .env
            conn.exec('grep -E "^(APP_URL|NODE_ENV|DB_DIALECT|DB_HOST|DB_USER|DB_NAME)" /var/www/vspaypsp/.env', (err, stream) => {
              if (err) { conn.end(); return; }
              let envOutput = '';
              stream.on('data', d => { envOutput += d.toString(); });
              stream.on('close', () => {
                console.log('  .env verification:');
                console.log('  ' + envOutput.trim().split('\n').join('\n  '));

                // Step 3: Restart PM2
                console.log('\n--- Step 3: Restarting PM2 ---');
                conn.exec('cd /var/www/vspaypsp && pm2 restart ecosystem.config.js --update-env', (err, stream) => {
                  if (err) { console.error('PM2 error:', err); conn.end(); return; }
                  let pm2Output = '';
                  stream.on('data', d => { pm2Output += d.toString(); });
                  stream.stderr.on('data', d => { pm2Output += d.toString(); });
                  stream.on('close', () => {
                    console.log(pm2Output);

                    // Step 4: Wait then verify
                    console.log('--- Step 4: Verifying (waiting 6s for startup) ---');
                    setTimeout(() => {
                      conn.exec('curl -s http://localhost:3000/health && echo "" && ss -tlnp | grep 3000 && pm2 status', (err, stream) => {
                        if (err) { conn.end(); process.exit(0); return; }
                        let verifyOutput = '';
                        stream.on('data', d => { verifyOutput += d.toString(); });
                        stream.stderr.on('data', d => { verifyOutput += d.toString(); });
                        stream.on('close', () => {
                          console.log(verifyOutput);
                          console.log('\n========================================');
                          console.log('  FIX COMPLETE');
                          console.log('========================================');
                          conn.end();
                          process.exit(0);
                        });
                      });
                    }, 6000);
                  });
                });
              });
            });
          });
        });
        return;
      }

      const file = filesToUpload[idx];
      console.log(`--- Step 1: Uploading ${path.basename(file.local)} ---`);

      const readStream = fs.createReadStream(file.local);
      const writeStream = sftp.createWriteStream(file.remote);

      writeStream.on('close', () => {
        console.log(`  ✅ Uploaded ${path.basename(file.local)}`);
        idx++;
        uploadNext();
      });
      writeStream.on('error', err => {
        console.error(`  ❌ Upload failed: ${err.message}`);
        idx++;
        uploadNext();
      });

      readStream.pipe(writeStream);
    }

    uploadNext();
  });
}).on('error', err => {
  console.error('SSH Error:', err);
  process.exit(1);
}).connect(config);
