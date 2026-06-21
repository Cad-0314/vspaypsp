const { Client } = require('ssh2');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ'
};

const commands = [
  `cd /var/www/vspaypsp && node reset-admin.js`
];

const conn = new Client();

conn.on('ready', () => {
  let currentIdx = 0;
  function runNext() {
    if (currentIdx >= commands.length) {
      console.log('Reset complete!');
      conn.end();
      process.exit(0);
    }
    conn.exec(commands[currentIdx], (err, stream) => {
      if (err) throw err;
      stream.on('data', d => process.stdout.write(d.toString()));
      stream.on('close', () => {
        currentIdx++;
        runNext();
      });
    });
  }
  runNext();
}).connect(config);
