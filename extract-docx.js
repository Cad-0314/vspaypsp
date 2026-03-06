const fs = require('fs');
const xml = fs.readFileSync('easypay_extracted/word/document.xml', 'utf8');
const text = xml
    .replace(/<w:br[^/]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/ +/g, ' ')
    .trim();
fs.writeFileSync('easypay_text.txt', text);
console.log('Done, chars:', text.length);
