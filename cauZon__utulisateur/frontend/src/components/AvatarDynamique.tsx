import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Image,
  Platform,
} from 'react-native';
import { useApp } from '../store/ContexteApp';
import { TOKENS } from '../theme/couleurs';

// ─── Utilitaires ─────────────────────────────────────────────────────────────

/** Extrait les initiales d'un nom complet (ex: "Jean Dupont" → "JD") */
const getInitiales = (nom: string): string => {
  const parts = nom.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'C';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/** Détermine si une URL est valide et chargeable */
const estUrlValide = (url?: string): boolean => {
  if (!url || url.trim() === '') return false;
  if (url.startsWith('avatar-')) return false;
  return url.startsWith('http') || url.startsWith('file') || url.startsWith('data:') || url.startsWith('blob:');
};

const getEmojiFromId = (id?: string): string | null => {
  if (!id) return null;
  const map: Record<string, string> = {
    'avatar-1': '👨‍🎓',
    'avatar-2': '👩‍🎓',
    'avatar-3': '🧑‍🔬',
    'avatar-4': '📚',
    'avatar-5': '💡',
    'avatar-6': '💼',
    'photo-perso': '📸',
  };
  if (map[id]) return map[id];
  if (id.length <= 4 && /\p{Emoji}/u.test(id)) return id;
  return null;
};

/** Génère une couleur de fond déterministe à partir du nom (toujours la même pour le même nom) */
const getCouleurFondAvatar = (nom: string): string => {
  const COULEURS_FOND = [
    '#7F011F', '#5A0015', '#C0392B',
    '#1A6B3C', '#2C4E8A', '#6B2FA0',
    '#8B4513', '#0E7490', '#B45309',
  ];
  let hash = 0;
  for (let i = 0; i < nom.length; i++) {
    hash = nom.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COULEURS_FOND[Math.abs(hash) % COULEURS_FOND.length];
};

// ─── Silhouette SVG Neutre (fallback final) ───────────────────────────────────
// Rendu en React Native pur sans dépendance SVG supplémentaire

function SilhouetteFallback({ taille, couleurFond }: { taille: number; couleurFond: string }) {
  const r = taille / 2;
  const headR = taille * 0.22;
  const bodyW = taille * 0.48;
  const bodyH = taille * 0.3;
  const bodyY = taille * 0.54;

  return (
    <View
      style={{
        width: taille,
        height: taille,
        borderRadius: r,
        backgroundColor: couleurFond,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Tête */}
      <View
        style={{
          width: headR * 2,
          height: headR * 2,
          borderRadius: headR,
          backgroundColor: 'rgba(255,255,255,0.6)',
          position: 'absolute',
          top: taille * 0.18,
        }}
      />
      {/* Corps demi-ellipse */}
      <View
        style={{
          width: bodyW,
          height: bodyH,
          borderTopLeftRadius: bodyW / 2,
          borderTopRightRadius: bodyW / 2,
          backgroundColor: 'rgba(255,255,255,0.5)',
          position: 'absolute',
          top: bodyY,
        }}
      />
    </View>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AvatarDynamiqueProps {
  /** Taille en pixels (largeur = hauteur = taille) */
  taille?: number;
  /** URL de la photo custom ou Google */
  photoUrl?: string;
  /** Nom de l'utilisateur (pour les initiales) */
  nom?: string;
  /** Affiche une couronne VIP si true */
  estVip?: boolean;
  /** Affiche un badge de notification si true */
  aNotification?: boolean;
  /** Style container optionnel */
  style?: object;
}

// ─── Composant Principal ──────────────────────────────────────────────────────

export default function AvatarDynamique({
  taille = 44,
  photoUrl,
  nom,
  estVip = false,
  aNotification = false,
  style,
}: AvatarDynamiqueProps) {
  const { couleurs, photoProfil, nomUtilisateur } = useApp();

  // Résolution de la photo à afficher
  const urlFinale = photoUrl ?? (estUrlValide(photoProfil) ? photoProfil : '');
  const nomFinal = nom ?? nomUtilisateur ?? 'C';
  const initiales = getInitiales(nomFinal);
  const couleurFond = getCouleurFondAvatar(nomFinal);

  // Animation pulsation badge notification
  const pulsAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!aNotification) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulsAnim, { toValue: 1.35, duration: 600, useNativeDriver: true }),
        Animated.timing(pulsAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [aNotification, pulsAnim]);

  // Animation scale au mount pour l'effet "pop"
  const mountScale = useRef(new Animated.Value(0.7)).current;
  const mountOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(mountScale, { toValue: 1, tension: 80, friction: 7, useNativeDriver: true }),
      Animated.timing(mountOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [mountScale, mountOpacity]);

  const borderRadius = taille / 2;
  const badgeTaille = Math.max(10, taille * 0.26);

  return (
    <Animated.View
      style={[
        styles.container,
        { width: taille, height: taille },
        { transform: [{ scale: mountScale }], opacity: mountOpacity },
        style,
      ]}
    >
      {/* ── Corps de l'avatar ── */}
      {estUrlValide(urlFinale) ? (
        // Priorité 1 : Photo personnalisée / Google / Galerie / Caméra
        <Image
          source={{ uri: urlFinale }}
          style={{ width: taille, height: taille, borderRadius }}
          resizeMode="cover"
        />
      ) : getEmojiFromId(urlFinale || photoProfil) ? (
        // Priorité 2 : Emoji sélectionné par l'étudiant
        <View
          style={[
            styles.fondInitiales,
            {
              width: taille,
              height: taille,
              borderRadius,
              backgroundColor: couleurFond,
            },
          ]}
        >
          <Text style={{ fontSize: taille * 0.48 }}>
            {getEmojiFromId(urlFinale || photoProfil)}
          </Text>
        </View>
      ) : initiales.length > 0 ? (
        // Priorité 3 : Initiales génératrices
        <View
          style={[
            styles.fondInitiales,
            {
              width: taille,
              height: taille,
              borderRadius,
              backgroundColor: couleurFond,
            },
          ]}
        >
          <Text
            style={[
              styles.textInitiales,
              {
                fontSize: taille * 0.36,
                color: '#FFFFFF',
                fontWeight: TOKENS.fontWeight.black,
              },
            ]}
          >
            {initiales}
          </Text>
        </View>
      ) : (
        // Priorité 4 : Silhouette SVG neutre
        <SilhouetteFallback taille={taille} couleurFond={couleurFond} />
      )}

      {/* ── Couronne VIP ── */}
      {estVip && (
        <View style={[styles.badgeVip, { top: -taille * 0.08, right: -taille * 0.08 }]}>
          <Text style={{ fontSize: badgeTaille * 0.9 }}>👑</Text>
        </View>
      )}

      {/* ── Badge notification ── */}
      {aNotification && !estVip && (
        <Animated.View
          style={[
            styles.badgeNotif,
            {
              width: badgeTaille,
              height: badgeTaille,
              borderRadius: badgeTaille / 2,
              top: 0,
              right: 0,
              transform: [{ scale: pulsAnim }],
              borderColor: couleurs.fondCarte,
              backgroundColor: couleurs.erreur,
            },
          ]}
        />
      )}

      {/* ── Bordure Ring (si VIP) ── */}
      {estVip && (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              borderRadius,
              borderWidth: 2,
              borderColor: '#6B1124',
            },
          ]}
        />
      )}
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  fondInitiales: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  textInitiales: {
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
  badgeVip: {
    position: 'absolute',
    zIndex: 10,
  },
  badgeNotif: {
    position: 'absolute',
    zIndex: 10,
    borderWidth: 2,
  },
});
