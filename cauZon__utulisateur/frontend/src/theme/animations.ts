import { Easing, Platform } from 'react-native';

/**
 * ⚡ SYSTÈME D'ANIMATION ET MICRO-INTERACTIONS CAUZON
 *
 * Spécifications 60 FPS mobile :
 * 1. Durées centralisées :
 *    - Boutons : 140 ms
 *    - Cartes : 200 ms
 *    - Transitions de pages : 280 ms
 * 2. Courbe naturelle : cubic-bezier(0.22, 1, 0.36, 1)
 * 3. Propriétés animées : Strictement transform et opacity (zéro reflow/repaint)
 * 4. Compression tactile : active:scale-96 (boutons), active:scale-98 (cartes)
 */

export const ANIMATIONS = {
  // ⏱️ Durées en millisecondes
  duration: {
    bouton: 140,
    button: 140,
    carte: 200,
    card: 200,
    page: 280,
    pageTransition: 280,
  },

  // 📐 Courbe d'accélération naturelle fluide
  bezier: [0.22, 1, 0.36, 1] as const,
  cssBezier: 'cubic-bezier(0.22, 1, 0.36, 1)',

  easing: {
    // Easing React Native compatible useNativeDriver: true
    naturel: Easing.bezier(0.22, 1, 0.36, 1),
    natural: Easing.bezier(0.22, 1, 0.36, 1),
    css: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },

  // 🔍 Niveaux de compression tactile (scale)
  scale: {
    boutonActif: 0.96, // active:scale-95/96
    carteActive: 0.98, // active:scale-98
    normal: 1.0,
  },

  // ♿ Détection de prefers-reduced-motion
  isReducedMotion: (): boolean => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  },
};

export default ANIMATIONS;

