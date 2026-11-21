const fs = require('fs');
const path = require('path');
const base = path.resolve(__dirname, '../administrateur_cauZon/src/');
const plan = {
  'components/ModalAjoutDocument.tsx': [["useState('100')", "useState('200')"], ["setPrix('100')", "setPrix('200')"]],
  'services/serviceDocuments.ts': [['parseInt(wizardData.prix) || 100', 'parseInt(wizardData.prix) || 200']],
  'services/serviceSettings.ts': [['montant > 0 ? montant : 100', 'montant > 0 ? montant : 200']],
  'views/CatalogView.tsx': [["prix: '100',", "prix: '200',"], ['doc.prix ?? 100', 'doc.prix ?? 200']],
  'views/SettingsView.tsx': [['defaultPrice: 100,', 'defaultPrice: 200,'], ['storageExtensionPrice: 500,', 'storageExtensionPrice: 1500,']],
  'views/DashboardView.tsx': [
    ["'500 FCFA / location'", "'1 000 FCFA / abonnement (10 docs)'"],
    ["'1000 FCFA / +75 docs'", "'1 500 FCFA / +21 docs'"],
    ["'100 FCFA / document'", "'200 FCFA / document'"],
  ],
};
for (const [f, reps] of Object.entries(plan)) {
  const p = path.join(base, f);
  let s = fs.readFileSync(p, 'utf8');
  for (const [a, b] of reps) {
    if (!s.includes(a)) { console.log('ABSENT', f, a); continue; }
    s = s.split(a).join(b);
  }
  fs.writeFileSync(p, s);
}
console.log('done');
