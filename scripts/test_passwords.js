const { Client } = require('ssh2');

const passwords = [
  'wgMVh6@eb256@LJ',
  'amit1ch.ok'
];

function tryPassword(index) {
  if (index >= passwords.length) {
    console.log('All candidate passwords failed.');
    process.exit(1);
  }
  const password = passwords[index];
  console.log(`Testing password: "${password}"...`);
  
  const conn = new Client();
  conn.on('ready', () => {
    console.log(`SUCCESS! Worked with password: "${password}"`);
    conn.end();
    process.exit(0);
  }).on('error', (err) => {
    console.log(`Failed for "${password}": ${err.message}`);
    tryPassword(index + 1);
  }).connect({
    host: '66.23.233.13',
    port: 22,
    username: 'root',
    password: password
  });
}

tryPassword(0);
