import React, { useEffect, useRef } from 'react';
import { StyleSheet, TouchableOpacity, Animated, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface AnimatedThemeToggleProps {
  isDark: boolean;
  onToggle: () => void;
}

export default function BoutonThemeAnime({ isDark, onToggle }: AnimatedThemeToggleProps) {
  const animValue = useRef(new Animated.Value(isDark ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(animValue, {
      toValue: isDark ? 1 : 0,
      bounciness: 8,
      speed: 12,
      useNativeDriver: false,
    }).start();
  }, [isDark]);

  const translateX = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 26],
  });

  const backgroundColor = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['#E5E7EB', '#6B1124'],
  });

  const knobColor = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FFFFFF', '#FAF6EB'],
  });

  const rotate = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onToggle}
      style={styles.touchable}
    >
      <Animated.View style={[styles.track, { backgroundColor }]}>
        <Animated.View
          style={[
            styles.knob,
            {
              transform: [{ translateX }],
              backgroundColor: knobColor,
            },
          ]}
        >
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Ionicons
              name={isDark ? 'moon' : 'sunny'}
              size={13}
              color={isDark ? '#6B1124' : '#F59E0B'}
            />
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchable: {
    padding: 4,
  },
  track: {
    width: 52,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(107, 17, 36, 0.2)',
  },
  knob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 3,
  },
});
