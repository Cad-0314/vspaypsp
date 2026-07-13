const fs = require('fs');
const content = fs.readFileSync('views/admin.ejs', 'utf8');
const lines = content.split('\n');
let depth = 0;
for(let i=840; i<=1910; i++) {
    const l = lines[i];
    const open = (l.match(/<div[^>]*>/g) || []).length;
    const close = (l.match(/<\/div>/g) || []).length;
    depth += open - close;
    if (l.includes('id="tab-')) console.log('Tab started at line', i+1, 'Depth:', depth);
    if (depth < 0) console.log('Negative depth at line', i+1);
}
