/**
 * ==============================================================================
 * 🚀 cauZon — Service de Synchronisation Hors-Ligne & Auto-Sync
 * Fichier : src/services/serviceSynchronisationHorsLigne.ts
 * ==============================================================================
 * 
 * 1. Synchronisation automatique en tâche de fond (Auto-Sync) des cours acquis / importés.
 * 2. Vérification rapide des statuts hors-ligne (< 5 ms via IndexedDB.getAllKeys()).
 * 3. Téléchargement ordonné et throttlé (anti-saturation réseau / mémoire).
 * 4. Hook React dédié `useSynchronisationHorsLigne` pour asservir l'interface utilisateur.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { Document, DocumentCourse } from '../types';
import { resoudreSourcePdf, verifierFichierLocalExiste, telechargerFichierVersDossierPersistant } from './serviceDocument';
import {
  obtenirIdsPdfsEnCache,
  estPdfEnCacheLocal,
  telechargerEtMettreEnCachePdf,
  enregistrerPdfLocal,
} from './gestionnaireCachePdf';

export interface ProgressionSync {
  faits: number;
  total: number;
  docCourantId?: string;
  docCourantTitre?: string;
}

type EcouteurSync = (docId: string, estEnCache: boolean) => void;
const ecouteursSync: Set<EcouteurSync> = new Set();

export function abonnerSynchronisation(cb: EcouteurSync): () => void {
  ecouteursSync.add(cb);
  return () => {
    ecouteursSync.delete(cb);
  };
}

function notifierDocumentSynchronise(docId: string, estEnCache: boolean) {
  ecouteursSync.forEach((cb) => {
    try {
      cb(docId, estEnCache);
    } catch (_) {}
  });
}

/**
 * Vérifie si un document individuel est prêt pour la lecture hors-ligne
 */
export async function verifierDocumentEstEnCache(doc: Document | DocumentCourse): Promise<boolean> {
  if (!doc?.id) return false;

  if (Platform.OS === 'web') {
    return estPdfEnCacheLocal(doc.id);
  }

  // Mobile Natif (iOS / Android)
  const localCandidates = [
    (doc as any).cheminLocal,
    (doc as any).local_uri,
    (doc as any).file_path,
  ].filter(Boolean) as string[];

  for (const candidate of localCandidates) {
    if (!candidate.startsWith('http://') && !candidate.startsWith('https://')) {
      const existe = await verifierFichierLocalExiste(candidate);
      if (existe) return true;
    }
  }

  return false;
}

/**
 * Synchronise un document unique (télécharge son binaire et le stocke dans le cache persistant)
 */
export async function synchroniserDocumentUnique(
  doc: Document | DocumentCourse
): Promise<boolean> {
  if (!doc?.id) return false;

  // 1. Vérifier si déjà présent en cache
  const dejaPresent = await verifierDocumentEstEnCache(doc);
  if (dejaPresent) {
    notifierDocumentSynchronise(doc.id, true);
    return true;
  }

  // 2. Vérifier si réseau disponible
  const estHorsLigne = typeof navigator !== 'undefined' && !navigator.onLine;
  if (estHorsLigne) {
    return false;
  }

  try {
    // 3. Résoudre la source PDF (URL signée / URL publique / fichier)
    const resolution = await resoudreSourcePdf({
      id: doc.id,
      titre: doc.titre,
      file_path: (doc as any).file_path,
      cheminLocal: (doc as any).cheminLocal,
      local_uri: (doc as any).local_uri,
      cloud_path: (doc as any).cloud_path,
      bucket: (doc as any).bucket || 'documents_utilisateurs',
      pdf_url: (doc as any).pdf_url,
      url: (doc as any).url,
    });

    if (!resolution.uri) {
      return false;
    }

    // 4. Persistance selon la plateforme
    if (Platform.OS === 'web') {
      const res = await telechargerEtMettreEnCachePdf(doc.id, resolution.uri, doc.titre);
      const succes = Boolean(res);
      if (succes) {
        notifierDocumentSynchronise(doc.id, true);
      }
      return succes;
    } else {
      // Mobile natif
      if (!resolution.isLocal && resolution.uri.startsWith('http')) {
        const localPath = await telechargerFichierVersDossierPersistant(
          resolution.uri,
          `${doc.id}.pdf`
        );
        const succes = Boolean(localPath);
        if (succes) {
          notifierDocumentSynchronise(doc.id, true);
        }
        return succes;
      }
      return true;
    }
  } catch (err) {
    console.warn(`⚠️ [SyncHorsLigne] Échec synchronisation ${doc.id} (${doc.titre}) :`, err);
    return false;
  }
}

/**
 * Synchronise une collection de documents avec gestion du délai de temporisation (throttle)
 */
export async function synchroniserCollectionDocuments(
  documents: (Document | DocumentCourse)[],
  options?: {
    delaiEntreFichiersMs?: number;
    onProgression?: (progression: ProgressionSync) => void;
  }
): Promise<{ succes: number; total: number; echecs: number }> {
  const delai = options?.delaiEntreFichiersMs ?? 200;
  const docsATraiter = documents.filter((d) => Boolean(d && d.id));
  const total = docsATraiter.length;

  if (total === 0) {
    return { succes: 0, total: 0, echecs: 0 };
  }

  // 1. Détecter les documents déjà présents pour ne pas refaire de téléchargements inutiles
  let idsDejaEnCache = new Set<string>();
  if (Platform.OS === 'web') {
    idsDejaEnCache = await obtenirIdsPdfsEnCache();
  }

  const docsReellementNonCaches = docsATraiter.filter((d) => !idsDejaEnCache.has(d.id));
  let succesCompteur = total - docsReellementNonCaches.length;
  let echecsCompteur = 0;

  options?.onProgression?.({
    faits: succesCompteur,
    total: total,
  });

  for (let i = 0; i < docsReellementNonCaches.length; i++) {
    const doc = docsReellementNonCaches[i];

    options?.onProgression?.({
      faits: succesCompteur,
      total: total,
      docCourantId: doc.id,
      docCourantTitre: doc.titre,
    });

    const ok = await synchroniserDocumentUnique(doc);
    if (ok) {
      succesCompteur++;
    } else {
      echecsCompteur++;
    }

    options?.onProgression?.({
      faits: succesCompteur,
      total: total,
      docCourantId: doc.id,
      docCourantTitre: doc.titre,
    });

    // Pause légère pour laisser respirer l'event-loop et le réseau mobile
    if (delai > 0 && i < docsReellementNonCaches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delai));
    }
  }

  return { succes: succesCompteur, total, echecs: echecsCompteur };
}

/**
 * Hook personnalisé React pour la synchronisation hors-ligne de la Bibliothèque
 */
export function useSynchronisationHorsLigne(
  documents: Document[],
  options?: {
    autoSync?: boolean;
    estEnLigne?: boolean;
    onToast?: (message: string, titre: string, type: 'succes' | 'erreur' | 'info') => void;
  }
) {
  const autoSyncActif = options?.autoSync ?? true;
  const estConnecte = options?.estEnLigne ?? (typeof navigator !== 'undefined' ? navigator.onLine : true);

  const [idsEnCache, setIdsEnCache] = useState<Set<string>>(new Set());
  const [idsEnCours, setIdsEnCours] = useState<Set<string>>(new Set());
  const [estEnSynchronisation, setEstEnSynchronisation] = useState<boolean>(false);
  const [progression, setProgression] = useState<ProgressionSync | null>(null);

  const autoSyncLanceRef = useRef<boolean>(false);
  const enCoursRef = useRef<boolean>(false);

  // 1. Rafraîchir les statuts de cache actuels
  const rechargerStatuts = useCallback(async () => {
    if (Platform.OS === 'web') {
      const ids = await obtenirIdsPdfsEnCache();
      setIdsEnCache(new Set(ids));
    } else {
      // Mobile natif
      const setMobile = new Set<string>();
      for (const doc of documents) {
        const ok = await verifierDocumentEstEnCache(doc);
        if (ok) setMobile.add(doc.id);
      }
      setIdsEnCache(setMobile);
    }
  }, [documents]);

  useEffect(() => {
    rechargerStatuts();
  }, [documents, rechargerStatuts]);

  // 2. Écouter les mises en cache événementielles
  useEffect(() => {
    const unsub = abonnerSynchronisation((docId, estEnCache) => {
      setIdsEnCache((prev) => {
        const next = new Set(prev);
        if (estEnCache) {
          next.add(docId);
        } else {
          next.delete(docId);
        }
        return next;
      });
      setIdsEnCours((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    });

    return () => unsub();
  }, []);

  // 3. Synchronisation d'un document unique à la demande
  const synchroniserUnDocument = useCallback(async (doc: Document): Promise<boolean> => {
    setIdsEnCours((prev) => new Set(prev).add(doc.id));
    const succes = await synchroniserDocumentUnique(doc);
    setIdsEnCours((prev) => {
      const next = new Set(prev);
      next.delete(doc.id);
      return next;
    });
    if (succes) {
      setIdsEnCache((prev) => new Set(prev).add(doc.id));
    }
    return succes;
  }, []);

  // 4. Lancement manuel de la synchronisation complète
  const lancerSynchronisationComplete = useCallback(async () => {
    if (enCoursRef.current) return;
    if (!estConnecte) {
      options?.onToast?.(
        'Vous êtes hors-ligne. Connectez-vous à Internet pour synchroniser vos documents.',
        'Hors-ligne 📶',
        'info'
      );
      return;
    }

    enCoursRef.current = true;
    setEstEnSynchronisation(true);

    try {
      const docsNonCaches = documents.filter((d) => !idsEnCache.has(d.id));
      if (docsNonCaches.length === 0) {
        options?.onToast?.(
          'Tous vos documents sont déjà prêts pour la lecture hors-ligne ! 💾',
          'À jour ✅',
          'succes'
        );
        return;
      }

      options?.onToast?.(
        `Démarrage du téléchargement de ${docsNonCaches.length} document${docsNonCaches.length > 1 ? 's' : ''}...`,
        'Téléchargement 📥',
        'info'
      );

      // Marquer comme en cours
      setIdsEnCours(new Set(docsNonCaches.map((d) => d.id)));

      const resultat = await synchroniserCollectionDocuments(documents, {
        delaiEntreFichiersMs: 200,
        onProgression: (p) => {
          setProgression(p);
          if (p.docCourantId) {
            setIdsEnCache((prev) => new Set(prev).add(p.docCourantId!));
            setIdsEnCours((prev) => {
              const next = new Set(prev);
              next.delete(p.docCourantId!);
              return next;
            });
          }
        },
      });

      await rechargerStatuts();

      options?.onToast?.(
        `${resultat.succes} document${resultat.succes > 1 ? 's' : ''} synchronisé${resultat.succes > 1 ? 's' : ''} avec succès pour le hors-ligne ! 🚀`,
        'Synchronisation Terminée ✅',
        'succes'
      );
    } catch (e) {
      console.warn('⚠️ [useSynchronisationHorsLigne] Erreur synchronisation complète :', e);
    } finally {
      enCoursRef.current = false;
      setEstEnSynchronisation(false);
      setProgression(null);
      setIdsEnCours(new Set());
    }
  }, [documents, idsEnCache, estConnecte, options, rechargerStatuts]);

  // 5. Auto-Sync silencieux en arrière-plan dès l'ouverture en ligne
  useEffect(() => {
    if (!autoSyncActif || !estConnecte || autoSyncLanceRef.current || documents.length === 0) {
      return;
    }

    autoSyncLanceRef.current = true;

    // Laisser passer 1.5s pour ne pas concurrencer le rendu initial de la bibliothèque
    const timer = setTimeout(async () => {
      try {
        const idsActuels = Platform.OS === 'web' ? await obtenirIdsPdfsEnCache() : idsEnCache;
        const nonCaches = documents.filter((d) => !idsActuels.has(d.id));

        if (nonCaches.length > 0) {
          console.log(`⚡ [AutoSync] Téléchargement silencieux en tâche de fond de ${nonCaches.length} document(s)...`);
          // Téléchargement discret avec throttle de 300ms
          for (const doc of nonCaches) {
            setIdsEnCours((prev) => new Set(prev).add(doc.id));
            const ok = await synchroniserDocumentUnique(doc);
            setIdsEnCours((prev) => {
              const next = new Set(prev);
              next.delete(doc.id);
              return next;
            });
            if (ok) {
              setIdsEnCache((prev) => new Set(prev).add(doc.id));
            }
            await new Promise((r) => setTimeout(r, 300));
          }
        }
      } catch (err) {
        console.warn('⚠️ [AutoSync] Note synchronisation automatique :', err);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [autoSyncActif, estConnecte, documents]);

  return {
    idsEnCache,
    idsEnCours,
    estEnSynchronisation,
    progression,
    lancerSynchronisationComplete,
    synchroniserUnDocument,
    rechargerStatuts,
    totalDocuments: documents.length,
    documentsEnCacheCount: idsEnCache.size,
  };
}
