const { Client } = require('ssh2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const conn = new Client();
conn.on('ready', () => {
    const cmd = 'cd /www/wwwroot/gaurpay.site && node -e "const{User}=require(String.fromCharCode(46)+String.fromCharCode(47)+String.fromCharCode(115)+String.fromCharCode(114)+String.fromCharCode(99)+String.fromCharCode(47)+String.fromCharCode(109)+String.fromCharCode(111)+String.fromCharCode(100)+String.fromCharCode(101)+String.fromCharCode(108)+String.fromCharCode(115));(async()=>{const a=await User.findOne({where:{role:String.fromCharCode(97,100,109,105,110)}});if(a){console.log(String.fromCharCode(73,68,58),a.id);console.log(String.fromCharCode(85,115,101,114,58),a.username);console.log(String.fromCharCode(50,70,65,95,69,110,97,98,108,101,100,58),a.two_fa_enabled);console.log(String.fromCharCode(50,70,65,95,83,101,99,114,101,116,58),a.two_fa_secret?String.fromCharCode(83,69,84):String.fromCharCode(78,85,76,76))}process.exit(0)})();"';
    conn.exec(cmd, (err, stream) => {
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.stderr.on('data', d => {});
        stream.on('close', () => conn.end());
    });
}).connect({
    host: process.env.DEPLOY_HOST,
    port: 22,
    username: process.env.DEPLOY_USER,
    password: process.env.DEPLOY_PASSWORD
});
