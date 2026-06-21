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
  console.log('SSH connected.\n');
  
  const cmds = [
    { label: 'Users in MySQL', cmd: "mysql -u vspay_user -pvspay_pass_789_secure vspay -e \"SELECT id, username, role, isActive, assignedChannel FROM users;\" 2>&1" },
    { label: 'Check .env DB config', cmd: 'grep -E "^(DB_|APP_URL|NODE_ENV)" /var/www/vspaypsp/.env' },
    { label: 'PM2 recent out logs', cmd: 'tail -20 /var/www/vspaypsp/logs/pm2-out-0.log 2>/dev/null' },
  ];

  let idx = 0;
  function next() {
    if (idx >= cmds.length) { conn.end(); process.exit(0); return; }
    const { label, cmd } = cmds[idx];
    console.log(`--- ${label} ---`);
    let output = '';
    conn.exec(cmd, (err, stream) => {
      if (err) { console.error(err); idx++; next(); return; }
      stream.on('data', d => { output += d.toString(); });
      stream.stderr.on('data', d => { output += d.toString(); });
      stream.on('close', () => {
        console.log(output.trim() + '\n');
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
