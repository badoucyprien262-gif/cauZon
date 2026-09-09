import { supabase } from '../lib/supabase';
import type { BannerRow } from '../types';
import { sendRemotePushNotification } from './servicePushNotifications';

export const fetchBanners = async (): Promise<BannerRow[]> => {
  const { data, error } = await supabase
    .from('annonces_bannieres')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((b: any) => ({
    id: b.id,
    titre_bande: b.titre_bande || b.title || '',
    contenu_detaille: b.contenu_detaille || b.message || '',
    type_importance: b.type_importance || 'info',
    date_debut: b.date_debut || b.created_at || new Date().toISOString(),
    date_fin: b.date_fin || new Date().toISOString(),
    ciblage_role: b.ciblage_role || 'tous',
    document_id_associe: b.document_id_associe || null,
    statut: b.statut || 'actif',
    created_at: b.created_at
  }));
};

export interface BannerSavePayload extends Omit<BannerRow, 'id' | 'created_at'> {
  diffuser_push?: boolean;
  titre_push?: string;
  corps_push?: string;
}

export const saveBanner = async (
  payload: BannerSavePayload,
  editingId: string | null
): Promise<{ pushResult?: any }> => {
  const titreClean = (payload.titre_bande || '').trim();
  const contenuClean = (payload.contenu_detaille || '').trim();

  if (!titreClean) throw new Error('Le titre de la bande est obligatoire.');
  if (!contenuClean) throw new Error('Le contenu détaillé est obligatoire.');
  if (!payload.date_fin) throw new Error("La date d'expiration est obligatoire.");

  const clean = {
    title: titreClean,
    message: contenuClean,
    titre_bande: titreClean,
    contenu_detaille: contenuClean,
    type_importance: payload.type_importance || 'info',
    date_debut: payload.date_debut ? new Date(payload.date_debut).toISOString() : new Date().toISOString(),
    date_fin: new Date(payload.date_fin).toISOString(),
    ciblage_role: payload.ciblage_role || 'tous',
    document_id_associe: payload.document_id_associe || null,
    statut: payload.statut || 'actif',
    updated_at: new Date().toISOString()
  };

  let pushResult: any = undefined;

  if (editingId) {
    const { error } = await supabase.from('annonces_bannieres').update(clean).eq('id', editingId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('annonces_bannieres').insert([clean]);
    if (error) throw error;
  }

  // 🚀 DÉCLENCHEMENT DU PUSH DISTANT HAUTE PRIORITÉ (EXPO PUSH API / EDGE FUNCTION)
  // Réveille les téléphones en arrière-plan ou fermés (mode Killed State)
  // Déclenché à la création ou modification dès que la bannière est active
  if (payload.diffuser_push !== false && clean.statut === 'actif') {
    const pTitle = payload.titre_push?.trim() || clean.titre_bande;
    const pBody = (payload.corps_push?.trim() || clean.contenu_detaille)
      .replace(/\[MEDIA:(image|video):[^\]]+\]/g, '')
      .trim();

    try {
      pushResult = await sendRemotePushNotification({
        title: pTitle,
        body: pBody || clean.titre_bande,
        document_id: clean.document_id_associe,
        route: clean.document_id_associe ? 'Bibliotheque' : 'Accueil',
        cible: clean.ciblage_role as 'tous' | 'non_abonnes' | 'abonnes',
        data: {
          type: 'annonce',
          importance: clean.type_importance,
          document_id: clean.document_id_associe || undefined,
          route: clean.document_id_associe ? 'Bibliotheque' : 'Accueil',
          action: 'open_banner',
          titre_bande: clean.titre_bande,
        },
      });
    } catch (err) {
      console.warn('Note envoi push annonce :', err);
    }
  }

  return { pushResult };
};

export const uploadBannerMedia = async (file: File): Promise<{ url: string; type: 'image' | 'video' }> => {
  const isVideo = file.type.startsWith('video/') || !!file.name.match(/\.(mp4|webm|mov|mkv)$/i);
  const ext = file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg');
  const filename = `banners/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

  const { error } = await supabase.storage.from('cours-documents').upload(filename, file, {
    contentType: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
    upsert: false
  });
  if (error) throw new Error(`Erreur lors de l'upload du média : ${error.message}`);

  const { data } = supabase.storage.from('cours-documents').getPublicUrl(filename);
  return { url: data.publicUrl, type: isVideo ? 'video' : 'image' };
};

export const deleteBanner = async (id: string): Promise<void> => {
  const { error } = await supabase.from('annonces_bannieres').delete().eq('id', id);
  if (error) throw error;
};

export const toggleBannerStatus = async (
  id: string,
  current: string,
  banner?: BannerRow
): Promise<{ newStatut: 'actif' | 'inactif'; pushResult?: any }> => {
  const newStatut = current === 'actif' ? 'inactif' : 'actif';
  const { error } = await supabase
    .from('annonces_bannieres')
    .update({ statut: newStatut, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;

  let pushResult: any = undefined;

  // 🚀 Si la bannière passe en statut "actif", diffuser automatiquement la notification push
  if (newStatut === 'actif' && banner) {
    const cleanDesc = (banner.contenu_detaille || '')
      .replace(/\[MEDIA:(image|video):[^\]]+\]/g, '')
      .trim();

    try {
      pushResult = await sendRemotePushNotification({
        title: banner.titre_bande,
        body: cleanDesc || banner.titre_bande,
        document_id: banner.document_id_associe || null,
        route: banner.document_id_associe ? 'Bibliotheque' : 'Accueil',
        cible: (banner.ciblage_role as 'tous' | 'non_abonnes' | 'abonnes') || 'tous',
        data: {
          type: 'annonce',
          importance: banner.type_importance || 'info',
          document_id: banner.document_id_associe || undefined,
          route: banner.document_id_associe ? 'Bibliotheque' : 'Accueil',
          action: 'open_banner',
          titre_bande: banner.titre_bande,
        },
      });
    } catch (err) {
      console.warn('Note envoi push activation bannière :', err);
    }
  }

  return { newStatut, pushResult };
};
