/**
 * ==============================================================================
 * 🚀 cauZon — Gestionnaire de Stockage Persistant des PDFs (Offline-First)
 * Fichier : src/services/gestionnaireCachePdf.ts
 * ==============================================================================
 * 
 * 1. Persistance binaire locale intégrale (IndexedDB + Cache Storage API).
 * 2. Clé immuable et normalisée par identifiant de document : `pdf_blob_${docId}`.
 * 3. En mode en ligne : téléchargement et mise en cache silencieuse des octets.
 * 4. En mode hors-ligne : restitution instantanée via URL Blob locale (0 requête réseau).
 */

import { Platform } from 'react-native';

const DB_NAME = 'cauzon_pdf_storage_db';
const DB_VERSION = 1;
const STORE_NAME = 'pdf_blobs';
const SW_CACHE_NAME = 'cauzon-pdf-documents-v1';

// Cache mémoire des ObjectURLs créées durant la session courante pour réutilisation instantanée
const objectUrlsMemoire = new Map<string, string>();

/**
 * Initialise ou ouvre la base IndexedDB dédiée au stockage des binaires PDF
 */
function ouvrirBaseIndexedDB(): Promise<IDBDatabase | null> {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: any) => {
        const db = event.target?.result as IDBDatabase;
        if (db && !db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = (err) => {
        console.warn('⚠️ [CachePdf] Échec ouverture IndexedDB :', err);
        resolve(null);
      };
    } catch (e) {
      console.warn('⚠️ [CachePdf] Exception ouverture IndexedDB :', e);
      resolve(null);
    }
  });
}

/**
 * Normalise la clé de stockage du PDF pour garantir son unicité et son immuabilité
 */
export function normaliserClePdf(docId: string): string {
  if (!docId) return 'pdf_blob_inconnu';
  const cleanId = String(docId).replace(/^pdf_blob_/, '').trim();
  return `pdf_blob_${cleanId}`;
}

/**
 * Enregistre un document PDF (Blob ou ArrayBuffer) dans le stockage local persistant IndexedDB
 */
export async function enregistrerPdfLocal(
  docId: string,
  data: Blob | ArrayBuffer | Uint8Array,
  titre?: string
): Promise<boolean> {
  if (Platform.OS !== 'web' || !docId) return false;

  try {
    const db = await ouvrirBaseIndexedDB();
    if (!db) return false;

    const cle = normaliserClePdf(docId);
    let blobAEnregistrer: Blob;

    if (data instanceof Blob) {
      blobAEnregistrer = data;
    } else {
      blobAEnregistrer = new Blob([data as any], { type: 'application/pdf' });
    }

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const item = {
        key: cle,
        docId: docId,
        blob: blobAEnregistrer,
        size: blobAEnregistrer.size,
        titre: titre || '',
        updatedAt: Date.now(),
      };

      const putReq = store.put(item);

      putReq.onsuccess = () => {
        console.log(`💾 [CachePdf] PDF persisté dans IndexedDB (${cle}, ${(blobAEnregistrer.size / (1024 * 1024)).toFixed(2)} Mo)`);
        // Libérer ou remplacer l'ancienne URL mémoire si existante
        const ancienneUrl = objectUrlsMemoire.get(cle);
        if (ancienneUrl && ancienneUrl.startsWith('blob:')) {
          URL.revokeObjectURL(ancienneUrl);
        }
        const nouvelleUrl = URL.createObjectURL(blobAEnregistrer);
        objectUrlsMemoire.set(cle, nouvelleUrl);
        resolve(true);
      };

      putReq.onerror = (err) => {
        console.warn(`⚠️ [CachePdf] Erreur enregistrement ${cle} dans IndexedDB :`, err);
        resolve(false);
      };
    });
  } catch (error) {
    console.warn('⚠️ [CachePdf] Exception enregistrerPdfLocal :', error);
    return false;
  }
}

/**
 * Récupère le Blob PDF depuis IndexedDB
 */
export async function recupererPdfLocal(docId: string): Promise<Blob | null> {
  if (Platform.OS !== 'web' || !docId) return null;

  try {
    const db = await ouvrirBaseIndexedDB();
    if (!db) return null;

    const cle = normaliserClePdf(docId);

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(cle);

      getReq.onsuccess = () => {
        const resultat = getReq.result;
        if (resultat && resultat.blob) {
          resolve(resultat.blob as Blob);
        } else {
          resolve(null);
        }
      };

      getReq.onerror = () => {
        resolve(null);
      };
    });
  } catch (err) {
    console.warn('⚠️ [CachePdf] Exception recupererPdfLocal :', err);
    return null;
  }
}

/**
 * Vérifie si le PDF est physiquement présent dans le cache persistant IndexedDB
 */
export async function estPdfEnCacheLocal(docId: string): Promise<boolean> {
  if (Platform.OS !== 'web' || !docId) return false;
  const blob = await recupererPdfLocal(docId);
  return Boolean(blob && blob.size > 0);
}

/**
 * Récupère en une seule lecture rapide l'ensemble des IDs de documents présents dans IndexedDB (< 5 ms)
 */
export async function obtenirIdsPdfsEnCache(): Promise<Set<string>> {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return new Set<string>();
  }

  try {
    const db = await ouvrirBaseIndexedDB();
    if (!db) return new Set<string>();

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAllKeys();

      req.onsuccess = () => {
        const setIds = new Set<string>();
        const keys = req.result || [];
        for (const k of keys) {
          const str = String(k);
          const docId = str.replace(/^pdf_blob_/, '');
          setIds.add(docId);
        }
        resolve(setIds);
      };

      req.onerror = () => {
        resolve(new Set<string>());
      };
    });
  } catch (_) {
    return new Set<string>();
  }
}

/**
 * Récupère une URL Blob locale utilisable directement par LecteurPdfDesktop ou LecteurPwaMobile
 */
export async function recupererUrlBlobPdf(docId: string): Promise<string | null> {
  if (Platform.OS !== 'web' || !docId) return null;

  const cle = normaliserClePdf(docId);

  // 1. Vérifier si l'URL Blob mémoire de session est encore active
  const urlMemoire = objectUrlsMemoire.get(cle);
  if (urlMemoire) {
    return urlMemoire;
  }

  // 2. Recherche dans IndexedDB
  const blob = await recupererPdfLocal(docId);
  if (blob && blob.size > 0) {
    const urlLocale = URL.createObjectURL(blob);
    objectUrlsMemoire.set(cle, urlLocale);
    return urlLocale;
  }

  // 3. Repli : Vérification dans le Service Worker Cache Storage (Cache API)
  if (typeof caches !== 'undefined') {
    try {
      const docsCache = await caches.open(SW_CACHE_NAME);
      // Tentative de recherche sur des clés d'URL potentielles associées
      const requests = await docsCache.keys();
      for (const req of requests) {
        if (req.url.includes(docId) || req.url.includes(encodeURIComponent(docId))) {
          const res = await docsCache.match(req, { ignoreSearch: true });
          if (res && res.ok) {
            const resBlob = await res.blob();
            if (resBlob && resBlob.size > 0) {
              await enregistrerPdfLocal(docId, resBlob);
              const urlLocale = URL.createObjectURL(resBlob);
              objectUrlsMemoire.set(cle, urlLocale);
              return urlLocale;
            }
          }
        }
      }
    } catch (_) {}
  }

  return null;
}

/**
 * Télécharge et persiste les octets du PDF dans IndexedDB et Cache Storage
 * Appelé lors de l'acquisition, de l'import ou de la première consultation en ligne.
 */
export async function telechargerEtMettreEnCachePdf(
  docId: string,
  urlFichier: string,
  titre?: string
): Promise<string | null> {
  if (Platform.OS !== 'web' || !docId || !urlFichier) return null;

  // Si c'est déjà un blob: local ou une data: URI
  if (urlFichier.startsWith('blob:') || urlFichier.startsWith('data:')) {
    try {
      const res = await fetch(urlFichier);
      if (res.ok) {
        const b = await res.blob();
        await enregistrerPdfLocal(docId, b, titre);
        return urlFichier;
      }
    } catch (_) {}
  }

  // Si déjà en cache IndexedDB, retourner directement son URL Blob
  const existant = await recupererUrlBlobPdf(docId);
  if (existant) {
    return existant;
  }

  // Téléchargement des octets en arrière-plan sans bloquer
  try {
    console.log(`📥 [CachePdf] Téléchargement et persistance locale du PDF : ${docId}`);
    const reponse = await fetch(urlFichier);
    if (!reponse.ok) {
      throw new Error(`HTTP ${reponse.status}`);
    }

    const blob = await reponse.blob();
    if (blob && blob.size > 0) {
      await enregistrerPdfLocal(docId, blob, titre);

      // Dupliquer également dans le cache du Service Worker sous l'URL d'origine
      if (typeof caches !== 'undefined') {
        try {
          const swCache = await caches.open(SW_CACHE_NAME);
          const cleanUrl = urlFichier.split('?')[0];
          await swCache.put(new Request(cleanUrl, { method: 'GET' }), new Response(blob.slice(), {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Length': String(blob.size),
            },
          }));
        } catch (_) {}
      }

      const cle = normaliserClePdf(docId);
      const urlBlob = URL.createObjectURL(blob);
      objectUrlsMemoire.set(cle, urlBlob);
      return urlBlob;
    }
  } catch (err) {
    console.warn(`⚠️ [CachePdf] Impossible de pré-mettre en cache ${docId} :`, err);
  }

  return null;
}

/**
 * Supprime un PDF du cache persistant local
 */
export async function supprimerPdfLocal(docId: string): Promise<boolean> {
  if (Platform.OS !== 'web' || !docId) return false;

  const cle = normaliserClePdf(docId);
  const urlMemoire = objectUrlsMemoire.get(cle);
  if (urlMemoire && urlMemoire.startsWith('blob:')) {
    URL.revokeObjectURL(urlMemoire);
    objectUrlsMemoire.delete(cle);
  }

  try {
    const db = await ouvrirBaseIndexedDB();
    if (!db) return false;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const delReq = store.delete(cle);
      delReq.onsuccess = () => resolve(true);
      delReq.onerror = () => resolve(false);
    });
  } catch (_) {
    return false;
  }
}
