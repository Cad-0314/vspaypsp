const { Client } = require('ssh2');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ',
  readyTimeout: 10000
};

const scriptContent = `
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { User } = require('./src/models');
const bcryptjs = require('bcryptjs');

async function check() {
  try {
    console.log('Using DB_DIALECT:', process.env.DB_DIALECT);
    console.log('Using DB_STORAGE:', process.env.DB_STORAGE);
    console.log('Using DB_NAME:', process.env.DB_NAME);
    console.log('Using DB_USER:', process.env.DB_USER);
    
    const admin = await User.findOne({ where: { username: 'admin' } });
    if (!admin) {
      console.log('Admin user not found in the active database!');
      process.exit(0);
    }
    console.log('Admin user found:');
    console.log('  Username:', admin.username);
    console.log('  Role:', admin.role);
    console.log('  IsActive:', admin.isActive);
    console.log('  Two_fa_enabled:', admin.two_fa_enabled);
    console.log('  Password Hash:', admin.password_hash);

    const testPasswords = ['password123', 'admin', 'admin123', 'password', '123456'];
    console.log('\\nTesting password hashes:');
    for (const p of testPasswords) {
      const matchJs = await bcryptjs.compare(p, admin.password_hash).catch(e => false);
      console.log(\`  Password "\${p}":\`);
      console.log(\`    bcryptjs match:      \${matchJs}\`);
    }
  } catch (err) {
    console.error('Error during check:', err);
  }
  process.exit(0);
}
check();
`;

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH Connected. Testing admin login hash on the server...\n');
  
  // Write the script to the server and run it
  conn.exec(`cat << 'EOF' > /var/www/vspaypsp/test_admin_login.js\n${scriptContent}\nEOF\ncd /var/www/vspaypsp && node test_admin_login.js && rm -f test_admin_login.js`, (err, stream) => {
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
