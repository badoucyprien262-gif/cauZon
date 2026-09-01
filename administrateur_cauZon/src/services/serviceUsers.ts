import { supabase } from '../lib/supabase';
import type { ProfileRow, BanDuration } from '../types';

const IS_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const formatErrorMessage = (e: unknown): string => {
  if (!e) return 'Une erreur inconnue est survenue.';
  if (typeof e === 'string') return e;
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'object') {
    const obj = e as Record<string, unknown>;
    if (obj.message && typeof obj.message === 'string') return obj.message;
    if (obj.error_description && typeof obj.error_description === 'string') return obj.error_description;
    if (obj.error && typeof obj.error === 'string') return obj.error;
    if (obj.details && typeof obj.details === 'string') return obj.details;
    try {
      return JSON.stringify(e, null, 2);
    } catch (_) {}
  }
  return String(e);
};

export const fetchProfiles = async (): Promise<ProfileRow[]> => {
  const list: ProfileRow[] = [];
  const knownIds = new Set<string>();

  try {
    // 1. Profils enregistrés (Utilisateurs Google/Email/Compte)
    const { data: profs, error: errProf } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (!errProf && profs) {
      profs.forEach((p) => {
        knownIds.add(p.id);
        const nomPropre = p.username?.trim() || p.phone_number || 'Étudiant cauZon';
        list.push({
          ...(p as ProfileRow),
          username: nomPropre,
          avatar_url: p.avatar_url || null,
          phone_number: p.phone_number || null,
          storage_limit: p.storage_limit || (p.has_extended_storage ? 150 : 75),
        });
      });
    } else if (errProf) {
      console.warn('Note lecture profiles :', errProf.message);
    }
  } catch (e) {
    console.warn('Erreur lecture profiles :', e);
  }

  try {
    // 2. Appareils uniques enregistrés (Utilisateurs mobiles et visiteurs)
    const { data: apps, error: errApp } = await supabase
      .from('appareils_historique_bienvenue')
      .select('*')
      .order('created_at', { ascending: false });

    if (!errApp && apps) {
      apps.forEach((app) => {
        const devId = app.device_id;
        if (devId && !knownIds.has(devId)) {
          knownIds.add(devId);
          const nomApp = app.username?.trim() || (app.phone_number ? `Étudiant (${app.phone_number})` : `Étudiant Invité (${devId.substring(0, 6)})`);
          list.push({
            id: devId,
            username: nomApp,
            avatar_url: app.avatar_url || null,
            phone_number: app.phone_number || null,
            has_extended_storage: Boolean(app.has_extended_storage),
            storage_limit: app.storage_limit || 75,
            is_banned: Boolean(app.is_banned),
            banned_until: app.banned_until || null,
            ban_reason: app.ban_reason || null,
            has_vip_pass: Boolean(app.has_vip_pass),
            vip_expiration_date: app.vip_expiration_date || null,
            created_at: app.created_at || new Date().toISOString(),
          });
        }
      });
    } else if (errApp) {
      console.warn('Note lecture appareils :', errApp.message);
    }
  } catch (e) {
    console.warn('Erreur lecture appareils :', e);
  }

  return list;
};

export const banUser = async (
  userId: string, duration: BanDuration, reason: string
): Promise<void> => {
  if (!reason.trim()) throw new Error('Motif de suspension obligatoire.');
  const now = Date.now();
  const durations: Record<BanDuration, number> = {
    '1d': 1, '3d': 3, '7d': 7, '14d': 14, '30d': 30, 'permanent': 3650
  };
  const bannedUntil = new Date(now + durations[duration] * 24 * 3600 * 1000).toISOString();

  if (IS_UUID_REGEX.test(userId)) {
    const { error } = await supabase.from('profiles').update({
      is_banned: true, banned_until: bannedUntil, ban_reason: reason.trim()
    }).eq('id', userId);
    if (error) throw new Error(error.message || 'Erreur lors de la suspension du profil.');
  } else {
    const { error } = await supabase.from('appareils_historique_bienvenue').update({
      is_banned: true, banned_until: bannedUntil, ban_reason: reason.trim()
    }).eq('device_id', userId);
    if (error) throw new Error(error.message || "Erreur lors de la suspension de l'appareil.");
  }
};

export const unbanUser = async (userId: string): Promise<void> => {
  if (IS_UUID_REGEX.test(userId)) {
    const { error } = await supabase.from('profiles').update({
      is_banned: false, banned_until: null, ban_reason: null
    }).eq('id', userId);
    if (error) throw new Error(error.message || 'Erreur lors du débannissement du profil.');
  } else {
    const { error } = await supabase.from('appareils_historique_bienvenue').update({
      is_banned: false, banned_until: null, ban_reason: null
    }).eq('device_id', userId);
    if (error) throw new Error(error.message || "Erreur lors du débannissement de l'appareil.");
  }
};

export const grantVip = async (userId: string): Promise<void> => {
  const expiration = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  if (IS_UUID_REGEX.test(userId)) {
    const { error } = await supabase.from('profiles').update({
      has_vip_pass: true, vip_expiration_date: expiration
    }).eq('id', userId);
    if (error) throw new Error(error.message || "Erreur lors de l'attribution du VIP.");
  } else {
    const { error } = await supabase.from('appareils_historique_bienvenue').update({
      has_vip_pass: true, vip_expiration_date: expiration
    }).eq('device_id', userId);
    if (error) throw new Error(error.message || "Erreur lors de l'attribution du VIP sur l'appareil.");
  }
};

export const grantStorage = async (userId: string): Promise<void> => {
  if (IS_UUID_REGEX.test(userId)) {
    const { error } = await supabase.from('profiles').update({
      has_extended_storage: true, storage_limit: 250
    }).eq('id', userId);
    if (error) throw new Error(error.message || "Erreur lors de l'attribution du stockage.");
  } else {
    const { error } = await supabase.from('appareils_historique_bienvenue').update({
      has_extended_storage: true, storage_limit: 250
    }).eq('device_id', userId);
    if (error) throw new Error(error.message || "Erreur lors de l'attribution du stockage sur l'appareil.");
  }
};

export const deleteUser = async (userId: string): Promise<void> => {
  if (IS_UUID_REGEX.test(userId)) {
    const { error } = await supabase.from('profiles').delete().eq('id', userId);
    if (error) throw new Error(error.message || "Erreur lors de la suppression de l'utilisateur.");
  } else {
    const { error } = await supabase.from('appareils_historique_bienvenue').delete().eq('device_id', userId);
    if (error) throw new Error(error.message || "Erreur lors de la suppression de l'appareil.");
  }
};
