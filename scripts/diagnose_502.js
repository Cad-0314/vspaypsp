const { Client } = require('ssh2');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ'
};

const commands = [
  { label: 'Full .env file', cmd: 'cat /var/www/vspaypsp/.env' },
  { label: 'Nginx site config', cmd: 'cat /www/server/panel/vhost/nginx/gaurpay.site.conf 2>/dev/null || cat /etc/nginx/sites-enabled/gaurpay* 2>/dev/null || cat /etc/nginx/conf.d/gaurpay* 2>/dev/null || find /www/server/panel/vhost/nginx/ -name "*.conf" -exec echo "=== {} ===" \\; -exec cat {} \\; 2>/dev/null || echo "Nginx config not found in common paths"' },
  { label: 'PM2 detailed status', cmd: 'pm2 jlist 2>/dev/null | python3 -m json.tool 2>/dev/null || pm2 jlist' },
  { label: 'PM2 out logs (last 50)', cmd: 'tail -50 /var/www/vspaypsp/logs/pm2-out-0.log 2>/dev/null || pm2 logs gaurpay-api --out --lines 50 --nostream 2>&1' },
  { label: 'PM2 error logs (last 50)', cmd: 'tail -50 /var/www/vspaypsp/logs/pm2-error-0.log 2>/dev/null || pm2 logs gaurpay-api --err --lines 50 --nostream 2>&1' },
  { label: 'Check port 3000 listening', cmd: 'ss -tlnp | grep 3000 || netstat -tlnp | grep 3000 || echo "Nothing listening on port 3000"' },
  { label: 'Node.js version', cmd: 'node -v' },
  { label: 'MySQL DB check', cmd: 'mysql -u vspay_user -pvspay_pass_789_secure vspay -e "SHOW TABLES;" 2>&1' },
  { label: 'Try starting app manually (5s timeout)', cmd: 'cd /var/www/vspaypsp && timeout 5 node server.js 2>&1 || true' },
];

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected. Running diagnostics...\n');
  let idx = 0;

  function next() {
    if (idx >= commands.length) {
      conn.end();
      process.exit(0);
      return;
    }
    const { label, cmd } = commands[idx];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${label}`);
    console.log(`${'='.repeat(60)}`);

    let output = '';
    conn.exec(cmd, (err, stream) => {
      if (err) { console.error('Exec error:', err); idx++; next(); return; }
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
