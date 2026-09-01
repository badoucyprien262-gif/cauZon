import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../store/ContexteApp';

interface StorageGaugeProps {
  nombreDocuments: number;
  surClicAmeliorer: () => void;
}

export default function JaugeStockage({ nombreDocuments, surClicAmeliorer }: StorageGaugeProps) {
  const { couleurs, aStockageEtendu, limiteStockage } = useApp();
  const styles = getStyles(couleurs);

  // La limite vient directement du contexte (75 standard ou 150 étendu)
  const limiteTotale = limiteStockage;
  const pourcentageProgression = Math.min(100, Math.max(3, (nombreDocuments / limiteTotale) * 100));

  return (
    <TouchableOpacity
      style={styles.carteJauge}
      activeOpacity={0.88}
      onPress={surClicAmeliorer}
    >
      <View style={styles.enteteJauge}>
        <View style={styles.ligneTitreJauge}>
          <View style={styles.iconContainer}>
            <Ionicons name="cloud-done" size={18} color={couleurs.primaire} />
          </View>
          <View>
            <Text style={styles.titreJauge}>Espace local hors-ligne</Text>
            <Text style={styles.sousTitreJauge}>Appuyez pour gérer l'espace</Text>
          </View>
        </View>

        <View style={styles.badgeQuota}>
          <Text style={styles.texteBadgeQuota}>
            {nombreDocuments} / {limiteTotale}
          </Text>
        </View>
      </View>

      {/* Barre de progression */}
      <View style={styles.conteneurProgression}>
        <View style={styles.barreProgressionFond}>
          <View
            style={[
              styles.barreProgressionRemplissage,
              { width: `${pourcentageProgression}%` },
            ]}
          />
        </View>
        <View style={styles.detailsProgression}>
          <Text style={styles.texteQuota}>
            {aStockageEtendu
              ? `Stockage Étendu : ${nombreDocuments} sur ${limiteTotale} documents utilisés`
              : `Stockage Standard : ${nombreDocuments} sur ${limiteTotale} documents utilisés`}
          </Text>
        </View>
      </View>

      {/* Bouton d'action — TOUJOURS CLIQUABLE ET ACCESSIBLE */}
      <TouchableOpacity
        style={[
          styles.boutonUpgrade,
          aStockageEtendu ? styles.boutonUpgradeEtendu : styles.boutonUpgradeStandard,
        ]}
        activeOpacity={0.8}
        onPress={surClicAmeliorer}
      >
        {aStockageEtendu ? (
          <>
            <Ionicons name="sparkles" size={16} color="#10B981" />
            <Text style={[styles.texteBoutonUpgrade, { color: couleurs.texte }]}>
              Plafond : {limiteTotale} docs · Ajouter +75 docs (1000 F)
            </Text>
            <Ionicons name="add-circle" size={16} color="#10B981" />
          </>
        ) : (
          <>
            <Ionicons name="rocket-outline" size={16} color="#FFFFFF" />
            <Text style={[styles.texteBoutonUpgrade, { color: '#FFFFFF' }]}>
              Augmenter à {limiteTotale + 75} docs (1000 FCFA)
            </Text>
            <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
          </>
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const getStyles = (couleurs: any) =>
  StyleSheet.create({
    carteJauge: {
      backgroundColor: couleurs.fondCarte,
      borderRadius: 20,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: couleurs.bordure,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: couleurs.estSombre ? 0.2 : 0.05,
      shadowRadius: 10,
      elevation: 3,
    },
    enteteJauge: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    ligneTitreJauge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    iconContainer: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: couleurs.estSombre
        ? 'rgba(255, 255, 255, 0.08)'
        : 'rgba(127, 1, 31, 0.08)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    titreJauge: {
      fontSize: 14,
      fontWeight: '800',
      color: couleurs.texte,
    },
    sousTitreJauge: {
      fontSize: 10.5,
      color: couleurs.texteSecondaire,
      marginTop: 1,
    },
    badgeQuota: {
      backgroundColor: couleurs.estSombre
        ? 'rgba(255, 255, 255, 0.08)'
        : 'rgba(127, 1, 31, 0.08)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    texteBadgeQuota: {
      fontSize: 11.5,
      fontWeight: '800',
      color: couleurs.primaire,
    },
    conteneurProgression: {
      marginBottom: 14,
    },
    barreProgressionFond: {
      height: 8,
      borderRadius: 4,
      backgroundColor: couleurs.estSombre
        ? 'rgba(255, 255, 255, 0.08)'
        : 'rgba(127, 1, 31, 0.08)',
      overflow: 'hidden',
      marginBottom: 6,
    },
    barreProgressionRemplissage: {
      height: '100%',
      borderRadius: 4,
      backgroundColor: couleurs.primaire,
    },
    detailsProgression: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
    },
    texteQuota: {
      fontSize: 11,
      fontWeight: '600',
      color: couleurs.texteSecondaire,
    },
    boutonUpgrade: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 12,
      gap: 8,
    },
    boutonUpgradeStandard: {
      backgroundColor: couleurs.primaire,
      shadowColor: couleurs.primaire,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 3,
    },
    boutonUpgradeEtendu: {
      backgroundColor: couleurs.estSombre
        ? 'rgba(255, 255, 255, 0.06)'
        : 'rgba(212, 175, 55, 0.12)',
      borderWidth: 1,
      borderColor: 'rgba(212, 175, 55, 0.3)',
    },
    texteBoutonUpgrade: {
      fontSize: 13,
      fontWeight: '800',
    },
  });
