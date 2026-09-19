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
    ` touch-action: auto !important;` +
    ` -webkit-overflow-scrolling: touch !important;` +
    ` -webkit-user-select: none !important;` +
    ` -moz-user-select: none !important;` +
    ` -ms-user-select: none !important;` +
    ` user-select: none !important;` +
    `}` +
    `/* Empêcher React Native Web de tuer le défilement mobile */` +
    `div[style*="touch-action: none"] {` +
    ` touch-action: pan-y !important;` +
    `}` +
    `</style>`;

  // ────────────────────────────────────────────────────────────────────────────
  // Injection PWA et icônes haute résolution (Android & iOS)
  // ────────────────────────────────────────────────────────────────────────────
  const pwaMetaTags = `\n    <!-- PWA & Haute Résolution Android & iOS Icons -->\n` +
    `    <meta name="description" content="Vos cours et ressources académiques partout avec vous. Épreuves, annales corrigées et cours universitaires certifiés.">\n` +
    `    <link rel="manifest" href="/manifest.json">\n` +
    `    <link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png">\n` +
    `    <link rel="icon" type="image/png" sizes="512x512" href="/assets/icon-512.png">\n` +
    `    <link rel="icon" type="image/png" sizes="192x192" href="/assets/icon-192.png">\n` +
    `    <link rel="icon" type="image/png" sizes="64x64" href="/assets/favicon.png">\n` +
    `    <meta name="mobile-web-app-capable" content="yes">\n` +
    `    <meta name="apple-mobile-web-app-capable" content="yes">\n` +
    `    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n` +
    `    <meta name="apple-mobile-web-app-title" content="cauZon">\n` +
    `    <!-- Google Identity Services (GIS) Web -->\n` +
    `    <script src="https://accounts.google.com/gsi/client" async defer></script>\n`;

  // Nettoyer d'éventuelles injections précédentes
  html = html.replace(/<!-- PWA & Haute Résolution[\s\S]*?<script src="https:\/\/accounts\.google\.com\/gsi\/client" async defer><\/script>\n?/i, '');
  html = html.replace(/<!-- PWA & Haute Résolution[\s\S]*?<meta name="apple-mobile-web-app-title" content="cauZon">\n?/i, '');
  html = html.replace(/<script id="cauzon-security-shield">[\s\S]*?<\/script>/i, '');

  // Injection dans le <head>
  let headInjections = pwaMetaTags + scrollFixStyle;
  if (fontFaceStyle) {
    headInjections += fontFaceStyle;
    console.log('✅ Police Ionicons injectée en Base64 dans dist/index.html.');
  }

  html = html.replace('</head>', headInjections + '</head>');
  console.log('✅ Déblocage scroll Web (html, body, #root overflow-y: auto) injecté.');

  // 🛡️ Bouclier Sécurité cauZon : Anti-Inspection & Anti-Fuite Web
  const securityScript = `<script id="cauzon-security-shield">` +
    `(function(){` +
    `document.addEventListener('contextmenu',function(e){e.preventDefault();return false;});` +
    `document.addEventListener('keydown',function(e){` +
    `if(e.key==='F12'||e.keyCode===123){e.preventDefault();return false;}` +
    `var isCtrlOrMeta=e.ctrlKey||e.metaKey;` +
    `if((isCtrlOrMeta&&(e.key==='u'||e.key==='U'||e.key==='s'||e.key==='S'))||` +
    `(isCtrlOrMeta&&e.shiftKey&&(e.key==='i'||e.key==='I'||e.key==='j'||e.key==='J'))){` +
    `e.preventDefault();return false;}` +
    `});` +
    `})();` +
    `</script>`;

  html = html.replace('</body>', securityScript + '</body>');
  console.log('🛡️ [Sécurité] Bouclier Anti-Inspection et Anti-Fuite Web injecté.');

  fs.writeFileSync(htmlFile, html, 'utf8');
} else {
  console.warn('⚠️ dist/index.html introuvable — build expo manquant ?');
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Copie du manifest PWA et des icônes haute résolution dans dist/
// ────────────────────────────────────────────────────────────────────────────
const distAssetsDir = path.join(distDir, 'assets');
if (!fs.existsSync(distAssetsDir)) {
  fs.mkdirSync(distAssetsDir, { recursive: true });
}

// Copie du manifest.json
const sourceManifest = fs.existsSync(path.join(rootDir, 'web', 'manifest.json'))
  ? path.join(rootDir, 'web', 'manifest.json')
  : path.join(rootDir, 'manifest.json');

if (fs.existsSync(sourceManifest)) {
  fs.copyFileSync(sourceManifest, path.join(distDir, 'manifest.json'));
  console.log('✅ Manifest PWA copié dans dist/manifest.json.');
}

// Copie des icônes haute résolution dans dist/assets/ et dist/
const iconFiles = [
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'favicon.png',
  'icon.png',
];

const sourceAssetsDir = path.join(rootDir, 'assets');
iconFiles.forEach(iconName => {
  const src = path.join(sourceAssetsDir, iconName);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(distAssetsDir, iconName));
    fs.copyFileSync(src, path.join(distDir, iconName));
  }
});
console.log('✅ Icônes haute résolution PWA (192px, 512px, maskable) synchronisées dans dist/.');

// ────────────────────────────────────────────────────────────────────────────
// 2-bis. Copie des binaires WebAssembly (.wasm) pour EmbedPDF / PDFium
// ────────────────────────────────────────────────────────────────────────────
const wasmCandidates = [
  path.join(rootDir, 'node_modules/@embedpdf/pdfium/dist/pdfium.wasm'),
  path.join(rootDir, 'node_modules/@embedpdf/snippet/dist/pdfium.wasm'),
];

for (const wasmPath of wasmCandidates) {
  if (fs.existsSync(wasmPath)) {
    fs.copyFileSync(wasmPath, path.join(distDir, 'pdfium.wasm'));
    fs.copyFileSync(wasmPath, path.join(distAssetsDir, 'pdfium.wasm'));
    console.log(`✅ Binaire WebAssembly PDFium synchronisé depuis ${path.relative(rootDir, wasmPath)} (${Math.round(fs.statSync(wasmPath).size / 1024)} Ko)`);
    break;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Copie de vercel.json dans dist/
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
// 4. Nettoyage : suppression du script temporaire scan-icons.js si existant
// ────────────────────────────────────────────────────────────────────────────
const scanScript = path.join(__dirname, 'scan-icons.js');
if (fs.existsSync(scanScript)) {
  try { fs.unlinkSync(scanScript); } catch (_) {}
}

console.log('🎉 [CauZon Post-Export Web] Terminé avec succès (PWA + Icônes HD + Ionicons) !');