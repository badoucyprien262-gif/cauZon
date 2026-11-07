import React, { useRef } from 'react';
import {
  Animated,
  TouchableOpacity,
  TouchableOpacityProps,
  Platform,
  StyleSheet,
} from 'react-native';
import { ANIMATIONS } from '../theme/animations';

export interface BoutonTactileProps extends TouchableOpacityProps {
  scaleActive?: number;
  duree?: number;
  children: React.ReactNode;
}

/**
 * ⚡ BoutonTactile : Bouton haute performance avec micro-interaction tactile instantanée
 *
 * - Compression active : active:scale-96 (défaut)
 * - Durée calibrée : 140 ms
 * - Courbe naturelle : cubic-bezier(0.22, 1, 0.36, 1)
 * - Suppression du délai tactile : delayPressIn={0}
 * - Sur Web : touch-action: manipulation et suppression de -webkit-tap-highlight-color
 * - Hardware accelerated : useNativeDriver: true (transform & opacity uniquement)
 */
export default function BoutonTactile({
  children,
  style,
  scaleActive = ANIMATIONS.scale.boutonActif,
  duree = ANIMATIONS.duration.bouton,
  onPressIn,
  onPressOut,
  disabled,
  activeOpacity = 0.9,
  ...rest
}: BoutonTactileProps) {
  const isReduced = ANIMATIONS.isReducedMotion();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = (e: any) => {
    if (disabled || isReduced) {
      if (onPressIn) onPressIn(e);
      return;
    }

    Animated.timing(scaleAnim, {
      toValue: scaleActive,
      duration: duree,
      easing: ANIMATIONS.easing.naturel,
      useNativeDriver: true,
    }).start();

    if (onPressIn) onPressIn(e);
  };

  const handlePressOut = (e: any) => {
    if (disabled || isReduced) {
      if (onPressOut) onPressOut(e);
      return;
    }

    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: duree,
      easing: ANIMATIONS.easing.naturel,
      useNativeDriver: true,
    }).start();

    if (onPressOut) onPressOut(e);
  };

  return (
    <Animated.View
      style={[
        { transform: [{ scale: scaleAnim }] },
        Platform.OS === 'web' && ({
          willChange: 'transform, opacity',
          touchAction: 'manipulation',
        } as any),
      ]}
    >
      <TouchableOpacity
        {...rest}
        disabled={disabled}
        activeOpacity={activeOpacity}
        delayPressIn={0}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          style,
          Platform.OS === 'web' && ({
            touchAction: 'manipulation',
            cursor: disabled ? 'default' : 'pointer',
            WebkitTapHighlightColor: 'transparent',
          } as any),
        ]}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

