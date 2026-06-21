const { Client } = require('ssh2');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ'
};

const conn = new Client();

conn.on('ready', () => {
  const envContent = `APP_URL=https://gaurpay.site
NODE_ENV=production
DB_DIALECT=mysql
DB_HOST=localhost
DB_USER=vspay_user
DB_PASSWORD=vspay_pass_789_secure
DB_NAME=vspay
PORT=3000
JWT_SECRET=supersecret123
`;

  // Write env and restart PM2
  conn.exec(`cat << 'EOF' > /var/www/vspaypsp/.env\n${envContent}EOF\ncd /var/www/vspaypsp && pm2 restart ecosystem.config.js --update-env`, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.on('close', () => {
      console.log('Fixed remote .env and restarted PM2.');
      conn.end();
    });
  });
}).on('error', err => {
  console.error('SSH Error:', err);
  process.exit(1);
}).connect(config);
