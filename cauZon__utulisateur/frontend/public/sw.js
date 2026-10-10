/**
 * ==============================================================================
 * 🚀 cauZon — Service Worker PWA (Cache App Shell & Relecture PDF Hors-Ligne)
 * Fichier : public/sw.js
 * ==============================================================================
 */

const CACHE_SHELL_NAME = 'cauzon-shell-v2';
const CACHE_DOCS_NAME = 'cauzon-pdf-documents-v1';

// Ressources critiques de l'App Shell à précharger à l'installation
const ASSETS_APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/icon.png',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js',
];

// ─── 1. Étape d'installation : Mise en cache robuste du Shell ─────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_SHELL_NAME).then(async (cache) => {
      console.log('📦 [SW] Pré-mise en cache du shell applicatif cauZon...');
      await Promise.allSettled(
        ASSETS_APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`⚠️ [SW] Asset optionnel non préchargé (${url}) :`, err?.message || err);
          })
        )
      );
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
    url.pathname.includes('/storage/v1/object/sign/') ||
    url.pathname.includes('/storage/v1/object/authenticated/') ||
    url.pathname.includes('documents_utilisateurs') ||
    url.pathname.includes('cours-documents') ||
    url.hostname.includes('r2.cloudflarestorage.com');

  if (isPdfRequest) {
    event.respondWith(
      (async () => {
        const docsCache = await caches.open(CACHE_DOCS_NAME);

        // Clé normalisée (sans les paramètres temporaires de signature d'URL pour matching hors-ligne)
        const cleanPathKey = new Request(url.origin + url.pathname, { method: 'GET' });
        const cachedResponse = (await docsCache.match(request)) || (await docsCache.match(cleanPathKey));

        if (cachedResponse) {
          console.log('⚡ [SW] PDF servi instantanément depuis le cache hors-ligne :', url.pathname);
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            // Mettre en cache pour relecture hors-ligne future
            try {
              await docsCache.put(cleanPathKey, networkResponse.clone());
              await docsCache.put(request, networkResponse.clone());
            } catch (errPut) {
              console.warn('⚠️ [SW] Erreur mise en cache PDF 200 :', errPut);
            }
          } else if (networkResponse && networkResponse.status === 206) {
            // Requête partielle : récupérer en tâche de fond le PDF complet (status 200) pour l'accès hors-ligne
            fetch(request.url, { headers: { Accept: 'application/pdf' } })
              .then(async (fullRes) => {
                if (fullRes && fullRes.status === 200) {
                  await docsCache.put(cleanPathKey, fullRes.clone());
                  await docsCache.put(request, fullRes.clone());
                }
              })
              .catch(() => {});
          }
          return networkResponse;
        } catch (error) {
          console.warn('⚠️ [SW] Réseau indisponible pour le PDF, tentative fallback cache direct...');
          const fallback = (await docsCache.match(request)) || (await docsCache.match(cleanPathKey));
          if (fallback) return fallback;
          throw error;
        }
      })()
    );
    return;
  }

  // 🌐 B. Stratégie pour la navigation (HTML SPA) : Fallback immédiat si réseau indisponible ou timeout 1.5s
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const shellCache = await caches.open(CACHE_SHELL_NAME);
        const matchCachedShell = async () => {
          return (
            (await shellCache.match('/index.html')) ||
            (await shellCache.match('/')) ||
            (await caches.match('/index.html')) ||
            (await caches.match('/'))
          );
        };

        // Course rapide : réseau vs timeout 1500ms
        try {
          const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 1500));
          const networkPromise = fetch(request).catch(() => null);

          const response = await Promise.race([networkPromise, timeoutPromise]);
          if (response && response.ok) {
            // Rafraîchir l'index du cache en arrière-plan
            shellCache.put('/index.html', response.clone()).catch(() => {});
            return response;
          }
        } catch (_) {}

        // Fallback immédiat vers l'App Shell mis en cache (mode avion / hors-ligne instantané)
        const cachedShell = await matchCachedShell();
        if (cachedShell) {
          console.log('⚡ [SW] App Shell servi instantanément hors-ligne (mode avion / réseau coupé)');
          return cachedShell;
        }

        // Dernier recours : retenter le réseau sans timeout
        try {
          return await fetch(request);
        } catch (err) {
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>cauZon Hors-ligne</title></head><body><h3>cauZon est prêt hors-ligne</h3><p>Veuillez recharger la page.</p></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
      })()
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
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.wasm') ||
    url.hostname.includes('cdnjs.cloudflare.com');

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

  // Comportement par défaut : passage direct au réseau avec fallback cache
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

