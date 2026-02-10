const fs = require('fs');
const path = require('path');

const replacements = [
    { search: /Payable/g, replace: 'GaurPay' },
    { search: /payable/g, replace: 'gaurpay' },
    { search: /PAYABLE/g, replace: 'GAURPAY' }
];

const ignoredDirs = ['node_modules', '.git', '.agent', '.gemini', 'logs', 'payout-data'];
const ignoredFiles = ['package-lock.json', 'rebrand_app.js'];

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            if (!ignoredDirs.includes(file)) {
                walkDir(filePath);
            }
        } else {
            if (!ignoredFiles.includes(file) && !filePath.includes('node_modules')) {
                processFile(filePath);
            }
        }
    }
}

function processFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let originalContent = content;
        let modified = false;

        for (const rule of replacements) {
            if (rule.search.test(content)) {
                content = content.replace(rule.search, rule.replace);
                modified = true;
            }
        }

        if (modified) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Updated: ${filePath}`);
        }
    } catch (err) {
        // Ignore binary files or read errors
        if (err.code !== 'ENOENT') {
            // console.error(`Error processing ${filePath}: ${err.message}`);
        }
    }
}

const rootDir = path.resolve(__dirname, '..');
console.log(`Starting rebranding in: ${rootDir}`);
walkDir(rootDir);
console.log('Rebranding complete.');
