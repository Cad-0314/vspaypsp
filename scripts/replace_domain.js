const fs = require('fs');
const path = require('path');

const search = 'gaurpay.firestars.co';
const replace = 'gaurpay.site';
const rootDir = path.resolve(__dirname, '..');

const filesToUpdate = [
    'test-payin-channels.js',
    'test-init.js',
    'src/services/telegramBot.js',
    'scripts/hdpay-payout-batch.js',
    'src/services/customChannel.js',
    'src/routes/paypage.js',
    'src/routes/merchant_api.js',
    'src/routes/admin.js',
    'src/routes/api/payout.js',
    'src/routes/api/payin.js',
    'src/routes/api/v2/transfer.js',
    'src/routes/api/v2/collection.js',
    'ourapi.txt',
    'oldapidocs.html'
];

filesToUpdate.forEach(file => {
    const filePath = path.join(rootDir, file);
    if (fs.existsSync(filePath)) {
        try {
            let content = fs.readFileSync(filePath, 'utf8');
            if (content.includes(search)) {
                content = content.replaceAll(search, replace);
                fs.writeFileSync(filePath, content, 'utf8');
                console.log(`Updated: ${file}`);
            } else {
                console.log(`Skipped (not found): ${file}`);
            }
        } catch (err) {
            console.error(`Error updating ${file}:`, err.message);
        }
    } else {
        console.warn(`File not found: ${file}`);
    }
});
