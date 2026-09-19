import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Linking, Platform, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { couleursClair, couleursSombre } from '../theme/couleurs';
import { fetchMesDocuments, activerStockageEtendu, verifierEligibiliteOffreBienvenue, chargerBibliothequeLocale, chargerDocumentsImportes } from '../services/serviceDocument';
import { connexionAvecGoogle, deconnexionAuth, synchroniserProfilGoogle, gererUrlRetourAuth } from '../services/serviceAuth';
import { getPushTokenLocal, synchroniserPushTokenSupabase, verifierEtRenouvelerPushToken, synchroniserNotificationsManquees } from '../services/serviceNotifications';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../lib/supabase';
import ToastNotification, { ToastType } from '../components/ToastNotification';

// Clés de persistance locale permanente
const STORAGE_KEY_PHOTO = 'CAUZON_PHOTO_PROFIL';
const STORAGE_KEY_NOM = 'CAUZON_NOM_UTILISATEUR';
const STORAGE_KEY_TELEPHONE = 'CAUZON_TELEPHONE';
export const STORAGE_KEY_THEME = '@cauzon_theme_preference';

import { verifierConnexionReseauRapide, avecTimeoutSecurise } from '../services/serviceReseau';

export type PreferenceTheme = 'clair' | 'sombre' | 'systeme';

export interface ToastOptions {
  type?: ToastType;
  titre?: string;
  message: string;
  dureeMs?: number;
}

// ─────────────────────────────────────────────
// Types du contexte global
// ─────────────────────────────────────────────
interface AppContextType {
  docsDebloquesIds: string[];
  setDocsDebloquesIds: React.Dispatch<React.SetStateAction<string[]>>;
  acquisitions: any[];
  setAcquisitions: React.Dispatch<React.SetStateAction<any[]>>;
  documentsImportes: any[];
  setDocumentsImportes: React.Dispatch<React.SetStateAction<any[]>>;
  utilisateur: any | null;
  setUtilisateur: React.Dispatch<React.SetStateAction<any | null>>;
  debloquerDocument: (id: string) => void;
  reinitialiserDemo: () => void;
  desactiverCompte: () => Promise<{ success: boolean; message: string }>;
  couleurs: typeof couleursClair;
  modeTheme: 'light' | 'dark';
  preferenceTheme: PreferenceTheme;
  themeCharge: boolean;
  definirPreferenceTheme: (pref: PreferenceTheme) => Promise<void>;
  basculerTheme: () => void;
  afficherToast: (optionsOrMessage: ToastOptions | string, titre?: string, type?: ToastType, dureeMs?: number) => void;
  masquerToast: () => void;
  aAccesVip: boolean;
  nomUtilisateur: string;
  setNomUtilisateur: React.Dispatch<React.SetStateAction<string>>;
  emailUtilisateur: string;
  telephoneFacturation: string;
  photoProfil: string;
  estConnecteGoogle: boolean;
  estEligibleOffreBienvenue: boolean;
  consommerOffreBienvenueLocal: () => void;
  connexionGoogle: (customRedirectUrl?: string) => Promise<{ success: boolean; error?: string }>;
  deconnexion: () => Promise<void>;
  mettreAJourProfil: (nom: string, telephone: string, photo: string) => void;
  estVip: boolean;
  setEstVip: React.Dispatch<React.SetStateAction<boolean>>;
  aStockageEtendu: boolean;
  limiteStockage: number;               // Limite dynamique cumulative (75, 150, 225, 300...)
  chargementStockage: boolean;          // true pendant la vérif initiale du stockage
  sAbonnerVip: () => void;
  acheterExtensionStockage: () => Promise<void>;  // maintenant async + Supabase
  aReponseNonLue: boolean;
  marquerCommentairesCommeLus: () => void;
  estAbonneVIP: boolean;
  setEstAbonneVIP: React.Dispatch<React.SetStateAction<boolean>>;
  dateExpirationAbonnement: string | null;
  vipExpireAt: string | null;
  chargementVip: boolean;
  sAbonnerVIPFeexPay: (expirationDate: string) => void;
  sAbonnerVIPCinetPay: (expirationDate: string) => void;
  retirerDocumentDebloque: (id: string) => void;
  // Modération / Suspension
  estSuspendu: boolean;
  dateFinSuspension: string | null;
  motifSuspension: string | null;
  // État réseau ultra-rapide
  estEnLigne: boolean;
  // Tunnel d'authentification Google sécurisé
  chargementAuth: boolean;
  setChargementAuth: (val: boolean) => void;
  sessionVerifiee: boolean;
}

const ContexteApp = createContext<AppContextType | undefined>(undefined);

export const FournisseurApp: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [docsDebloquesIds, setDocsDebloquesIds] = useState<string[]>([]);
  const [acquisitions, setAcquisitions] = useState<any[]>([]);
  const [documentsImportes, setDocumentsImportes] = useState<any[]>([]);
  const [utilisateur, setUtilisateur] = useState<any | null>(null);
  const [nomUtilisateur, setNomUtilisateur] = useState<string>('Étudiant cauZon');
  const [emailUtilisateur, setEmailUtilisateur] = useState<string>('');
  const [telephoneFacturation, setTelephoneFacturation] = useState<string>('');
  const [photoProfil, setPhotoProfil] = useState<string>('avatar-1');
  const [estConnecteGoogle, setEstConnecteGoogle] = useState<boolean>(false);
  const [estEligibleOffreBienvenue, setEstEligibleOffreBienvenue] = useState<boolean>(false);
  const [estVip, setEstVip] = useState<boolean>(false);
  const [aStockageEtendu, setAStockageEtendu] = useState<boolean>(false);
  const [limiteStockage, setLimiteStockage] = useState<number>(75);

  // 🎨 Gestion pérenne du Thème (Clair / Sombre / Système)
  const systemColorScheme = useColorScheme();
  const [themeCharge, setThemeCharge] = useState<boolean>(false);
  const [preferenceTheme, setPreferenceTheme] = useState<PreferenceTheme>(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY_THEME) as PreferenceTheme | null;
        if (saved && (saved === 'clair' || saved === 'sombre' || saved === 'systeme')) {
          return saved;
        }
      } catch {}
    }
    return 'systeme';
  });

  // Calcul dynamique et réactif du mode effectif :
  // Si l'utilisateur a explicitement choisi 'clair' ou 'sombre', cette valeur DOIT impérativement primer et ne JAMAIS être supplantée par useColorScheme().
  const modeTheme: 'light' | 'dark' =
    preferenceTheme === 'clair'
      ? 'light'
      : preferenceTheme === 'sombre'
      ? 'dark'
      : systemColorScheme === 'dark'
      ? 'dark'
      : 'light';

  // 🏝️ Gestionnaire Toast "Dynamic Island" adaptatif global
  const [toastState, setToastState] = useState<{
    visible: boolean;
    type: ToastType;
    titre?: string;
    message: string;
    dureeMs?: number;
  }>({
    visible: false,
    type: 'succes',
    titre: undefined,
    message: '',
    dureeMs: 3200,
  });

  const afficherToast = useCallback(
    (optionsOrMessage: ToastOptions | string, titre?: string, type?: ToastType, dureeMs?: number) => {
      if (typeof optionsOrMessage === 'string') {
        const typeNorm = (type === 'success' ? 'succes' : type === 'error' ? 'erreur' : type) as 'succes' | 'erreur' | 'info';
        setToastState({
          visible: true,
          message: optionsOrMessage,
          titre: titre,
          type: typeNorm || 'succes',
          dureeMs: dureeMs || 3200,
        });
      } else {
        const typeNorm = (optionsOrMessage.type === 'success' ? 'succes' : optionsOrMessage.type === 'error' ? 'erreur' : optionsOrMessage.type) as 'succes' | 'erreur' | 'info';
        setToastState({
          visible: true,
          type: typeNorm || 'succes',
          titre: optionsOrMessage.titre,
          message: optionsOrMessage.message,
          dureeMs: optionsOrMessage.dureeMs || 3200,
        });
      }
    },
    []
  );

  const masquerToast = useCallback(() => {
    setToastState((prev) => ({ ...prev, visible: false }));
  }, []);

  const definirPreferenceTheme = async (nouvellePref: PreferenceTheme) => {
    setPreferenceTheme(nouvellePref);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_THEME, nouvellePref);
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY_THEME, nouvellePref);
      }
    } catch (err) {
      console.warn('Erreur sauvegarde preference theme :', err);
    }
  };

  const basculerTheme = () => {
    const nextPref: PreferenceTheme = modeTheme === 'dark' ? 'clair' : 'sombre';
    definirPreferenceTheme(nextPref);
  };

  const [aReponseNonLue, setAReponseNonLue] = useState<boolean>(true);
  const [estAbonneVIP, setEstAbonneVIP] = useState<boolean>(false);
  const [dateExpirationAbonnement, setDateExpirationAbonnement] = useState<string | null>(null);
  const [vipExpireAt, setVipExpireAt] = useState<string | null>(null);
  const [chargementVip, setChargementVip] = useState<boolean>(true);
  const [chargementStockage, setChargementStockage] = useState<boolean>(true);
  
  // États de modération / suspension
  const [estSuspendu, setEstSuspendu] = useState<boolean>(false);
  const [dateFinSuspension, setDateFinSuspension] = useState<string | null>(null);
  const [motifSuspension, setMotifSuspension] = useState<string | null>(null);

  // 🌐 Détection ultra-rapide de l'état réseau (Web synchrone / Mobile rapide)
  const [estEnLigne, setEstEnLigne] = useState<boolean>(() => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine;
    }
    return true;
  });

  // 🛡️ État du tunnel d'authentification (écran de chargement élégant aux couleurs cauZon)
  const [chargementAuth, setChargementAuth] = useState<boolean>(false);
  const [sessionVerifiee, setSessionVerifiee] = useState<boolean>(false);

  // ─────────────────────────────────────────────
  // INITIALISATION AU DÉMARRAGE & ÉCOUTEUR AUTH RÉSISTANT AUX DÉCONNEXIONS
  // ─────────────────────────────────────────────
  useEffect(() => {
    let linkSubscription: { remove: () => void } | null = null;
    let authSubscription: { unsubscribe: () => void } | null = null;
    let heartbeatInterval: any = null;
    let userRealtimeChannel: any = null;

    // ⏱️ Timeout de sécurité absolu (4s) : garantit le déblocage inconditionnel du Sas Web / Auth Guard
    const watchdogTimer = setTimeout(() => {
      setChargementAuth((chargement) => {
        if (chargement) {
          console.warn('⏱️ [Auth Watchdog] 4s écoulées : désactivation forcée de chargementAuth.');
        }
        return false;
      });
      setSessionVerifiee((verifiee) => {
        if (!verifiee) {
          console.warn('⏱️ [Auth Watchdog] 4s écoulées : validation forcée de la session pour libérer l\'interface.');
        }
        return true;
      });
    }, 4000);

    const initialiserApplication = async () => {
      try {
        // 1. Toujours charger le profil et statut VIP/Stockage depuis le cache local immédiatement
        try {
          await chargerProfilLocal();
        } catch (errProf) {
          console.warn('Note chargement profil local :', errProf);
        }

        // 2. Détection réseau ultra-rapide (500ms max sur mobile, 0ms sur Web)
        let connecte = true;
        try {
          connecte = await verifierConnexionReseauRapide();
        } catch (_) {}
        setEstEnLigne(connecte);

        // ─── FAST-PATH COURT-CIRCUIT HORS-LIGNE ───
        if (!connecte) {
          console.log('⚡ [Fast-Path Hors-Ligne] Pas de connexion Internet : chargement immédiat de la Bibliothèque locale.');
          // Charger immédiatement les documents débloqués depuis le cache local sans attendre Supabase
          try {
            const docsLocaux = await chargerBibliothequeLocale();
            const docsImportes = await chargerDocumentsImportes();
            const tousLesDocsLocaux = [...docsImportes, ...docsLocaux];
            if (tousLesDocsLocaux.length > 0) {
              setDocsDebloquesIds(tousLesDocsLocaux.map((d: any) => d.id));
            }
          } catch (_) {}
          setChargementVip(false);
          setChargementStockage(false);
          setChargementAuth(false);
          setSessionVerifiee(true);
          return;
        }

        // ─── MODE EN LIGNE : CHARGEMENT DISTANT AVEC TIMEOUTS SÉCURISÉS ───
        // Enveloppé dans avecTimeoutSecurise pour ne jamais bloquer sur réseau instable
        avecTimeoutSecurise(chargerStatutVIP(), 2500, undefined).catch(() => {});
        avecTimeoutSecurise(chargerAcquisitionsReelles(), 2500, undefined).catch(() => {});
        avecTimeoutSecurise(chargerEligibiliteBienvenue(), 2500, undefined).catch(() => {});

        // ⚡ Synchronisation de rattrapage des notifications hors-ligne (Effet WhatsApp)
        try {
          synchroniserNotificationsManquees({
            afficherToast: (opts) => afficherToast(opts.message, opts.titre, opts.type as any, opts.dureeMs),
          }).catch(() => {});
        } catch (_) {}

      // 0. Écouteur de Deep Links Google OAuth (Android / iOS)
      const handleDeepLink = async ({ url }: { url: string }) => {
        if (url && (url.includes('cauzon://') || url.includes('access_token=') || url.includes('code='))) {
          console.log('📲 Deep Link reçu dans ContexteApp :', url.substring(0, 60));
          setChargementAuth(true);
          try {
            const succes = await gererUrlRetourAuth(url);
            if (succes) {
              const { data: { session } } = await supabase.auth.getSession();
              if (session?.user) {
                console.log('✅ Session active synchronisée suite au Deep Link :', session.user.email);
                setEstConnecteGoogle(true);
                if (session.user.email) setEmailUtilisateur(session.user.email);
                const meta = session.user.user_metadata || {};
                const nomG = meta.full_name || meta.name || meta.given_name || session.user.email?.split('@')[0] || 'Étudiant cauZon';
                setNomUtilisateur(nomG);
                AsyncStorage.setItem(STORAGE_KEY_NOM, nomG).catch(() => {});
                const photoG = meta.avatar_url || meta.picture;
                if (photoG) {
                  setPhotoProfil(photoG);
                  AsyncStorage.setItem(STORAGE_KEY_PHOTO, photoG).catch(() => {});
                }
                setUtilisateur(session.user);
                AsyncStorage.setItem('cauzon_user_session', JSON.stringify(session.user)).catch(() => {});
                synchroniserProfilGoogle(session.user).catch(() => {});
                chargerStatutVIP().catch(() => {});
                chargerAcquisitionsReelles().catch(() => {});
                chargerEligibiliteBienvenue().catch(() => {});
              }
            }
          } catch (errDeepLink) {
            console.warn('⚠️ Erreur traitement Deep Link :', errDeepLink);
          } finally {
            setChargementAuth(false);
            setSessionVerifiee(true);
          }
        }
      };

      linkSubscription = Linking.addEventListener('url', handleDeepLink);
      Linking.getInitialURL().then((initUrl) => {
        if (initUrl) handleDeepLink({ url: initUrl });
      });

      // 1. Restauration proactive immédiate de la session persistée (avec timeout sécurisé)
      const initialiserSession = async () => {
        try {
          // Sur Web : détection, traitement sécurisé et nettoyage transparent des tokens dans l'URL
          if (Platform.OS === 'web' && typeof window !== 'undefined' && window?.location) {
            const currentUrl = window.location?.href || '';
            const storedUrl = typeof window.sessionStorage !== 'undefined' ? window.sessionStorage?.getItem('cauzon_oauth_redirect_url') : null;
            const hasAuthParams = currentUrl.includes('access_token=') || currentUrl.includes('code=') || currentUrl.includes('error=');
            const authUrl = storedUrl || (hasAuthParams ? currentUrl : null);

            if (authUrl) {
              setChargementAuth(true);
              try {
                if (typeof window.sessionStorage !== 'undefined') {
                  window.sessionStorage?.removeItem('cauzon_oauth_redirect_url');
                }
                // Nettoie IMMÉDIATEMENT les paramètres d'authentification de l'URL pour éviter toute boucle infinie au rechargement
                if (window?.history?.replaceState) {
                  const cleanUrl = window.location.origin + window.location.pathname;
                  window.history.replaceState({}, (typeof document !== 'undefined' ? document.title : '') || '', cleanUrl);
                }
              } catch (_) {}
              await gererUrlRetourAuth(authUrl);
            }
          }

          const { data: { session }, error } = await avecTimeoutSecurise(
            supabase.auth.getSession(),
            2000,
            { data: { session: null }, error: null } as any
          );

          if (!error && session?.user) {
            console.log('✅ Session Supabase active restaurée :', session.user.email);
            setEstConnecteGoogle(true);
            if (session.user.email) setEmailUtilisateur(session.user.email);
            setUtilisateur(session.user);
            AsyncStorage.setItem('cauzon_user_session', JSON.stringify(session.user)).catch(() => {});

            // Dès que la session est restaurée, libérer immédiatement l'attente sans bloquer sur les requêtes annexes
            setChargementAuth(false);
            setSessionVerifiee(true);

            // Synchronisation profil et droits en tâche de fond (non bloquante)
            (async () => {
              try {
                const { data: profilExistant } = await avecTimeoutSecurise(
                  Promise.resolve(
                    supabase
                      .from('profiles')
                      .select('est_actif, desactive_le, username, avatar_url, phone_number')
                      .eq('id', session.user.id)
                      .maybeSingle()
                  ),
                  2000,
                  { data: null, error: null } as any
                );

                if (profilExistant && profilExistant.est_actif === false) {
                  console.log('🔄 Compte désactivé détecté lors de la restauration -> Réactivation automatique...');
                  await supabase
                    .from('profiles')
                    .update({
                      est_actif: true,
                      desactive_le: null,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', session.user.id);
                }

                const meta = session.user.user_metadata || {};
                const nomG = profilExistant?.username || meta.full_name || meta.name || meta.given_name || session.user.email?.split('@')[0] || 'Étudiant cauZon';
                setNomUtilisateur(nomG);
                AsyncStorage.setItem(STORAGE_KEY_NOM, nomG).catch(() => {});

                const photoG = profilExistant?.avatar_url || meta.avatar_url || meta.picture;
                if (photoG) {
                  setPhotoProfil(photoG);
                  AsyncStorage.setItem(STORAGE_KEY_PHOTO, photoG).catch(() => {});
                }

                await avecTimeoutSecurise(synchroniserProfilGoogle(session.user), 2500, undefined).catch(() => {});
                await avecTimeoutSecurise(chargerStatutVIP(), 2500, undefined).catch(() => {});
                await avecTimeoutSecurise(chargerAcquisitionsReelles(), 2500, undefined).catch(() => {});
                await avecTimeoutSecurise(chargerEligibiliteBienvenue(), 2500, undefined).catch(() => {});
                verifierEtRenouvelerPushToken().catch(() => {});
              } catch (errBg) {
                console.warn('Note synchronisation profil arrière-plan :', errBg);
              }
            })();
          } else {
            setUtilisateur(null);
            AsyncStorage.removeItem('cauzon_user_session').catch(() => {});
            setChargementAuth(false);
            setSessionVerifiee(true);
            chargerStatutVIP().catch(() => {});
            chargerAcquisitionsReelles().catch(() => {});
            chargerEligibiliteBienvenue().catch(() => {});
          }
        } catch (errSession) {
          console.warn('⚠️ Info vérification session initiale :', errSession);
        } finally {
          setChargementAuth(false);
          setSessionVerifiee(true);
        }
      };

      await initialiserSession();

      // 2. Écouter les changements d'authentification Supabase de façon ciblée
      const authSubRes = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          if (session?.user) {
            setEstConnecteGoogle(true);
            if (session.user.email) setEmailUtilisateur(session.user.email);
            setUtilisateur(session.user);
            AsyncStorage.setItem('cauzon_user_session', JSON.stringify(session.user)).catch(() => {});

            // Libération instantanée de l'attente du sas / spinner
            setChargementAuth(false);
            setSessionVerifiee(true);

            try {
              // Vérification du statut Soft Delete à la connexion
              let userProf: any = null;
              try {
                const { data } = await avecTimeoutSecurise(
                  Promise.resolve(
                    supabase
                      .from('profiles')
                      .select('est_actif, desactive_le, username, avatar_url')
                      .eq('id', session.user.id)
                      .maybeSingle()
                  ),
                  2000,
                  { data: null, error: null } as any
                );
                userProf = data;

                if (userProf && userProf.est_actif === false) {
                  console.log('🔄 Réactivation automatique du compte utilisateur suite à SIGNED_IN');
                  await supabase
                    .from('profiles')
                    .update({
                      est_actif: true,
                      desactive_le: null,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', session.user.id);
                }
              } catch (reactivErr) {
                console.warn('Note réactivation profil :', reactivErr);
              }
              
              const meta = session.user.user_metadata || {};
              const nomG = userProf?.username || meta.full_name || meta.name || meta.given_name || session.user.email?.split('@')[0] || 'Étudiant cauZon';
              setNomUtilisateur(nomG);
              AsyncStorage.setItem(STORAGE_KEY_NOM, nomG).catch(() => {});

              const photoG = userProf?.avatar_url || meta.avatar_url || meta.picture;
              if (photoG) {
                setPhotoProfil(photoG);
                AsyncStorage.setItem(STORAGE_KEY_PHOTO, photoG).catch(() => {});
              }
              
              await avecTimeoutSecurise(synchroniserProfilGoogle(session.user), 2500, undefined).catch(() => {});
              await avecTimeoutSecurise(chargerStatutVIP(), 2500, undefined).catch(() => {});
              await avecTimeoutSecurise(chargerAcquisitionsReelles(), 2500, undefined).catch(() => {});
              await avecTimeoutSecurise(chargerEligibiliteBienvenue(), 2500, undefined).catch(() => {});

              // Resynchroniser immédiatement le push token de l'appareil dès la connexion
              verifierEtRenouvelerPushToken().catch(() => {});
              // Rattrapage des notifications & réponses administratives ciblées
              synchroniserNotificationsManquees({
                afficherToast: (opts) => afficherToast(opts.message, opts.titre, opts.type as any, opts.dureeMs),
              }).catch(() => {});
            } catch (errBgAuth) {
              console.warn('Note post-connexion arrière-plan :', errBgAuth);
            } finally {
              setChargementAuth(false);
              setSessionVerifiee(true);
            }
          }
        } else if (event === 'SIGNED_OUT') {
        setEstConnecteGoogle(false);
        setUtilisateur(null);
        setEmailUtilisateur('');
        setNomUtilisateur('Étudiant cauZon');
        setTelephoneFacturation('');
        setPhotoProfil('avatar-1');
        setEstVip(false);
        setEstAbonneVIP(false);
        setDateExpirationAbonnement(null);
        setVipExpireAt(null);
        setAStockageEtendu(false);
        setLimiteStockage(75);
        setDocsDebloquesIds([]);
        setAcquisitions([]);
        setDocumentsImportes([]);
        setChargementAuth(false);
        setSessionVerifiee(true);
        const clesPurge = [
          STORAGE_KEY_PHOTO,
          STORAGE_KEY_NOM,
          STORAGE_KEY_TELEPHONE,
          'cauzon_user_session',
          'CAUZON_PHOTO_PROFIL',
          'CAUZON_NOM_UTILISATEUR',
          'CAUZON_TELEPHONE',
          'cauzon_vip_status',
          'cauzon_storage_status',
          'cauzon_local_library_cache',
          'cauzon_documents_importes_cache',
          'cauzon_documents_hors_ligne',
          '@cauzon_documents_hors_ligne',
          '@cauzon_documents_importes',
          '@cauzon_vip',
          '@cauzon_acquisitions',
          '@cauzon_abonnements',
          '@cauzon_locations',
          '@cauzon_panier',
          'cauzon_panier',
          'CAUZON_PUSH_TOKEN',
          'CAUZON_NOTIF_PROMPT_DECIDED',
        ];
        AsyncStorage.multiRemove(clesPurge).catch(() => {});
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
          try {
            clesPurge.forEach((cle) => window.localStorage.removeItem(cle));
            Object.keys(window.localStorage).forEach((k) => {
              if (k.startsWith('@cauzon') || k.startsWith('cauzon') || k.startsWith('CAUZON')) {
                window.localStorage.removeItem(k);
              }
            });
          } catch (_) {}
        }
      }
    });
    authSubscription = authSubRes?.data?.subscription ?? null;

    // 3. Heartbeat silencieux : rafraîchit automatiquement le token en arrière-plan toutes les 15 min
    heartbeatInterval = setInterval(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          console.log('💓 Heartbeat session Supabase : token rafraîchi et valide');
        }
      } catch (errHeartbeat) {
        console.log('Info heartbeat auth :', errHeartbeat);
      }
    }, 15 * 60 * 1000);

    // 4. 📡 Écouteur Supabase Realtime Utilisateur (Synchronisation instantanée statut VIP, Stockage, Modération, Feedbacks)
    userRealtimeChannel = supabase
      .channel('cauzon-user-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          console.log('⚡ Changement profil détecté via Realtime -> Synchronisation locale');
          chargerStatutVIP();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'acquisitions' },
        () => {
          console.log('⚡ Changement acquisitions détecté via Realtime -> Actualisation bibliothèque');
          chargerAcquisitionsReelles();
          chargerEligibiliteBienvenue();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feedbacks' },
        () => {
          console.log('⚡ Réponse admin reçue sur feedback via Realtime');
          setAReponseNonLue(true);
        }
      )
      } catch (errInitGlobal) {
        console.warn('⚠️ Erreur globale non fatale lors de initialiserApplication :', errInitGlobal);
      } finally {
        setChargementVip(false);
        setChargementStockage(false);
        setChargementAuth(false);
        setSessionVerifiee(true);
      }
    }; // fin initialiserApplication

    try {
      initialiserApplication();
    } catch (e) {
      console.warn('Erreur invocation initialiserApplication :', e);
    }

    // 5. 🌐 Écouteur de connectivité réseau : rattrapage immédiat au retour en ligne (Effet WhatsApp)
    let etaitConnecte = true;
    let unsubscribeNetInfo: (() => void) | null = null;
    try {
      unsubscribeNetInfo = NetInfo.addEventListener((state) => {
        try {
          const connecteActuel = state.isConnected !== false && state.isInternetReachable !== false;
          setEstEnLigne(connecteActuel);
          if (connecteActuel && !etaitConnecte) {
            console.log('🌐 [Réseau] Reconnexion Internet détectée -> Rattrapage immédiat des notifications (Effet WhatsApp)');
            synchroniserNotificationsManquees({
              afficherToast: (opts) => afficherToast(opts.message, opts.titre, opts.type as any, opts.dureeMs),
            }).catch(() => {});
          }
          etaitConnecte = connecteActuel;
        } catch (e) {
          console.warn('Note callback NetInfo :', e);
        }
      });
    } catch (e) {
      console.warn('Note addEventListener NetInfo :', e);
    }

    return () => {
      try {
        if (linkSubscription) linkSubscription.remove();
        if (authSubscription) authSubscription.unsubscribe();
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (userRealtimeChannel) supabase.removeChannel(userRealtimeChannel);
        if (unsubscribeNetInfo) unsubscribeNetInfo();
      } catch (_) {}
    };
  }, []);


  /**
   * Charge immédiatement les données de profil depuis le stockage persistant local
   */
  /**
   * Charge immédiatement les données de profil depuis le stockage persistant local
   */
  const chargerProfilLocal = async () => {
    try {
      const stored = await AsyncStorage.multiGet([
        STORAGE_KEY_PHOTO,
        STORAGE_KEY_NOM,
        STORAGE_KEY_TELEPHONE,
        'cauzon_vip_status',
        'cauzon_storage_status',
        STORAGE_KEY_THEME,
        'cauzon_user_session',
      ]);
      const photo = stored[0][1];
      const nom = stored[1][1];
      const telephone = stored[2][1];
      const savedTheme = stored[5]?.[1] as PreferenceTheme | null;
      const savedUser = stored[6]?.[1];

      if (photo) setPhotoProfil(photo);
      if (nom) setNomUtilisateur(nom);
      if (telephone) setTelephoneFacturation(telephone);

      // ⚡ Hydratation instantanée de la session utilisateur en cache
      if (savedUser) {
        try {
          const userObj = JSON.parse(savedUser);
          if (userObj && userObj.id) {
            setUtilisateur(userObj);
            setEstConnecteGoogle(true);
            if (userObj.email) setEmailUtilisateur(userObj.email);
            console.log('⚡ [Fast-Path Cache] Utilisateur hydraté immédiatement depuis le stockage local :', userObj.email);
          }
        } catch (_) {}
      }

      // 🎨 Hydratation pérenne prioritaire de la préférence Thème (Clair / Sombre / Système)
      if (savedTheme && (savedTheme === 'clair' || savedTheme === 'sombre' || savedTheme === 'systeme')) {
        console.log('🎨 [Persistance Thème] Thème restauré depuis AsyncStorage :', savedTheme);
        setPreferenceTheme(savedTheme);
      }
      setThemeCharge(true);

      // Hydratation immédiate VIP
      if (stored[3][1]) {
        try {
          const vipCache = JSON.parse(stored[3][1]);
          if (vipCache.has_vip_pass && vipCache.vip_expiration_date) {
            const exp = new Date(vipCache.vip_expiration_date);
            const isActif = new Date() <= exp;
            setEstVip(isActif);
            setEstAbonneVIP(isActif);
            setVipExpireAt(vipCache.vip_expiration_date);
            if (isActif) setDateExpirationAbonnement(vipCache.date_affichage || exp.toLocaleDateString('fr-FR'));
          }
        } catch (_) {}
      }

      // Hydratation immédiate Stockage Étendu
      if (stored[4][1]) {
        try {
          const storageCache = JSON.parse(stored[4][1]);
          if (storageCache.has_extended_storage || storageCache.storage_limit) {
            setAStockageEtendu(Boolean(storageCache.has_extended_storage));
            setLimiteStockage(storageCache.storage_limit || 250);
          }
        } catch (_) {}
      }
    } catch (err) {
      console.warn('⚠️ Erreur lecture cache profil local :', err);
      setThemeCharge(true);
    }
  };

  const chargerEligibiliteBienvenue = async () => {
    try {
      const eligible = await verifierEligibiliteOffreBienvenue();
      setEstEligibleOffreBienvenue(eligible);
      console.log('🎁 Éligibilité offre de bienvenue (appareil) :', eligible ? 'DISPONIBLE' : 'DÉJÀ CONSOMMÉE');
    } catch (e) {
      setEstEligibleOffreBienvenue(false);
    }
  };

  const consommerOffreBienvenueLocal = () => {
    setEstEligibleOffreBienvenue(false);
  };




  // ─────────────────────────────────────────────
  // 1. Lecture du profil Supabase : VIP + Stockage + Modération (Source Unique de Vérité)
  // ─────────────────────────────────────────────
  const chargerStatutVIP = async () => {
    setChargementVip(true);
    setChargementStockage(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { getDeviceId } = await import('../services/serviceDocument');
      const deviceId = await getDeviceId();

      let profil: any = null;

      // 1. Profil utilisateur authentifié
      if (user) {
        const { data: userProfile, error: userErr } = await supabase
          .from('profiles')
          .select('has_vip_pass, vip_expiration_date, has_extended_storage, storage_limit, is_banned, banned_until, ban_reason, username, avatar_url, phone_number')
          .eq('id', user.id)
          .maybeSingle();

        if (!userErr && userProfile) {
          profil = userProfile;
        }
      }

      // 2. Repli persistant sur l'historique appareil (Device ID)
      if (!profil && deviceId) {
        const { data: devProfile, error: devErr } = await supabase
          .from('appareils_historique_bienvenue')
          .select('has_vip_pass, vip_expiration_date, has_extended_storage, storage_limit, username, avatar_url, phone_number')
          .eq('device_id', deviceId)
          .maybeSingle();

        if (!devErr && devProfile) {
          profil = devProfile;
        }
      }

      if (profil) {
        // ── Synchronisation Profil (Avatar, Nom, Téléphone) ───
        if (profil.avatar_url) {
          setPhotoProfil(profil.avatar_url);
          AsyncStorage.setItem(STORAGE_KEY_PHOTO, profil.avatar_url).catch(() => {});
        }
        if (profil.username) {
          setNomUtilisateur(profil.username);
          AsyncStorage.setItem(STORAGE_KEY_NOM, profil.username).catch(() => {});
        }
        if (profil.phone_number) {
          setTelephoneFacturation(profil.phone_number);
          AsyncStorage.setItem(STORAGE_KEY_TELEPHONE, profil.phone_number).catch(() => {});
        }

        // ── Modération / Bannissement ────────────────────────
        const isBanned: boolean = profil.is_banned ?? false;
        const bannedUntilISO: string | null = profil.banned_until ?? null;
        let suspendu = false;

        if (isBanned && bannedUntilISO) {
          const maintenant = new Date();
          const finBan = new Date(bannedUntilISO);
          suspendu = maintenant <= finBan;
        } else if (isBanned && !bannedUntilISO) {
          suspendu = true;
        }

        setEstSuspendu(suspendu);
        setDateFinSuspension(bannedUntilISO ? new Date(bannedUntilISO).toLocaleDateString('fr-FR') + ' à ' + new Date(bannedUntilISO).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'Définitif');
        setMotifSuspension(profil.ban_reason || 'Non respect des règles de la plateforme');

        // ── VIP ──────────────────────────────────────────────
        const hasVip: boolean = profil.has_vip_pass ?? false;
        const expireAtISO: string | null = profil.vip_expiration_date ?? null;
        let vipActif = false;

        if (hasVip && expireAtISO) {
          const maintenant = new Date();
          const dateExpiration = new Date(expireAtISO);
          vipActif = maintenant <= dateExpiration;
        } else if (hasVip && !expireAtISO) {
          vipActif = true;
        }

        setEstVip(vipActif);
        setEstAbonneVIP(vipActif);
        setVipExpireAt(expireAtISO);
        if (vipActif && expireAtISO) {
          setDateExpirationAbonnement(new Date(expireAtISO).toLocaleDateString('fr-FR'));
        }

        AsyncStorage.setItem('cauzon_vip_status', JSON.stringify({
          has_vip_pass: vipActif,
          vip_expiration_date: expireAtISO,
          date_affichage: expireAtISO ? new Date(expireAtISO).toLocaleDateString('fr-FR') : null,
        })).catch(() => {});

        // ── Stockage étendu ───────────────────────────────────
        const stockageEtendu: boolean = profil.has_extended_storage ?? false;
        const limiteStock: number = profil.storage_limit && profil.storage_limit >= 75 ? profil.storage_limit : (stockageEtendu ? 150 : 75);
        setAStockageEtendu(stockageEtendu);
        setLimiteStockage(limiteStock);

        AsyncStorage.setItem('cauzon_storage_status', JSON.stringify({
          has_extended_storage: stockageEtendu,
          storage_limit: limiteStock,
        })).catch(() => {});
      }

    } catch (err: any) {
      console.error('❌ Erreur inattendue lors du chargement du profil :', err.message);
    } finally {
      setChargementVip(false);
      setChargementStockage(false);
    }
  };


  // ─────────────────────────────────────────────
  // 2. Chargement des documents débloqués
  // ─────────────────────────────────────────────
  const chargerAcquisitionsReelles = async () => {
    try {
      const docs = await fetchMesDocuments();
      const imported = await chargerDocumentsImportes();
      const importedIds = (imported || []).map((d: any) => d.id);
      
      const officialDocs = (docs || []).filter((d: any) => !d.id?.startsWith('imported_'));
      setAcquisitions(officialDocs);
      setDocumentsImportes(imported || []);

      const allIds = Array.from(new Set([
        ...officialDocs.map((d: any) => d.id),
        ...importedIds
      ]));

      setDocsDebloquesIds(allIds);
      console.log('📡 Acquisitions réelles chargées :', allIds.length, 'document(s) (dont', importedIds.length, 'importés)');
    } catch (erreur) {
      console.error('❌ Erreur lors du chargement des acquisitions :', erreur);
      try {
        const imported = await chargerDocumentsImportes();
        const importedIds = (imported || []).map((d: any) => d.id);
        setDocumentsImportes(imported || []);
        setDocsDebloquesIds(importedIds);
      } catch (_) {
        setDocsDebloquesIds([]);
        setDocumentsImportes([]);
      }
      setAcquisitions([]);
    }
  };

  // ─────────────────────────────────────────────
  // Actions du contexte
  // ─────────────────────────────────────────────
  const debloquerDocument = (id: string) => {
    setDocsDebloquesIds((prev) => {
      if (prev.includes(id)) return prev;
      return [...prev, id];
    });
  };

  const reinitialiserDemo = () => {
    setDocsDebloquesIds([]);
    setAcquisitions([]);
    setDocumentsImportes([]);
    setUtilisateur(null);
    setEstVip(false);
    setAStockageEtendu(false);
    setLimiteStockage(75);
    definirPreferenceTheme('systeme');
    setPhotoProfil('avatar-1');
    setNomUtilisateur('Étudiant cauZon');
    setTelephoneFacturation('');
    setAReponseNonLue(false);
    setEstAbonneVIP(false);
    setDateExpirationAbonnement(null);
    setVipExpireAt(null);
    setEstConnecteGoogle(false);
    setEmailUtilisateur('');
  };

  const marquerCommentairesCommeLus = () => {
    setAReponseNonLue(false);
  };

  const mettreAJourProfil = async (nom: string, telephone: string, photo: string) => {
    setNomUtilisateur(nom);
    setTelephoneFacturation(telephone);
    setPhotoProfil(photo);

    // 1. Sauvegarde locale permanente immédiate
    await AsyncStorage.multiSet([
      [STORAGE_KEY_NOM, nom],
      [STORAGE_KEY_TELEPHONE, telephone],
      [STORAGE_KEY_PHOTO, photo],
    ]).catch((err) => console.warn('⚠️ Erreur AsyncStorage profil :', err));

    // 2. Persistance distante Supabase
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { getDeviceId } = await import('../services/serviceDocument');
      const deviceId = await getDeviceId();

      if (user) {
        await supabase
          .from('profiles')
          .update({
            avatar_url: photo,
            phone_number: telephone,
            username: nom,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);
      }

      if (deviceId) {
        await supabase
          .from('appareils_historique_bienvenue')
          .upsert({
            device_id: deviceId,
            avatar_url: photo,
            phone_number: telephone,
            username: nom,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'device_id' });
      }
    } catch (e: any) {
      console.warn('⚠️ Erreur mise à jour profil Supabase :', e.message);
    }
  };


  const sAbonnerVip = async () => {
    const { activerPassVIP } = await import('../services/serviceDocument');
    await activerPassVIP(30);
    await chargerStatutVIP();
    await chargerAcquisitionsReelles();
  };

  const sAbonnerVIPCinetPay = async (expirationDate: string) => {
    const { activerPassVIP } = await import('../services/serviceDocument');
    await activerPassVIP(30);
    await chargerStatutVIP();
    await chargerAcquisitionsReelles();
  };

  const acheterExtensionStockage = async (): Promise<void> => {
    // 1. Persister dans Supabase
    const { activerStockageEtendu } = await import('../services/serviceDocument');
    const result = await activerStockageEtendu();

    // 2. Mettre à jour l'état local immédiatement
    setAStockageEtendu(true);
    setLimiteStockage(result.nouveauPlafond || (limiteStockage + 75));

    // 3. Re-synchroniser avec Supabase
    await chargerStatutVIP();

    if (!result.success) {
      console.warn('⚠️ Stockage étendu activé localement mais erreur Supabase :', result.message);
    } else {
      console.log(`✅ Extension de stockage active : nouvelle limite passée à ${result.nouveauPlafond} documents.`);
    }
  };

  const retirerDocumentDebloque = (id: string) => {
    setDocsDebloquesIds((prev) => prev.filter((dId) => dId !== id));
    setAcquisitions((prev) => prev.filter((d) => d.id !== id));
    setDocumentsImportes((prev) => prev.filter((d) => d.id !== id));
  };

  const connexionGoogle = async (customRedirectUrl?: string) => {
    setChargementAuth(true);
    const res = await connexionAvecGoogle(customRedirectUrl);
    if (!res.success) {
      setChargementAuth(false);
    }
    return res;
  };

  const deconnexion = async () => {
    setEstConnecteGoogle(false);
    setUtilisateur(null);
    setEmailUtilisateur('');
    setNomUtilisateur('Étudiant cauZon');
    setTelephoneFacturation('');
    setPhotoProfil('avatar-1');
    setEstVip(false);
    setEstAbonneVIP(false);
    setDateExpirationAbonnement(null);
    setVipExpireAt(null);
    setAStockageEtendu(false);
    setLimiteStockage(75);
    setDocsDebloquesIds([]);
    setAcquisitions([]);
    setDocumentsImportes([]);

    await deconnexionAuth().catch(() => {});

    const clesAPurger = [
      STORAGE_KEY_PHOTO,
      STORAGE_KEY_NOM,
      STORAGE_KEY_TELEPHONE,
      'cauzon_user_session',
      'CAUZON_PHOTO_PROFIL',
      'CAUZON_NOM_UTILISATEUR',
      'CAUZON_TELEPHONE',
      'cauzon_vip_status',
      'cauzon_storage_status',
      'cauzon_local_library_cache',
      'cauzon_documents_importes_cache',
      'cauzon_documents_hors_ligne',
      '@cauzon_documents_hors_ligne',
      '@cauzon_documents_importes',
      '@cauzon_vip',
      '@cauzon_acquisitions',
      '@cauzon_abonnements',
      '@cauzon_locations',
      '@cauzon_panier',
      'cauzon_panier',
      'CAUZON_PUSH_TOKEN',
      'CAUZON_NOTIF_PROMPT_DECIDED',
    ];
    await AsyncStorage.multiRemove(clesAPurger).catch(() => {});
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      try {
        clesAPurger.forEach((cle) => window.localStorage.removeItem(cle));
        Object.keys(window.localStorage).forEach((k) => {
          if (k.startsWith('@cauzon') || k.startsWith('cauzon') || k.startsWith('CAUZON')) {
            window.localStorage.removeItem(k);
          }
        });
      } catch (_) {}
    }
  };

  /**
   * Désactivation atomique du compte :
   * 1. Mise à jour synchrone immédiate de tous les states en mémoire
   * 2. Purge intégrale du stockage local (AsyncStorage + localStorage)
   * 3. Appel Supabase de Soft Delete et signOut
   */
  const desactiverCompte = async (): Promise<{ success: boolean; message: string }> => {
    // 1. Mise à jour IMMÉDIATE de tous les states React en mémoire en un seul bloc synchrone
    setEstVip(false);
    setEstAbonneVIP(false);
    setDocsDebloquesIds([]);
    setAcquisitions([]);
    setDocumentsImportes([]);
    setUtilisateur(null);
    setNomUtilisateur('Étudiant cauZon');
    setEmailUtilisateur('');
    setTelephoneFacturation('');
    setPhotoProfil('avatar-1');
    setEstConnecteGoogle(false);
    setDateExpirationAbonnement(null);
    setVipExpireAt(null);
    setAStockageEtendu(false);
    setLimiteStockage(75);

    // 2. Exécute ensuite la purge du stockage local (AsyncStorage et localStorage.clear() pour les clés de session)
    const clesAPurger = [
      STORAGE_KEY_PHOTO,
      STORAGE_KEY_NOM,
      STORAGE_KEY_TELEPHONE,
      'CAUZON_PHOTO_PROFIL',
      'CAUZON_NOM_UTILISATEUR',
      'CAUZON_TELEPHONE',
      'cauzon_vip_status',
      'cauzon_storage_status',
      'cauzon_local_library_cache',
      'cauzon_documents_importes_cache',
      'cauzon_documents_hors_ligne',
      '@cauzon_documents_hors_ligne',
      '@cauzon_documents_importes',
      '@cauzon_vip',
      '@cauzon_acquisitions',
      '@cauzon_abonnements',
      '@cauzon_locations',
      '@cauzon_panier',
      'cauzon_panier',
      'CAUZON_PUSH_TOKEN',
      'CAUZON_NOTIF_PROMPT_DECIDED',
    ];

    await AsyncStorage.multiRemove(clesAPurger).catch(() => {});
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const cauzonKeys = allKeys.filter(
        (k) => k.startsWith('@cauzon') || k.startsWith('cauzon') || k.startsWith('CAUZON')
      );
      if (cauzonKeys.length > 0) {
        await AsyncStorage.multiRemove(cauzonKeys);
      }
    } catch (_) {}

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      try {
        clesAPurger.forEach((cle) => window.localStorage.removeItem(cle));
        Object.keys(window.localStorage).forEach((k) => {
          if (k.startsWith('@cauzon') || k.startsWith('cauzon') || k.startsWith('CAUZON')) {
            window.localStorage.removeItem(k);
          }
        });
      } catch (_) {}
    }

    // 3. Exécute l'appel Supabase de soft delete et supabase.auth.signOut()
    try {
      const { desactiverCompteUtilisateur } = await import('../services/serviceDocument');
      return await desactiverCompteUtilisateur();
    } catch (e: any) {
      console.error('Erreur appel distant désactivation :', e);
      return { success: true, message: 'Compte désactivé localement.' };
    }
  };

  const couleurs = modeTheme === 'light' ? couleursClair : couleursSombre;
  const aAccesVip = Boolean(estVip || estAbonneVIP || utilisateur?.has_vip_pass);

  return (
    <ContexteApp.Provider
      value={{
        docsDebloquesIds,
        setDocsDebloquesIds,
        acquisitions,
        setAcquisitions,
        documentsImportes,
        setDocumentsImportes,
        utilisateur,
        setUtilisateur,
        debloquerDocument,
        reinitialiserDemo,
        desactiverCompte,
        couleurs,
        modeTheme,
        preferenceTheme,
        themeCharge,
        definirPreferenceTheme,
        basculerTheme,
        afficherToast,
        masquerToast,
        aAccesVip,
        nomUtilisateur,
        setNomUtilisateur,
        emailUtilisateur,
        telephoneFacturation,
        photoProfil,
        estConnecteGoogle,
        estEligibleOffreBienvenue,
        consommerOffreBienvenueLocal,
        connexionGoogle,
        deconnexion,
        mettreAJourProfil,

        estVip,
        setEstVip,
        aStockageEtendu,
        limiteStockage,
        chargementStockage,
        sAbonnerVip,
        acheterExtensionStockage,
        aReponseNonLue,
        marquerCommentairesCommeLus,
        estAbonneVIP,
        setEstAbonneVIP,
        dateExpirationAbonnement,
        vipExpireAt,
        chargementVip,
        sAbonnerVIPFeexPay: sAbonnerVip,
        sAbonnerVIPCinetPay: sAbonnerVip,
        retirerDocumentDebloque,
        estSuspendu,
        dateFinSuspension,
        motifSuspension,
        estEnLigne,
        chargementAuth,
        setChargementAuth,
        sessionVerifiee,
      }}
    >
      {children}
      <ToastNotification
        visible={toastState.visible}
        type={toastState.type}
        titre={toastState.titre}
        message={toastState.message}
        dureeMs={toastState.dureeMs}
        onFermer={masquerToast}
      />
    </ContexteApp.Provider>
  );
};

export const useApp = () => {

  const contexte = useContext(ContexteApp);
  if (!contexte) {
    throw new Error('useApp doit être utilisé au sein d\'un FournisseurApp');
  }
  return contexte;
};
export { ContexteApp };


