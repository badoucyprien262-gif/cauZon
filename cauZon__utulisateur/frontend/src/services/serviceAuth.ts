import { Platform, Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { supabase } from '../lib/supabase';

// Complète la session de navigateur si l'authentification s'exécute dans une popup (Web uniquement)
try {
  if (Platform.OS === 'web') {
    WebBrowser.maybeCompleteAuthSession();
  }
} catch (_) {}

/**
 * Génère l'URL de redirection OAuth propre selon la plateforme
 */
export const obtenirUrlRedirectionOAuth = (customRedirect?: string): string => {
  if (Platform.OS === 'web') {
    if (customRedirect) return customRedirect;
    // Utilise l'origin (racine propre de l'app) pour éviter des URLs polluées avec
    // des paramètres résiduels lors du retour OAuth. Le routeur SPA gère ensuite.
    return (typeof window !== 'undefined' && window?.location?.origin)
      ? window.location.origin
      : 'https://app.cauzon.ci';
  }
  return makeRedirectUri({
    scheme: 'cauzon',
    path: 'auth/callback',
  });
};


/**
 * Extrait de façon robuste tous les paramètres (depuis le fragment hash # ou la query ?)
 * d'une URL de retour OAuth. Gère le décodage d'URL et les séparateurs multiples.
 */
export const extraireParamsDepuisUrl = (url: string): { [key: string]: string } => {
  const params: { [key: string]: string } = {};
  if (!url) return params;

  try {
    const match = url.match(/[#?](.*)/);
    if (!match || !match[1]) return params;

    const fullStr = match[1].replace(/[#?]/g, '&');
    const segments = fullStr.split('&');

    for (const segment of segments) {
      if (!segment) continue;
      const eqIdx = segment.indexOf('=');
      if (eqIdx === -1) continue;

      const rawKey = segment.slice(0, eqIdx);
      const rawVal = segment.slice(eqIdx + 1);

      try {
        params[decodeURIComponent(rawKey)] = decodeURIComponent(rawVal);
      } catch {
        params[rawKey] = rawVal;
      }
    }
  } catch (err) {
    console.warn('⚠️ Erreur analyse paramètres URL OAuth :', err);
  }

  return params;
};

/**
 * Web Client ID Google OAuth (avec fallback autonome pour EAS Build)
 */
export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  '843173177415-rsjoi9cto15k6kfh80ko94g5uhqrghdj.apps.googleusercontent.com';

/**
 * Lance la connexion rapide via Google avec Supabase.
 * - Sur Web : Redirection OAuth dynamique capturant l'URL exacte du cours/page en cours.
 * - Sur Android : Boîte de dialogue native Google Play Services / One Tap (GoogleSignin + signInWithIdToken)
 * - Sur iOS : Boîte de dialogue Google OAuth avec openAuthSessionAsync
 */
export const connexionAvecGoogle = async (customRedirectUrl?: string): Promise<{ success: boolean; error?: string }> => {
  try {
    // 1. Plateforme Web : Authentification Google Identity Services (GIS) sans redirection
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && (window as any).google?.accounts?.id) {
        return new Promise((resolve) => {
          (window as any).google.accounts.id.initialize({
            client_id: GOOGLE_WEB_CLIENT_ID,
            callback: async (response: any) => {
              try {
                if (!response?.credential) {
                  console.error('Aucun credential reçu de Google');
                  resolve({ success: false, error: 'Aucun jeton reçu de Google' });
                  return;
                }
                const { data, error } = await supabase.auth.signInWithIdToken({
                  provider: 'google',
                  token: response.credential,
                });
                if (error) {
                  console.error('Erreur session Supabase :', error);
                  resolve({ success: false, error: error.message });
                  return;
                }
                if (data?.user) {
                  await synchroniserProfilGoogle(data.user);
                }
                resolve({ success: true });
              } catch (err: any) {
                console.error('Erreur session Supabase :', err);
                resolve({ success: false, error: err?.message || 'Erreur de connexion' });
              }
            },
          });
          // Réinitialiser le cookie g_state pour réautoriser l'affichage immédiat du prompt One Tap
          try {
            document.cookie = 'g_state=;path=/;expires=Thu, 01 Jan 1970 00:00:01 GMT';
          } catch (_) {}
          (window as any).google.accounts.id.prompt();
          resolve({ success: true });
        });
      }

      // Fallback OAuth si le script GIS n'est pas encore prêt ou chargé
      const redirectUrl = obtenirUrlRedirectionOAuth(customRedirectUrl);
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });
      if (error) throw error;
      return { success: true };
    }

    // 2. Plateforme Native Android : Authentification Google Native (Play Services / One Tap)
    if (Platform.OS === 'android') {
      console.log('📱 Démarrage authentification Google native Android...');
      console.log('🔑 Google Web Client ID configuré :', GOOGLE_WEB_CLIENT_ID.substring(0, 15) + '...');

      GoogleSignin.configure({
        webClientId: GOOGLE_WEB_CLIENT_ID,
        scopes: ['email', 'profile'],
      });

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      const response = await GoogleSignin.signIn();

      if (response.type === 'cancelled') {
        console.log('ℹ️ Connexion Google annulée par l\'utilisateur.');
        return { success: false, error: 'Connexion annulée' };
      }

      // Extraction robuste du jeton idToken (response.data.idToken ou response.idToken)
      let idToken: string | null = (response as any)?.data?.idToken || (response as any)?.idToken || null;

      // Si idToken est toujours absent/null, interrogation directe via getTokens()
      if (!idToken) {
        console.log('🔄 idToken non présent dans response, tentative de récupération via GoogleSignin.getTokens()...');
        try {
          const tokens = await GoogleSignin.getTokens();
          idToken = tokens?.idToken || null;
          console.log('🎟️ Jeton idToken récupéré via getTokens :', !!idToken);
        } catch (tokenErr) {
          console.warn('⚠️ Échec de récupération via getTokens() :', tokenErr);
        }
      }

      if (!idToken) {
        console.error('❌ Impossible de récupérer le jeton idToken Google.');
        throw new Error("Jeton Google (idToken) manquant. Vérifiez la configuration du Web Client ID Google.");
      }

      console.log('🔐 Connexion à Supabase via signInWithIdToken...');
      // Connexion directe dans Supabase via le jeton d'identité Google ID Token
      const { data: authData, error: authErr } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });

      if (authErr) {
        console.error('❌ Erreur Supabase signInWithIdToken :', authErr.message);
        throw authErr;
      }

      if (authData?.user) {
        console.log('✅ Utilisateur Supabase authentifié avec succès :', authData.user.email);
        await synchroniserProfilGoogle(authData.user);
        return { success: true };
      }

      return { success: false, error: "Échec de l'authentification avec le compte Google." };
    }

    // 3. Fallback iOS / Autres : Flux OAuth avec WebBrowser.openAuthSessionAsync
    const redirectUrl = obtenirUrlRedirectionOAuth(customRedirectUrl);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    });

    if (error) throw error;

    if (!data?.url) {
      return { success: false, error: "Impossible de préparer la session de connexion Google." };
    }

    const authResult = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl, {
      showInRecents: false,
      preferEphemeralSession: false,
      toolbarColor: '#6B1124',
      secondaryToolbarColor: '#6B1124',
      enableBarCollapsing: true,
      showTitle: false,
    });

    if (authResult.type === 'success' && authResult.url) {
      const params = extraireParamsDepuisUrl(authResult.url);
      if (params.access_token && params.refresh_token) {
        const { data: sessionData, error: sessionErr } = await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
        if (!sessionErr && sessionData?.user) {
          await synchroniserProfilGoogle(sessionData.user);
          return { success: true };
        }
      } else if (params.code) {
        const { data: sessionData, error: codeErr } = await supabase.auth.exchangeCodeForSession(params.code);
        if (!codeErr && sessionData?.user) {
          await synchroniserProfilGoogle(sessionData.user);
          return { success: true };
        }
      }

      const success = await gererUrlRetourAuth(authResult.url);
      return { success };
    } else if (authResult.type === 'dismiss') {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await synchroniserProfilGoogle(session.user);
        return { success: true };
      }
      return { success: false, error: 'Connexion annulée ou fermée.' };
    } else if (authResult.type === 'cancel') {
      return { success: false, error: 'Connexion annulée' };
    }

    return { success: true };
  } catch (error: any) {
    // Interception propre des annulations et états en cours (sans blocage UI)
    if (
      error?.code === statusCodes?.SIGN_IN_CANCELLED ||
      error?.message?.includes('SIGN_IN_CANCELLED') ||
      error?.message?.toLowerCase().includes('cancel')
    ) {
      console.log('ℹ️ Connexion Google annulée par l\'utilisateur.');
      return { success: false, error: 'Connexion annulée' };
    }

    if (error?.code === statusCodes?.IN_PROGRESS) {
      console.log('ℹ️ Connexion Google déjà en cours.');
      return { success: false, error: 'Connexion Google déjà en cours...' };
    }

    if (error?.code === statusCodes?.PLAY_SERVICES_NOT_AVAILABLE) {
      console.warn('⚠️ Google Play Services non disponibles.');
      return {
        success: false,
        error: 'Les services Google Play sont indisponibles ou obsolètes sur votre appareil.',
      };
    }

    console.error('Erreur authentification Google :', error);
    const userMsg = error?.message?.toLowerCase().includes('network')
      ? 'Problème de connexion internet. Veuillez vérifier votre réseau.'
      : (error?.message || 'Échec de la connexion avec Google. Veuillez réessayer.');
    return { success: false, error: userMsg };
  }
};

/**
 * Déconnecte l'utilisateur de Supabase Auth
 */
export const deconnexionAuth = async (): Promise<void> => {
  try {
    await supabase.auth.signOut();
  } catch (error: any) {
    // Silencieux
  }
};

/**
 * Traite les retours d'authentification Google OAuth sans fuite de données
 * Utilisé par openAuthSessionAsync et par les écouteurs de Deep Linking.
 */
export const gererUrlRetourAuth = async (url: string): Promise<boolean> => {
  try {
    if (!url) return false;
    console.log('🔄 Traitement URL de retour OAuth :', url.substring(0, 60));
    const params = extraireParamsDepuisUrl(url);

    // 1. Fragment hash / jetons (#access_token=...&refresh_token=...)
    if (params.access_token && params.refresh_token) {
      console.log('🔑 Jetons access_token et refresh_token extraits avec succès.');
      const { data: sessionData, error } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      });

      if (error) {
        console.error('❌ Erreur supabase.auth.setSession :', error.message);
        return false;
      }

      if (sessionData?.user) {
        console.log('✅ Session Supabase établie avec succès pour :', sessionData.user.email);
        await synchroniserProfilGoogle(sessionData.user);
      }
      return true;
    }

    // 2. Code PKCE (?code=...)
    if (params.code) {
      console.log('🔐 Code PKCE extrait. Échange du code...');
      const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(params.code);
      if (error) {
        const fallback = await supabase.auth.exchangeCodeForSession(url);
        if (fallback.data?.user) {
          await synchroniserProfilGoogle(fallback.data.user);
          return true;
        }
        console.error('❌ Erreur échange code PKCE :', error.message);
        return false;
      }

      if (sessionData?.user) {
        console.log('✅ Session PKCE établie pour :', sessionData.user.email);
        await synchroniserProfilGoogle(sessionData.user);
      }
      return true;
    }

    return false;
  } catch (err: any) {
    console.error('⚠️ Exception lors du traitement de l\'URL retour Auth :', err);
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
    const emailUtilisateur = user.email || meta.email || null;

    let deviceId: string | null = null;
    try {
      const { getDeviceId } = await import('./serviceDocument');
      deviceId = await getDeviceId();
    } catch (_) {}

    // 1. Vérifier si le compte était désactivé (Soft Delete) pour réactivation automatique
    const { data: profilExistant } = await supabase
      .from('profiles')
      .select('est_actif, desactive_le')
      .eq('id', user.id)
      .maybeSingle();

    const payload: any = {
      id: user.id,
      username: nomComplet,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
      est_actif: true,
      desactive_le: null,
    };

    if (deviceId) {
      payload.device_id = deviceId;
    }

    if (emailUtilisateur) {
      payload.email = emailUtilisateur;
    }

    if (profilExistant && profilExistant.est_actif === false) {
      console.log('🔄 Compte désactivé détecté -> Réactivation automatique du compte cauZon pour :', nomComplet);
    }

    let { error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' });

    // Si la colonne email n'est pas encore créée dans la table profiles, repli automatique sans email
    if (error && (error.message?.includes('email') || error.details?.includes('email'))) {
      delete payload.email;
      const resRepli = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'id' });
      error = resRepli.error;
    }

    if (error) {
      console.log('Note synchro profil Supabase :', error.message);
    } else {
      console.log('✅ Profil Google synchronisé et actif dans Supabase :', nomComplet, emailUtilisateur ? `(${emailUtilisateur})` : '');
    }

    // Mise à jour de l'empreinte matérielle dans appareils_historique_bienvenue
    if (deviceId) {
      try {
        await supabase
          .from('appareils_historique_bienvenue')
          .update({
            username: nomComplet,
            avatar_url: avatarUrl,
          })
          .eq('device_id', deviceId);
      } catch (_) {}
    }

    // Rattachement automatique des acquisitions locales de l'appareil au compte Google
    if (deviceId) {
      try {
        await supabase
          .from('acquisitions')
          .update({ user_id: user.id })
          .eq('device_id', deviceId)
          .is('user_id', null);
        console.log('🔗 Acquisitions de l\'appareil rattachées au compte utilisateur');
      } catch (acqLinkErr) {
        console.log('Note liaison acquisitions :', acqLinkErr);
      }
    }
  } catch (err: any) {
    console.error('Erreur synchronisation profil Google :', err.message);
  }
};
