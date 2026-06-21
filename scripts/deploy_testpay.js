/**
 * Deploy only testpay-related changes to server
 * Uploads only the modified/new files and restarts PM2
 */
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ',
  keepaliveInterval: 10000,
  keepaliveCountMax: 5,
  readyTimeout: 30000
};

const baseDir = path.join(__dirname, '..');
const remoteBase = '/var/www/vspaypsp';

// Only the files changed for testpay
const filesToSync = [
  'src/services/testpay.js',
  'src/services/channelRouter.js',
  'src/routes/api/callbacks.js',
  'src/seeders/init.js',
  '.env',
];

console.log(`Deploying ${filesToSync.length} testpay-related files...`);

const conn = new Client();

conn.on('ready', () => {
  console.log('SSH connected.\n');

  conn.sftp((err, sftp) => {
    if (err) { console.error('SFTP error:', err); conn.end(); return; }

    let idx = 0;
    let ok = 0;

    function uploadNext() {
      if (idx >= filesToSync.length) {
        console.log(`\n✅ Uploaded ${ok}/${filesToSync.length} files.`);
        console.log('Restarting PM2...\n');

        conn.exec(`cd ${remoteBase} && pm2 restart ecosystem.config.js --update-env`, (err, stream) => {
          if (err) { console.error('PM2 error:', err); conn.end(); return; }
          stream.on('data', d => process.stdout.write(d.toString()));
          stream.stderr.on('data', d => process.stderr.write(d.toString()));
          stream.on('close', () => {
            console.log('\n✅ Deploy complete! Server restarted.');
            conn.end();
            process.exit(0);
          });
        });
        return;
      }

      const f = filesToSync[idx];
      const localPath = path.join(baseDir, f);
      const remotePath = `${remoteBase}/${f.replace(/\\/g, '/')}`;

      if (!fs.existsSync(localPath)) {
        console.log(`  ⚠️  Skip (not found): ${f}`);
        idx++;
        uploadNext();
        return;
      }

      const readStream = fs.createReadStream(localPath);
      const writeStream = sftp.createWriteStream(remotePath);

      writeStream.on('close', () => {
        ok++;
        console.log(`  ✅ ${f}`);
        idx++;
        uploadNext();
      });
      writeStream.on('error', (err) => {
        console.error(`  ❌ ${f}: ${err.message}`);
        idx++;
        uploadNext();
      });

      readStream.pipe(writeStream);
    }

    uploadNext();
  });
}).on('error', err => {
  console.error('SSH Error:', err.message);
  process.exit(1);
}).connect(config);
