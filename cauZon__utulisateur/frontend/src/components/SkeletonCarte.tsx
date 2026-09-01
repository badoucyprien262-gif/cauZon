import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { useApp } from '../store/ContexteApp';

const { width } = Dimensions.get('window');
const LARGEUR_CARTE = (width - 40) / 2;

interface SkeletonCarteProps {
  largeur?: number;
}

export default function SkeletonCarte({ largeur }: SkeletonCarteProps) {
  const { couleurs } = useApp();
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: false,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 900,
          useNativeDriver: false,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [shimmerAnim]);

  const bgShimmer = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [
      couleurs.estSombre ? 'rgba(255, 255, 255, 0.05)' : 'rgba(127, 1, 31, 0.05)',
      couleurs.estSombre ? 'rgba(255, 255, 255, 0.12)' : 'rgba(127, 1, 31, 0.12)',
    ],
  });

  return (
    <View
      style={[
        styles.carte,
        {
          backgroundColor: couleurs.fondCarte,
          borderColor: couleurs.bordure,
        },
        largeur ? { width: largeur } : null,
      ]}
    >
      {/* Top badges */}
      <View style={styles.topRow}>
        <Animated.View style={[styles.badgePill, { backgroundColor: bgShimmer }]} />
        <Animated.View style={[styles.badgePillSmall, { backgroundColor: bgShimmer }]} />
      </View>

      {/* Thumbnail */}
      <Animated.View style={[styles.thumbnail, { backgroundColor: bgShimmer }]} />

      {/* Title & subtitle lines */}
      <View style={styles.content}>
        <Animated.View style={[styles.lineLong, { backgroundColor: bgShimmer }]} />
        <Animated.View style={[styles.lineShort, { backgroundColor: bgShimmer }]} />
        <Animated.View style={[styles.lineTiny, { backgroundColor: bgShimmer }]} />
      </View>

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: couleurs.bordure }]}>
        <Animated.View style={[styles.priceTag, { backgroundColor: bgShimmer }]} />
        <Animated.View style={[styles.actionBtn, { backgroundColor: bgShimmer }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  carte: {
    width: LARGEUR_CARTE,
    borderRadius: 18,
    marginBottom: 16,
    padding: 12,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  badgePill: {
    width: 60,
    height: 16,
    borderRadius: 8,
  },
  badgePillSmall: {
    width: 44,
    height: 16,
    borderRadius: 8,
  },
  thumbnail: {
    width: '100%',
    height: 86,
    borderRadius: 14,
    marginBottom: 12,
  },
  content: {
    marginBottom: 12,
    gap: 6,
  },
  lineLong: {
    width: '90%',
    height: 12,
    borderRadius: 6,
  },
  lineShort: {
    width: '65%',
    height: 10,
    borderRadius: 5,
  },
  lineTiny: {
    width: '40%',
    height: 9,
    borderRadius: 4,
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 10,
  },
  priceTag: {
    width: 55,
    height: 16,
    borderRadius: 8,
  },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
});
