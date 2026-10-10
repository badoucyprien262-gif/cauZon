import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../lib/supabase';
import { useCallback } from 'react';
import { useApp } from '../store/ContexteApp';

export interface OptionsEligibiliteAchat {
  utilisateur?: any | null;
  estConnecteGoogle?: boolean;
  afficherToast?: (message: string, titre?: string, type?: 'erreur' | 'succes' | 'info' | any) => void;
  onDeclencherAuth?: (motif?: 'achat' | 'vip' | 'bienvenue') => void;
  motif?: 'achat' | 'vip' | 'bienvenue';
}

/**
 * Vérifie instantanément l'état effectif de la connexion Internet :
 * - Web : vérifie navigator.onLine (synchrone et instantané)
 * - Mobile natif (Android/iOS) : NetInfo.fetch()
 */
export async function verifierEstEnLigne(): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine;
    }
    return true;
  }

  try {
    const netState = await Promise.race([
      NetInfo.fetch(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 800)),
    ]);

    if (!netState) {
      return true; // En cas de timeout de sonde sur réseau lent, ne pas bloquer par excès
    }

    return netState.isConnected !== false && netState.isInternetReachable !== false;
  } catch (_) {
    return true;
  }
}

/**
 * Garde Universelle d'Éligibilité à l'Achat / Paiement
 *
 * Règles strictes :
 * 1. Étape 1 : Contrôle de la connexion Internet (Online Guard)
 *    Si hors-ligne : bloque immédiatement + affiche le toast d'interdiction + retourne false
 *
 * 2. Étape 2 : Contrôle de l'authentification (Auth Guard)
 *    Si non authentifié : bloque immédiatement + ouvre la modale de connexion + retourne false
 *
 * 3. Étape 3 : Si en ligne ET authentifié -> retourne true pour autoriser le flux de paiement
 */
export async function verifierEligibiliteAchat(
  options: OptionsEligibiliteAchat = {}
): Promise<boolean> {
  // ── Étape 1 : Contrôle de la connexion Internet ─────────────────────────────
  const estEnLigne = await verifierEstEnLigne();
  if (!estEnLigne) {
    console.warn('[Paiement] Blocage : Tentative d’achat en mode hors-ligne.');
    if (options.afficherToast) {
      options.afficherToast(
        'Connexion Internet requise. Vous devez être connecté à Internet pour effectuer un paiement sécurisé.',
        'Hors-Ligne 📡',
        'erreur'
      );
    }
    return false;
  }

  // ── Étape 2 : Contrôle de l'authentification ────────────────────────────────
  let estAuthentifie = Boolean(options.utilisateur || options.estConnecteGoogle);

  // Vérification de secours via session Supabase active si les options ne précisent pas
  if (!estAuthentifie) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        estAuthentifie = true;
      }
    } catch (_) {}
  }

  if (!estAuthentifie) {
    console.warn('[Paiement] Blocage : Tentative d’achat par un utilisateur non authentifié.');
    if (options.onDeclencherAuth) {
      options.onDeclencherAuth(options.motif || 'achat');
    }
    return false;
  }

  // ── Étape 3 : Autorisation validée ──────────────────────────────────────────
  return true;
}

/**
 * Hook React pour utiliser facilement la garde d'éligibilité à l'achat
 * au sein de n'importe quel composant React / React Native.
 */
export function useEligibiliteAchat() {
  const { utilisateur, estConnecteGoogle, afficherToast } = useApp();

  const verifier = useCallback(
    async (params?: {
      onDeclencherAuth?: (motif?: 'achat' | 'vip' | 'bienvenue') => void;
      motif?: 'achat' | 'vip' | 'bienvenue';
    }): Promise<boolean> => {
      return verifierEligibiliteAchat({
        utilisateur,
        estConnecteGoogle,
        afficherToast: (msg, titre, type) => {
          afficherToast(msg, titre, type);
        },
        onDeclencherAuth: params?.onDeclencherAuth,
        motif: params?.motif,
      });
    },
    [utilisateur, estConnecteGoogle, afficherToast]
  );

  return { verifierEligibiliteAchat: verifier };
}
