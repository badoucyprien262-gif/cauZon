import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Animated,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from './AppIcon';
import { useApp } from '../store/ContexteApp';

export type ToastType = 'info' | 'succes' | 'erreur' | 'success' | 'error';

export interface ToastProps {
  visible: boolean;
  message: string;
  titre?: string;
  type?: ToastType;
  dureeMs?: number;
  onFermer: () => void;
}

/**
 * 🏝️ Toast "Dynamic Island" adaptatif (Mode Clair & Sombre)
 * Capsule flottante arrondie, animations douces, couleurs harmonisées avec le thème CauZon.
 */
export default function ToastNotification({
  visible,
  message,
  titre,
  type = 'succes',
  dureeMs = 3200,
  onFermer,
}: ToastProps) {
  const { couleurs } = useApp();
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  const typeNormalise = (type === 'success' ? 'succes' : type === 'error' ? 'erreur' : type) as 'succes' | 'erreur' | 'info';

  const masquerToast = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -120,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.92,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (visible) onFermer();
    });
  };

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: Platform.OS === 'ios' ? 52 : Platform.OS === 'web' ? 24 : 32,
          useNativeDriver: true,
          bounciness: 5,
          speed: 13,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          bounciness: 4,
          speed: 14,
        }),
      ]).start();

      const timer = setTimeout(() => {
        masquerToast();
      }, dureeMs);

      return () => clearTimeout(timer);
    } else {
      masquerToast();
    }
  }, [visible]);

  if (!visible) return null;

  // Configuration sémantique des variantes adaptées au thème
  const getThemeDetails = () => {
    const isDark = couleurs.estSombre;

    switch (typeNormalise) {
      case 'succes':
        return {
          icon: 'checkmark-circle' as const,
          iconColor: '#10B981',
          accentColor: '#10B981',
          titreDefaut: 'Succès ✨',
          bgCircle: isDark ? 'rgba(16, 185, 129, 0.18)' : 'rgba(16, 185, 129, 0.12)',
        };
      case 'erreur':
        return {
          icon: 'alert-circle' as const,
          iconColor: isDark ? '#F87171' : '#E74C3C',
          accentColor: isDark ? '#EF4444' : '#C0392B',
          titreDefaut: 'Attention ⚠️',
          bgCircle: isDark ? 'rgba(239, 68, 68, 0.20)' : 'rgba(192, 57, 43, 0.12)',
        };
      case 'info':
      default:
        return {
          icon: 'information-circle' as const,
          iconColor: isDark ? '#F59E0B' : '#6B1124',
          accentColor: isDark ? '#F59E0B' : '#6B1124',
          titreDefaut: 'Information CauZon',
          bgCircle: isDark ? 'rgba(245, 158, 11, 0.18)' : 'rgba(107, 17, 36, 0.10)',
        };
    }
  };

  const { icon, iconColor, accentColor, titreDefaut, bgCircle } = getThemeDetails();
  const isDark = couleurs.estSombre;

  // Couleurs de fond et bordures selon la spécification
  // Clair : fond crème doux #FAF6EB, bordure discrète, texte et icône bordeaux #6B1124
  // Sombre : fond sombre profond #1E1B18 / #2A181D, bordure subtile ambrée/bordeaux, texte clair
  const backgroundColor = isDark ? '#1E1B18' : '#FAF6EB';
  const borderColor = isDark
    ? typeNormalise === 'succes'
      ? 'rgba(16, 185, 129, 0.45)'
      : typeNormalise === 'erreur'
      ? 'rgba(239, 68, 68, 0.45)'
      : 'rgba(245, 158, 11, 0.35)'
    : typeNormalise === 'succes'
    ? 'rgba(16, 185, 129, 0.35)'
    : typeNormalise === 'erreur'
    ? 'rgba(192, 57, 43, 0.35)'
    : 'rgba(107, 17, 36, 0.20)';

  const titleColor = isDark ? '#FAF6EB' : '#6B1124';
  const messageColor = isDark ? 'rgba(250, 246, 235, 0.85)' : '#4B5563';
  const closeColor = isDark ? 'rgba(250, 246, 235, 0.6)' : '#6B7280';

  return (
    <Animated.View
      style={[
        styles.toastWrapper,
        {
          transform: [{ translateY }, { scale }],
          opacity,
        },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <TouchableOpacity
        style={[
          styles.islandContainer,
          {
            backgroundColor,
            borderColor,
            shadowColor: isDark ? '#000000' : '#6B1124',
          },
        ]}
        activeOpacity={0.92}
        onPress={masquerToast}
      >
        {/* Pastille Icône */}
        <View style={[styles.iconCircle, { backgroundColor: bgCircle }]}>
          <Ionicons name={icon} size={22} color={iconColor} />
        </View>

        {/* Textes (Titre + Message) */}
        <View style={styles.textContainer}>
          <Text style={[styles.toastTitle, { color: titleColor }]} numberOfLines={1}>
            {titre || titreDefaut}
          </Text>
          <Text style={[styles.toastMessage, { color: messageColor }]} numberOfLines={2}>
            {message}
          </Text>
        </View>

        {/* Bouton Fermer */}
        <TouchableOpacity
          onPress={masquerToast}
          style={styles.closeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Fermer la notification"
        >
          <Ionicons name="close" size={18} color={closeColor} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toastWrapper: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    zIndex: 999999,
    alignItems: 'center',
  },
  islandContainer: {
    width: '100%',
    maxWidth: 480,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 24, // Style Dynamic Island capsule
    borderWidth: 1.2,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 12,
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  toastTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.15,
    marginBottom: 1,
  },
  toastMessage: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 12,
  },
});
