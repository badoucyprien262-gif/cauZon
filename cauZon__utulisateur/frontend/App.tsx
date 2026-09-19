import React, { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
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


export const navigationRef = createNavigationContainerRef<any>();

function OverlayChargementAuth() {
  const { chargementAuth } = useApp();
  // Sur Web, SasDesktopGatekeeper gère l'overlay de chargement via SpinnerSessionWeb
  if (Platform.OS === 'web') return null;
  return <EcranChargementAuth visible={chargementAuth} />;
}


function BarreDeStatutDynamique({ splashVisible }: { splashVisible: boolean }) {
  const { modeTheme } = useApp();
  return <StatusBar style={splashVisible ? "light" : (modeTheme === 'dark' ? "light" : "dark")} />;
}

export default function App() {
  const [splashVisible, setSplashVisible] = useState(true);
  const [estPret, setEstPret] = useState(false);
  const notificationListener = useRef<Notifications.EventSubscription | undefined>(undefined);
  const responseListener = useRef<Notifications.EventSubscription | undefined>(undefined);

  // 🚀 Barrière de synchronisation UX : Préchargement synchronisé de l'accueil
  useEffect(() => {
    async function synchroniserDemarrage() {
      try {
        await Promise.all([
          // Durée minimale d'animation élégante
          new Promise((resolve) => setTimeout(resolve, 1200)),
          // Préchargement immédiat du catalogue, des annonces et de la configuration promo
          prechargerDonneesAccueil(),
        ]);
      } catch (err) {
        console.warn('[Init] Erreur préchargement accueil accéléré (silencieux) :', err);
      } finally {
        setEstPret(true);
      }
    }
    synchroniserDemarrage();
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
        { flex: 1 },
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
        <NavigationContainer ref={navigationRef}>
          <NavigateurApp />
          <BarreDeStatutDynamique splashVisible={splashVisible} />
        </NavigationContainer>
        {splashVisible && (
          <SplashScreenCauzon 
            onFinish={() => setSplashVisible(false)} 
            estPret={estPret}
          />
        )}
        <SasDesktopGatekeeper />
        <OverlayChargementAuth />
      </FournisseurApp>
    </SafeAreaProvider>
  );
}

