import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Animated,
  TouchableOpacity,
  Platform,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../store/ContexteApp';

export interface ToastProps {
  visible: boolean;
  message: string;
  titre?: string;
  type?: 'success' | 'info' | 'error';
  dureeMs?: number;
  onFermer: () => void;
}

export default function ToastNotification({
  visible,
  message,
  titre,
  type = 'success',
  dureeMs = 3200,
  onFermer,
}: ToastProps) {
  const { couleurs } = useApp();
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: Platform.OS === 'ios' ? 50 : 20,
          useNativeDriver: true,
          bounciness: 6,
          speed: 12,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
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

  const masquerToast = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -120,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (visible) onFermer();
    });
  };

  if (!visible) return null;

  const getThemeDetails = () => {
    switch (type) {
      case 'success':
        return {
          icon: 'checkmark-circle' as const,
          iconColor: '#10B981',
          accentColor: '#10B981',
          titreDefaut: 'Opération Réussie ✨',
        };
      case 'error':
        return {
          icon: 'alert-circle' as const,
          iconColor: '#EF4444',
          accentColor: '#EF4444',
          titreDefaut: 'Attention ⚠️',
        };
      case 'info':
      default:
        return {
          icon: 'information-circle' as const,
          iconColor: '#6B1124',
          accentColor: '#6B1124',
          titreDefaut: 'Notification cauZon',
        };
    }
  };

  const { icon, iconColor, accentColor, titreDefaut } = getThemeDetails();

  return (
    <Animated.View
      style={[
        styles.toastWrapper,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <TouchableOpacity
        style={[
          styles.toastContainer,
          {
            backgroundColor: couleurs.estSombre ? '#1E1E24' : '#FAF6EB',
            borderColor: accentColor,
            shadowColor: accentColor,
          },
        ]}
        activeOpacity={0.9}
        onPress={masquerToast}
      >
        <View style={[styles.iconCircle, { backgroundColor: `${iconColor}18` }]}>
          <Ionicons name={icon} size={22} color={iconColor} />
        </View>

        <View style={styles.textContainer}>
          <Text
            style={[
              styles.toastTitle,
              { color: couleurs.estSombre ? '#FFFFFF' : '#6B1124' },
            ]}
          >
            {titre || titreDefaut}
          </Text>
          <Text
            style={[
              styles.toastMessage,
              { color: couleurs.estSombre ? 'rgba(255,255,255,0.75)' : '#4B5563' },
            ]}
            numberOfLines={2}
          >
            {message}
          </Text>
        </View>

        <TouchableOpacity onPress={masquerToast} style={styles.closeBtn}>
          <Ionicons
            name="close"
            size={18}
            color={couleurs.estSombre ? '#9CA3AF' : '#6B7280'}
          />
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
    zIndex: 99999,
    alignItems: 'center',
  },
  toastContainer: {
    width: '100%',
    maxWidth: 480,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
    gap: 12,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
  toastTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  toastMessage: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  closeBtn: {
    padding: 4,
    marginLeft: 4,
  },
});
