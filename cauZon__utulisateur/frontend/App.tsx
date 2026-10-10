import React, { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, BackHandler, ToastAndroid, Animated, Easing } from 'react-native';
import * as ExpoSplashScreen from 'expo-splash-screen';

// Empêche Expo de cacher automatiquement le splash natif avant que
// SplashScreenCauzon ait pris le relais (appelé dès l'import du module).
try { ExpoSplashScreen.preventAutoHideAsync().catch(() => {}); } catch (_) {}
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import * as ScreenCapture from 'expo-screen-capture';
import NavigateurApp from './src/navigation/NavigateurApp';
import { FournisseurApp, useApp } from './src/store/ContexteApp';
import SplashScreenCauzon from './src/components/SplashScreenCauzon';
import EcranChargementAuth from './src/components/EcranChargementAuth';
import SasDesktopGatekeeper from './src/components/SasDesktopGatekeeper';
import { initialiserGestionnaireNotifications, synchroniserNotificationsManquees } from './src/services/serviceNotifications';
import { prechargerDonneesAccueil } from './src/services/serviceDocument';
import { chargerScriptGoogleGsi } from './src/services/serviceGoogleOneTap';


const linkingConfig = {
  prefixes: ['https://cauzon.app', 'cauzon://', 'exp://'],
  config: {
    screens: {
      MainTabs: {
        screens: {
          Accueil: '',
          Bibliothèque: 'bibliotheque',
        },
      },
      PolitiqueConfidentialite: 'politique-de-confidentialite',
      DocumentViewer: 'document',
      PdfViewer: 'pdf',
    },
  },
};

export const navigationRef = createNavigationContainerRef<any>();

function OverlayChargementAuth() {
  const { chargementAuth } = useApp();
  // Sur Web, SasDesktopGatekeeper gère l'overlay de chargement via SpinnerSessionWeb
  if (Platform.OS === 'web') return null;
  return <EcranChargementAuth visible={chargementAuth} />;
}


function BarreDeStatutDynamique({ splashMounted }: { splashMounted: boolean }) {
  const { modeTheme } = useApp();
  return <StatusBar style={splashMounted ? "light" : (modeTheme === 'dark' ? "light" : "dark")} />;
}

export default function App() {
  // ── Contrat de Synchronisation UX ─────────────────────────────────────────
  // appReady      : données/auth chargées (indépendant de l'animation)
  // splashMounted : le composant Splash est encore dans l'arbre React
  const [appReady, setAppReady] = useState(false);
  const [splashMounted, setSplashMounted] = useState(true);

  // Opacité de l'overlay Splash géré par App.tsx (fade-out 250 ms)
  const splashOverlayOpacity = useRef(new Animated.Value(1)).current;

  const notificationListener = useRef<Notifications.EventSubscription | undefined>(undefined);
  const responseListener = useRef<Notifications.EventSubscription | undefined>(undefined);
  const dernierAppuiRetourRef = useRef<number>(0);

  // 🤖 Interception globale du bouton Retour sous Android (Conformité Play Store)
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const onHardwareBackPress = () => {
      if (!navigationRef.isReady()) return false;

      // 1. Si la pile de navigation peut reculer (écran secondaire)
      if (navigationRef.canGoBack()) {
        navigationRef.goBack();
        return true;
      }

      // 2. Si on est sur un onglet secondaire (ex: Bibliothèque) -> retour à l'Accueil
      const routeCourante = navigationRef.getCurrentRoute()?.name;
      if (routeCourante && routeCourante !== 'Accueil') {
        navigationRef.navigate('Accueil');
        return true;
      }

      // 3. Si on est sur l'écran d'accueil principal (racine) -> Double appui pour quitter
      const maintenant = Date.now();
      if (maintenant - dernierAppuiRetourRef.current < 2000) {
        BackHandler.exitApp();
        return true;
      }

      dernierAppuiRetourRef.current = maintenant;
      ToastAndroid.show('Appuyez à nouveau pour quitter', ToastAndroid.SHORT);
      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBackPress);
    return () => sub.remove();
  }, []);

  // 🚀 Chargement des données/auth — NE modifie PAS l'affichage du Splash ici.
  // Seul appReady=true est positionné ; c'est onAnimationFinish qui déclenchera la sortie.
  useEffect(() => {
    async function synchroniserDemarrage() {
      // Déblocage immédiat de l'App Shell si l'appareil est hors-ligne sur le Web
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.onLine) {
        console.log('⚡ [PWA Démarrage] Hors-ligne au lancement -> Déblocage instantané du splash');
        setAppReady(true);
        return;
      }

      // Garde-fou absolu pour garantir que le splash screen ne reste jamais bloqué
      const watchdog = setTimeout(() => {
        setAppReady(true);
      }, Platform.OS === 'web' ? 1200 : 2500);

      try {
        await Promise.all([
          // Préchargement immédiat Stale-While-Revalidate (instantané dès présence de cache)
          prechargerDonneesAccueil(),
        ]);
      } catch (err) {
        console.warn('[Init] Erreur préchargement accueil accéléré (silencieux) :', err);
      } finally {
        clearTimeout(watchdog);
        setAppReady(true);
      }
    }
    synchroniserDemarrage();
  }, []);

  // 🎬 Callback appelé par SplashScreenCauzon quand animation + hold sont terminés
  // ET que appReady est vrai. Déclenche le fade-out 250ms, puis démonte le Splash.
  const handleAnimationFinish = () => {
    Animated.timing(splashOverlayOpacity, {
      toValue: 0,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setSplashMounted(false);
    });
  };

  // 🌐 Préchargement du SDK Google Identity Services sur Web
  useEffect(() => {
    if (Platform.OS === 'web') {
      chargerScriptGoogleGsi().catch(() => {});
    }
  }, []);

  useEffect(() => {
    // 🛡️ Protection Anti-Capture sur Mobile (Android / iOS)
    if (Platform.OS !== 'web') {
      try {
        ScreenCapture.preventScreenCaptureAsync().catch((err) => {
          console.warn('Anti-Capture Mobile non supporté sur cette plateforme :', err);
        });
      } catch (err) {
        console.warn('Erreur initialisation ScreenCapture :', err);
      }
    }

    // 🛡️ Bouclier Anti-Inspection sur le Web (Sécurité runtime React)
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        return false;
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        // F12
        if (e.key === 'F12' || e.keyCode === 123) {
          e.preventDefault();
          return false;
        }
        // Ctrl+U, Ctrl+S, Ctrl+Shift+I, Ctrl+Shift+J (ou équivalents Mac avec Cmd/Meta)
        const isCtrlOrMeta = e.ctrlKey || e.metaKey;
        if (
          (isCtrlOrMeta && (e.key === 'u' || e.key === 'U' || e.key === 's' || e.key === 'S')) ||
          (isCtrlOrMeta && e.shiftKey && (e.key === 'i' || e.key === 'I' || e.key === 'j' || e.key === 'J'))
        ) {
          e.preventDefault();
          return false;
        }
      };

      document.addEventListener('contextmenu', handleContextMenu);
      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('contextmenu', handleContextMenu);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, []);

  useEffect(() => {
    // 1. Configure le gestionnaire foreground + canal Android haute priorité
    try {
      initialiserGestionnaireNotifications().catch((e) => console.warn('Note initialisation notifications :', e));
    } catch (e) {
      console.warn('Erreur synchrone gestionnaire notifications :', e);
    }

    // ⚡ Synchronisation de rattrapage des notifications hors-ligne au lancement (Effet WhatsApp)
    try {
      synchroniserNotificationsManquees().catch(() => {});
    } catch (_) {}

    // Fonction commune de routage selon la payload de notification
    const routerNotification = async (data: any) => {
      try {
        if (!data) return;
        console.log('👆 Routage notification — data :', data);

        const documentId = data.document_id || data.documentId || data.doc_id || data.id;
        const routeCible = data.cible || data.route || data.screen;

        // Attendre que la navigation soit prête
        for (let i = 0; i < 12; i++) {
          if (navigationRef.isReady()) break;
          await new Promise((r) => setTimeout(r, 150));
        }

        if (!navigationRef.isReady()) return;

        if (documentId) {
          try {
            const { fetchCatalogueDocuments } = await import('./src/services/serviceDocument');
            const catalogue = await fetchCatalogueDocuments();
            const doc = catalogue.find((d: any) => String(d.id) === String(documentId));
            if (doc) {
              navigationRef.navigate('DocumentViewer', { document: doc });
              return;
            }
          } catch (errDoc) {
            console.warn('Erreur chargement document suite à notification :', errDoc);
          }
        }

        if (routeCible) {
          navigationRef.navigate(routeCible);
        }
      } catch (errRoute) {
        console.warn('Erreur routage notification :', errRoute);
      }
    };

    // 2. Écouteur : notification reçue au premier plan (Foreground)
    try {
      notificationListener.current = Notifications.addNotificationReceivedListener(
        (notification) => {
          console.log('📩 Notification reçue au premier plan :', notification?.request?.content?.title);
        }
      );
    } catch (e) {
      console.warn('Note enregistrement notificationReceivedListener :', e);
    }

    // 3. Écouteur : l'utilisateur a tapé sur la bannière de notification (Background)
    try {
      responseListener.current = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          const data = response?.notification?.request?.content?.data;
          routerNotification(data);
        }
      );
    } catch (e) {
      console.warn('Note enregistrement notificationResponseReceivedListener :', e);
    }

    // 4. Détection clic notification au démarrage depuis état tué (Killed State)
    try {
      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response?.notification?.request?.content?.data) {
          routerNotification(response.notification.request.content.data);
        }
      }).catch((e) => console.warn('Note getLastNotificationResponseAsync :', e));
    } catch (e) {
      console.warn('Note appel synchrone getLastNotificationResponseAsync :', e);
    }

    // Nettoyage des abonnements au démontage
    return () => {
      try {
        notificationListener.current?.remove();
        responseListener.current?.remove();
      } catch (_) {}
    };
  }, []);

  return (
    <SafeAreaProvider
      style={[
        { flex: 1, width: '100%', height: '100%' },
        Platform.OS === 'web' && ({
          // @ts-ignore
          touchAction: 'auto',
          WebkitOverflowScrolling: 'touch',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        } as any),
      ]}
    >
      <FournisseurApp>
        <NavigationContainer
          ref={navigationRef}
          linking={linkingConfig}
          onReady={() => {
            const estHorsLigne = Platform.OS === 'web'
              ? (typeof navigator !== 'undefined' && !navigator.onLine)
              : false;

            if (estHorsLigne) {
              console.log('⚡ [PWA Routage Initial] App hors-ligne -> Navigation directe vers Bibliothèque');
              navigationRef.navigate('MainTabs', { screen: 'Bibliothèque' });
            }
          }}
        >
          <NavigateurApp />
          <BarreDeStatutDynamique splashMounted={splashMounted} />
        </NavigationContainer>
        {/* Fade-out overlay géré par App.tsx (250 ms) — démonté après la fin du fondu */}
        {splashMounted && (
          <Animated.View
            style={[
              { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9998 },
              { opacity: splashOverlayOpacity },
            ]}
            pointerEvents="none"
          >
            <SplashScreenCauzon
              onAnimationFinish={handleAnimationFinish}
              appReady={appReady}
            />
          </Animated.View>
        )}
        <SasDesktopGatekeeper />
        <OverlayChargementAuth />
      </FournisseurApp>
    </SafeAreaProvider>
  );
}

