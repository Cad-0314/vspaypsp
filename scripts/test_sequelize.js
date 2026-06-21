const { Client } = require('ssh2');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ'
};

const conn = new Client();

conn.on('ready', () => {
  const script = `
const { User } = require('./src/models');
async function test() {
  try {
    const user = await User.findOne({ where: { username: 'admin' } });
    console.log('User found:', user ? user.toJSON() : 'null');
    const allUsers = await User.findAll({ attributes: ['username'] });
    console.log('All usernames in DB via Sequelize:', allUsers.map(u => u.username));
    process.exit(0);
  } catch (err) {
    console.error('Sequelize Error:', err);
    process.exit(1);
  }
}
test();
  `;
  
  // Create script on remote and run it
  conn.exec(`cat << 'EOF' > /var/www/vspaypsp/test_login_db.js\n${script}\nEOF\ncd /var/www/vspaypsp && node test_login_db.js`, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => {
      conn.end();
    });
  });
}).on('error', err => {
  console.error('SSH Error:', err);
  process.exit(1);
}).connect(config);
