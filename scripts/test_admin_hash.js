const { Client } = require('ssh2');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ',
  readyTimeout: 10000
};

const scriptContent = `
const bcrypt = require('bcryptjs');
const hash = '$2b$10$QyIc5RME///Cdy43LWW19.XhTW7T.sLO1YN9MKvzhKDgLABEKUpbC';
const passwordsToTest = ['admin', 'admin123', 'password', '123456', 'admin@123', 'admin777', 'admin@777', 'admin@777', 'admin@1234'];

async function test() {
  console.log('Testing passwords against admin hash...');
  for (const p of passwordsToTest) {
    const match = await bcrypt.compare(p, hash);
    if (match) {
      console.log('Match found! Password is:', p);
      process.exit(0);
    }
  }
  console.log('No match found in common passwords.');
  process.exit(0);
}
test();
`;

const conn = new Client();
conn.on('ready', () => {
  conn.exec(`cat << 'EOF' > /var/www/vspaypsp/test_hash.js\n${scriptContent}\nEOF\nnode /var/www/vspaypsp/test_hash.js`, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    let output = '';
    stream.on('data', d => { output += d.toString(); });
    stream.stderr.on('data', d => { output += d.toString(); });
    stream.on('close', () => {
      console.log(output);
      conn.end();
    });
  });
}).on('error', err => {
  console.error('SSH Error:', err);
  process.exit(1);
}).connect(config);
