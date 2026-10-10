/**
 * ==============================================================================
 * 🚀 cauZon — Service Worker PWA (Cache App Shell & Relecture PDF Hors-Ligne)
 * Fichier : web/sw.js
 * ==============================================================================
 */

const CACHE_SHELL_NAME = 'cauzon-shell-v1';
const CACHE_DOCS_NAME = 'cauzon-pdf-documents-v1';

// Ressources critiques de l'App Shell à précharger à l'installation
const ASSETS_APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/apple-touch-icon.png',
];

// ─── 1. Étape d'installation : Mise en cache du Shell ─────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_SHELL_NAME).then(async (cache) => {
      console.log('📦 [SW] Pré-mise en cache du shell applicatif cauZon...');
      try {
        await cache.addAll(ASSETS_APP_SHELL);
      } catch (err) {
        console.warn('⚠️ [SW] Certains assets du shell n\'ont pas pu être préchargés :', err);
      }
    })
  );
  self.skipWaiting();
});

// ─── 2. Étape d'activation : Nettoyage des anciens caches ─────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_SHELL_NAME && key !== CACHE_DOCS_NAME) {
            console.log('🧹 [SW] Suppression de l\'ancien cache obsolète :', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// ─── 3. Stratégie de capture réseau & Cache PDF Hors-Ligne ────────────────────
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Ignorer les requêtes non-GET (POST webhooks, RPCs, uploads)
  if (request.method !== 'GET') {
    return;
  }

  // Ne pas intercepter les requêtes internes Chrome-extension
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // 📄 A. Stratégie dédiée aux documents PDF (Cloudflare R2 & Supabase Storage)
  // Permet la relecture hors-ligne des cours et épreuves déjà consultés
  const isPdfRequest =
    url.pathname.endsWith('.pdf') ||
    url.searchParams.has('response-content-type') ||
    request.headers.get('accept')?.includes('application/pdf') ||
    url.pathname.includes('/storage/v1/object/public/') ||
    url.hostname.includes('r2.cloudflarestorage.com');

  if (isPdfRequest) {
    event.respondWith(
      (async () => {
        const docsCache = await caches.open(CACHE_DOCS_NAME);

        // Clé normalisée (sans les paramètres temporaires de signature d'URL pour matching hors-ligne)
        const cacheKey = new Request(url.origin + url.pathname, { method: 'GET' });
        const cachedResponse = await docsCache.match(cacheKey);

        if (cachedResponse) {
          console.log('⚡ [SW] PDF servi instantanément depuis le cache hors-ligne :', url.pathname);
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(request);
          if (networkResponse && (networkResponse.status === 200 || networkResponse.status === 206)) {
            // Mettre en cache pour relecture hors-ligne future
            docsCache.put(cacheKey, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          console.warn('⚠️ [SW] Réseau indisponible pour le PDF, tentative fallback cache direct...');
          const fallback = await docsCache.match(request);
          if (fallback) return fallback;
          throw error;
        }
      })()
    );
    return;
  }

  // 🌐 B. Stratégie pour la navigation (HTML SPA) : Network-First avec fallback index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_SHELL_NAME);
        const cachedIndex = await cache.match('/index.html');
        return cachedIndex || Response.error();
      })
    );
    return;
  }

  // 🎨 C. Stratégie pour les assets statiques (JS, CSS, Polices, Images) : Stale-While-Revalidate
  const isStaticAsset =
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.ttf') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_SHELL_NAME).then((cache) => {
                cache.put(request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // Comportement par défaut : passage direct au réseau
});
