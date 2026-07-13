const { Client } = require('ssh2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const conn = new Client();
const SERVER = {
    host: process.env.DEPLOY_HOST,
    port: 22,
    username: process.env.DEPLOY_USER,
    password: process.env.DEPLOY_PASSWORD
};

conn.on('ready', () => {
    console.log('Connected to server. Enabling remote MySQL access...');
    
    const cmds = `
        sed -i "s/^bind-address.*/bind-address = 0.0.0.0/" /etc/mysql/mysql.conf.d/mysqld.cnf
        sed -i "s/^mysqlx-bind-address.*/mysqlx-bind-address = 0.0.0.0/" /etc/mysql/mysql.conf.d/mysqld.cnf || true
        systemctl restart mysql
        ufw allow 3306/tcp
        DB_PASS=$(cat /root/.gaurpay_db_pass)
        mysql -u root -e "CREATE USER IF NOT EXISTS 'gaurpay'@'%' IDENTIFIED BY '$DB_PASS';"
        mysql -u root -e "ALTER USER 'gaurpay'@'%' IDENTIFIED WITH mysql_native_password BY '$DB_PASS';"
        mysql -u root -e "GRANT ALL PRIVILEGES ON gaurpay.* TO 'gaurpay'@'%';"
        mysql -u root -e "FLUSH PRIVILEGES;"
        cd /www/wwwroot/gaurpay.site
        node seed-admin.js
        echo "DB_PASSWORD_IS:$DB_PASS"
    `;

    conn.exec(cmds, (err, stream) => {
        if (err) throw err;
        let output = '';
        stream.on('data', d => {
            const str = d.toString();
            output += str;
            process.stdout.write(str);
        });
        stream.stderr.on('data', d => process.stderr.write(d.toString()));
        stream.on('close', (code) => {
            console.log('\\nSetup finished with code ' + code);
            const match = output.match(/DB_PASSWORD_IS:(.+)/);
            if (match && match[1]) {
                const fs = require('fs');
                const envPath = path.join(__dirname, '..', '.env');
                let envContent = fs.readFileSync(envPath, 'utf8');
                
                envContent = envContent.replace(/^DB_DIALECT=.*/m, 'DB_DIALECT=mysql');
                envContent = envContent.replace(/^#?\s*DB_HOST=.*/m, 'DB_HOST=' + SERVER.host);
                envContent = envContent.replace(/^#?\s*DB_USER=.*/m, 'DB_USER=gaurpay');
                envContent = envContent.replace(/^#?\s*DB_PASSWORD=.*/m, 'DB_PASSWORD=' + match[1].trim());
                envContent = envContent.replace(/^#?\s*DB_NAME=.*/m, 'DB_NAME=gaurpay');
                
                fs.writeFileSync(envPath, envContent);
                console.log('Local .env updated to use remote scalable MySQL database!');
            }
            conn.end();
        });
    });
}).connect(SERVER);
