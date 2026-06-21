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
  
  // Stop PM2 first, then try starting manually to see the actual error
  const cmd = 'cd /var/www/vspaypsp && pm2 stop gaurpay-api 2>/dev/null; timeout 8 node server.js 2>&1; echo "EXIT_CODE=$?"';
  
  console.log('Stopping PM2 and running server.js manually to capture crash error...\n');
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    let output = '';
    stream.on('data', d => { 
      const str = d.toString();
      output += str; 
      process.stdout.write(str); 
    });
    stream.stderr.on('data', d => { 
      const str = d.toString();
      output += str; 
      process.stderr.write(str); 
    });
    stream.on('close', () => {
      console.log('\n\n--- Also checking if proxyManager.js exists ---');
      conn.exec('ls -la /var/www/vspaypsp/src/services/proxyManager.js 2>&1 && echo "---" && head -5 /var/www/vspaypsp/src/services/proxyManager.js', (err, stream) => {
        if (err) { conn.end(); return; }
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.stderr.on('data', d => process.stderr.write(d.toString()));
        stream.on('close', () => {
          // Start PM2 back
          conn.exec('cd /var/www/vspaypsp && pm2 start ecosystem.config.js --update-env 2>&1', (err, stream) => {
            if (err) { conn.end(); return; }
            stream.on('data', d => process.stdout.write(d.toString()));
            stream.on('close', () => {
              conn.end();
              process.exit(0);
            });
          });
        });
      });
    });
  });
}).on('error', err => {
  console.error('SSH Error:', err);
  process.exit(1);
}).connect(config);
