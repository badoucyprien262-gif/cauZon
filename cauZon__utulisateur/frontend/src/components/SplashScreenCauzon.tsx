import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Platform, Easing } from 'react-native';

interface Props {
  onFinish: () => void;
  estPret?: boolean;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function SplashScreenCauzon({ onFinish, estPret = true }: Props) {
  const letters = ['c', 'a', 'u', 'Z', 'o', 'n'];
  const useNative = Platform.OS !== 'web';

  // 🛡️ Verrouillage du cycle de vie : état explicite de complétion de l'animation
  const [animationComplete, setAnimationComplete] = useState(false);

  // Valeurs animées pour chaque lettre du mot-symbole cauZon
  const letterAnims = useRef(
    letters.map(() => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(10),
      scale: new Animated.Value(0.75),
    }))
  ).current;

  // Valeurs animées globales (sous-titre, logo zoom et fondu de sortie progressif)
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const logoZoomScale = useRef(new Animated.Value(1)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;

  const estPretRef = useRef(estPret);
  estPretRef.current = estPret;

  const sortieDeclencheeRef = useRef(false);
  const unmountedRef = useRef(false);

  // 1. Séquence d'écriture caractère par caractère (autonome et garantie sans saut d'index)
  useEffect(() => {
    unmountedRef.current = false;
    let timerEcriture: any = null;
    let timerPause: any = null;

    // Timer de sécurité absolue (max 4.0s) pour garantir la libération en toute circonstance
    const safetyTimer = setTimeout(() => {
      if (!unmountedRef.current && !sortieDeclencheeRef.current) {
        sortieDeclencheeRef.current = true;
        declencherSortie();
      }
    }, 4000);

    // Paramètres temporels de l'effet écriture progressive
    const CADENCE_MS = 30; // Cadence stable et fluide (25ms - 35ms par caractère)
    const DUREE_LETTRE_MS = 180; // Transition d'apparition de chaque lettre
    const PAUSE_LECTURE_MS = 400; // Pause de confort pour lire le résultat final

    let indexCourant = 0;

    const animerLettre = (index: number) => {
      if (unmountedRef.current || index >= letters.length) return;

      Animated.parallel([
        Animated.timing(letterAnims[index].opacity, {
          toValue: 1,
          duration: DUREE_LETTRE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: useNative,
        }),
        Animated.timing(letterAnims[index].translateY, {
          toValue: 0,
          duration: DUREE_LETTRE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: useNative,
        }),
        Animated.timing(letterAnims[index].scale, {
          toValue: 1,
          duration: DUREE_LETTRE_MS,
          easing: Easing.out(Easing.back(1.4)),
          useNativeDriver: useNative,
        }),
      ]).start();
    };

    // Déclenchement de la première lettre immédiatement
    animerLettre(0);
    indexCourant = 1;

    // Écriture cadencée progressive garantie pour chaque lettre
    timerEcriture = setInterval(() => {
      if (indexCourant < letters.length) {
        animerLettre(indexCourant);
        indexCourant++;
      } else {
        clearInterval(timerEcriture);
        timerEcriture = null;

        // 100% des lettres ont été déclenchées -> apparition élégante du sous-titre
        Animated.timing(subtitleOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.ease),
          useNativeDriver: useNative,
        }).start();

        // Verrouillage du cycle de vie :
        // Attendre que la dernière lettre ait terminé son animation (DUREE_LETTRE_MS)
        // + temps de pause obligatoire de 400ms pour permettre la lecture complète
        timerPause = setTimeout(() => {
          if (!unmountedRef.current) {
            setAnimationComplete(true);
          }
        }, DUREE_LETTRE_MS + PAUSE_LECTURE_MS);
      }
    }, CADENCE_MS);

    return () => {
      unmountedRef.current = true;
      if (timerEcriture) clearInterval(timerEcriture);
      if (timerPause) clearTimeout(timerPause);
      clearTimeout(safetyTimer);
    };
  }, []);

  // 2. Transition de sortie fluide en fondu progressif (~300ms)
  const declencherSortie = () => {
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: useNative,
      }),
      Animated.timing(logoZoomScale, {
        toValue: 1.05,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: useNative,
      }),
    ]).start(() => {
      if (!unmountedRef.current && onFinish) {
        onFinish();
      }
    });
  };

  // 3. Condition stricte de démontage : isAppReady && animationComplete
  useEffect(() => {
    if (estPret && animationComplete && !sortieDeclencheeRef.current) {
      sortieDeclencheeRef.current = true;
      declencherSortie();
    }
  }, [estPret, animationComplete]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: overlayOpacity,
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
            transform: [{ scale: logoZoomScale }],
          },
        ]}
      >
        <View style={styles.lettersRow}>
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
                      { translateY: anim.translateY },
                      { scale: anim.scale },
                    ],
                  },
                ]}
              >
                {letter}
              </Animated.Text>
            );
          })}
        </View>

        {/* Sous-titre institutionnel cauZon révélé en fin d'écriture */}
        <Animated.View style={[styles.subtitleContainer, { opacity: subtitleOpacity }]}>
          <Text style={styles.subtitleText}>EXCELLENCE ACADÉMIQUE</Text>
        </Animated.View>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  lettersRow: {
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
  subtitleContainer: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  subtitleText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
    letterSpacing: 2.2,
  },
});
