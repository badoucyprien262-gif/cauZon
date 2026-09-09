// ==============================================================================
// 🛡️ cauZon — Écran de Chargement d'Authentification Élégant & Sécurisé
// Fichier : src/components/EcranChargementAuth.tsx
// ==============================================================================

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Platform,
} from 'react-native';
import { Ionicons } from './AppIcon';

interface Props {
  visible: boolean;
  message?: string;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function EcranChargementAuth({ visible, message }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const useNative = Platform.OS !== 'web';

  useEffect(() => {
    if (visible) {
      // Apparition fluide
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: useNative,
      }).start();

      // Pulsation subtile de l'emblème
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 900,
            useNativeDriver: useNative,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 900,
            useNativeDriver: useNative,
          }),
        ])
      ).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: useNative,
      }).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      {/* Halo lumineux bordeaux d'ambiance */}
      <View style={styles.haloAmbiant} />

      <View style={styles.cardContainer}>
        {/* Emblème Officiel cauZon */}
        <Animated.View style={[styles.logoBadge, { transform: [{ scale: pulseAnim }] }]}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Typographie cauZon */}
        <Text style={styles.brandTitle}>cauZon</Text>

        {/* Indicateur d'activité blanc crème */}
        <View style={styles.spinnerWrapper}>
          <ActivityIndicator size="large" color="#FAF6EB" />
        </View>

        {/* Message d'état rassurance */}
        <Text style={styles.titreChargement}>Authentification Sécurisée</Text>
        <Text style={styles.sousTitreChargement}>
          {message || 'Connexion et synchronisation de votre espace étudiant...'}
        </Text>

        {/* Badge de sécurité discret */}
        <View style={styles.badgeSecurite}>
          <Ionicons name="shield-checkmark" size={14} color="#10B981" />
          <Text style={styles.texteBadgeSecurite}>Connexion chiffrée de bout en bout</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#6B1124', // Bordeaux officiel cauZon
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
  },
  haloAmbiant: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(250, 246, 235, 0.08)',
  },
  cardContainer: {
    alignItems: 'center',
    paddingHorizontal: 28,
    maxWidth: 360,
  },
  logoBadge: {
    width: 84,
    height: 84,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(250, 246, 235, 0.25)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
    overflow: 'hidden',
  },
  logoImage: {
    width: 78,
    height: 78,
    borderRadius: 20,
  },
  brandTitle: {
    marginTop: 14,
    fontSize: 22,
    fontWeight: '900',
    color: '#FAF6EB',
    letterSpacing: -0.5,
  },
  spinnerWrapper: {
    marginTop: 22,
    marginBottom: 14,
  },
  titreChargement: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FAF6EB',
    textAlign: 'center',
    marginBottom: 6,
  },
  sousTitreChargement: {
    fontSize: 13,
    color: 'rgba(250, 246, 235, 0.8)',
    textAlign: 'center',
    lineHeight: 18,
  },
  badgeSecurite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 26,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  texteBadgeSecurite: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FAF6EB',
    opacity: 0.9,
  },
});
