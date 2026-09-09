import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

/**
 * Vérifie instantanément l'état de la connexion réseau :
 * - Sur Web : navigator.onLine synchrone instantané
 * - Sur Mobile : NetInfo.fetch() avec timeout de 500ms
 */
export const verifierConnexionReseauRapide = async (): Promise<boolean> => {
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine;
    }
    return true;
  }

  try {
    const netState = await Promise.race([
      NetInfo.fetch(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 500)),
    ]);

    if (!netState) {
      // Timeout de 500ms écoulé : supposer en ligne pour ne pas faussement bloquer
      return true;
    }

    return netState.isConnected !== false && netState.isInternetReachable !== false;
  } catch (_) {
    return true;
  }
};

/**
 * Exécute une promesse avec un timeout strict pour éviter les blocages sur réseau instable.
 * En cas de timeout ou d'erreur, renvoie la valeur de repli (fallback).
 */
export const avecTimeoutSecurise = async <T>(
  promesse: Promise<T>,
  delaiMs: number,
  fallback: T
): Promise<T> => {
  let timer: any = null;
  try {
    const timeoutPromise = new Promise<T>((resolve) => {
      timer = setTimeout(() => {
        resolve(fallback);
      }, delaiMs);
    });

    const resultat = await Promise.race([promesse, timeoutPromise]);
    return resultat;
  } catch (_) {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
};
