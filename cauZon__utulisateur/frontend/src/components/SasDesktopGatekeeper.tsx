// ==============================================================================
// CauZon — Sas d'Authentification Obligatoire Web (Auth Wall universel)
// Fichier : src/components/SasDesktopGatekeeper.tsx
// Couvre : Desktop, tablette ET mobile web (tout navigateur, toute largeur)
// Mobile natif Android/iOS : retourne null immédiatement, flux inchangé.
// ==============================================================================

import React, { useState, useEffect } from 'react';
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
import { supabase } from '../lib/supabase';
import { initialiserGoogleOneTap, annulerGoogleOneTap } from '../services/serviceGoogleOneTap';

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
        <ActivityIndicator size="large" color="#6B1124" style={{ marginBottom: 16 }} />
        <Text style={styles.spinnerTitre}>Connexion à votre espace CauZon…</Text>
        <Text style={styles.spinnerSousTitre}>
          Validation de la session en cours, merci de patienter.
        </Text>
      </View>
    </View>
  );
}

export default function SasDesktopGatekeeper() {
  const { width } = useWindowDimensions();
  const { utilisateur, chargementAuth, sessionVerifiee, connexionGoogle } = useApp();
  const [enCoursConnexion, setEnCoursConnexion] = useState(false);
  const [timeoutDepasse, setTimeoutDepasse] = useState(false);

  // ⏱️ Timeout de sécurité garanti : après 4s max, libérer immédiatement l'attente
  useEffect(() => {
    const timer = setTimeout(() => {
      setTimeoutDepasse(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  // 🎯 Initialisation et Déclenchement automatique de Google One Tap (Web uniquement)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    // Si déjà authentifié, annuler toute invite résiduelle
    if (utilisateur) {
      annulerGoogleOneTap();
      return;
    }

    let isMounted = true;

    initialiserGoogleOneTap({
      autoPrompt: true,
      onSuccess: () => {
        if (isMounted) {
          setEnCoursConnexion(false);
        }
      },
      onError: (err) => {
        console.error('❌ [OneTap Auth Error]', err);
        if (isMounted) {
          setEnCoursConnexion(false);
        }
      },
      onNotDisplayed: (reason) => {
        console.log('[OneTap] Statut d\'affichage One Tap :', reason);
      },
    });

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

  // 5. Aucune session : afficher la carte d'authentification avec option d'exploration
  const isSmallScreen = width < 480;

  // Redirection classique OAuth vers le sélecteur Google Supabase
  const procederRedirectionOAuth = async () => {
    const redirectUrl = (typeof window !== 'undefined' && window.location?.origin)
      ? window.location.origin
      : undefined;

    console.log('🚀 [SasDesktopGatekeeper] Redirection Google OAuth vers :', redirectUrl);

    const timerSecurite = setTimeout(() => {
      setEnCoursConnexion(false);
    }, 6000);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    });

    if (error) {
      clearTimeout(timerSecurite);
      console.error('❌ [SasDesktopGatekeeper] Erreur signInWithOAuth :', error.message);
      setEnCoursConnexion(false);
      return;
    }

    if (data?.url && typeof window !== 'undefined') {
      clearTimeout(timerSecurite);
      console.log('🔄 [SasDesktopGatekeeper] Navigation vers :', data.url);
      window.location.href = data.url;
    }
  };

  // Gestionnaire de clic sur le bouton "Continuer avec Google" (Fallback)
  const gererConnexionGoogle = async () => {
    try {
      setEnCoursConnexion(true);

      // Si Google Identity Services One Tap est prêt, tenter d'abord de ré-afficher le prompt
      if (typeof window !== 'undefined' && (window as any).google?.accounts?.id) {
        let promptAffiche = false;

        (window as any).google.accounts.id.prompt((notification: any) => {
          if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()) {
            console.log('[OneTap] Invite One Tap non affichée ou ignorée, redirection classique...');
            procederRedirectionOAuth();
          } else {
            promptAffiche = true;
          }
        });

        // Délai de secours : si One Tap ne réagit pas sous 800ms, redirection directe
        setTimeout(() => {
          if (!promptAffiche && enCoursConnexion) {
            procederRedirectionOAuth();
          }
        }, 800);
        return;
      }

      // Si One Tap non disponible sur ce navigateur, redirection directe
      await procederRedirectionOAuth();
    } catch (err) {
      console.error('❌ [SasDesktopGatekeeper] Erreur déclencheur Google Auth :', err);
      setEnCoursConnexion(false);
    }
  };

  const gererRetourVitrine = () => {
    if (typeof window !== 'undefined') {
      window.location.href = 'https://cauzon.ci';
    } else {
      Linking.openURL('https://cauzon.ci').catch(() => {});
    }
  };

  return (
    <View style={styles.overlayContainer}>
      <View style={styles.haloAmbiantDore} />
      <View style={styles.haloAmbiantEmeraude} />
      <ScrollView
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
          <TouchableOpacity
            style={styles.boutonGoogle}
            onPress={gererConnexionGoogle}
            activeOpacity={0.88}
            disabled={enCoursConnexion}
          >
            {enCoursConnexion ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <View style={styles.googleIconCircle} pointerEvents="none">
                  {Platform.OS === 'web' ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' } as any}>
                      <svg width="18" height="18" viewBox="0 0 24 24" style={{ pointerEvents: 'none' } as any}>
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                      </svg>
                    </span>
                  ) : (
                    <Ionicons name="logo-google" size={18} color="#6B1124" />
                  )}
                </View>
                <Text style={styles.boutonGoogleTexte}>Continuer avec Google</Text>
              </>
            )}
          </TouchableOpacity>
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 998,
    backgroundColor: 'rgba(61, 6, 19, 0.92)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        } as any)
      : {}),
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
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
  boutonGoogle: {
    width: '100%',
    height: 52,
    backgroundColor: '#6B1124',
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(250, 246, 235, 0.3)',
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          boxShadow: '0 10px 24px -6px rgba(107,17,36,0.5)',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        } as any)
      : { elevation: 5 }),
  },
  googleIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FAF6EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  boutonGoogleTexte: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FAF6EB',
    letterSpacing: 0.2,
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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