// ==============================================================================
// 📡 CauZon — Service Centralisé des Notifications Push (Expo Notifications)
// Fichier : src/services/serviceNotifications.ts
// ==============================================================================

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { getDeviceId } from './serviceDocument';
import { verifierConnexionReseauRapide } from './serviceReseau';

export const STORAGE_KEY_PUSH_TOKEN = 'CAUZON_PUSH_TOKEN';
export const STORAGE_KEY_NOTIF_ACTIVE = 'CAUZON_NOTIF_ACTIVE';
export const STORAGE_KEY_NOTIF_PROMPT_DONE = 'CAUZON_NOTIF_PROMPT_DECIDED';
export const STORAGE_KEY_NOTIF_PROMPT_TRAITE = '@cauzon_notif_prompt_traite';
export const STORAGE_KEY_DERNIERE_SYNCHRO_NOTIFS = '@cauzon_derniere_synchro_notifs';
export const STORAGE_KEY_NOTIFS_NOTIFIED_IDS = '@cauzon_notifs_notified_ids';
const EXPO_PROJECT_ID = '8bf68898-d1e1-4a72-9317-827af406386f';

/**
 * 1. Initialise le gestionnaire de notifications au premier plan (Foreground)
 * et configure le canal Android "default" haute priorité avec son et vibration.
 */
export const initialiserGestionnaireNotifications = async (): Promise<void> => {
  try {
    // Configuration foreground : alerte, son, badge, bannière
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    // Configuration du canal Android haute priorité
    if (Platform.OS === 'android') {
      try {
        // Canal principal "default" avec importance maximale (MAX)
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Notifications CauZon',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#6B1124',
          enableLights: true,
          enableVibrate: true,
          sound: 'default',
          showBadge: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          bypassDnd: true,
        });

        // Canal dédié aux annonces de révision & examens
        await Notifications.setNotificationChannelAsync('cauzon-annonces', {
          name: 'Annonces & Épreuves CauZon',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#6B1124',
          enableLights: true,
          enableVibrate: true,
          sound: 'default',
          showBadge: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          bypassDnd: true,
        });
      } catch (err) {
        console.warn('Erreur configuration canaux Android notifications :', err);
      }
    }
  } catch (errRoot) {
    console.warn('Erreur initialisation gestionnaire notifications :', errRoot);
  }
};

/**
 * 2. Vérifie le statut actuel des permissions sans déclencher de pop-up natif
 */
export const verifierStatutPermissionsNotifications = async (): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> => {
  if (Platform.OS === 'web') {
    const active = await AsyncStorage.getItem(STORAGE_KEY_NOTIF_ACTIVE);
    const granted = active === 'true';
    if (granted) {
      await AsyncStorage.setItem(STORAGE_KEY_NOTIF_PROMPT_TRAITE, 'true');
    }
    return { granted, canAskAgain: true };
  }

  try {
    const settings = await Notifications.getPermissionsAsync();
    const granted =
      settings.granted ||
      settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
      settings.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED;

    // Dès que la permission est accordée, marquer immédiatement le prompt comme traité
    if (granted) {
      await AsyncStorage.setItem(STORAGE_KEY_NOTIF_PROMPT_TRAITE, 'true');
    }

    return {
      granted,
      canAskAgain: settings.canAskAgain,
    };
  } catch (error) {
    console.warn('Erreur vérification permission notification :', error);
    return { granted: false, canAskAgain: true };
  }
};

/**
 * 3. Enregistre le token de notification push :
 * - Vérifie si l'appareil est physique (les simulateurs ne gèrent pas les push tokens)
 * - Demande la permission de manière contextuelle
 * - Récupère le jeton via Notifications.getExpoPushTokenAsync()
 * - Sauvegarde le token dans profiles.push_token et profiles.derniere_activite_notif
 * - Stocke localement CAUZON_NOTIF_ACTIVE = 'true'
 */
export const enregistrerPushToken = async (): Promise<{
  success: boolean;
  token?: string;
  error?: string;
}> => {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(STORAGE_KEY_NOTIF_ACTIVE, 'true');
    await AsyncStorage.setItem(STORAGE_KEY_NOTIF_PROMPT_TRAITE, 'true');
    return { success: true, token: 'WEB_PUSH_ACTIVE' };
  }

  try {
    // 1. Vérification appareil physique
    if (!Device.isDevice) {
      console.log('📱 Notifications : Exécution sur simulateur/émulateur.');
      await AsyncStorage.setItem(STORAGE_KEY_NOTIF_ACTIVE, 'true');
      await AsyncStorage.setItem(STORAGE_KEY_NOTIF_PROMPT_DONE, 'true');
      await AsyncStorage.setItem(STORAGE_KEY_NOTIF_PROMPT_TRAITE, 'true');
      return {
        success: true,
        token: 'SIMULATOR_EXPO_PUSH_TOKEN_CAUZON',
      };
    }

    // 2. Demande / Vérification de permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      await AsyncStorage.setItem(STORAGE_KEY_NOTIF_ACTIVE, 'false');
      await AsyncStorage.setItem(STORAGE_KEY_NOTIF_PROMPT_DONE, 'true');
      await AsyncStorage.setItem(STORAGE_KEY_NOTIF_PROMPT_TRAITE, 'true');
      return {
        success: false,
        error: "L'autorisation de notification n'a pas été accordée.",
      };
    }

    // 3. Récupération du jeton Expo Push Token officiel
    console.log('📱 [Push Mobile] Génération du push token avec projectId :', EXPO_PROJECT_ID);
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId: EXPO_PROJECT_ID,
    });
    const token = tokenResponse.data;

    if (!token) {
      console.error('❌ [Push Mobile] getExpoPushTokenAsync a retourné une valeur vide');
      return { success: false, error: 'Impossible de générer le jeton de notification.' };
    }

    console.log('📱 [Push Mobile] Jeton obtenu avec succès :', token);

    // 4. Sauvegarde locale persistante
    await AsyncStorage.setItem(STORAGE_KEY_PUSH_TOKEN, token);
    await AsyncStorage.setItem(STORAGE_KEY_NOTIF_ACTIVE, 'true');
    await AsyncStorage.setItem(STORAGE_KEY_NOTIF_PROMPT_DONE, 'true');
    await AsyncStorage.setItem(STORAGE_KEY_NOTIF_PROMPT_TRAITE, 'true');

    // 5. Synchronisation Supabase (profiles, push_tokens & feedbacks)
    await synchroniserPushTokenSupabase(token);

    console.log('✅ [Push Mobile] Push Token enregistré et synchronisé avec succès :', token);
    return { success: true, token };
  } catch (error: any) {
    console.error('❌ [Push Mobile] Erreur critique enregistrement push token :', error);
    return {
      success: false,
      error: error.message || 'Impossible de récupérer le token de notification.',
    };
  }
};

/**
 * Alias pour rétrocompatibilité avec les composants existants
 */
export const demanderPermissionNotifications = enregistrerPushToken;

/**
 * 4. Désactive les notifications push sur l'appareil
 */
export const desactiverPushToken = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_NOTIF_ACTIVE, 'false');
    await AsyncStorage.setItem(STORAGE_KEY_NOTIF_PROMPT_TRAITE, 'true');
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      await supabase
        .from('profiles')
        .update({
          push_token: null,
          derniere_activite_notif: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      console.log('🔕 [Push Mobile] Push token dissocié du profil utilisateur dans Supabase');
    }
  } catch (err) {
    console.warn('Note désactivation notifications :', err);
  }
};

/**
 * 5. Synchronise le token de notification push avec le backend Supabase
 * Met à jour profiles (push_token, derniere_activite_notif), push_tokens et feedbacks
 */
export const synchroniserPushTokenSupabase = async (token: string): Promise<void> => {
  if (!token || token.trim() === '') return;

  try {
    const deviceId = await getDeviceId();
    const { data: { user } } = await supabase.auth.getUser();
    const username = user?.user_metadata?.full_name || user?.user_metadata?.name || 'Étudiant cauZon';
    const nowIso = new Date().toISOString();

    console.log('🔄 [Push Mobile] Début synchronisation backend pour deviceId :', deviceId, 'user :', user?.email || 'Visiteur');

    // 1. Mise à jour de la table profiles si utilisateur connecté
    if (user?.id) {
      try {
        const { error: profErr } = await supabase
          .from('profiles')
          .update({
            push_token: token,
            derniere_activite_notif: nowIso,
            updated_at: nowIso,
          })
          .eq('id', user.id);

        if (!profErr) {
          console.log('✅ [Push Mobile] profiles.push_token mis à jour avec succès pour :', user.email);
        } else {
          console.log('ℹ️ [Push Mobile] Table profiles note (colonne push_token non créée ou RLS) :', profErr.message);
        }
      } catch (profErr: any) {
        console.warn('Note mise à jour profiles.push_token :', profErr?.message);
      }
    }

    // 2. Enregistrement dans la table dédiée push_tokens (tous appareils)
    try {
      const { error: tblErr } = await supabase
        .from('push_tokens')
        .upsert(
          [
            {
              device_id: deviceId,
              user_id: user?.id || null,
              push_token: token,
              plateforme: Platform.OS,
              updated_at: nowIso,
            },
          ],
          { onConflict: 'device_id' }
        );

      if (!tblErr) {
        console.log('✅ [Push Mobile] push_tokens upsert réussi pour deviceId :', deviceId);
      } else {
        console.log('ℹ️ [Push Mobile] Table push_tokens note (table non créée ou RLS) :', tblErr.message);
      }
    } catch (tblErr: any) {
      console.log('ℹ️ [Push Mobile] Table push_tokens non joignable :', tblErr?.message);
    }

    // 3. Enregistrement de secours dans feedbacks (toujours accessible sans restriction RLS)
    try {
      const { data: existants } = await supabase
        .from('feedbacks')
        .select('id')
        .eq('device_id', deviceId)
        .eq('statut', 'device_push_token')
        .limit(1);

      if (existants && existants.length > 0) {
        await supabase
          .from('feedbacks')
          .update({
            message: token,
            user_id: user?.id || null,
            username: username,
            updated_at: nowIso,
          })
          .eq('id', existants[0].id);
      } else {
        await supabase.from('feedbacks').insert([
          {
            device_id: deviceId,
            user_id: user?.id || null,
            username: username,
            message: token,
            statut: 'device_push_token',
            created_at: nowIso,
            updated_at: nowIso,
          },
        ]);
      }
      console.log('✅ [Push Mobile] Réservoir garanti feedbacks synchronisé avec succès');
    } catch (fbErr: any) {
      console.warn('Note enregistrement token feedbacks :', fbErr?.message);
    }

    console.log('✅ [Push Mobile] Synchronisation terminée pour token :', token);
  } catch (err: any) {
    console.warn('Note synchronisation token notification :', err.message);
  }
};

/**
 * 6. Vérifie et renouvelle automatiquement le token au démarrage
 */
export const verifierEtRenouvelerPushToken = async (): Promise<string | null> => {
  try {
    const statutActif = await AsyncStorage.getItem(STORAGE_KEY_NOTIF_ACTIVE);
    if (statutActif === 'false') return null;

    const { granted } = await verifierStatutPermissionsNotifications();
    if (!granted) return null;

    if (!Device.isDevice) {
      const cached = await getPushTokenLocal();
      if (cached) await synchroniserPushTokenSupabase(cached);
      return cached;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId: EXPO_PROJECT_ID,
    });
    const token = tokenResponse.data;
    if (token) {
      await AsyncStorage.setItem(STORAGE_KEY_PUSH_TOKEN, token);
      await AsyncStorage.setItem(STORAGE_KEY_NOTIF_ACTIVE, 'true');
      await synchroniserPushTokenSupabase(token);
      return token;
    }
    return null;
  } catch (err) {
    console.warn('Note vérification/renouvellement token :', err);
    return null;
  }
};

/**
 * 7. Utilitaires de stockage local
 */
export const getPushTokenLocal = async (): Promise<string | null> => {
  return AsyncStorage.getItem(STORAGE_KEY_PUSH_TOKEN);
};

export const aDejaReponduInviteNotification = async (): Promise<boolean> => {
  try {
    const traite = await AsyncStorage.getItem(STORAGE_KEY_NOTIF_PROMPT_TRAITE);
    if (traite === 'true') return true;

    const legacy = await AsyncStorage.getItem(STORAGE_KEY_NOTIF_PROMPT_DONE);
    if (legacy === 'true') {
      await AsyncStorage.setItem(STORAGE_KEY_NOTIF_PROMPT_TRAITE, 'true');
      return true;
    }

    const { granted } = await verifierStatutPermissionsNotifications();
    if (granted) {
      await AsyncStorage.setItem(STORAGE_KEY_NOTIF_PROMPT_TRAITE, 'true');
      return true;
    }

    return false;
  } catch {
    return true;
  }
};

export const marquerInviteNotificationTraitee = async (): Promise<void> => {
  try {
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEY_NOTIF_PROMPT_TRAITE, 'true'),
      AsyncStorage.setItem(STORAGE_KEY_NOTIF_PROMPT_DONE, 'true'),
    ]);
  } catch (err) {
    console.warn('Erreur marquer invite notification traitee :', err);
  }
};

let estEnTrainDeSynchroniser = false;

export interface OptionsSynchronisationNotifs {
  afficherToast?: (options: { message: string; titre?: string; type?: 'info' | 'success' | 'warning' | 'error'; dureeMs?: number }) => void;
  force?: boolean;
}

/**
 * 8. Synchronisation de rattrapage des notifications hors-ligne (Effet WhatsApp)
 * Interroge Supabase au retour de connexion ou au démarrage pour identifier
 * les annonces et réponses administratives manquées pendant la coupure réseau,
 * et déclenche immédiatement les notifications locales et Toasts in-app.
 */
export const synchroniserNotificationsManquees = async (
  options?: OptionsSynchronisationNotifs
): Promise<{ success: boolean; count: number }> => {
  if (estEnTrainDeSynchroniser && !options?.force) {
    return { success: true, count: 0 };
  }

  try {
    estEnTrainDeSynchroniser = true;

    // 1. Vérification rapide de l'état réseau
    const enLigne = await verifierConnexionReseauRapide();
    if (!enLigne) {
      estEnTrainDeSynchroniser = false;
      return { success: false, count: 0 };
    }

    // 2. Détermination de la borne temporelle de synchronisation (Dernière synchro ou fenêtre 24h par défaut)
    const derniereSynchroStr = await AsyncStorage.getItem(STORAGE_KEY_DERNIERE_SYNCHRO_NOTIFS);
    const fenetre24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const datePivot = derniereSynchroStr && derniereSynchroStr > fenetre24h ? derniereSynchroStr : fenetre24h;

    // 3. Récupération du registre local des IDs déjà notifiés (anti-doublon strict)
    let idsDejaNotifies: string[] = [];
    try {
      const idsRaw = await AsyncStorage.getItem(STORAGE_KEY_NOTIFS_NOTIFIED_IDS);
      if (idsRaw) {
        idsDejaNotifies = JSON.parse(idsRaw);
      }
    } catch (_) {}
    const setDejaNotifies = new Set<string>(idsDejaNotifies);

    let totalNouvellesNotifs = 0;
    const nowIso = new Date().toISOString();

    // 4. Rattrapage des annonces actives publiées pendant l'absence
    try {
      const { data: annonces, error: errAnnonces } = await supabase
        .from('annonces_bannieres')
        .select('id, title, message, titre_bande, contenu_detaille, type_importance, date_debut, date_fin, statut, created_at, document_id_associe')
        .eq('statut', 'actif')
        .gt('created_at', datePivot)
        .order('created_at', { ascending: true });

      if (!errAnnonces && annonces && annonces.length > 0) {
        for (const annonce of annonces) {
          // Filtrer les annonces expirées
          if (annonce.date_fin && new Date(annonce.date_fin).getTime() < Date.now()) {
            continue;
          }

          const uniqueKey = `annonce_${annonce.id}`;
          if (setDejaNotifies.has(uniqueKey)) continue;

          const titre = annonce.titre_bande || annonce.title || 'Annonce CauZon 📢';
          const corps = annonce.contenu_detaille || annonce.message || 'Une nouvelle annonce est disponible sur CauZon.';
          const payload = {
            route: 'Bibliotheque',
            cible: 'Bibliotheque',
            document_id: annonce.document_id_associe || undefined,
            type: 'annonce',
            annonce_id: annonce.id,
          };

          // Déclenchement notification locale native (Effet WhatsApp dans le tiroir système)
          if (Platform.OS !== 'web') {
            try {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: titre,
                  body: corps,
                  sound: 'default',
                  priority: Notifications.AndroidNotificationPriority.MAX,
                  data: payload,
                },
                trigger: null,
              });
            } catch (errSched) {
              console.warn('Note émission notification locale annonce :', errSched);
            }
          }

          // Déclenchement du Toast in-app visuel
          if (options?.afficherToast) {
            options.afficherToast({
              type: 'info',
              titre,
              message: corps,
              dureeMs: 5000,
            });
          }

          setDejaNotifies.add(uniqueKey);
          totalNouvellesNotifs++;
        }
      }
    } catch (errAnnonces) {
      console.warn('Note rattrapage annonces_bannieres :', errAnnonces);
    }

    // 5. Rattrapage des réponses administratives reçues sur les feedbacks
    try {
      let userId: string | null = null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        userId = session?.user?.id || null;
      } catch (_) {}
      const deviceId = await getDeviceId();

      let requeteFb = supabase
        .from('feedbacks')
        .select('id, user_id, device_id, reponse, repondu_a, updated_at, message')
        .not('reponse', 'is', null);

      if (userId && deviceId) {
        requeteFb = requeteFb.or(`user_id.eq.${userId},device_id.eq.${deviceId}`);
      } else if (deviceId) {
        requeteFb = requeteFb.eq('device_id', deviceId);
      } else if (userId) {
        requeteFb = requeteFb.eq('user_id', userId);
      }

      const { data: feedbacks, error: errFb } = await requeteFb;

      if (!errFb && feedbacks && feedbacks.length > 0) {
        for (const fb of feedbacks) {
          const dateActivite = fb.updated_at || fb.repondu_a;
          if (!dateActivite || dateActivite <= datePivot) continue;

          const uniqueKey = `feedback_${fb.id}_${dateActivite}`;
          if (setDejaNotifies.has(uniqueKey)) continue;

          const titre = 'Administration CauZon 📩';
          const corps = fb.reponse || "L'équipe administrative a répondu à votre message.";
          const payload = {
            route: 'Parametres',
            cible: 'Parametres',
            feedback_id: fb.id,
            type: 'reponse_admin',
          };

          if (Platform.OS !== 'web') {
            try {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: titre,
                  body: corps,
                  sound: 'default',
                  priority: Notifications.AndroidNotificationPriority.MAX,
                  data: payload,
                },
                trigger: null,
              });
            } catch (errSched) {
              console.warn('Note émission notification locale feedback :', errSched);
            }
          }

          if (options?.afficherToast) {
            options.afficherToast({
              type: 'success',
              titre,
              message: corps,
              dureeMs: 6000,
            });
          }

          setDejaNotifies.add(uniqueKey);
          totalNouvellesNotifs++;
        }
      }
    } catch (errFb) {
      console.warn('Note rattrapage feedbacks :', errFb);
    }

    // 6. Mise à jour de la date de synchronisation et de la liste des identifiants notifiés
    const listeMaj = Array.from(setDejaNotifies).slice(-100);
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEY_DERNIERE_SYNCHRO_NOTIFS, nowIso),
      AsyncStorage.setItem(STORAGE_KEY_NOTIFS_NOTIFIED_IDS, JSON.stringify(listeMaj)),
    ]);

    if (totalNouvellesNotifs > 0) {
      console.log(`⚡ [Effet WhatsApp] ${totalNouvellesNotifs} notification(s) manquée(s) synchronisée(s) avec succès.`);
    }

    return { success: true, count: totalNouvellesNotifs };
  } catch (errGlobal) {
    console.warn('Erreur synchronisation notifications manquées :', errGlobal);
    return { success: false, count: 0 };
  } finally {
    estEnTrainDeSynchroniser = false;
  }
};

/**
 * 9. Planifie une notification locale de rappel d'expiration VIP à J-2 (48 heures avant l'échéance).
 * Sur mobile natif uniquement (vérifié via Platform.OS !== 'web').
 */
export const programmerRappelExpirationVIP = async (dateExpiration: Date | string): Promise<void> => {
  if (Platform.OS === 'web') return;

  try {
    const dateExp = typeof dateExpiration === 'string' ? new Date(dateExpiration) : dateExpiration;
    if (isNaN(dateExp.getTime())) return;

    // Calcul de la date de rappel 48h (J-2) avant l'échéance
    const triggerDate = new Date(dateExp.getTime() - 48 * 60 * 60 * 1000);
    const now = Date.now();

    // Ne planifier que si l'échéance de rappel est encore dans le futur
    if (triggerDate.getTime() <= now) {
      console.log('ℹ️ [Notification VIP] Date J-2 déjà passée ou trop proche, pas de rappel programmé.');
      return;
    }

    // Annuler les notifications locales de rappel VIP précédemment programmées pour éviter les doublons
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const notif of scheduled) {
        if (notif.content.data?.type === 'rappel_vip_j2') {
          await Notifications.cancelScheduledNotificationAsync(notif.identifier);
        }
      }
    } catch (errCancel) {
      console.warn('Note nettoyage anciens rappels VIP :', errCancel);
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "👑 Échéance Pass VIP cauZon",
        body: "Votre formule de location expire dans 48h. Renouvelez-la pour conserver vos cours actifs !",
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: {
          type: 'rappel_vip_j2',
          route: 'Bibliotheque',
          cible: 'ModaleVip',
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    });

    console.log(`✅ [Notification VIP] Rappel local J-2 programmé pour le ${triggerDate.toLocaleString('fr-FR')}`);
  } catch (error) {
    console.warn('Erreur programmation rappel expiration VIP :', error);
  }
};

// Ré-export des utilitaires d'émission haute priorité FlashScore
export {
  envoyerNotificationFlashScore,
  notifierNouveauDocumentDisponible,
  notifierAlerteExamen,
} from './serviceEnvoiNotification';

