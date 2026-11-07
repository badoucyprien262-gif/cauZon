import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, ViewStyle, StyleProp, Platform } from 'react-native';
import { ANIMATIONS } from '../theme/animations';

interface TransitionPageProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
}

/**
 * 🚀 TransitionPage : Conteneur de vue à haute fluidité (60 FPS)
 *
 * Implémente :
 * - Fondu doux (opacity: 0 -> 1)
 * - Léger glissement vertical naturel (translateY: 14 -> 0)
 * - Durée calibrée : 280 ms
 * - Courbe naturelle : cubic-bezier(0.22, 1, 0.36, 1)
 * - Strictement hardware-accelerated (useNativeDriver: true, transform et opacity)
 * - Prise en compte de prefers-reduced-motion
 */
export default function TransitionPage({ children, style, delay = 0 }: TransitionPageProps) {
  const isReduced = ANIMATIONS.isReducedMotion();
  const animOpacity = useRef(new Animated.Value(isReduced ? 1 : 0)).current;
  const animTranslateY = useRef(new Animated.Value(isReduced ? 0 : 14)).current;
  const hasMounted = useRef(false);

  useEffect(() => {
    if (hasMounted.current || isReduced) return;
    hasMounted.current = true;

    Animated.parallel([
      Animated.timing(animOpacity, {
        toValue: 1,
        duration: ANIMATIONS.duration.page,
        delay,
        easing: ANIMATIONS.easing.naturel,
        useNativeDriver: true,
      }),
      Animated.timing(animTranslateY, {
        toValue: 0,
        duration: ANIMATIONS.duration.page,
        delay,
        easing: ANIMATIONS.easing.naturel,
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, isReduced]);

  return (
    <Animated.View
      style={[
        styles.pageWrapper,
        style,
        {
          opacity: animOpacity,
          transform: [{ translateY: animTranslateY }],
        },
        Platform.OS === 'web' && ({
          willChange: 'transform, opacity',
        } as any),
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pageWrapper: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
});

