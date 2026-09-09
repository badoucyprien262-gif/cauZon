// ==============================================================================
// 🚀 CauZon — Service d'Émission Haute Priorité ("FlashScore")
// Fichier : src/services/serviceEnvoiNotification.ts
// ==============================================================================

import { supabase } from '../lib/supabase';

export interface NotificationPayloadData {
  document_id?: string;
  route?: string;
  cible?: string;
  [key: string]: any;
}

export interface OptionsNotificationPush {
  titre: string;
  corps: string;
  donnees?: NotificationPayloadData;
  tokens?: string[];
  userId?: string;
  envoyerATous?: boolean;
}

export interface ExpoPushMessage {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  priority: 'high';
  ttl?: number;
  channelId: 'default';
  _displayInForeground: boolean;
  data: Record<string, any>;
}

export interface ResultatEnvoiPush {
  succes: boolean;
  totalEnvoyes: number;
  totalSucces: number;
  totalEchecs: number;
  details?: any[];
  erreur?: string;
}

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Valide le format d'un token Expo Push.
 */
export const estTokenExpoValide = (token: string): boolean => {
  return (
    typeof token === 'string' &&
    (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken['))
  );
};

/**
 * Récupère les tokens cibles depuis Supabase (table push_tokens avec repli sur profiles).
 */
export const recupererTokensDestinataires = async (options: {
  userId?: string;
  envoyerATous?: boolean;
}): Promise<string[]> => {
  const tokensTrouves = new Set<string>();

  try {
    // 1. Recherche dans la table dédiée push_tokens (actifs uniquement)
    let requetePushTokens = supabase
      .from('push_tokens')
      .select('token')
      .eq('est_actif', true);

    if (options.userId) {
      requetePushTokens = requetePushTokens.eq('user_id', options.userId);
    }

    const { data: dataPushTokens, error: errPushTokens } = await requetePushTokens;
    if (!errPushTokens && dataPushTokens) {
      dataPushTokens.forEach((row: { token: string }) => {
        if (row.token && estTokenExpoValide(row.token)) {
          tokensTrouves.add(row.token);
        }
      });
    }

    // 2. Repli / complément depuis la colonne profiles.push_token
    let requeteProfiles = supabase
      .from('profiles')
      .select('push_token')
      .not('push_token', 'is', null);

    if (options.userId) {
      requeteProfiles = requeteProfiles.eq('id', options.userId);
    }

    const { data: dataProfiles, error: errProfiles } = await requeteProfiles;
    if (!errProfiles && dataProfiles) {
      dataProfiles.forEach((row: { push_token: string | null }) => {
        if (row.push_token && estTokenExpoValide(row.push_token)) {
          tokensTrouves.add(row.push_token);
        }
      });
    }
  } catch (err) {
    console.warn('Erreur lors de la récupération des push tokens :', err);
  }

  return Array.from(tokensTrouves);
};

/**
 * Désactive un token obsolète ou désinstallé (DeviceNotRegistered).
 */
export const desactiverTokenInvalide = async (token: string): Promise<void> => {
  try {
    await supabase
      .from('push_tokens')
      .update({ est_actif: false, derniere_activite: new Date().toISOString() })
      .eq('token', token);

    await supabase
      .from('profiles')
      .update({ push_token: null })
      .eq('push_token', token);
  } catch (err) {
    console.warn(`Impossible de désactiver le token obsolète [${token}] :`, err);
  }
};

/**
 * Envoie une notification haute priorité de type "FlashScore"
 * Capable de réveiller un appareil même si l'application est tuée / fermée.
 */
export const envoyerNotificationFlashScore = async (
  options: OptionsNotificationPush
): Promise<ResultatEnvoiPush> => {
  try {
    let tokensCibles: string[] = [];

    // Priorité aux tokens fournis explicitement
    if (options.tokens && options.tokens.length > 0) {
      tokensCibles = options.tokens.filter(estTokenExpoValide);
    } else {
      tokensCibles = await recupererTokensDestinataires({
        userId: options.userId,
        envoyerATous: options.envoyerATous ?? true,
      });
    }

    if (tokensCibles.length === 0) {
      return {
        succes: true,
        totalEnvoyes: 0,
        totalSucces: 0,
        totalEchecs: 0,
        erreur: 'Aucun token valide trouvé pour cette cible.',
      };
    }

    // Construction stricte de la charge utile haute priorité ("FlashScore") avec rétention 24h
    const messages: ExpoPushMessage[] = tokensCibles.map((token) => ({
      to: token,
      sound: 'default',
      title: options.titre,
      body: options.corps,
      priority: 'high',
      ttl: 86400,
      channelId: 'default',
      _displayInForeground: true,
      data: {
        ...(options.donnees || {}),
        document_id: options.donnees?.document_id,
        route: options.donnees?.route || 'Bibliotheque',
        cible: options.donnees?.cible || options.donnees?.route || 'Bibliotheque',
      },
    }));

    // Envoi par paquets de 100 max (recommandation officielle Expo)
    const TAILLE_LOT = 100;
    const tousLesTickets: any[] = [];
    let succesCount = 0;
    let echecCount = 0;

    for (let i = 0; i < messages.length; i += TAILLE_LOT) {
      const lot = messages.slice(i, i + TAILLE_LOT);

      const reponse = await fetch(EXPO_PUSH_API_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(lot),
      });

      if (!reponse.ok) {
        const erreurTexte = await reponse.text();
        console.error(`Erreur HTTP Expo Push (${reponse.status}) :`, erreurTexte);
        echecCount += lot.length;
        continue;
      }

      const resultatJson = await reponse.json();
      const tickets = resultatJson?.data || [];

      // Analyse des tickets pour détecter les tokens désinstallés
      for (let j = 0; j < tickets.length; j++) {
        const ticket = tickets[j];
        const tokenAssocie = lot[j]?.to;

        tousLesTickets.push(ticket);

        if (ticket.status === 'ok') {
          succesCount++;
        } else {
          echecCount++;
          if (ticket.details?.error === 'DeviceNotRegistered' && tokenAssocie) {
            // Nettoyage en arrière-plan
            desactiverTokenInvalide(tokenAssocie).catch(() => {});
          }
        }
      }
    }

    return {
      succes: succesCount > 0,
      totalEnvoyes: messages.length,
      totalSucces: succesCount,
      totalEchecs: echecCount,
      details: tousLesTickets,
    };
  } catch (erreur: any) {
    console.error("Échec critique lors de l'envoi de notification push :", erreur);
    return {
      succes: false,
      totalEnvoyes: 0,
      totalSucces: 0,
      totalEchecs: 0,
      erreur: erreur?.message || 'Erreur inconnue lors de la transmission.',
    };
  }
};

/**
 * Helper rapide : Alerte d'un nouveau cours ou épreuve disponible
 */
export const notifierNouveauDocumentDisponible = async (
  documentId: string,
  titreDocument: string,
  matiere?: string
): Promise<ResultatEnvoiPush> => {
  return envoyerNotificationFlashScore({
    titre: '📚 Nouveau document disponible !',
    corps: matiere ? `[${matiere}] ${titreDocument}` : titreDocument,
    donnees: {
      document_id: documentId,
      route: 'Bibliotheque',
      cible: 'DocumentViewer',
    },
    envoyerATous: true,
  });
};

/**
 * Helper rapide : Alerte pour les révisions ou session d'examens
 */
export const notifierAlerteExamen = async (
  titre: string,
  message: string,
  routeCible: string = 'Catalogue'
): Promise<ResultatEnvoiPush> => {
  return envoyerNotificationFlashScore({
    titre,
    corps: message,
    donnees: {
      route: routeCible,
      cible: routeCible,
    },
    envoyerATous: true,
  });
};
