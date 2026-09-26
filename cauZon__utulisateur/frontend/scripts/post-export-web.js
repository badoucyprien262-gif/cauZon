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
    ` overscroll-behavior-y: none !important;` +
    `}` +
    `/* Empêcher React Native Web de tuer le défilement mobile */` +
    `div[style*="touch-action: none"] {` +
    ` touch-action: pan-y !important;` +
    `}` +
    `/* Défilement vertical strict & respect du ratio A4 sans compression */` +
    `.cauzon-pdf-scroll-container {` +
    ` display: block !important;` +
    ` width: 100% !important;` +
    ` height: 100% !important;` +
    ` overflow-y: scroll !important;` +
    ` overflow-x: auto !important;` +
    ` -webkit-overflow-scrolling: touch !important;` +
    ` touch-action: pan-x pan-y pinch-zoom !important;` +
    ` padding-bottom: 120px !important;` +
    ` overscroll-behavior-y: contain !important;` +
    ` box-sizing: border-box !important;` +
    `}` +
    `.cauzon-page-wrapper {` +
    ` display: block !important;` +
    ` width: 100% !important;` +
    ` max-width: 800px !important;` +
    ` margin: 0 auto 16px auto !important;` +
    ` flex-shrink: 0 !important;` +
    ` box-sizing: border-box !important;` +
    ` position: relative !important;` +
    `}` +
    `.cauzon-page-wrapper canvas {` +
    ` display: block !important;` +
    ` width: 100% !important;` +
    ` height: auto !important;` +
    ` flex-shrink: 0 !important;` +
    `}` +
    `</style>`;

  // ────────────────────────────────────────────────────────────────────────────
  // Injection Pack Référencement & SEO Google, Open Graph, Schema.org et PWA
  // ────────────────────────────────────────────────────────────────────────────
  // Assurer la langue française sur la balise html
  html = html.replace(/<html(\s[^>]*)?>/i, '<html lang="fr">');

  // Nettoyer les balises SEO / Meta existantes pour éviter les doublons lors de l'export
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '');
  html = html.replace(/<meta\s+name=["']description["'][^>]*>/gi, '');
  html = html.replace(/<meta\s+name=["']keywords["'][^>]*>/gi, '');
  html = html.replace(/<meta\s+name=["']viewport["'][^>]*>/gi, '');
  html = html.replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '');
  html = html.replace(/<meta\s+property=["']og:[^"']*["'][^>]*>/gi, '');
  html = html.replace(/<meta\s+name=["']twitter:[^"']*["'][^>]*>/gi, '');
  html = html.replace(/<script\s+type=["']application\/ld\+json["']>[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<!-- PWA & Haute Résolution[\s\S]*?<script src="https:\/\/accounts\.google\.com\/gsi\/client" async defer><\/script>\n?/i, '');
  html = html.replace(/<!-- PWA & Haute Résolution[\s\S]*?<meta name="apple-mobile-web-app-title" content="cauZon">\n?/i, '');
  html = html.replace(/<!-- 🔍 Métadonnées SEO Essentielles[\s\S]*?<script src="https:\/\/accounts\.google\.com\/gsi\/client" async defer><\/script>\n?/i, '');
  html = html.replace(/<script id="cauzon-security-shield">[\s\S]*?<\/script>/i, '');

  const fullSeoAndPwaBlock = `\n    <!-- 🔍 Métadonnées SEO Essentielles Google -->\n` +
    `    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover">\n` +
    `    <title>cauZon — Cours, TD & Sujets d'Examens Certifiés en Côte d'Ivoire</title>\n` +
    `    <meta name="description" content="Révisez et réussissez vos examens avec cauZon. Plateforme éducative leader en Côte d'Ivoire : accédez à des cours, fiches, TD et annales certifiés par vos enseignants.">\n` +
    `    <meta name="keywords" content="cauZon, cours Côte d'Ivoire, sujets BAC CI, BEPC CI, révisions université Abidjan, examens Côte d'Ivoire, annales, devoirs, fiches de révision">\n` +
    `    <link rel="canonical" href="https://cauzon.app">\n` +
    `    <meta name="theme-color" content="#6B1124">\n` +
    `\n    <!-- 🌐 Balises Open Graph (WhatsApp, Facebook, LinkedIn) -->\n` +
    `    <meta property="og:type" content="website">\n` +
    `    <meta property="og:site_name" content="cauZon">\n` +
    `    <meta property="og:url" content="https://cauzon.app">\n` +
    `    <meta property="og:title" content="cauZon — L'excellence académique à portée de main">\n` +
    `    <meta property="og:description" content="Accédez à la bibliothèque de cours, TD et sujets corrigés certifiés en Côte d'Ivoire. Disponible sur Web et Mobile.">\n` +
    `    <meta property="og:image" content="https://cauzon.app/assets/og-preview.png">\n` +
    `    <meta property="og:image:secure_url" content="https://cauzon.app/assets/og-preview.png">\n` +
    `    <meta property="og:image:type" content="image/png">\n` +
    `    <meta property="og:image:width" content="1200">\n` +
    `    <meta property="og:image:height" content="630">\n` +
    `    <meta property="og:image:alt" content="Logo et aperçu de la plateforme cauZon">\n` +
    `\n    <!-- 🐦 Twitter Card -->\n` +
    `    <meta name="twitter:card" content="summary_large_image">\n` +
    `    <meta name="twitter:title" content="cauZon — L'excellence académique à portée de main">\n` +
    `    <meta name="twitter:description" content="Accédez à la bibliothèque de cours, TD et sujets corrigés certifiés en Côte d'Ivoire. Disponible sur Web et Mobile.">\n` +
    `    <meta name="twitter:image" content="https://cauzon.app/assets/og-preview.png">\n` +
    `\n    <!-- 📱 PWA & Haute Résolution Android & iOS Icons -->\n` +
    `    <link rel="manifest" href="/manifest.json">\n` +
    `    <link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png">\n` +
    `    <link rel="icon" type="image/png" sizes="512x512" href="/assets/icon-512.png">\n` +
    `    <link rel="icon" type="image/png" sizes="192x192" href="/assets/icon-192.png">\n` +
    `    <link rel="icon" type="image/png" sizes="64x64" href="/assets/favicon.png">\n` +
    `    <link rel="icon" href="/favicon.png">\n` +
    `    <meta name="mobile-web-app-capable" content="yes">\n` +
    `    <meta name="apple-mobile-web-app-capable" content="yes">\n` +
    `    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n` +
    `    <meta name="apple-mobile-web-app-title" content="cauZon">\n` +
    `\n    <!-- 📊 Données Structurées Google Schema.org (JSON-LD) -->\n` +
    `    <script type="application/ld+json">\n` +
    `    {\n` +
    `      "@context": "https://schema.org",\n` +
    `      "@graph": [\n` +
    `        {\n` +
    `          "@type": "WebApplication",\n` +
    `          "@id": "https://cauzon.app/#app",\n` +
    `          "name": "cauZon",\n` +
    `          "url": "https://cauzon.app",\n` +
    `          "applicationCategory": "EducationalApplication",\n` +
    `          "operatingSystem": "All",\n` +
    `          "inLanguage": "fr",\n` +
    `          "description": "Plateforme éducative pour la consultation et le partage sécurisé de documents académiques et cours en Côte d'Ivoire.",\n` +
    `          "offers": {\n` +
    `            "@type": "Offer",\n` +
    `            "price": "100",\n` +
    `            "priceCurrency": "XOF"\n` +
    `          }\n` +
    `        },\n` +
    `        {\n` +
    `          "@type": "EducationalOrganization",\n` +
    `          "@id": "https://cauzon.app/#organization",\n` +
    `          "name": "cauZon",\n` +
    `          "url": "https://cauzon.app",\n` +
    `          "areaServed": {\n` +
    `            "@type": "Country",\n` +
    `            "name": "Côte d'Ivoire"\n` +
    `          }\n` +
    `        }\n` +
    `      ]\n` +
    `    }\n` +
    `    </script>\n` +
    `\n    <!-- Google Identity Services (GIS) Web -->\n` +
    `    <script src="https://accounts.google.com/gsi/client" async defer></script>\n` +
    `\n    <!-- Moteur de Rendu Vectoriel PDF.js pour Consultation Web Directe -->\n` +
    `    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"></script>\n` +
    `    <!-- Bibliothèque PDF-lib pour Sécurisation Paywall Desktop (hors bundle Metro) -->\n` +
    `    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.9/pdf-lib.min.js"></script>\n`;

  // Injection dans le <head>
  let headInjections = fullSeoAndPwaBlock + scrollFixStyle;
  if (fontFaceStyle) {
    headInjections += fontFaceStyle;
    console.log('✅ Police Ionicons injectée en Base64 dans dist/index.html.');
  }

  html = html.replace('</head>', headInjections + '</head>');
  console.log('✅ Pack Référencement & SEO Google, Open Graph et Schema.org injecté dans dist/index.html.');

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

// Copie des icônes haute résolution et assets SEO Open Graph dans dist/assets/ et dist/
const iconFiles = [
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'favicon.png',
  'icon.png',
  'og-preview.png',
  'logo-cauzon.png',
];

const sourceAssetsDir = path.join(rootDir, 'assets');
iconFiles.forEach(iconName => {
  const src = path.join(sourceAssetsDir, iconName);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(distAssetsDir, iconName));
    fs.copyFileSync(src, path.join(distDir, iconName));
  }
});
console.log('✅ Icônes haute résolution et aperçu Open Graph synchronisés dans dist/.');

// ────────────────────────────────────────────────────────────────────────────
// 2-bis. Copie des fichiers SEO Google (robots.txt et sitemap.xml)
// ────────────────────────────────────────────────────────────────────────────
const publicDir = path.join(rootDir, 'public');
[
  'robots.txt',
  'sitemap.xml',
  'google0a16ebf370de0768.html',
  'politique-de-confidentialite.html',
  'confidentialite.html'
].forEach(fileName => {
  const src = path.join(publicDir, fileName);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(distDir, fileName));
    console.log(`✅ Fichier ${fileName} copié dans dist/${fileName}.`);
  } else {
    console.warn(`⚠️ Fichier ${fileName} introuvable dans public/.`);
  }
});

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

// Copie locale de pdf-lib.min.js pour découpage autonome hors-ligne
const pdfLibSource = path.join(rootDir, 'node_modules/pdf-lib/dist/pdf-lib.min.js');
const pdfLibPublic = path.join(rootDir, 'public/pdf-lib.min.js');
if (fs.existsSync(pdfLibSource)) {
  fs.copyFileSync(pdfLibSource, path.join(distDir, 'pdf-lib.min.js'));
  console.log('✅ Binaire pdf-lib.min.js copié dans dist/pdf-lib.min.js');
} else if (fs.existsSync(pdfLibPublic)) {
  fs.copyFileSync(pdfLibPublic, path.join(distDir, 'pdf-lib.min.js'));
  console.log('✅ Binaire public/pdf-lib.min.js copié dans dist/pdf-lib.min.js');
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