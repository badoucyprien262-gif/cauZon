import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Platform, Easing } from 'react-native';
import * as ExpoSplashScreen from 'expo-splash-screen';

// ─────────────────────────────────────────────────────────────────────────────
// Chronologie cible (~1,55 s avant onAnimationFinish + 350 ms zoom + 250 ms fade) :
//   100 ms  → délai initial (premier rendu RN + hideAsync natif)
//   500 ms  → écriture progressive des 6 lettres (5 × 100 ms de stagger)
//   600 ms  → durée d'animation de chaque lettre (bezier 0.22,1,0.36,1)
//   150 ms  → Hold du logo complet stabilisé
//   350 ms  → scale-up cinématographique 1→1.08 (chevauchement fade-out)
//   250 ms  → fade-out overlay géré par App.tsx (en parallèle du zoom)
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  /** Appelé quand le cycle animation + hold est terminé (déclenche le fade-out App). */
  onAnimationFinish: () => void;
  /** Données/auth chargées — débloque le callback si l'animation est déjà finie. */
  appReady?: boolean;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Masquage one-shot du splash natif Expo (appelé au premier montage du composant)
let _nativeHideCalled = false;
function masquerSplashNatif(): void {
  if (_nativeHideCalled || Platform.OS === 'web') return;
  _nativeHideCalled = true;
  ExpoSplashScreen.hideAsync().catch(() => {});
}

export default function SplashScreenCauzon({ onAnimationFinish, appReady = false }: Props) {
  const letters = ['c', 'a', 'u', 'Z', 'o', 'n'];
  const useNative = Platform.OS !== 'web';

  // État interne : animation construction + hold terminée
  const [animationFinished, setAnimationFinished] = useState(false);

  // Valeurs animées pour chaque lettre du mot-symbole cauZon
  const letterAnims = useRef(
    letters.map(() => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(12),
      scale: new Animated.Value(0.72),
    }))
  ).current;

  // Valeurs animées globales
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const logoZoomScale = useRef(new Animated.Value(1)).current;

  const unmountedRef = useRef(false);
  const finishCalledRef = useRef(false);

  // ─── Masquage du splash natif dès le premier rendu ───────────────────────
  useEffect(() => {
    masquerSplashNatif();
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  // ─── Séquence d'animation principale ────────────────────────────────────
  useEffect(() => {
    unmountedRef.current = false;

    // Paramètres chronologiques (directives affinées)
    const DELAI_INITIAL_MS = 100;   // Pause avant la première lettre
    const CADENCE_MS = 100;          // Stagger typographique : 100 ms entre chaque lettre
    const DUREE_LETTRE_MS = 600;     // Animation d'apparition de chaque lettre (distincte)
    const HOLD_MS = 150;             // Maintien logo complet stabilisé avant callback

    // Courbe premium : "spring naturel" (ease-out très prononcé)
    const EASING_LETTRE = Easing.bezier(0.22, 1, 0.36, 1);

    // Timer de sécurité absolue (max 5 s)
    const safetyTimer = setTimeout(() => {
      if (!unmountedRef.current && !finishCalledRef.current) {
        setAnimationFinished(true);
      }
    }, 5000);

    let timerDelai: ReturnType<typeof setTimeout> | null = null;
    let timerEcriture: ReturnType<typeof setInterval> | null = null;
    let timerHold: ReturnType<typeof setTimeout> | null = null;

    const animerLettre = (index: number) => {
      if (unmountedRef.current || index >= letters.length) return;

      Animated.parallel([
        Animated.timing(letterAnims[index].opacity, {
          toValue: 1,
          duration: DUREE_LETTRE_MS,
          easing: EASING_LETTRE,
          useNativeDriver: useNative,
        }),
        Animated.timing(letterAnims[index].translateY, {
          toValue: 0,
          duration: DUREE_LETTRE_MS,
          easing: EASING_LETTRE,
          useNativeDriver: useNative,
        }),
        Animated.timing(letterAnims[index].scale, {
          toValue: 1,
          duration: DUREE_LETTRE_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: useNative,
        }),
      ]).start();
    };

    // Délai initial de 100 ms
    timerDelai = setTimeout(() => {
      let indexCourant = 0;

      // Première lettre immédiatement
      animerLettre(0);
      indexCourant = 1;

      // Écriture cadencée progressive
      timerEcriture = setInterval(() => {
        if (indexCourant < letters.length) {
          animerLettre(indexCourant);
          indexCourant++;
        } else {
          clearInterval(timerEcriture!);
          timerEcriture = null;

          // Apparition élégante du sous-titre après la dernière lettre
          Animated.timing(subtitleOpacity, {
            toValue: 1,
            duration: 300,
            easing: Easing.out(Easing.ease),
            useNativeDriver: useNative,
          }).start();

          // Hold : attendre la fin de la dernière lettre + 150 ms de stabilisation
          timerHold = setTimeout(() => {
            if (!unmountedRef.current) {
              setAnimationFinished(true);
            }
          }, DUREE_LETTRE_MS + HOLD_MS);
        }
      }, CADENCE_MS);
    }, DELAI_INITIAL_MS);

    return () => {
      unmountedRef.current = true;
      if (timerDelai) clearTimeout(timerDelai);
      if (timerEcriture) clearInterval(timerEcriture);
      if (timerHold) clearTimeout(timerHold);
      clearTimeout(safetyTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Contrat de Synchronisation : appReady && animationFinished ──────────
  // Déclenche le scale-up cinématographique EN PARALLÈLE de onAnimationFinish,
  // de sorte que le zoom (350 ms) chevauche le fade-out d'App.tsx (250 ms).
  // L'effet final : le logo grossit doucement pendant qu'il s'estompe.
  useEffect(() => {
    if (appReady && animationFinished && !finishCalledRef.current) {
      finishCalledRef.current = true;

      // Scale-up cinématographique 1 → 1.08 sur 350 ms
      // Courbe Easing.bezier(0.25, 0.1, 0.25, 1) : démarrage doux, progression naturelle
      Animated.timing(logoZoomScale, {
        toValue: 1.08,
        duration: 350,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: useNative,
      }).start();

      // Déclencher le fade-out App.tsx immédiatement (en parallèle du zoom)
      // Le zoom continue de s'exécuter pendant que l'overlay s'estompe.
      if (!unmountedRef.current) {
        onAnimationFinish();
      }
    }
  }, [appReady, animationFinished]);

  // Ce composant ne gère plus l'opacité de sortie (délégué à App.tsx).
  // Il reste monté et visible (opacité 1) jusqu'à ce qu'App.tsx le démonte
  // après son propre fade-out de 250 ms.
  return (
    <Animated.View style={styles.container} pointerEvents="none">
      {/* Halo d'ambiance blanc subtil */}
      <View style={styles.ambientHalo} />

      {/* Conteneur animé du Logo cauZon */}
      <Animated.View
        style={[
          styles.logoContainer,
          { transform: [{ scale: logoZoomScale }] },
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
    color: '#FFFFFF',
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
