const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ'
};

const localZipPath = path.join(__dirname, '..', 'vspaypsp.zip');
const remoteZipPath = '/tmp/vspaypsp.zip';
const targetDir = '/var/www/vspaypsp';

const conn = new Client();

conn.on('ready', () => {
  console.log('SSH Connection ready for upload.');
  
  conn.sftp((err, sftp) => {
    if (err) {
      console.error('SFTP initialization failed:', err);
      conn.end();
      process.exit(1);
    }
    
    console.log(`Uploading local file ${localZipPath} to remote ${remoteZipPath}...`);
    
    const readStream = fs.createReadStream(localZipPath);
    const writeStream = sftp.createWriteStream(remoteZipPath);
    
    writeStream.on('close', () => {
      console.log('Upload completed successfully!');
      
      // Execute extract and npm install
      const commands = [
        `mkdir -p ${targetDir}`,
        `unzip -o ${remoteZipPath} -d ${targetDir}`,
        `cd ${targetDir} && npm install --production`,
        `rm ${remoteZipPath}`
      ];
      
      let currentIdx = 0;
      function runNextCommand() {
        if (currentIdx >= commands.length) {
          console.log('Deployment upload and install actions complete!');
          conn.end();
          process.exit(0);
        }
        
        const cmd = commands[currentIdx];
        console.log(`Executing remote command: ${cmd}`);
        
        conn.exec(cmd, (err, stream) => {
          if (err) {
            console.error('Remote execution error:', err);
            conn.end();
            process.exit(1);
          }
          
          stream.on('close', (code) => {
            const isUnzip = cmd.startsWith('unzip');
            const allowed = isUnzip ? [0, 1] : [0];
            if (!allowed.includes(code)) {
              console.error(`Command failed with code: ${code}`);
              conn.end();
              process.exit(code);
            }
            console.log('Command completed successfully.');
            currentIdx++;
            runNextCommand();
          }).on('data', (data) => {
            process.stdout.write(data.toString());
          }).stderr.on('data', (data) => {
            process.stderr.write(data.toString());
          });
        });
      }
      
      runNextCommand();
    });
    
    writeStream.on('error', (err) => {
      console.error('Write stream error:', err);
      conn.end();
      process.exit(1);
    });
    
    readStream.pipe(writeStream);
  });
}).on('error', (err) => {
  console.error('SSH Connection Error:', err);
  process.exit(1);
}).connect(config);
