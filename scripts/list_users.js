const { Client } = require('ssh2');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ'
};

const conn = new Client();

conn.on('ready', () => {
  const query = `mysql -u vspay_user -pvspay_pass_789_secure vspay -e "SELECT id, username, role, isActive, apiKey, createdAt FROM users;"`;
  
  conn.exec(query, (err, stream) => {
    if (err) throw err;
    let output = '';
    stream.on('data', d => {
      output += d.toString();
      process.stdout.write(d.toString());
    });
    stream.stderr.on('data', d => {
      console.error(d.toString());
    });
    stream.on('close', () => {
      conn.end();
      process.exit(0);
    });
  });
}).on('error', err => {
  console.error('SSH Error:', err);
  process.exit(1);
}).connect(config);
