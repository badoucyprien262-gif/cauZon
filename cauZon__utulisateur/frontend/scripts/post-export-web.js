// ==============================================================================
// 🛠️ CauZon — Post-Export Script pour le Web
// Fichier : scripts/post-export-web.js
//
// 1. Injecte la police Ionicons encodée en Base64 dans dist/index.html
//    → Garantit le rendu des icônes sans requête réseau, CORS ou 404
// 2. Copie vercel.json dans dist/ pour le routage SPA
// ==============================================================================

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const htmlFile = path.join(distDir, 'index.html');

console.log('🚀 [CauZon Post-Export Web] Début du post-traitement...');

// ────────────────────────────────────────────────────────────────────────────
// 1. Injection de la police Ionicons en Base64 dans dist/index.html
// ────────────────────────────────────────────────────────────────────────────
if (fs.existsSync(htmlFile)) {
  let html = fs.readFileSync(htmlFile, 'utf8');

  // Localisation dynamique du fichier Ionicons.ttf (le nom contient un hash)
  const fontsDir = path.join(
    rootDir,
    'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts'
  );

  let fontFaceStyle = '';

  if (fs.existsSync(fontsDir)) {
    const ioniconsFile = fs
      .readdirSync(fontsDir)
      .find(f => f.startsWith('Ionicons') && f.endsWith('.ttf'));

    if (ioniconsFile) {
      const ttfPath = path.join(fontsDir, ioniconsFile);
      const base64Font = fs.readFileSync(ttfPath).toString('base64');

      fontFaceStyle = `<style id="cauzon-vector-icons-web-fonts">` +
        `@font-face{` +
        `font-family:'Ionicons';` +
        `src:url('data:font/truetype;charset=utf-8;base64,${base64Font}')format('truetype');` +
        `font-display:block;` +
        `}` +
        `</style>`;

      console.log(`✅ Police Ionicons trouvée : ${ioniconsFile} (${Math.round(base64Font.length / 1024)} Ko Base64)`);
    } else {
      console.warn('⚠️ Aucun fichier Ionicons*.ttf trouvé dans', fontsDir);
    }
  } else {
    console.warn('⚠️ Dossier Fonts introuvable :', fontsDir);
  }

  // Suppression d'un éventuel bloc résiduel existant avant ré-injection
  html = html.replace(/<style id="cauzon-vector-icons-web-fonts">[\s\S]*?<\/style>/i, '');
  html = html.replace(/<style id="cauzon-scroll-fix">[\s\S]*?<\/style>/i, '');

  // 🚀 Déblocage du scroll sur le Web : Remplacer "overflow: hidden" de expo-reset
  // et autoriser explicitement le défilement vertical tactile sur iOS Safari, Chrome Android & Desktop
  html = html.replace(
    /body\s*\{\s*overflow:\s*hidden;\s*\}/i,
    'body { overflow-y: auto !important; -webkit-overflow-scrolling: touch !important; }'
  );

  const scrollFixStyle = `<style id="cauzon-scroll-fix">` +
    `html, body, #root {` +
    ` height: 100% !important;` +
    ` overflow-y: auto !important;` +
    ` -webkit-overflow-scrolling: touch !important;` +
    `}` +
    `</style>`;

  // Injection dans le <head>
  let headInjections = scrollFixStyle;
  if (fontFaceStyle) {
    headInjections += fontFaceStyle;
    console.log('✅ Police Ionicons injectée en Base64 dans dist/index.html.');
  }

  html = html.replace('</head>', headInjections + '</head>');
  console.log('✅ Déblocage scroll Web (html, body, #root overflow-y: auto) injecté.');

  fs.writeFileSync(htmlFile, html, 'utf8');
} else {
  console.warn('⚠️ dist/index.html introuvable — build expo manquant ?');
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Copie de vercel.json dans dist/
// ────────────────────────────────────────────────────────────────────────────
const rootVercelJson = path.join(rootDir, 'vercel.json');
const distVercelJson = path.join(distDir, 'vercel.json');
const defaultVercelConfig = {
  rewrites: [
    { source: '/(.*)', destination: '/index.html' }
  ]
};

try {
  if (fs.existsSync(rootVercelJson)) {
    fs.copyFileSync(rootVercelJson, distVercelJson);
  } else {
    fs.writeFileSync(distVercelJson, JSON.stringify(defaultVercelConfig, null, 2), 'utf8');
  }
  console.log('✅ Configuration dist/vercel.json validée.');
} catch (e) {
  console.warn('⚠️ Erreur copie vercel.json :', e.message);
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Nettoyage : suppression du script temporaire scan-icons.js si existant
// ────────────────────────────────────────────────────────────────────────────
const scanScript = path.join(__dirname, 'scan-icons.js');
if (fs.existsSync(scanScript)) {
  try { fs.unlinkSync(scanScript); } catch (_) {}
}

console.log('🎉 [CauZon Post-Export Web] Terminé avec succès (Ionicons Base64 injectée) !');