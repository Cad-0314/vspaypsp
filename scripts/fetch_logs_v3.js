const { Client } = require('ssh2');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ',
  readyTimeout: 10000
};

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH Connected. Searching PM2 combined logs for SQL error...');
  
  // Find logs containing the timestamp or Sequelize error details
  const cmd = 'grep -C 10 -i "11:54:26" /var/www/vspaypsp/logs/pm2-combined-0.log || grep -C 10 -i "11:54:26" /var/www/vspaypsp/logs/pm2-out-0.log || grep -C 10 -i "11:52:40" /var/www/vspaypsp/logs/pm2-combined-0.log';
  
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    let output = '';
    stream.on('data', d => { output += d.toString(); });
    stream.stderr.on('data', d => { output += d.toString(); });
    stream.on('close', () => {
      console.log('--- Remote PM2 Combined Log Search Results ---');
      console.log(output.trim() || '(No matching log lines found)');
      conn.end();
    });
  });
}).on('error', err => {
  console.error('SSH Error:', err);
  process.exit(1);
}).connect(config);
