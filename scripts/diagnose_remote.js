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
  console.log('SSH connected. Running diagnostics...\n');
  
  const cmds = [
    'pwd',
    'ls -la /var/www/vspaypsp',
    'find /var/www/vspaypsp -maxdepth 2 -name ".git"',
    'pm2 show gaurpay-api'
  ];

  let idx = 0;
  function next() {
    if (idx >= cmds.length) { conn.end(); process.exit(0); return; }
    const cmd = cmds[idx];
    console.log(`\n--- CMD: ${cmd} ---`);
    let output = '';
    conn.exec(cmd, (err, stream) => {
      if (err) { console.error(err); idx++; next(); return; }
      stream.on('data', d => { output += d.toString(); });
      stream.stderr.on('data', d => { output += d.toString(); });
      stream.on('close', () => {
        console.log(output.trim());
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
