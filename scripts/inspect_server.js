const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connection established successfully.');
  
  const commands = [
    'echo "=== OS RELEASE ===" && cat /etc/os-release',
    'echo "=== CPU INFO ===" && nproc && lscpu | grep "Model name"',
    'echo "=== MEMORY INFO ===" && free -h',
    'echo "=== DISK INFO ===" && df -h /',
    'echo "=== INSTALLED SERVICES ===" && command -v mysql node npm pm2 nginx caddy docker ufw 2>&1',
    'echo "=== VERSIONS ===" && (mysql --version || true) && (node -v || true) && (npm -v || true) && (pm2 -v || true) && (nginx -v || true)'
  ];

  const fullCmd = commands.join(' && echo "" && ');

  conn.exec(fullCmd, (err, stream) => {
    if (err) throw err;
    let stdout = '';
    let stderr = '';
    stream.on('close', (code, signal) => {
      console.log('SSH Execution closed with code ' + code);
      console.log('--- STDOUT ---');
      console.log(stdout);
      console.log('--- STDERR ---');
      console.log(stderr);
      conn.end();
    }).on('data', (data) => {
      stdout += data;
    }).stderr.on('data', (data) => {
      stderr += data;
    });
  });
}).on('error', (err) => {
  console.error('SSH Connection Error:', err);
}).connect({
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ'
});
