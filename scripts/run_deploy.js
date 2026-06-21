const { Client } = require('ssh2');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ',
  readyTimeout: 20000
};

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected. Starting deployment on remote server...\n');
  
  const cmds = [
    { label: 'Go to folder and get status', cmd: 'cd /var/www/vspaypsp && git status' },
    { label: 'Pull latest code', cmd: 'cd /var/www/vspaypsp && git pull origin main' },
    { label: 'Install dependencies', cmd: 'cd /var/www/vspaypsp && npm install --production' },
    { label: 'Reload PM2 service', cmd: 'cd /var/www/vspaypsp && pm2 reload gaurpay-api --update-env' },
    { label: 'Check PM2 status', cmd: 'pm2 status' },
    { label: 'Check port 3000', cmd: 'ss -tlnp | grep 3000' },
    { label: 'Check Health endpoint', cmd: 'curl -s http://localhost:3000/health' }
  ];

  let idx = 0;
  function next() {
    if (idx >= cmds.length) {
      console.log('\nDeployment script execution completed successfully!');
      conn.end();
      process.exit(0);
      return;
    }
    const { label, cmd } = cmds[idx];
    console.log(`>>> [${idx + 1}/${cmds.length}] ${label} (${cmd})`);
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
      stream.on('close', (code) => {
        console.log(output.trim() || `(no output, exit code: ${code})`);
        console.log('--------------------------------------------------');
        idx++;
        next();
      });
    });
  }
  next();
}).on('error', err => {
  console.error('SSH Connection Error:', err);
  process.exit(1);
}).connect(config);
