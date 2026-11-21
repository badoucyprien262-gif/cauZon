const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = [
  path.join(root, 'administrateur_cauZon/vercel.json'),
  path.join(root, 'cauZon__utulisateur/frontend/vercel.json'),
  path.join(root, 'Dossier du site internet/vercel.json')
];

let allOk = true;

for (const f of files) {
  if (!fs.existsSync(f)) {
    console.log('[SKIP]', f, 'does not exist');
    continue;
  }
  const buf = fs.readFileSync(f);
  const hasBom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const str = buf.toString('utf8');
  try {
    JSON.parse(str);
    if (hasBom) {
      console.error('[FAIL - HAS BOM]', f);
      allOk = false;
    } else {
      console.log('[OK]', f, '(BOM: false, JSON: valid, len:', buf.length, ')');
    }
  } catch (err) {
    console.error('[FAIL - INVALID JSON]', f, err.message);
    allOk = false;
  }
}

if (!allOk) {
  process.exit(1);
} else {
  console.log('✅ ALL vercel.json files are 100% valid JSON without BOM.');
}
