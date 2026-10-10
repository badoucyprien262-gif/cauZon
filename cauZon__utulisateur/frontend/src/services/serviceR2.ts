/**
 * Service R2 — Côté Client Mobile (cauZon)
 *
 * Fournit une URL pré-signée temporaire pour lire un document PDF stocké
 * dans Cloudflare R2, via la Supabase Edge Function `r2-signed-url`.
 *
 * Le lecteur mobile (EcranLecteurDocument) appelle ce service au lieu d'accéder
 * directement à R2 (aucune clé secrète côté client).
 *
 * @module services/serviceR2
 */

import { supabase } from '../lib/supabase';

// URL de la Edge Function Supabase
const R2_SIGNED_URL_FUNCTION =
  `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/r2-signed-url`;

// Cache mémoire local des URLs pré-signées (évite les appels répétitifs)
const urlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Durée du cache local d'URL pré-signée : 13 minutes
 * (TTL de l'URL = 15 min, on la retire 2 min avant expiration)
 */
const CACHE_TTL_MS = 13 * 60 * 1000;

/**
 * Récupère une URL pré-signée temporaire pour lire un PDF stocké dans R2.
 *
 * Stratégie :
 *  1. Cache mémoire : si une URL valide existe (< 13 min), la réutiliser.
 *  2. Sinon : appel à la Edge Function `r2-signed-url` avec la session JWT courante.
 *  3. Retourne l'URL pré-signée HTTPS valide 15 minutes.
 *
 * @param fileKey - Clé du fichier dans R2 (ex: "documents/miage_l1/algebre.pdf")
 * @param ttlSeconds - Durée de validité souhaitée en secondes (défaut: 900 = 15 min)
 * @param documentId - Identifiant UUID optionnel du document pour vérification d'accès
 * @returns URL pré-signée ou null en cas d'erreur
 */
export async function obtenirUrlPresigneeR2(
  fileKey: string,
  ttlSeconds: number = 900,
  documentId?: string
): Promise<string | null> {
  if (!fileKey) return null;

  const cleanKey = fileKey.replace(/^\/+/, '');

  // 1. Vérification du cache mémoire
  const cached = urlCache.get(cleanKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.url;
  }

  try {
    // 2. Récupérer la session JWT courante (anon ou authentifié)
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

    // 3. Appel à la Edge Function Deno
    const response = await fetch(R2_SIGNED_URL_FUNCTION, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
      },
      body: JSON.stringify({ fileKey: cleanKey, ttl: ttlSeconds, documentId }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[serviceR2] Erreur Edge Function :', response.status, errText);
      return null;
    }

    const data = await response.json() as {
      success: boolean;
      signedUrl?: string;
      expiresAt?: string;
      error?: string;
    };

    if (!data.success || !data.signedUrl) {
      console.error('[serviceR2] URL pré-signée non générée :', data.error);
      return null;
    }

    // 4. Mise en cache mémoire (13 min)
    urlCache.set(cleanKey, {
      url: data.signedUrl,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return data.signedUrl;
  } catch (err) {
    console.error('[serviceR2] Exception :', err);
    return null;
  }
}

/**
 * Résout la source PDF d'un document en priorité depuis R2 (si file_key présent),
 * sinon délègue à l'URL publique Supabase Storage (rétro-compatibilité).
 *
 * @param document - Objet document avec file_key ou file_path
 * @returns URL de lecture du PDF
 */
export async function resoudreUrlDocumentR2(document: {
  file_key?: string;
  file_path?: string;
  cloud_path?: string;
  local_uri?: string;
  id?: string;
}): Promise<string | null> {
  // Priorité 1 : fichier local (hors-ligne)
  if (document.local_uri) {
    return document.local_uri;
  }

  // Priorité 2 : R2 (nouveau pipeline avec vérification de droits)
  if (document.file_key) {
    const url = await obtenirUrlPresigneeR2(document.file_key, 900, document.id);
    if (url) return url;
  }

  // Priorité 3 : Supabase Storage (rétro-compatibilité)
  if (document.cloud_path || document.file_path) {
    return document.cloud_path || document.file_path || null;
  }

  return null;
}

/**
 * Invalide le cache pour une clé donnée (ex: après mise à jour du document).
 */
export function invaliderCacheR2(fileKey: string): void {
  const cleanKey = fileKey.replace(/^\/+/, '');
  urlCache.delete(cleanKey);
}

/**
 * Vide tout le cache d'URLs pré-signées.
 */
export function viderCacheR2(): void {
  urlCache.clear();
}
