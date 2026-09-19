import { Platform, Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { supabase } from '../lib/supabase';
import { avecTimeoutSecurise } from './serviceReseau';

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
 * Déclencheur direct et garanti de l'authentification Google OAuth pour le Web.
 * Redirige explicitement vers le sélecteur de compte Google via Supabase Auth.
 */
export const seConnecterAvecGoogleWeb = async (customRedirectUrl?: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const redirectUrl = customRedirectUrl || (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://app.cauzon.ci');
    console.log('🌐 [Google OAuth Web] Initialisation redirection Supabase vers :', redirectUrl);

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

    if (error) {
      console.error('❌ Erreur signInWithOAuth Web :', error.message);
      return { success: false, error: error.message };
    }

    if (data?.url && typeof window !== 'undefined') {
      console.log('🔄 Redirection du navigateur vers :', data.url);
      window.location.href = data.url;
    }

    return { success: true };
  } catch (err: any) {
    console.error('❌ Exception seConnecterAvecGoogleWeb :', err);
    return { success: false, error: err?.message || 'Erreur de connexion Google' };
  }
};

/**
 * Lance la connexion rapide via Google avec Supabase.
 * - Sur Web : Redirection OAuth dynamique capturant l'URL exacte du cours/page en cours.
 * - Sur Android : Boîte de dialogue native Google Play Services / One Tap (GoogleSignin + signInWithIdToken)
 * - Sur iOS : Boîte de dialogue Google OAuth avec openAuthSessionAsync
 */
export const connexionAvecGoogle = async (customRedirectUrl?: string): Promise<{ success: boolean; error?: string }> => {
  try {
    // 1. Plateforme Web : Authentification Google OAuth directe avec redirection vers les comptes Google
    if (Platform.OS === 'web') {
      return await seConnecterAvecGoogleWeb(customRedirectUrl);
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
      const res = await avecTimeoutSecurise(
        supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        }),
        3500,
        { data: { session: null, user: null }, error: new Error('Timeout setSession') } as any
      );

      if (res?.error) {
        console.error('❌ Erreur supabase.auth.setSession :', res.error.message);
        return false;
      }

      const sessionUser = res?.data?.session?.user || res?.data?.user;
      if (sessionUser) {
        console.log('✅ Session Supabase établie avec succès pour :', sessionUser.email);
        synchroniserProfilGoogle(sessionUser).catch(() => {});
        return true;
      }
      return false;
    }

    // 2. Code PKCE (?code=...)
    if (params.code) {
      console.log('🔐 Code PKCE extrait. Échange du code...');

      // Vérifier si la session est déjà établie (notamment via detectSessionInUrl automatique de Supabase)
      const sessionExistante = await avecTimeoutSecurise(
        supabase.auth.getSession(),
        1000,
        { data: { session: null }, error: null } as any
      );
      if (sessionExistante?.data?.session?.user) {
        console.log('✅ Session déjà active via Supabase detectSessionInUrl :', sessionExistante.data.session.user.email);
        synchroniserProfilGoogle(sessionExistante.data.session.user).catch(() => {});
        return true;
      }

      const res = await avecTimeoutSecurise(
        supabase.auth.exchangeCodeForSession(params.code),
        3500,
        { data: { session: null, user: null }, error: new Error('Timeout exchangeCodeForSession') } as any
      );

      const pkceUser = res?.data?.session?.user || res?.data?.user;
      if (!res?.error && pkceUser) {
        console.log('✅ Session PKCE établie pour :', pkceUser.email);
        synchroniserProfilGoogle(pkceUser).catch(() => {});
        return true;
      }

      // Tentative fallback avec URL complète si le code seul a retourné une erreur
      if (res?.error) {
        console.log('Tentative fallback échange code avec URL complète...');
        const fallbackRes = await avecTimeoutSecurise(
          supabase.auth.exchangeCodeForSession(url),
          2500,
          { data: { session: null, user: null }, error: null } as any
        );
        const fallbackUser = fallbackRes?.data?.session?.user || fallbackRes?.data?.user;
        if (fallbackUser) {
          synchroniserProfilGoogle(fallbackUser).catch(() => {});
          return true;
        }
      }

      // Contrôle final getSession() au cas où l'événement a été géré en tâche de fond
      const sessionFinale = await avecTimeoutSecurise(
        supabase.auth.getSession(),
        1000,
        { data: { session: null }, error: null } as any
      );
      if (sessionFinale?.data?.session?.user) {
        return true;
      }

      return false;
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
