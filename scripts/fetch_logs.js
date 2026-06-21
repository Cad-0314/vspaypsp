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
  conn.exec('tail -n 100 /var/www/vspaypsp/logs/pm2-out-0.log', (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    let output = '';
    stream.on('data', d => { output += d.toString(); });
    stream.stderr.on('data', d => { output += d.toString(); });
    stream.on('close', () => {
      console.log('--- PM2 OUT LOG ---');
      console.log(output);
      
      conn.exec('tail -n 100 /var/www/vspaypsp/logs/pm2-error-0.log', (err2, stream2) => {
        if (err2) { conn.end(); return; }
        let errOut = '';
        stream2.on('data', d => { errOut += d.toString(); });
        stream2.on('close', () => {
          console.log('\n--- PM2 ERR LOG ---');
          console.log(errOut);
          conn.end();
        });
      });
    });
  });
}).on('error', err => {
  console.error('SSH Error:', err);
  process.exit(1);
}).connect(config);
