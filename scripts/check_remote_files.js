const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ',
  readyTimeout: 10000,
  keepaliveInterval: 5000
};

const remoteBase = '/var/www/vspaypsp';

// Check if critical files are in sync
const filesToCheck = [
  'src/middleware/i18n.js',
  'src/locales/en.json',
  'src/locales/zh.json',
];

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected. Comparing files...\n');
  
  const cmds = [
    { label: 'i18n middleware (remote)', cmd: `cat ${remoteBase}/src/middleware/i18n.js 2>&1` },
    { label: 'Check locales exist', cmd: `ls -la ${remoteBase}/src/locales/ 2>&1` },
    { label: 'Check admin.ejs size', cmd: `wc -c ${remoteBase}/views/admin.ejs 2>&1` },
    { label: 'admin.ejs script section (line 2210-2232)', cmd: `sed -n '2210,2232p' ${remoteBase}/views/admin.ejs 2>&1 || echo "sed failed"` },
  ];
  
  let idx = 0;
  function next() {
    if (idx >= cmds.length) { conn.end(); process.exit(0); return; }
    const { label, cmd } = cmds[idx];
    console.log(`--- ${label} ---`);
    let output = '';
    conn.exec(cmd, (err, stream) => {
      if (err) { console.error(err); idx++; next(); return; }
      stream.on('data', d => { output += d.toString(); });
      stream.stderr.on('data', d => { output += d.toString(); });
      stream.on('close', () => {
        console.log(output.trim() + '\n');
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
