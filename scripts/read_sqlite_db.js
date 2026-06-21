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
  console.log('SSH Connected. Reading remote SQLite database...');
  
  const cmd = 'sqlite3 /var/www/vspaypsp/database.sqlite "SELECT id, username, role, isActive, two_fa_enabled, password_hash FROM users;"';
  
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    let output = '';
    stream.on('data', d => { output += d.toString(); });
    stream.stderr.on('data', d => { output += d.toString(); });
    stream.on('close', () => {
      console.log('--- Remote SQLite Users ---');
      console.log(output.trim() || '(No users found or error)');
      conn.end();
    });
  });
}).on('error', err => {
  console.error('SSH Error:', err);
  process.exit(1);
}).connect(config);
