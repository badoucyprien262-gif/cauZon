// ==============================================================================
// 🎬 cauZon — Service Espace Posteur (profil créateur style TikTok)
// Lecture du portefeuille / publications + RPC d'activation + demande de retrait.
// Aucune donnée téléphonique n'est conservée ici : le numéro est transmis une
// seule fois à l'Edge Function feexpay-payout puis oublié.
// ==============================================================================

import { supabase } from '../lib/supabase';

export const SEUIL_RETRAIT_FCFA = 5000;
export const GAIN_PAR_ACQUISITION_FCFA = 50;
export const QUOTA_POSTEUR_BASE_MO = 400;
export const EXTENSION_POSTEUR_MO = 400;
export const PRIX_EXTENSION_POSTEUR_FCFA = 1500;
export const TAILLE_MAX_PDF_MO = 100;

export interface WalletPosteur {
  user_id: string;
  est_posteur_actif: boolean;
  pseudo_createur: string | null;
  bio_createur: string | null;
  avatar_url: string | null;
  quota_stockage_mo: number;
  espace_utilise_mo: number;
  solde_retirable: number;
  cumul_gains_historique: number;
  total_acquisitions_recues: number;
}

export interface PublicationPosteur {
  id: string;
  titre: string;
  tags: string | null;
  taille_mo: number | null;
  status: string | null;
  cover_url: string | null;
  nombre_pages: number | null;
  created_at?: string | null;
}

export interface DemandeRetrait {
  id: string;
  montant: number;
  operateur: string;
  statut: string;
  created_at: string;
}

export interface EspacePosteur {
  wallet: WalletPosteur | null;
  publications: PublicationPosteur[];
  retraits: DemandeRetrait[];
  espaceUtiliseMo: number;
}

export const chargerEspacePosteur = async (userId: string): Promise<EspacePosteur> => {
  const [walletRes, docsRes, retraitsRes] = await Promise.all([
    supabase.from('posteurs_wallets').select('*').eq('user_id', userId).maybeSingle(),
    supabase
      .from('documents')
      .select('id, titre, tags, taille_mo, status, cover_url, nombre_pages, created_at')
      .eq('author_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('demandes_retrait_posteurs')
      .select('id, montant, operateur, statut, created_at')
      .eq('posteur_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const wallet = (walletRes.data as WalletPosteur | null) ?? null;
  const publications = ((docsRes.data as PublicationPosteur[]) ?? []);
  const retraits = ((retraitsRes.data as DemandeRetrait[]) ?? []);

  // Espace réellement consommé : on retient le plus fiable des deux (wallet serveur / somme des PDF)
  const sommeDocs = publications.reduce((acc, d) => acc + (Number(d.taille_mo) || 0), 0);
  const espaceUtiliseMo = Math.max(Number(wallet?.espace_utilise_mo) || 0, sommeDocs);

  return { wallet, publications, retraits, espaceUtiliseMo };
};

export const activerEspacePosteur = async (
  pseudo: string,
  bio: string,
  avatarUrl?: string | null
): Promise<{ success: boolean; message: string }> => {
  // Appel RPC avec les 3 paramètres
  const { data, error } = await supabase.rpc('activer_espace_posteur', {
    p_pseudo: pseudo,
    p_bio: bio,
    p_avatar_url: avatarUrl ?? null,
  });

  if (!error && data) {
    return { success: Boolean(data?.success), message: data?.message || 'Espace posteur activé avec succès.' };
  }

  // Si erreur de fonction manquante dans le schéma ou cache PostgREST temporaire :
  // on applique une écriture directe dans posteurs_wallets avec RLS
  if (error) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error: upsertErr } = await supabase.from('posteurs_wallets').upsert({
          user_id: user.id,
          est_posteur_actif: true,
          pseudo_createur: pseudo.trim() || null,
          bio_createur: bio.trim() || null,
          avatar_url: avatarUrl ?? null,
          updated_at: new Date().toISOString(),
        });
        if (!upsertErr) {
          // Synchroniser aussi la table documents si des cours existent
          await supabase.from('documents').update({
            author_pseudo: pseudo.trim() || null,
            author_avatar_url: avatarUrl ?? null,
          }).eq('author_id', user.id);

          return { success: true, message: 'Espace posteur activé avec succès !' };
        }
      }
    } catch (_) {}
    return { success: false, message: error.message };
  }

  return { success: true, message: 'Espace posteur activé.' };
};

export const mettreAJourProfilPosteur = async (
  userId: string,
  pseudo: string,
  bio: string,
  avatarUrl?: string | null
): Promise<{ success: boolean; message: string }> => {
  const payload: any = {
    pseudo_createur: pseudo.trim() || null,
    bio_createur: bio.trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (avatarUrl !== undefined) {
    payload.avatar_url = avatarUrl;
  }

  const { error } = await supabase
    .from('posteurs_wallets')
    .update(payload)
    .eq('user_id', userId);

  if (!error) {
    // Répercuter sur les documents publiés pour affichage immédiat sur les cartes
    const docPayload: any = { author_pseudo: pseudo.trim() || null };
    if (avatarUrl !== undefined) docPayload.author_avatar_url = avatarUrl;
    supabase.from('documents').update(docPayload).eq('author_id', userId).then(() => {}, () => {});
  }

  return error ? { success: false, message: error.message } : { success: true, message: 'Profil créateur mis à jour.' };
};

/** Clé d'idempotence stable pour une tentative de retrait (à conserver jusqu'au succès). */
export const genererCleIdempotenceRetrait = (): string =>
  `payout_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

/**
 * Demande de retrait Mobile Money. Le numéro n'est jamais stocké :
 * il est envoyé une seule fois à l'Edge Function puis non conservé.
 */
export const demanderRetraitPosteur = async (params: {
  montant: number;
  operateur: string;
  telephone: string;
  idempotencyKey: string;
}): Promise<{ success: boolean; message: string }> => {
  if (params.montant < SEUIL_RETRAIT_FCFA) {
    return { success: false, message: `Le montant minimum de retrait est de ${SEUIL_RETRAIT_FCFA} FCFA.` };
  }
  const { data, error } = await supabase.functions.invoke('feexpay-payout', { body: params });
  if (error) {
    // Les erreurs HTTP 4xx/5xx de la fonction portent le message dans le contexte
    let message = error.message;
    try {
      const ctx: any = (error as any).context;
      if (ctx?.json) message = (await ctx.json())?.message || message;
    } catch (_) {}
    return { success: false, message };
  }
  return { success: Boolean(data?.success), message: data?.message || 'Retrait envoyé.' };
};
