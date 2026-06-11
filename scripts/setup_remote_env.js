const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ'
};

const localEnvPath = path.join(__dirname, '..', '.env');
const remoteEnvPath = '/var/www/vspaypsp/.env';

// Read local .env
let envContent = fs.readFileSync(localEnvPath, 'utf8');

// Modify settings for production
envContent = envContent.replace(/APP_URL=http:\/\/localhost:3000/g, 'APP_URL=http://66.23.233.13');
envContent = envContent.replace(/NODE_ENV=development/g, 'NODE_ENV=production');
envContent = envContent.replace(/DB_DIALECT=sqlite/g, 'DB_DIALECT=mysql');
envContent = envContent.replace(/DB_STORAGE=\.\/database\.sqlite/g, '# DB_STORAGE=./database.sqlite');

// Add or override DB host, user, password, name
const dbConfigs = `
DB_HOST=127.0.0.1
DB_USER=vspay_user
DB_PASSWORD=vspay_pass_789_secure
DB_NAME=vspay
`;

// Append DB configs at the top or bottom, first removing any active DB_HOST, DB_USER, etc.
envContent = envContent.replace(/^DB_HOST=.*$/gm, '# DB_HOST=...');
envContent = envContent.replace(/^DB_USER=.*$/gm, '# DB_USER=...');
envContent = envContent.replace(/^DB_PASSWORD=.*$/gm, '# DB_PASSWORD=...');
envContent = envContent.replace(/^DB_NAME=.*$/gm, '# DB_NAME=...');

envContent = dbConfigs.trim() + '\n\n' + envContent;

console.log('Modified remote .env content preview (first 15 lines):');
console.log(envContent.split('\n').slice(0, 15).join('\n'));

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH Connection established for uploading .env.');
  conn.sftp((err, sftp) => {
    if (err) {
      console.error('SFTP error:', err);
      conn.end();
      process.exit(1);
    }
    
    const writeStream = sftp.createWriteStream(remoteEnvPath);
    writeStream.on('close', () => {
      console.log('.env uploaded successfully to remote server.');
      conn.end();
      process.exit(0);
    });
    
    writeStream.on('error', (err) => {
      console.error('SFTP write error:', err);
      conn.end();
      process.exit(1);
    });
    
    writeStream.write(envContent);
    writeStream.end();
  });
}).on('error', (err) => {
  console.error('SSH connection failed:', err);
}).connect(config);
