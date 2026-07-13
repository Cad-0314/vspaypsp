const { Client } = require('ssh2'); 
const path = require('path'); 
require('dotenv').config({ path: path.join(__dirname, '.env') }); 
const conn = new Client(); 
conn.on('ready', () => { 
    const script = `
const fs = require('fs');
const path = require('path');
function search(dir) {
    fs.readdirSync(dir).forEach(file => {
        const p = path.join(dir, file);
        if (fs.statSync(p).isDirectory()) {
            if (file !== 'node_modules') search(p);
        } else if (p.endsWith('.js')) {
            const content = fs.readFileSync(p, 'utf8');
            if (content.includes('non-existent')) {
                console.log('FOUND IN:', p);
            }
        }
    });
}
search('/www/wwwroot/gaurpay.site/src');
`;
    conn.exec(`node -e "${script.replace(/\n/g, ' ')}"`, (err, stream) => { 
        stream.on('data', d => process.stdout.write(d.toString())); 
        stream.stderr.on('data', d => process.stderr.write(d.toString())); 
        stream.on('close', () => conn.end()); 
    }); 
}).connect({
    host: process.env.DEPLOY_HOST, 
    username: process.env.DEPLOY_USER, 
    password: process.env.DEPLOY_PASSWORD
});
