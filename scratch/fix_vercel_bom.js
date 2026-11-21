const fs = require('fs');
const path = require('path');

const target = path.resolve(__dirname, '../administrateur_cauZon/vercel.json');
let content = fs.readFileSync(target, 'utf8');

// Strip any BOM (\uFEFF)
content = content.replace(/^\uFEFF/, '');

// Ensure it parses cleanly
JSON.parse(content);

// Write as raw buffer without BOM
const buf = Buffer.from(content, 'utf8');
fs.writeFileSync(target, buf);

console.log('Fixed:', target);
console.log('Bytes:', buf.subarray(0, 8).toString('hex'));
