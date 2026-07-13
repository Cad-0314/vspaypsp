const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
    const cmds = `
        cd /www/wwwroot/gaurpay.site
        sed -i 's/NODE_ENV=development/NODE_ENV=production/g' .env
        sed -i 's/DB_DIALECT=sqlite/DB_DIALECT=mysql/g' .env
        
        # Remove any existing DB configuration to avoid duplicates
        sed -i '/^DB_HOST=/d' .env
        sed -i '/^DB_USER=/d' .env
        sed -i '/^DB_PASSWORD=/d' .env
        sed -i '/^DB_NAME=/d' .env
        
        echo 'DB_HOST=127.0.0.1' >> .env
        echo 'DB_USER=gaurpay' >> .env
        echo 'DB_PASSWORD=Gp_Db_70baec85e4fc5ebe' >> .env
        echo 'DB_NAME=gaurpay' >> .env
        
        pm2 reload gaurpay-api --update-env
    `;
    conn.exec(cmds, (err, stream) => {
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.stderr.on('data', d => process.stderr.write(d.toString()));
        stream.on('close', () => conn.end());
    });
}).connect({ host: '139.180.135.210', port: 22, username: 'root', password: 'o9)A_5G%Xtf,QyAe' });
