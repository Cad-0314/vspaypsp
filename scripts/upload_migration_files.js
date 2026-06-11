const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ'
};

const conn = new Client();

conn.on('ready', () => {
  console.log('SSH Connection ready to upload migration files.');
  
  conn.sftp((err, sftp) => {
    if (err) {
      console.error('SFTP initialization failed:', err);
      conn.end();
      process.exit(1);
    }
    
    const filesToUpload = [
      {
        local: path.join(__dirname, '..', 'database.sqlite'),
        remote: '/var/www/vspaypsp/database.sqlite'
      },
      {
        local: path.join(__dirname, '..', 'scripts', 'migrate_sqlite_to_mysql.js'),
        remote: '/var/www/vspaypsp/scripts/migrate_sqlite_to_mysql.js'
      }
    ];
    
    let uploadedCount = 0;
    
    function uploadNext() {
      if (uploadedCount >= filesToUpload.length) {
        console.log('All migration files uploaded successfully!');
        conn.end();
        process.exit(0);
      }
      
      const file = filesToUpload[uploadedCount];
      console.log(`Uploading ${file.local} to ${file.remote}...`);
      
      const readStream = fs.createReadStream(file.local);
      const writeStream = sftp.createWriteStream(file.remote);
      
      writeStream.on('close', () => {
        console.log(`Finished uploading ${path.basename(file.local)}`);
        uploadedCount++;
        uploadNext();
      });
      
      writeStream.on('error', (err) => {
        console.error(`Error uploading ${file.local}:`, err);
        conn.end();
        process.exit(1);
      });
      
      readStream.pipe(writeStream);
    }
    
    uploadNext();
  });
}).on('error', (err) => {
  console.error('SSH Connection Error:', err);
  process.exit(1);
}).connect(config);
