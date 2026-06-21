const { Client } = require('ssh2');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ'
};

const domain = 'gaurpay.site';
const email = 'admin@gaurpay.site'; // Used for Let's Encrypt notifications

const commands = [
  // 1. Install Certbot and the Nginx plugin
  'apt-get update',
  'apt-get install -y certbot python3-certbot-nginx',
  
  // 2. Update the Nginx configuration to use the real domain instead of '_'
  `sed -i 's/server_name _;/server_name ${domain} www.${domain};/g' /etc/nginx/sites-available/default`,
  
  // 3. Test and restart Nginx to apply the domain name change
  'nginx -t',
  'systemctl restart nginx',
  
  // 4. Request and install the SSL certificate using Certbot
  `certbot --nginx -d ${domain} -d www.${domain} --non-interactive --agree-tos -m ${email} --redirect`,
  
  // 5. Verify ufw allows HTTPS traffic (port 443)
  'ufw allow "Nginx Full"',
  'ufw reload'
];

function runCommands() {
  const conn = new Client();
  
  conn.on('ready', () => {
    console.log('SSH connection established.');
    
    let currentIdx = 0;
    
    function runNext() {
      if (currentIdx >= commands.length) {
        console.log('\n========================================');
        console.log('✅ SSL Setup Completed Successfully!');
        console.log(`Your website should now be available at https://${domain}`);
        console.log('========================================');
        conn.end();
        process.exit(0);
      }
      
      const cmd = commands[currentIdx];
      console.log(`\n========================================`);
      console.log(`Executing: ${cmd}`);
      console.log(`========================================`);
      
      conn.exec(cmd, (err, stream) => {
        if (err) {
          console.error(`Execution error: ${err.message}`);
          conn.end();
          process.exit(1);
        }
        
        stream.on('close', (code, signal) => {
          if (code !== 0) {
            console.error(`\n❌ Command failed with exit code: ${code}`);
            console.log('Make sure your DNS A record is pointed to the server IP and has propagated before running this.');
            conn.end();
            process.exit(code);
          }
          console.log(`Command finished successfully.`);
          currentIdx++;
          runNext();
        }).on('data', (data) => {
          process.stdout.write(data.toString());
        }).stderr.on('data', (data) => {
          process.stderr.write(data.toString());
        });
      });
    }
    
    runNext();
  }).on('error', (err) => {
    console.error('SSH Connection Error:', err);
    process.exit(1);
  }).connect(config);
}

runCommands();
