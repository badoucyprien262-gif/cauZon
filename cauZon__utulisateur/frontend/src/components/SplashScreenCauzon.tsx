import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Platform } from 'react-native';

interface Props {
  onFinish: () => void;
  estPret?: boolean;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function SplashScreenCauzon({ onFinish, estPret = true }: Props) {
  const letters = ['c', 'a', 'u', 'Z', 'o', 'n'];
  const useNative = Platform.OS !== 'web';
  const estPretRef = useRef(estPret);
  estPretRef.current = estPret;

  // Valeurs animées pour chaque lettre
  const letterAnims = useRef(
    letters.map(() => ({
      opacity: new Animated.Value(0),
      translateX: new Animated.Value(-12),
      scale: new Animated.Value(0.7),
    }))
  ).current;

  // Valeurs animées globales pour le Twist Zoom et le Fade Out
  const logoZoomScale = useRef(new Animated.Value(1)).current;
  const logoZoomOpacity = useRef(new Animated.Value(1)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const overlayScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let unmounted = false;

    // Timer de sécurité absolue (max 3.5s) pour garantir la libération de l'écran quoi qu'il arrive
    const safetyTimer = setTimeout(() => {
      if (!unmounted && onFinish) onFinish();
    }, 3500);

    // 1. Séquence en cascade (Stagger) de chaque lettre (0.0s -> 0.50s)
    const staggerAnimations = letterAnims.map((anim) =>
      Animated.parallel([
        Animated.timing(anim.opacity, {
          toValue: 1,
          duration: 240,
          useNativeDriver: useNative,
        }),
        Animated.timing(anim.translateX, {
          toValue: 0,
          duration: 240,
          useNativeDriver: useNative,
        }),
        Animated.timing(anim.scale, {
          toValue: 1,
          duration: 240,
          useNativeDriver: useNative,
        }),
      ])
    );

    // Phase 1 : Cascade vive et prestigieuse de lettres (~500ms)
    Animated.sequence([
      Animated.stagger(40, staggerAnimations),
      Animated.delay(60),
    ]).start(async () => {
      if (unmounted) return;

      // 🛡️ Barrière de synchronisation : attendre que les données soient prêtes (max 1.2s supplémentaire)
      const startTime = Date.now();
      while (!estPretRef.current && Date.now() - startTime < 1200) {
        await new Promise((r) => setTimeout(r, 40));
        if (unmounted) return;
      }

      // Phase 2 : Twist Zoom Immersif vers le plein écran avec transition d'opacité fluide (200ms)
      Animated.parallel([
        Animated.timing(logoZoomScale, {
          toValue: 3.2,
          duration: 200,
          useNativeDriver: useNative,
        }),
        Animated.timing(logoZoomOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: useNative,
        }),
        Animated.timing(overlayScale, {
          toValue: 1.08,
          duration: 200,
          useNativeDriver: useNative,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: useNative,
        }),
      ]).start(() => {
        clearTimeout(safetyTimer);
        if (!unmounted && onFinish) {
          onFinish();
        }
      });
    });

    return () => {
      unmounted = true;
      clearTimeout(safetyTimer);
    };
  }, [letterAnims, logoZoomScale, logoZoomOpacity, overlayOpacity, overlayScale, onFinish, useNative]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: overlayOpacity,
          transform: [{ scale: overlayScale }],
        },
      ]}
      pointerEvents="none"
    >
      {/* Halo d'ambiance blanc subtil */}
      <View style={styles.ambientHalo} />

      {/* Conteneur animé du Logo cauZon */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: logoZoomOpacity,
            transform: [{ scale: logoZoomScale }],
          },
        ]}
      >
        {letters.map((letter, index) => {
          const anim = letterAnims[index];
          const isSpecialZ = letter === 'Z';

          return (
            <Animated.Text
              key={index}
              style={[
                styles.letter,
                isSpecialZ && styles.letterZ,
                {
                  opacity: anim.opacity,
                  transform: [
                    { translateX: anim.translateX },
                    { scale: anim.scale },
                  ],
                },
              ]}
            >
              {letter}
            </Animated.Text>
          );
        })}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#7F011F', // Bordeaux officiel cauZon
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  ambientHalo: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    color: '#FFFFFF', // Blanc Pur officiel
    fontSize: Platform.OS === 'web' ? 96 : 82,
    fontWeight: '900',
    letterSpacing: -1.5,
    includeFontPadding: false,
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 16,
  },
  letterZ: {
    letterSpacing: -1,
  },
});
