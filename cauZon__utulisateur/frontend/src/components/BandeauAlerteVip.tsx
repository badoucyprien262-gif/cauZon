import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../store/ContexteApp';

interface BandeauAlerteVipProps {
  onRenouveler: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function BandeauAlerteVip({ onRenouveler, style }: BandeauAlerteVipProps) {
  const { vipExpireAt, estAbonneVIP, estVip, aAccesVip, couleurs } = useApp();

  const isVip = aAccesVip ?? (estVip || estAbonneVIP);
  if (!isVip || !vipExpireAt) return null;

  const dateExpiration = new Date(vipExpireAt);
  if (isNaN(dateExpiration.getTime())) return null;

  const now = new Date();
  const diffHeures = (dateExpiration.getTime() - now.getTime()) / (1000 * 60 * 60);
  const diffJours = Math.ceil(diffHeures / 24);

  // Alerte active uniquement à J-2 et J-1 (diffJours <= 2 && diffJours > 0)
  if (diffJours <= 0 || diffJours > 2) return null;

  const texteExpiration = `⚠️ Votre formule expire dans ${diffJours} jour${diffJours > 1 ? 's' : ''}. Renouvelez pour conserver l'accès.`;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.contentRow}>
        <View style={styles.iconWrapper}>
          <Ionicons name="warning" size={20} color="#D97706" />
        </View>
        <View style={styles.textWrapper}>
          <Text style={styles.messageText}>{texteExpiration}</Text>
        </View>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onRenouveler}
          activeOpacity={0.85}
        >
          <Ionicons name="sparkles" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
          <Text style={styles.actionButtonText}>Renouveler</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#B45309',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FDE68A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  textWrapper: {
    flex: 1,
    marginRight: 8,
  },
  messageText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#92400E',
    lineHeight: 17,
  },
  actionButton: {
    backgroundColor: '#D97706',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
