// ==============================================================================
// CauZon — Sas d'Authentification Obligatoire Web (Auth Wall universel)
// Fichier : src/components/SasDesktopGatekeeper.tsx
// Couvre : Desktop, tablette ET mobile web (tout navigateur, toute largeur)
// Mobile natif Android/iOS : retourne null immédiatement, flux inchangé.
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
  Linking,
  ScrollView,
} from 'react-native';
import { Ionicons } from './AppIcon';
import { useApp } from '../store/ContexteApp';
import {
  initialiserGoogleOneTap,
  annulerGoogleOneTap,
  rendreBoutonGoogleGis,
} from '../services/serviceGoogleOneTap';

// Spinner plein écran affiché pendant la vérification de session
function SpinnerSessionWeb() {
  return (
    <View style={styles.spinnerOverlay}>
      <View style={styles.spinnerCard}>
        <View style={styles.spinnerLogoWrapper}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.spinnerLogo}
            resizeMode="contain"
          />
        </View>
        <ActivityIndicator size="large" color="#FAF6EB" style={{ marginBottom: 16 }} />
        <Text style={styles.spinnerTitre}>Connexion à votre espace CauZon…</Text>
        <Text style={styles.spinnerSousTitre}>
          Validation de la session en cours, merci de patienter.
        </Text>
      </View>
    </View>
  );
}

// ID unique du conteneur DOM qui accueille le bouton GIS
const GIS_BUTTON_CONTAINER_ID = 'googleSignInButtonGis';

export default function SasDesktopGatekeeper() {
  const { width } = useWindowDimensions();
  const { utilisateur, chargementAuth, sessionVerifiee } = useApp();
  const [timeoutDepasse, setTimeoutDepasse] = useState(false);
  const [boutonRendu, setBoutonRendu] = useState(false);
  const tentativesRef = useRef(0);

  // ⏱️ Timeout de sécurité garanti : après 4s max, libérer immédiatement l'attente
  useEffect(() => {
    const timer = setTimeout(() => {
      setTimeoutDepasse(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  // 🎯 Rendu du bouton natif Google Identity Services (Web uniquement)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || utilisateur) {
      return;
    }

    let isMounted = true;

    // Initialiser One Tap (prompt automatique) en parallèle du bouton
    initialiserGoogleOneTap({
      autoPrompt: true,
      onNotDisplayed: (reason) => {
        console.log('[OneTap] Non affiché :', reason);
      },
    });

    // Rendre le bouton GIS natif avec retry si le DOM n'est pas encore prêt
    const rendreBouton = async () => {
      if (!isMounted || tentativesRef.current > 5) return;
      tentativesRef.current += 1;

      const ok = await rendreBoutonGoogleGis(GIS_BUTTON_CONTAINER_ID, {
        onSuccess: () => {
          if (isMounted) setBoutonRendu(true);
        },
        onError: (err) => {
          console.error('❌ [GIS] Erreur connexion après sélection compte :', err);
        },
      });

      if (!ok && isMounted) {
        // Le conteneur DOM n'est peut-être pas encore monté — retry dans 400ms
        setTimeout(rendreBouton, 400);
      } else if (ok && isMounted) {
        setBoutonRendu(true);
      }
    };

    rendreBouton();

    return () => {
      isMounted = false;
      annulerGoogleOneTap();
    };
  }, [utilisateur]);

  // 1. Sur mobile natif (Android / iOS) ne jamais bloquer
  if (Platform.OS !== 'web') {
    return null;
  }

  // 3. Si la vérification de session est en cours : afficher spinner, sauf si timeout dépassé
  if ((!sessionVerifiee || chargementAuth) && !timeoutDepasse) {
    return <SpinnerSessionWeb />;
  }

  // 4. Session active : déverrouiller immédiatement, ne rien afficher
  if (utilisateur) {
    return null;
  }

  // 5. Aucune session : afficher la carte d'authentification
  const isSmallScreen = width < 480;

  const gererRetourVitrine = () => {
    if (typeof window !== 'undefined') {
      window.location.href = 'https://cauzon.ci';
    } else {
      Linking.openURL('https://cauzon.ci').catch(() => {});
    }
  };

  return (
    <View style={styles.overlayContainer}>
      <View style={styles.haloAmbiantDore} pointerEvents="none" />
      <View style={styles.haloAmbiantEmeraude} pointerEvents="none" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.card, isSmallScreen && styles.cardSmall]}>
          <View style={styles.badgeTop}>
            <Ionicons name="lock-closed-outline" size={13} color="#D97706" style={{ marginRight: 6 }} />
            <Text style={styles.badgeTopTexte}>Accès Sécurisé Requis</Text>
          </View>
          <View style={styles.emblemeContainer}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.emblemeImage}
              resizeMode="contain"
            />
          </View>
          <Text style={[styles.titre, isSmallScreen && styles.titreSmall]}>
            Espace Étudiant CauZon
          </Text>
          <Text style={styles.messageExplicatif}>
            Pour accéder à vos cours, fiches de révision et à votre bibliothèque, veuillez vous identifier avec votre compte étudiant.
          </Text>
          <View style={styles.pointsClesContainer}>
            <View style={styles.pointCleItem}>
              <View style={styles.pointCleIconeWrapper}>
                <Ionicons name="flash-outline" size={14} color="#6B1124" />
              </View>
              <Text style={styles.pointCleTexte}>Mode Hors-Ligne et Synchronisation</Text>
            </View>
            <View style={styles.pointCleItem}>
              <View style={styles.pointCleIconeWrapper}>
                <Ionicons name="book-outline" size={14} color="#6B1124" />
              </View>
              <Text style={styles.pointCleTexte}>Bibliothèque et Annales d'Examens</Text>
            </View>
            <View style={styles.pointCleItem}>
              <View style={styles.pointCleIconeWrapper}>
                <Ionicons name="ribbon-outline" size={14} color="#6B1124" />
              </View>
              <Text style={styles.pointCleTexte}>Pass VIP et Documents Certifiés</Text>
            </View>
          </View>
          {/* ── Bouton Google Identity Services natif (Web) ───────────────── */}
          {Platform.OS === 'web' ? (
            <View style={styles.boutonGoogleContainer}>
              {/* Le SDK GIS rend ici le bouton natif "Continuer en tant que…" */}
              {/* @ts-ignore — div est valide dans les renderers web React Native */}
              <div
                id={GIS_BUTTON_CONTAINER_ID}
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  minHeight: 44,
                }}
              />
              {!boutonRendu && (
                <ActivityIndicator
                  size="small"
                  color="#6B1124"
                  style={{ position: 'absolute' } as any}
                />
              )}
            </View>
          ) : (
            // Fallback natif iOS/Android (ne doit jamais s'afficher sur Web)
            <View style={styles.boutonGoogleContainer} />
          )}
          <View style={styles.mentionSecuriteContainer}>
            <Ionicons name="shield-checkmark" size={15} color="#10B981" style={{ marginRight: 6 }} />
            <Text style={styles.mentionSecuriteTexte}>
              Connexion sécurisée en un clic • Accès instantané à vos documents acquis
            </Text>
          </View>
          <View style={styles.separateur} />
          <TouchableOpacity
            style={styles.boutonRetourVitrine}
            onPress={gererRetourVitrine}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back-outline" size={14} color="#6B1124" style={{ marginRight: 6 }} />
            <Text style={styles.boutonRetourVitrineTexte}>Retourner au site vitrine</Text>
          </TouchableOpacity>
          <Text style={styles.footerNote}>
            CauZon Côte d'Ivoire • Conforme à la protection des données personnelles
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    zIndex: 998,
    backgroundColor: 'rgba(61, 6, 19, 0.92)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        } as any)
      : {}),
  },
  scrollView: {
    width: '100%',
    height: '100%',
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    minHeight: '100%' as any,
  },
  haloAmbiantDore: {
    position: 'absolute',
    top: '10%' as any,
    left: '20%' as any,
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: '#F59E0B',
    opacity: 0.12,
    ...(Platform.OS === 'web' ? ({ filter: 'blur(100px)' } as any) : {}),
  },
  haloAmbiantEmeraude: {
    position: 'absolute',
    bottom: '10%' as any,
    right: '20%' as any,
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: '#10B981',
    opacity: 0.1,
    ...(Platform.OS === 'web' ? ({ filter: 'blur(110px)' } as any) : {}),
  },
  card: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FAF6EB',
    borderRadius: 30,
    paddingVertical: 36,
    paddingHorizontal: 32,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 25px 60px -15px rgba(0,0,0,0.6)',
        } as any)
      : {
          elevation: 16,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.45,
          shadowRadius: 25,
        }),
  },
  cardSmall: {
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderRadius: 24,
  },
  badgeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4.5,
    borderRadius: 20,
    marginBottom: 20,
  },
  badgeTopTexte: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#B45309',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  emblemeContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#6B1124',
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(250, 246, 235, 0.25)',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 10px 25px -5px rgba(107,17,36,0.45)' } as any)
      : { elevation: 6 }),
  },
  emblemeImage: {
    width: '100%',
    height: '100%',
  },
  titre: {
    fontSize: 22,
    fontWeight: '800',
    color: '#3D0613',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  titreSmall: {
    fontSize: 19,
  },
  messageExplicatif: {
    fontSize: 14,
    fontWeight: '400',
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 22,
    paddingHorizontal: 10,
  },
  pointsClesContainer: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(107, 17, 36, 0.08)',
    marginBottom: 24,
    gap: 8,
  },
  pointCleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pointCleIconeWrapper: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(107, 17, 36, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pointCleTexte: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#1F2937',
  },
  boutonGoogleContainer: {
    width: '100%',
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    position: 'relative',
    ...(Platform.OS === 'web'
      ? ({
          overflow: 'hidden',
          // Légère ombre pour intégrer le bouton dans la card
          filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.18))',
        } as any)
      : {}),
  },

  mentionSecuriteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginBottom: 18,
  },
  mentionSecuriteTexte: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 16,
    flexShrink: 1,
  },
  separateur: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(107, 17, 36, 0.1)',
    marginBottom: 16,
  },
  boutonRetourVitrine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 12,
    marginTop: 2,
    marginBottom: 4,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  boutonRetourVitrineTexte: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#6B1124',
    textDecorationLine: 'underline',
  },
  footerNote: {
    fontSize: 10.5,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 14,
  },
  spinnerOverlay: {
    position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    zIndex: 999,
    backgroundColor: '#3D0613',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    ...(Platform.OS === 'web'
      ? ({ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' } as any)
      : {}),
  },
  spinnerCard: {
    alignItems: 'center',
    maxWidth: 340,
    width: '100%',
  },
  spinnerLogoWrapper: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(250, 246, 235, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(250, 246, 235, 0.2)',
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  spinnerLogo: {
    width: '100%',
    height: '100%',
  },
  spinnerTitre: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FAF6EB',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  spinnerSousTitre: {
    fontSize: 13,
    fontWeight: '400',
    color: 'rgba(250, 246, 235, 0.65)',
    textAlign: 'center',
    lineHeight: 19,
  },
});