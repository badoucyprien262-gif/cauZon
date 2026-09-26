// ==============================================================================
// CauZon — Service d'Intégration Google One Tap (Google Identity Services Web)
// Fichier : src/services/serviceGoogleOneTap.ts
// Plateformes : Web et PWA uniquement (Desktop, Tablette, Mobile Web)
// ==============================================================================

import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { GOOGLE_WEB_CLIENT_ID, synchroniserProfilGoogle } from './serviceAuth';

/**
 * Charge dynamiquement le script officiel Google Identity Services (GIS)
 * si celui-ci n'est pas déjà présent et prêt dans le DOM de la page.
 */
export const chargerScriptGoogleGsi = (): Promise<boolean> => {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(false);
  }

  if ((window as any).google?.accounts?.id) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const existing = document.getElementById('google-gsi-client') as HTMLScriptElement | null;
    if (existing) {
      if ((window as any).google?.accounts?.id) {
        resolve(true);
        return;
      }
      existing.addEventListener('load', () => resolve(true), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });

      // Timeout de sécurité au cas où l'événement n'est pas déclenché
      setTimeout(() => {
        resolve(Boolean((window as any).google?.accounts?.id));
      }, 2500);
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-gsi-client';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(true);
    script.onerror = (e) => {
      console.warn('⚠️ [OneTap] Impossible de charger le SDK Google Identity Services :', e);
      resolve(false);
    };
    document.head.appendChild(script);
  });
};

/**
 * Authentifie l'utilisateur auprès de Supabase via son jeton ID Token Google
 * (signInWithIdToken) sans aucune redirection de page.
 */
export const authentifierParGoogleIdToken = async (idToken: string) => {
  if (!idToken) {
    throw new Error('Jeton Google One Tap (credential) manquant');
  }

  console.log('✨ [OneTap] ID Token Google reçu. Authentification Supabase en cours...');
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });

  if (error) {
    console.error('❌ [OneTap Auth Error] signInWithIdToken a échoué :', error.message);
    throw error;
  }

  if (data?.user) {
    console.log('✅ [OneTap] Connexion instantanée réussie pour :', data.user.email);
    synchroniserProfilGoogle(data.user).catch((err) => {
      console.warn('⚠️ [OneTap] Échec synchronisation profil :', err);
    });
  }

  return data;
};

export interface OptionsGoogleOneTap {
  onSuccess?: (user: any) => void;
  onError?: (error: any) => void;
  onNotDisplayed?: (reason: string) => void;
  autoPrompt?: boolean;
}

/**
 * Initialise le client Google Identity Services avec le Web Client ID OAuth
 * et prépare l'écouteur de réponse One Tap.
 */
export const initialiserGoogleOneTap = async (
  options: OptionsGoogleOneTap = {}
): Promise<boolean> => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return false;
  }

  const pret = await chargerScriptGoogleGsi();
  if (!pret || !(window as any).google?.accounts?.id) {
    console.log('⚠️ [OneTap] SDK Google Identity Services non disponible.');
    return false;
  }

  const clientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || GOOGLE_WEB_CLIENT_ID;

  try {
    /* global google */
    (window as any).google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response: any) => {
        try {
          const idToken = response?.credential;
          const authData = await authentifierParGoogleIdToken(idToken);
          if (options.onSuccess) {
            options.onSuccess(authData?.user);
          }
        } catch (err) {
          if (options.onError) {
            options.onError(err);
          }
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
      context: 'signin',
    });

    if (options.autoPrompt !== false) {
      afficherGoogleOneTap(options.onNotDisplayed);
    }

    return true;
  } catch (err) {
    console.error('⚠️ [OneTap] Erreur lors de l\'initialisation One Tap :', err);
    return false;
  }
};

/**
 * Déclenche l'affichage visuel de l'invite One Tap :
 * - PC / Desktop : Bulle élégante en haut à droite
 * - Mobile Web / PWA : Bottom Sheet moderne glissant depuis le bas
 */
export const afficherGoogleOneTap = (
  onNotDisplayed?: (reason: string) => void
) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !(window as any).google?.accounts?.id) {
    return;
  }

  try {
    (window as any).google.accounts.id.prompt((notification: any) => {
      const isNotDisplayed = notification?.isNotDisplayed?.();
      const isSkipped = notification?.isSkippedMoment?.();

      if (isNotDisplayed || isSkipped) {
        const reason = notification?.getNotDisplayedReason?.() || notification?.getSkippedReason?.() || 'inconnu';
        console.log('[OneTap] Non affiché ou ignoré :', reason);
        if (onNotDisplayed) {
          onNotDisplayed(reason);
        }
      } else {
        console.log('🎯 [OneTap] Widget One Tap affiché à l\'écran.');
      }
    });
  } catch (err) {
    console.warn('⚠️ [OneTap] Erreur lors de l\'appel à prompt() :', err);
  }
};

/**
 * Annule l'invite One Tap en cours (nettoyage)
 */
export const annulerGoogleOneTap = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && (window as any).google?.accounts?.id) {
    try {
      (window as any).google.accounts.id.cancel();
    } catch (_) {}
  }
};
