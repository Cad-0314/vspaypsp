const fs = require('fs');
const { Client } = require('ssh2');

const sshConfig = {
    host: '66.23.233.13',
    port: 22,
    username: 'root',
    password: '3RW#xHuJ',
    readyTimeout: 20000
};

const pubKeyPath = process.env.USERPROFILE + '\\.ssh\\id_rsa.pub';
const pubKey = fs.readFileSync(pubKeyPath, 'utf8').trim();

const commands = [
    `mkdir -p ~/.ssh`,
    `echo "${pubKey}" >> ~/.ssh/authorized_keys`,
    `chmod 700 ~/.ssh`,
    `chmod 600 ~/.ssh/authorized_keys`,
    `echo "SSH KEY INSTALLED SUCCESSFULLY"`
];

const conn = new Client();
conn.on('ready', () => {
    console.log('Client :: ready');
    conn.exec(commands.join(' && '), (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('Stream :: close :: code: ' + code + ', signal: ' + signal);
            conn.end();
        }).on('data', (data) => {
            console.log('STDOUT: ' + data);
        }).stderr.on('data', (data) => {
            console.log('STDERR: ' + data);
        });
    });
}).on('error', (err) => {
    console.error('Connection Error:', err);
}).connect(sshConfig);
