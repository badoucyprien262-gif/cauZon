import { Platform, Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';

// Complète la session de navigateur si l'authentification s'exécute dans une popup
WebBrowser.maybeCompleteAuthSession();

/**
 * Lance la connexion rapide via Google (OAuth) avec Supabase.
 * - Sur Web : Redirection OAuth transparente sans crash de chemin.
 * - Sur Mobile : Boîte de dialogue Pop-up native (Chrome Custom Tabs / ASWebAuthenticationSession).
 */
export const connexionAvecGoogle = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    if (Platform.OS === 'web') {
      const redirectUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8081';
      console.log('🌐 Lancement Google OAuth Web explicite avec redirectTo :', redirectUrl);
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8081',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      if (error) throw error;
      return { success: true };
    } else {
      // Sur Mobile (Android / iOS) : Pop-up native via WebBrowser
      const redirectUrl = 'cauzon://auth/callback';
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      if (!data?.url) {
        return { success: false, error: "URL d'authentification indisponible" };
      }

      // Ouvre une boîte de dialogue Google OAuth native fluide (Pop-up)
      const authResult = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl, {
        showInRecents: false,
        preferEphemeralSession: false,
      });

      if (authResult.type === 'success' && authResult.url) {
        const success = await gererUrlRetourAuth(authResult.url);
        return { success };
      } else if (authResult.type === 'cancel' || authResult.type === 'dismiss') {
        return { success: false, error: 'Connexion annulée' };
      }

      return { success: true };
    }
  } catch (error: any) {
    console.error('❌ Erreur de connexion Google OAuth :', error.message);
    return { success: false, error: error.message || 'Échec de connexion Google' };
  }
};

/**
 * Déconnecte l'utilisateur de Supabase Auth
 */
export const deconnexionAuth = async (): Promise<void> => {
  try {
    await supabase.auth.signOut();
  } catch (error: any) {
    console.error('Erreur déconnexion :', error.message);
  }
};

/**
 * Traite les Deep Links retour de Google OAuth (sur Mobile)
 */
export const gererUrlRetourAuth = async (url: string): Promise<boolean> => {
  try {
    if (!url) return false;

    // 1. Tokens dans le fragment hash (#access_token=...)
    if (url.includes('access_token=') && url.includes('refresh_token=')) {
      const hashPart = url.includes('#') ? url.split('#')[1] : url.split('?')[1];
      const params = new URLSearchParams(hashPart);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error) {
          console.log('✅ Session Google OAuth établie avec succès via Deep Link');
          return true;
        }
      }
    }

    // 2. Code PKCE (?code=...)
    if (url.includes('code=')) {
      const { error } = await supabase.auth.exchangeCodeForSession(url);
      if (!error) {
        console.log('✅ Session Google OAuth établie avec succès via PKCE Code Exchange');
        return true;
      }
    }

    return false;
  } catch (err: any) {
    console.warn('⚠️ Erreur traitement Deep Link Auth :', err.message);
    return false;
  }
};

/**
 * Synchronise les métadonnées du compte Google avec la table `profiles`
 * et rattache les achats de l'appareil (device_id) au compte connecté
 */
export const synchroniserProfilGoogle = async (user: any): Promise<void> => {
  if (!user || !user.id) return;

  try {
    const meta = user.user_metadata || {};
    const nomComplet = meta.full_name || meta.name || meta.given_name || user.email?.split('@')[0] || 'Étudiant cauZon';
    const avatarUrl = meta.avatar_url || meta.picture || null;

    const payload: any = {
      id: user.id,
      username: nomComplet,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.log('Note synchro profil Supabase :', error.message);
    } else {
      console.log('✅ Profil Google synchronisé avec succès dans Supabase :', nomComplet);
    }

    // Rattachement automatique des acquisitions locales de l'appareil au compte Google
    try {
      const { getDeviceId } = await import('./serviceDocument');
      const deviceId = await getDeviceId();
      if (deviceId) {
        await supabase
          .from('acquisitions')
          .update({ user_id: user.id })
          .eq('device_id', deviceId)
          .is('user_id', null);
        console.log('🔗 Acquisitions de l\'appareil rattachées au compte utilisateur');
      }
    } catch (acqLinkErr) {
      console.log('Note liaison acquisitions :', acqLinkErr);
    }
  } catch (err: any) {
    console.error('Erreur synchronisation profil Google :', err.message);
  }
};
