const { Client } = require('ssh2');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ'
};

function runCommands(commands) {
  const conn = new Client();
  
  conn.on('ready', () => {
    console.log('SSH connection established.');
    
    let currentIdx = 0;
    
    function runNext() {
      if (currentIdx >= commands.length) {
        console.log('All commands completed successfully!');
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
            console.error(`Command failed with exit code: ${code}`);
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

// Get commands to execute from arguments
const arg = process.argv[2];
if (arg === 'step1') {
  runCommands([
    'apt-get update',
    'apt-get install -y curl git ufw unzip',
    'curl -fsSL https://deb.nodesource.com/setup_20.x | bash -',
    'apt-get install -y nodejs',
    'npm install -g pm2',
    'node -v && npm -v && pm2 -v'
  ]);
} else if (arg === 'step2') {
  runCommands([
    'apt-get install -y mysql-server',
    'systemctl start mysql && systemctl enable mysql',
    'mysql -e "CREATE DATABASE IF NOT EXISTS vspay CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"',
    'mysql -e "CREATE USER IF NOT EXISTS \'vspay_user\'@\'localhost\' IDENTIFIED BY \'vspay_pass_789_secure\';"',
    'mysql -e "GRANT ALL PRIVILEGES ON vspay.* TO \'vspay_user\'@\'localhost\';"',
    'mysql -e "FLUSH PRIVILEGES;"',
    'bash -c "cat << \'EOF\' >> /etc/mysql/mysql.conf.d/mysqld.cnf\n\n# Optimized for low-memory 2GB RAM VPS\nmax_connections = 150\nkey_buffer_size = 16M\nmax_allowed_packet = 16M\nthread_stack = 192K\nthread_cache_size = 8\nmyisam-recover-options = BACKUP\ninnodb_buffer_pool_size = 256M\ninnodb_log_file_size = 64M\ninnodb_log_buffer_size = 8M\ninnodb_flush_log_at_trx_commit = 2\ninnodb_thread_concurrency = 4\nEOF"',
    'systemctl restart mysql && systemctl status mysql | grep -E "Active:|Main PID"'
  ]);
} else if (arg === 'step4') {
  runCommands([
    'cd /var/www/vspaypsp && node scripts/migrate_sqlite_to_mysql.js',
    'rm -f /var/www/vspaypsp/database.sqlite',
    'rm -f /var/www/vspaypsp/scripts/migrate_sqlite_to_mysql.js'
  ]);
} else if (arg === 'step5') {
  runCommands([
    'cd /var/www/vspaypsp && pm2 start ecosystem.config.js',
    'pm2 save',
    'pm2 startup systemd -u root --hp /root || true',
    'pm2 status'
  ]);
} else if (arg === 'step6') {
  runCommands([
    'apt-get install -y nginx',
    'bash -c "cat << \'EOF\' > /etc/nginx/sites-available/default\nserver {\n    listen 80 default_server;\n    listen [::]:80 default_server;\n\n    server_name _;\n\n    gzip on;\n    gzip_proxied any;\n    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;\n    gzip_vary on;\n    gzip_min_length 1000;\n\n    client_max_body_size 10M;\n\n    location / {\n        proxy_pass http://127.0.0.1:3000;\n        proxy_http_version 1.1;\n        proxy_set_header Upgrade \\$http_upgrade;\n        proxy_set_header Connection \'upgrade\';\n        proxy_set_header Host \\$host;\n        proxy_cache_bypass \\$http_upgrade;\n        proxy_set_header X-Real-IP \\$remote_addr;\n        proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto \\$scheme;\n    }\n}\nEOF"',
    'nginx -t',
    'systemctl restart nginx',
    'ufw allow ssh',
    'ufw allow \'Nginx Full\'',
    'ufw --force enable',
    'ufw status'
  ]);
} else {
  console.error('Please specify a valid step argument, e.g. node deploy_runner.js step1');
  process.exit(1);
}
