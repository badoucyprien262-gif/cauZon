import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Platform } from 'react-native';

interface Props {
  onFinish: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function SplashScreenCauzon({ onFinish }: Props) {
  const letters = ['c', 'a', 'u', 'Z', 'o', 'n'];
  const useNative = Platform.OS !== 'web';

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
    // Timer de sécurité absolue pour garantir la libération de l'écran quoi qu'il arrive
    const safetyTimer = setTimeout(() => {
      if (onFinish) onFinish();
    }, 2100);

    // 1. Séquence en cascade (Stagger) de chaque lettre (0.0s -> 0.75s)
    const staggerAnimations = letterAnims.map((anim) =>
      Animated.parallel([
        Animated.timing(anim.opacity, {
          toValue: 1,
          duration: 380,
          useNativeDriver: useNative,
        }),
        Animated.timing(anim.translateX, {
          toValue: 0,
          duration: 380,
          useNativeDriver: useNative,
        }),
        Animated.timing(anim.scale, {
          toValue: 1,
          duration: 380,
          useNativeDriver: useNative,
        }),
      ])
    );

    // Lancer la séquence complète fluide
    Animated.sequence([
      // Phase 1 : Cascade de lettres
      Animated.stagger(70, staggerAnimations),
      // Légère stabilisation
      Animated.delay(180),
      // Phase 2 : Twist Zoom Immersif vers le plein écran
      Animated.parallel([
        Animated.timing(logoZoomScale, {
          toValue: 4.8,
          duration: 480,
          useNativeDriver: useNative,
        }),
        Animated.timing(logoZoomOpacity, {
          toValue: 0,
          duration: 450,
          useNativeDriver: useNative,
        }),
        Animated.timing(overlayScale, {
          toValue: 1.25,
          duration: 520,
          useNativeDriver: useNative,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 520,
          useNativeDriver: useNative,
        }),
      ]),
    ]).start(() => {
      clearTimeout(safetyTimer);
      if (onFinish) {
        onFinish();
      }
    });

    return () => {
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
    ...StyleSheet.absoluteFillObject,
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
