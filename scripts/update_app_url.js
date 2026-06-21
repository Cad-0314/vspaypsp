const { Client } = require('ssh2');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ'
};

const commands = [
  // Verify current APP_URL
  `grep APP_URL /var/www/vspaypsp/.env`,
  // Update APP_URL to the new domain
  `sed -i 's|APP_URL=.*|APP_URL=https://gaurpay.site|g' /var/www/vspaypsp/.env`,
  // Restart PM2 to apply env changes
  `cd /var/www/vspaypsp && pm2 restart ecosystem.config.js --update-env`
];

const conn = new Client();

conn.on('ready', () => {
  let currentIdx = 0;
  function runNext() {
    if (currentIdx >= commands.length) {
      console.log('Update complete!');
      conn.end();
      process.exit(0);
    }
    conn.exec(commands[currentIdx], (err, stream) => {
      if (err) {
        console.error('Exec error:', err);
        return;
      }
      stream.on('data', d => process.stdout.write(d.toString()));
      stream.on('close', () => {
        currentIdx++;
        runNext();
      });
    });
  }
  runNext();
}).on('error', (err) => {
  console.error('Connection error:', err);
}).connect(config);
