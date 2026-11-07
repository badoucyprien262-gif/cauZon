import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Platform,
  StyleSheet,
  Modal,
} from 'react-native';
import { Ionicons } from './AppIcon';
import { useApp } from '../store/ContexteApp';
import BoutonTactile from './BoutonTactile';

/**
 * 📲 Bannière d'installation PWA persistante supérieure
 *
 * Spécifications :
 * 1. Capture & interception de l'événement global `beforeinstallprompt` (preventDefault).
 * 2. Vérification automatique si l'application tourne déjà en mode standalone
 *    (window.matchMedia('(display-mode: standalone)').matches).
 * 3. Affichage fixe tout en haut de l'écran (sticky / fixed top-0 left-0 right-0 z-50).
 * 4. Déclenchement de l'invite native deferredPrompt.prompt() au clic.
 * 5. Prise en charge d'un guide étape par étape sur iOS Safari (où beforeinstallprompt n'est pas supporté par Apple).
 */
export default function BanniereInstallationPwaTop() {
  if (Platform.OS !== 'web') {
    return null;
  }

  return <BanniereInstallationPwaTopWeb />;
}

function BanniereInstallationPwaTopWeb() {
  const { couleurs } = useApp();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(() => {
    if (typeof window !== 'undefined' && (window as any).__cauzonDeferredPrompt) {
      return (window as any).__cauzonDeferredPrompt;
    }
    return null;
  });

  const [estInstalle, setEstInstalle] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const matchMediaStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches;
      const navigatorStandalone = (window.navigator as any)?.standalone === true;
      const estAndroidApp = typeof document !== 'undefined' && document.referrer.includes('android-app://');
      return Boolean(matchMediaStandalone || navigatorStandalone || estAndroidApp);
    } catch {
      return false;
    }
  });

  const [modaleIosVisible, setModaleIosVisible] = useState<boolean>(false);
  const [imageChargee, setImageChargee] = useState<boolean>(true);

  // Détection d'appareil iOS Safari
  const estIos = typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as any).MSStream;

  useEffect(() => {
    if (typeof window === 'undefined' || estInstalle) return;

    // 1. Interception de l'événement beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      (window as any).__cauzonDeferredPrompt = e;
      setDeferredPrompt(e);
      console.log('📲 [PWA] Événement beforeinstallprompt intercepté avec succès.');
    };

    // 2. Écoute de l'événement d'installation réussie
    const handleAppInstalled = () => {
      console.log('🎉 [PWA] cauZon a été installé avec succès sur l\'appareil.');
      setEstInstalle(true);
      setDeferredPrompt(null);
      (window as any).__cauzonDeferredPrompt = null;
    };

    // 3. Écoute de l'événement personnalisé dispatched par index.html
    const handleCustomInstallable = () => {
      if ((window as any).__cauzonDeferredPrompt) {
        setDeferredPrompt((window as any).__cauzonDeferredPrompt);
      }
    };

    // 4. Écoute dynamique du changement de mode d'affichage vers standalone
    let mediaMatcher: MediaQueryList | null = null;
    try {
      mediaMatcher = window.matchMedia('(display-mode: standalone)');
      const handleMediaChange = (evt: MediaQueryListEvent) => {
        if (evt.matches) {
          setEstInstalle(true);
        }
      };
      mediaMatcher.addEventListener?.('change', handleMediaChange);
    } catch {}

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('cauzon-pwa-installable', handleCustomInstallable);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('cauzon-pwa-installable', handleCustomInstallable);
    };
  }, [estInstalle]);

  // Si l'application est déjà installée en mode standalone, ne rien afficher
  if (estInstalle) {
    return null;
  }

  // Déclencheur du flux d'installation
  const handleInstaller = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choiceResult = await deferredPrompt.userChoice;
        if (choiceResult?.outcome === 'accepted') {
          console.log('✅ [PWA] L\'utilisateur a accepté l\'installation.');
          setEstInstalle(true);
        } else {
          console.log('ℹ️ [PWA] L\'utilisateur a reporté l\'installation.');
        }
        setDeferredPrompt(null);
        (window as any).__cauzonDeferredPrompt = null;
      } catch (err) {
        console.warn('⚠️ [PWA] Erreur lors du déclenchement du prompt :', err);
      }
      return;
    }

    // Si on est sur iOS (ou navigateur sans beforeinstallprompt), afficher le guide
    setModaleIosVisible(true);
  };

  return (
    <>
      <View
        style={[
          styles.container,
          {
            backgroundColor: couleurs.fondCarte,
            borderBottomColor: couleurs.estSombre
              ? 'rgba(249, 168, 184, 0.15)'
              : 'rgba(127, 1, 31, 0.12)',
          },
          Platform.OS === 'web' && ({
            position: 'sticky',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9990,
            width: '100%',
            contain: 'layout paint',
          } as any),
        ]}
      >
        <View style={styles.leftSection}>
          {/* Logo / Icône officielle cauZon */}
          <View style={[styles.iconContainer, { backgroundColor: '#7F011F' }]}>
            {imageChargee ? (
              <Image
                source={{ uri: '/assets/icon-192.png' }}
                style={styles.iconImage}
                onError={() => setImageChargee(false)}
                resizeMode="cover"
              />
            ) : (
              <Ionicons name="school" size={19} color="#FAF6EB" />
            )}
          </View>

          {/* Description claire et engageante */}
          <View style={styles.textContainer}>
            <View style={styles.titleRow}>
              <Text style={[styles.brandTitle, { color: couleurs.texte }]}>
                cauZon
              </Text>
              <View style={[styles.appBadge, { backgroundColor: 'rgba(127, 1, 31, 0.08)' }]}>
                <Text style={[styles.appBadgeText, { color: couleurs.primaire }]}>
                  Application
                </Text>
              </View>
            </View>
            <Text
              style={[styles.subtitle, { color: couleurs.texteSecondaire }]}
              numberOfLines={1}
            >
              Accès rapide & révision hors-ligne
            </Text>
          </View>
        </View>

        {/* Bouton d'action Installer avec micro-interaction tactile */}
        <View style={styles.rightSection}>
          <BoutonTactile
            style={[styles.installButton, { backgroundColor: '#7F011F' }]}
            onPress={handleInstaller}
            activeOpacity={0.85}
          >
            <Ionicons name="cloud-download-outline" size={14} color="#FFFFFF" />
            <Text style={styles.installButtonText}>Installer</Text>
          </BoutonTactile>
        </View>
      </View>

      {/* Guide contextuel d'installation iOS Safari */}
      <Modal
        visible={modaleIosVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModaleIosVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: couleurs.fondCarte,
                borderColor: couleurs.bordure,
              },
            ]}
          >
            {/* Header du guide */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderIcon}>
                <Ionicons name="phone-portrait-outline" size={20} color="#7F011F" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: couleurs.texte }]}>
                  Installer cauZon sur votre téléphone
                </Text>
                <Text style={[styles.modalSubtitle, { color: couleurs.texteSecondaire }]}>
                  Suivez ces 2 étapes simples sur votre navigateur :
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setModaleIosVisible(false)}
                style={styles.modalCloseBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color={couleurs.texteSecondaire} />
              </TouchableOpacity>
            </View>

            {/* Étapes illustrées */}
            <View style={styles.modalBody}>
              <View style={styles.stepRow}>
                <View style={[styles.stepNumberBadge, { backgroundColor: '#7F011F' }]}>
                  <Text style={styles.stepNumberText}>1</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stepText, { color: couleurs.texte }]}>
                    Touchez le bouton <Text style={{ fontWeight: '700' }}>Partager</Text> en bas de votre écran.
                  </Text>
                  <View style={styles.stepIconPreview}>
                    <Ionicons name="share-outline" size={16} color="#7F011F" />
                    <Text style={[styles.stepIconLabel, { color: couleurs.texteSecondaire }]}>
                      Icône de partage de votre navigateur
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.stepRow}>
                <View style={[styles.stepNumberBadge, { backgroundColor: '#7F011F' }]}>
                  <Text style={styles.stepNumberText}>2</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stepText, { color: couleurs.texte }]}>
                    Faites défiler puis touchez <Text style={{ fontWeight: '700' }}>« Sur l'écran d'accueil »</Text>.
                  </Text>
                  <View style={styles.stepIconPreview}>
                    <Ionicons name="add-circle-outline" size={16} color="#7F011F" />
                    <Text style={[styles.stepIconLabel, { color: couleurs.texteSecondaire }]}>
                      Puis validez sur « Ajouter »
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Bouton de confirmation */}
            <BoutonTactile
              style={[styles.modalActionBtn, { backgroundColor: '#7F011F' }]}
              onPress={() => setModaleIosVisible(false)}
            >
              <Text style={styles.modalActionBtnText}>Compris !</Text>
            </BoutonTactile>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
    gap: 10,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 9,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#7F011F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
    flexShrink: 0,
  },
  iconImage: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  appBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  appBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  installButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 18,
    shadowColor: '#7F011F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  installButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  // Modale Guide iOS
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  modalHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(127, 1, 31, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    lineHeight: 18,
  },
  modalSubtitle: {
    fontSize: 11.5,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalBody: {
    gap: 14,
    marginBottom: 18,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepNumberBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  stepText: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  stepIconPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    backgroundColor: 'rgba(127, 1, 31, 0.05)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  stepIconLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  modalActionBtn: {
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});

