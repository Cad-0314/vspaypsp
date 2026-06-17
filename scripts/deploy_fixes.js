const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ'
};

// Files to upload
const filesToUpload = [
  {
    local: path.join(__dirname, '..', 'test-payin-channels.js'),
    remote: '/var/www/vspaypsp/test-payin-channels.js'
  }
];

const conn = new Client();

conn.on('ready', () => {
  console.log('SSH connection established.');

  conn.sftp((err, sftp) => {
    if (err) { console.error('SFTP error:', err); process.exit(1); }

    let idx = 0;
    function uploadNext() {
      if (idx >= filesToUpload.length) {
        console.log('\nAll files uploaded. Restarting PM2...');
        conn.exec('cd /var/www/vspaypsp && pm2 restart ecosystem.config.js --update-env', (err, stream) => {
          if (err) throw err;
          stream.on('data', d => process.stdout.write(d.toString()));
          stream.on('close', () => {
            console.log('\n✅ Deployment complete! Server restarted.');
            conn.end();
            process.exit(0);
          });
        });
        return;
      }

      const file = filesToUpload[idx];
      console.log(`Uploading: ${path.basename(file.local)} → ${file.remote}`);

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
