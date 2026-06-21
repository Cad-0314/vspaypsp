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
  
  const commands = [
    { label: 'Installing https-proxy-agent', cmd: 'cd /var/www/vspaypsp && npm install https-proxy-agent --save 2>&1' },
    { label: 'Restarting PM2', cmd: 'cd /var/www/vspaypsp && pm2 restart ecosystem.config.js --update-env 2>&1' },
  ];

  let idx = 0;
  function next() {
    if (idx >= commands.length) {
      // Wait 8 seconds for app startup, then verify
      console.log('\n--- Waiting 8s for startup... ---\n');
      setTimeout(() => {
        const verifyCmds = [
          'pm2 status',
          'ss -tlnp | grep 3000 || echo "NOT LISTENING on 3000"',
          'curl -s --connect-timeout 5 http://localhost:3000/health || echo "HEALTH CHECK FAILED"',
          'tail -5 /var/www/vspaypsp/logs/pm2-error-0.log 2>/dev/null',
        ];
        const fullCmd = verifyCmds.join(' && echo "---" && ');
        conn.exec(fullCmd, (err, stream) => {
          if (err) { conn.end(); return; }
          let output = '';
          stream.on('data', d => { output += d.toString(); });
          stream.stderr.on('data', d => { output += d.toString(); });
          stream.on('close', () => {
            console.log('--- Verification ---');
            console.log(output);
            console.log('\n========================================');
            console.log('  DONE');
            console.log('========================================');
            conn.end();
            process.exit(0);
          });
        });
      }, 8000);
      return;
    }
    const { label, cmd } = commands[idx];
    console.log(`--- ${label} ---`);
    conn.exec(cmd, (err, stream) => {
      if (err) { console.error(err); idx++; next(); return; }
      let output = '';
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
