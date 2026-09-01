import React, { createContext, useContext, useState, useEffect } from 'react';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { couleursClair, couleursSombre } from '../theme/couleurs';
import { fetchMesDocuments, activerStockageEtendu, verifierEligibiliteOffreBienvenue } from '../services/serviceDocument';
import { connexionAvecGoogle, deconnexionAuth, synchroniserProfilGoogle, gererUrlRetourAuth } from '../services/serviceAuth';
import { supabase } from '../lib/supabase';

// Clés de persistance locale permanente
const STORAGE_KEY_PHOTO = 'CAUZON_PHOTO_PROFIL';
const STORAGE_KEY_NOM = 'CAUZON_NOM_UTILISATEUR';
const STORAGE_KEY_TELEPHONE = 'CAUZON_TELEPHONE';

// ─────────────────────────────────────────────
// Types du contexte global
// ─────────────────────────────────────────────
interface AppContextType {
  docsDebloquesIds: string[];
  debloquerDocument: (id: string) => void;
  reinitialiserDemo: () => void;
  couleurs: typeof couleursClair;
  modeTheme: 'light' | 'dark';
  basculerTheme: () => void;
  nomUtilisateur: string;
  emailUtilisateur: string;
  telephoneFacturation: string;
  photoProfil: string;
  estConnecteGoogle: boolean;
  estEligibleOffreBienvenue: boolean;
  consommerOffreBienvenueLocal: () => void;
  connexionGoogle: () => Promise<{ success: boolean; error?: string }>;
  deconnexion: () => Promise<void>;
  mettreAJourProfil: (nom: string, telephone: string, photo: string) => void;
  estVip: boolean;
  aStockageEtendu: boolean;
  limiteStockage: number;               // Limite dynamique cumulative (75, 150, 225, 300...)
  chargementStockage: boolean;          // true pendant la vérif initiale du stockage
  sAbonnerVip: () => void;
  acheterExtensionStockage: () => Promise<void>;  // maintenant async + Supabase
  aReponseNonLue: boolean;
  marquerCommentairesCommeLus: () => void;
  estAbonneVIP: boolean;
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
}

const ContexteApp = createContext<AppContextType | undefined>(undefined);

export const FournisseurApp: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [docsDebloquesIds, setDocsDebloquesIds] = useState<string[]>([]);
  const [nomUtilisateur, setNomUtilisateur] = useState<string>('Jean Dupont');
  const [emailUtilisateur, setEmailUtilisateur] = useState<string>('');
  const [telephoneFacturation, setTelephoneFacturation] = useState<string>('+225 07 12 34 56 78');
  const [photoProfil, setPhotoProfil] = useState<string>('avatar-1');
  const [estConnecteGoogle, setEstConnecteGoogle] = useState<boolean>(false);
  const [estEligibleOffreBienvenue, setEstEligibleOffreBienvenue] = useState<boolean>(false);
  const [estVip, setEstVip] = useState<boolean>(false);
  const [aStockageEtendu, setAStockageEtendu] = useState<boolean>(false);
  const [limiteStockage, setLimiteStockage] = useState<number>(75);
  const [modeTheme, setModeTheme] = useState<'light' | 'dark'>('light');
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

  // ─────────────────────────────────────────────
  // INITIALISATION AU DÉMARRAGE & ÉCOUTEUR AUTH RÉSISTANT AUX DÉCONNEXIONS
  // ─────────────────────────────────────────────
  useEffect(() => {
    chargerProfilLocal();
    chargerStatutVIP();
    chargerAcquisitionsReelles();
    chargerEligibiliteBienvenue();

    // 0. Écouteur de Deep Links Google OAuth (Android / iOS)
    const handleDeepLink = async ({ url }: { url: string }) => {
      if (url && (url.includes('cauzon://') || url.includes('access_token=') || url.includes('code='))) {
        console.log('🔗 Deep link reçu :', url);
        await gererUrlRetourAuth(url);
      }
    };

    const linkSubscription = Linking.addEventListener('url', handleDeepLink);
    Linking.getInitialURL().then((initUrl) => {
      if (initUrl) handleDeepLink({ url: initUrl });
    });

    // 1. Restauration proactive immédiate de la session persistée
    const initialiserSession = async () => {
      try {
        // Sur Web : détection et traitement immédiat des tokens dans l'URL
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const currentUrl = window.location.href;
          if (currentUrl.includes('access_token=') || currentUrl.includes('code=')) {
            console.log('🌐 Capture OAuth Web depuis l\'URL');
            await gererUrlRetourAuth(currentUrl);
            try {
              window.history.replaceState({}, document.title, window.location.pathname);
            } catch (_) {}
          }
        }

        const { data: { session }, error } = await supabase.auth.getSession();
        if (!error && session?.user) {
          console.log('✅ Session Supabase active restaurée :', session.user.email);
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

          await synchroniserProfilGoogle(session.user);
          chargerStatutVIP();
          chargerAcquisitionsReelles();
          chargerEligibiliteBienvenue();
        }
      } catch (errSession) {
        console.warn('⚠️ Info vérification session initiale :', errSession);
      }
    };

    initialiserSession();

    // 2. Écouter les changements d'authentification Supabase de façon ciblée
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔄 Événement Auth Supabase :', event);

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (session?.user) {
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
          
          await synchroniserProfilGoogle(session.user);
          chargerStatutVIP();
          chargerAcquisitionsReelles();
          chargerEligibiliteBienvenue();
        }
      } else if (event === 'SIGNED_OUT') {
        // Déconnexion explicite demandée par l'utilisateur
        console.log('👋 Déconnexion explicite confirmée');
        setEstConnecteGoogle(false);
        setEmailUtilisateur('');
      }
    });

    // 3. Heartbeat silencieux : rafraîchit automatiquement le token en arrière-plan toutes les 15 min
    const heartbeatInterval = setInterval(async () => {
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
    const userRealtimeChannel = supabase
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
      .subscribe();

    return () => {
      linkSubscription.remove();
      subscription.unsubscribe();
      clearInterval(heartbeatInterval);
      supabase.removeChannel(userRealtimeChannel);
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
      ]);
      const photo = stored[0][1];
      const nom = stored[1][1];
      const telephone = stored[2][1];

      if (photo) setPhotoProfil(photo);
      if (nom) setNomUtilisateur(nom);
      if (telephone) setTelephoneFacturation(telephone);

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
      if (docs && docs.length > 0) {
        const ids = docs.map((d: any) => d.id);
        setDocsDebloquesIds(ids);
        console.log('📡 Acquisitions réelles chargées :', ids.length, 'document(s)');
      }
    } catch (erreur) {
      console.error('❌ Erreur lors du chargement des acquisitions :', erreur);
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
    setEstVip(false);
    setAStockageEtendu(false);
    setLimiteStockage(75);
    setModeTheme('light');
    setPhotoProfil('avatar-1');
    setNomUtilisateur('Jean Dupont');
    setTelephoneFacturation('+225 07 12 34 56 78');
    setAReponseNonLue(true);
    setEstAbonneVIP(false);
    setDateExpirationAbonnement(null);
    setVipExpireAt(null);
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
  };

  const basculerTheme = () => {
    setModeTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const connexionGoogle = async () => {
    return await connexionAvecGoogle();
  };

  const deconnexion = async () => {
    await deconnexionAuth();
    setEstConnecteGoogle(false);
    setEmailUtilisateur('');
  };

  const couleurs = modeTheme === 'light' ? couleursClair : couleursSombre;

  return (
    <ContexteApp.Provider
      value={{
        docsDebloquesIds,
        debloquerDocument,
        reinitialiserDemo,
        couleurs,
        modeTheme,
        basculerTheme,
        nomUtilisateur,
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
        aStockageEtendu,
        limiteStockage,
        chargementStockage,
        sAbonnerVip,
        acheterExtensionStockage,
        aReponseNonLue,
        marquerCommentairesCommeLus,
        estAbonneVIP,
        dateExpirationAbonnement,
        vipExpireAt,
        chargementVip,
        sAbonnerVIPFeexPay: sAbonnerVip,
        sAbonnerVIPCinetPay: sAbonnerVip,
        retirerDocumentDebloque,
        estSuspendu,
        dateFinSuspension,
        motifSuspension,
      }}
    >
      {children}
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


