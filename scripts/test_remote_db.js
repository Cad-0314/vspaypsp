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
require('dotenv').config({ path: '/var/www/vspaypsp/.env' });
const User = require('/var/www/vspaypsp/src/models/User');
const sequelize = require('/var/www/vspaypsp/src/config/database');

async function test() {
  try {
    console.log('DB Config:', {
      dialect: process.env.DB_DIALECT,
      host: process.env.DB_HOST,
      name: process.env.DB_NAME,
      sequelizeDialect: sequelize.options.dialect
    });
    
    await sequelize.authenticate();
    console.log('Connection OK.');

    const user = await User.findOne({ where: { username: 'admin' } });
    if (user) {
      console.log('Found user:', user.toJSON());
    } else {
      console.log('User admin NOT FOUND!');
      const allUsers = await User.findAll();
      console.log('All users in DB:', allUsers.map(u => u.username));
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    process.exit(0);
  }
}
test();
`;

const conn = new Client();
conn.on('ready', () => {
  conn.exec(`cat << 'EOF' > /var/www/vspaypsp/test_db.js\n${scriptContent}\nEOF\nnode /var/www/vspaypsp/test_db.js`, (err, stream) => {
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
