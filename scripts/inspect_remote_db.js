const { Client } = require('ssh2');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ'
};

const commands = [
  // Show all tables
  `mysql -u vspay_user -pvspay_pass_789_secure vspay -e "SHOW TABLES;"`,
  
  // Show a quick summary of some key tables if they exist
  `mysql -u vspay_user -pvspay_pass_789_secure vspay -e "SELECT COUNT(*) as UserCount FROM users;" 2>/dev/null || true`,
  `mysql -u vspay_user -pvspay_pass_789_secure vspay -e "SELECT COUNT(*) as OrderCount FROM orders;" 2>/dev/null || true`,
  `mysql -u vspay_user -pvspay_pass_789_secure vspay -e "SELECT COUNT(*) as MerchantCount FROM merchants;" 2>/dev/null || true`
];

const conn = new Client();

conn.on('ready', () => {
  console.log('SSH connection established. Querying database...\n');
  
  let currentIdx = 0;
  
  function runNext() {
    if (currentIdx >= commands.length) {
      conn.end();
      process.exit(0);
    }
    
    conn.exec(commands[currentIdx], (err, stream) => {
      if (err) throw err;
      
      stream.on('close', () => {
        currentIdx++;
        runNext();
      }).on('data', (data) => {
        process.stdout.write(data.toString());
      }).stderr.on('data', (data) => {
        // Ignore stderr (like the password warning)
      });
    });
  }
  
  runNext();
}).on('error', (err) => {
  console.error('SSH Error:', err);
  process.exit(1);
}).connect(config);
