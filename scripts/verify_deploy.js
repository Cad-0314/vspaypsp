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
  console.log('SSH connected. Verifying deployment...\n');
  
  const cmds = [
    { label: 'admin.ejs size (should be ~155KB)', cmd: 'wc -c /var/www/vspaypsp/views/admin.ejs' },
    { label: 'Health check', cmd: 'curl -s http://localhost:3000/health' },
    { label: 'PM2 status', cmd: 'pm2 status' },
    { label: 'Port 3000', cmd: 'ss -tlnp | grep 3000' },
    { label: 'switchTab in admin.ejs', cmd: 'grep -c "function switchTab" /var/www/vspaypsp/views/admin.ejs' },
  ];

  let idx = 0;
  function next() {
    if (idx >= cmds.length) { conn.end(); process.exit(0); return; }
    const { label, cmd } = cmds[idx];
    let output = '';
    conn.exec(cmd, (err, stream) => {
      if (err) { console.error(err); idx++; next(); return; }
      stream.on('data', d => { output += d.toString(); });
      stream.stderr.on('data', d => { output += d.toString(); });
      stream.on('close', () => {
        console.log(`${label}: ${output.trim()}`);
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
