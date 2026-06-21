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
  console.log('SSH Connected. Migrating MySQL schema on the server...\n');
  
  const cmds = [
    { label: 'Describe payoutType column before alter', cmd: `mysql -u vspay_user -pvspay_pass_789_secure vspay -e "SHOW COLUMNS FROM orders LIKE 'payoutType';"` },
    { label: 'Alter orders table to add "upi" to payoutType enum', cmd: `mysql -u vspay_user -pvspay_pass_789_secure vspay -e "ALTER TABLE orders MODIFY COLUMN payoutType ENUM('bank', 'usdt', 'upi') DEFAULT NULL;"` },
    { label: 'Describe payoutType column after alter', cmd: `mysql -u vspay_user -pvspay_pass_789_secure vspay -e "SHOW COLUMNS FROM orders LIKE 'payoutType';"` }
  ];

  let idx = 0;
  function next() {
    if (idx >= cmds.length) {
      console.log('\nMySQL database schema migrated successfully!');
      conn.end();
      process.exit(0);
      return;
    }
    const { label, cmd } = cmds[idx];
    console.log(`>>> [${idx + 1}/${cmds.length}] ${label}`);
    let output = '';
    conn.exec(cmd, (err, stream) => {
      if (err) {
        console.error(`Error running: ${label}`, err);
        conn.end();
        process.exit(1);
        return;
      }
      stream.on('data', d => { output += d.toString(); });
      stream.stderr.on('data', d => { output += d.toString(); });
      stream.on('close', () => {
        console.log(output.trim() || '(no output)');
        console.log('--------------------------------------------------');
        idx++;
        next();
      });
    });
  }
  next();
}).on('error', err => {
  console.error('SSH Error:', err);
  process.exit(1);
}).connect(config);
