const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ'
};

const baseDir = path.join(__dirname, '..');
const remoteBase = '/var/www/vspaypsp';

// All source files to sync (excludes node_modules, .git, logs, temp files)
// NOTE: .env is NOT synced — production has different DB config (MySQL vs local SQLite)
const filesToSync = [
  'server.js',
  'package.json',
  'ecosystem.config.js',
  'src/config/database.js',
  'src/config/passport.js',
  'src/config/currencies.js',
  'src/middleware/apiAuth.js',
  'src/middleware/i18n.js',
  'src/models/index.js',
  'src/models/User.js',
  'src/models/Channel.js',
  'src/models/Order.js',
  'src/models/Settlement.js',
  'src/seeders/init.js',
  'src/services/aapay.js',
  'src/services/agpay.js',
  'src/services/autoSuccessWorker.js',
  'src/services/bharatpay.js',
  'src/services/caipay.js',
  'src/services/callbackService.js',
  'src/services/channelRouter.js',
  'src/services/ckpay.js',
  'src/services/customChannel.js',
  'src/services/cxpay.js',
  'src/services/easypay.js',
  'src/services/fendpay.js',
  'src/services/firpay.js',
  'src/services/ipay.js',
  'src/services/passpay.js',
  'src/services/testpay.js',
  'src/services/silkpay.js',
  'src/services/stats.js',
  'src/services/telegramBot.js',
  'src/services/proxyManager.js',
  'src/services/unitedpay.js',
  'src/services/ynpay.js',
  'src/routes/admin.js',
  'src/routes/auth.js',
  'src/routes/merchant_api.js',
  'src/routes/paypage.js',
  'src/routes/api/balance.js',
  'src/routes/api/callbacks.js',
  'src/routes/api/payin.js',
  'src/routes/api/payout.js',
  'src/routes/api/v2/account.js',
  'src/routes/api/v2/collection.js',
  'src/routes/api/v2/transfer.js',
  'src/routes/api/v3/deposit.js',
  'src/routes/api/v3/wallet.js',
  'src/routes/api/v3/withdraw.js',
];

// Also sync views and public directories
const viewsAndPublic = [];

function walkDir(dir, prefix) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walkDir(fullPath, relPath);
      } else {
        viewsAndPublic.push(relPath);
      }
    }
  } catch (e) { /* ignore */ }
}

walkDir(path.join(baseDir, 'views'), 'views');
walkDir(path.join(baseDir, 'public'), 'public');

const allFiles = [...filesToSync, ...viewsAndPublic].filter(f => {
  const fullPath = path.join(baseDir, f);
  return fs.existsSync(fullPath);
});

console.log(`Total files to sync: ${allFiles.length}`);

const conn = new Client();

conn.on('ready', () => {
  console.log('SSH connection established.\n');

  // First ensure all remote directories exist
  const remoteDirs = new Set();
  for (const f of allFiles) {
    const dir = path.dirname(f).replace(/\\/g, '/');
    if (dir !== '.') {
      remoteDirs.add(`${remoteBase}/${dir}`);
    }
  }

  const mkdirCmd = Array.from(remoteDirs).map(d => `mkdir -p "${d}"`).join(' && ');

  conn.exec(mkdirCmd, (err, stream) => {
    if (err) { console.error('mkdir error:', err); conn.end(); return; }
    stream.on('close', () => {
      console.log('Remote directories ensured.\n');

      conn.sftp((err, sftp) => {
        if (err) { console.error('SFTP error:', err); conn.end(); return; }

        let idx = 0;
        let successCount = 0;
        let failCount = 0;

        function uploadNext() {
          if (idx >= allFiles.length) {
            console.log(`\n========================================`);
            console.log(`Upload complete: ${successCount} success, ${failCount} failed`);
            console.log(`========================================\n`);
            console.log('Restarting PM2...');

            conn.exec(`cd ${remoteBase} && pm2 restart ecosystem.config.js --update-env`, (err, stream) => {
              if (err) { console.error('PM2 restart error:', err); conn.end(); return; }
              stream.on('data', d => process.stdout.write(d.toString()));
              stream.on('close', () => {
                console.log('\n✅ Full deployment complete!');
                conn.end();
                process.exit(0);
              });
            });
            return;
          }

          const relFile = allFiles[idx];
          const localPath = path.join(baseDir, relFile);
          const remotePath = `${remoteBase}/${relFile.replace(/\\/g, '/')}`;

          const readStream = fs.createReadStream(localPath);
          const writeStream = sftp.createWriteStream(remotePath);

          writeStream.on('close', () => {
            successCount++;
            if (successCount % 10 === 0) {
              console.log(`  Uploaded ${successCount}/${allFiles.length} files...`);
            }
            idx++;
            uploadNext();
          });
          writeStream.on('error', (err) => {
            console.error(`  ❌ Failed: ${relFile} - ${err.message}`);
            failCount++;
            idx++;
            uploadNext();
          });

          readStream.pipe(writeStream);
        }

        uploadNext();
      });
    });
    stream.on('data', () => {});
  });
}).on('error', err => {
  console.error('SSH Error:', err);
  process.exit(1);
}).connect(config);
