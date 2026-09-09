import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from './AppIcon';
import { useApp } from '../store/ContexteApp';

export type ConfirmationType = 'danger' | 'warning' | 'info' | 'succes';

export interface ModaleConfirmationCauzonProps {
  visible: boolean;
  titre: string;
  message: string;
  texteConfirmer?: string;
  texteAnnuler?: string;
  icone?: string;
  type?: ConfirmationType;
  chargement?: boolean;
  onConfirmer: () => void | Promise<void>;
  onAnnuler: () => void;
}

/**
 * 🏛️ Modale de Confirmation Élégante CauZon
 * Remplace définitivement les boîtes de dialogue système grises Alert.alert()
 * par un design épuré, respectant la charte bordeaux/ivoire/or avec support sombre & clair.
 */
export default function ModaleConfirmationCauzon({
  visible,
  titre,
  message,
  texteConfirmer = 'Confirmer',
  texteAnnuler = 'Annuler',
  icone,
  type = 'danger',
  chargement = false,
  onConfirmer,
  onAnnuler,
}: ModaleConfirmationCauzonProps) {
  const { couleurs } = useApp();
  const isDark = couleurs.estSombre;

  if (!visible) return null;

  // Configuration sémantique de l'icône et des accents
  const getThemeConfig = () => {
    switch (type) {
      case 'danger':
        return {
          iconeDefaut: 'trash-outline' as const,
          couleurAccent: '#DC2626',
          bgCercle: isDark ? 'rgba(220, 38, 38, 0.20)' : 'rgba(220, 38, 38, 0.12)',
          bgBoutonConfirmer: '#6B1124',
          couleurTexteBouton: '#FFFFFF',
        };
      case 'warning':
        return {
          iconeDefaut: 'warning-outline' as const,
          couleurAccent: '#F59E0B',
          bgCercle: isDark ? 'rgba(245, 158, 11, 0.20)' : 'rgba(245, 158, 11, 0.14)',
          bgBoutonConfirmer: '#6B1124',
          couleurTexteBouton: '#FFFFFF',
        };
      case 'succes':
        return {
          iconeDefaut: 'checkmark-circle-outline' as const,
          couleurAccent: '#10B981',
          bgCercle: isDark ? 'rgba(16, 185, 129, 0.20)' : 'rgba(16, 185, 129, 0.12)',
          bgBoutonConfirmer: '#10B981',
          couleurTexteBouton: '#FFFFFF',
        };
      case 'info':
      default:
        return {
          iconeDefaut: 'information-circle-outline' as const,
          couleurAccent: '#6B1124',
          bgCercle: isDark ? 'rgba(245, 158, 11, 0.18)' : 'rgba(107, 17, 36, 0.10)',
          bgBoutonConfirmer: '#6B1124',
          couleurTexteBouton: '#FFFFFF',
        };
    }
  };

  const config = getThemeConfig();
  const nomIcone = icone || config.iconeDefaut;

  // Fonds & Couleurs
  const fondCarte = isDark ? '#1E1B18' : '#FAF6EB';
  const bordureCarte = isDark ? 'rgba(250, 246, 235, 0.12)' : 'rgba(107, 17, 36, 0.15)';
  const couleurTitre = isDark ? '#FAF6EB' : '#6B1124';
  const couleurMessage = isDark ? 'rgba(250, 246, 235, 0.82)' : '#4B5563';
  const fondBoutonAnnuler = isDark ? 'rgba(255, 255, 255, 0.08)' : '#FFFFFF';
  const bordureBoutonAnnuler = isDark ? 'rgba(255, 255, 255, 0.15)' : '#D1D5DB';
  const couleurTexteAnnuler = isDark ? '#E5E7EB' : '#6B7280';

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onAnnuler}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.container,
            {
              backgroundColor: fondCarte,
              borderColor: bordureCarte,
            },
          ]}
        >
          {/* Badge Icône stylisé */}
          <View style={[styles.iconeCircle, { backgroundColor: config.bgCercle }]}>
            <Ionicons name={nomIcone as any} size={28} color={config.couleurAccent} />
          </View>

          {/* Titre */}
          <Text style={[styles.titre, { color: couleurTitre }]}>
            {titre}
          </Text>

          {/* Message explicatif */}
          <Text style={[styles.message, { color: couleurMessage }]}>
            {message}
          </Text>

          {/* Actions */}
          <View style={styles.actionsContainer}>
            {/* Bouton Annuler */}
            <TouchableOpacity
              style={[
                styles.bouton,
                styles.boutonAnnuler,
                {
                  backgroundColor: fondBoutonAnnuler,
                  borderColor: bordureBoutonAnnuler,
                },
              ]}
              onPress={onAnnuler}
              disabled={chargement}
              activeOpacity={0.8}
            >
              <Text style={[styles.texteBoutonAnnuler, { color: couleurTexteAnnuler }]}>
                {texteAnnuler}
              </Text>
            </TouchableOpacity>

            {/* Bouton Confirmer */}
            <TouchableOpacity
              style={[
                styles.bouton,
                styles.boutonConfirmer,
                {
                  backgroundColor: config.bgBoutonConfirmer,
                },
              ]}
              onPress={onConfirmer}
              disabled={chargement}
              activeOpacity={0.85}
            >
              {chargement ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={[styles.texteBoutonConfirmer, { color: config.couleurTexteBouton }]}>
                  {texteConfirmer}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 5, 6, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 99999,
  },
  container: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1.2,
    paddingVertical: 24,
    paddingHorizontal: 22,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 18,
      },
      android: {
        elevation: 16,
      },
      web: {
        boxShadow: '0 20px 35px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      },
    }),
  },
  iconeCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  titre: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 6,
  },
  actionsContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  bouton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  boutonAnnuler: {
    borderWidth: 1,
  },
  boutonConfirmer: {
    ...Platform.select({
      ios: {
        shadowColor: '#6B1124',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  texteBoutonAnnuler: {
    fontSize: 14,
    fontWeight: '600',
  },
  texteBoutonConfirmer: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});