import React, { useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Dimensions,
  Image,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../store/ContexteApp';
import { Document } from '../types';
import { getCouleurCategorie, TOKENS } from '../theme/couleurs';

const { width } = Dimensions.get('window');
const LARGEUR_CARTE = (width - 40) / 2;

interface CarteDocumentProps {
  document: Document;
  onPress: () => void;
  largeur?: number;
  onUnlockPress?: () => void;
}

export default function CarteDocument({
  document,
  onPress,
  largeur,
  onUnlockPress,
}: CarteDocumentProps) {
  const { couleurs, estVip, estAbonneVIP, docsDebloquesIds } = useApp();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // L'utilisateur est-il VIP ?
  const isVipUser = estVip || estAbonneVIP;

  // Vérifier si le cours est déjà dans la bibliothèque
  const estAcquis = docsDebloquesIds.includes(document.id);

  // Animation Uiverse tactile Micro-interaction (Spring scale)
  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 40,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 8,
    }).start();
  };

  // Extraction dynamique et universelle du nombre de pages
  const nbPagesReel =
    (document as any).total_pages ||
    (document as any).page_count ||
    document.nombrePages ||
    (document as any).nombre_pages ||
    (document as any).pages ||
    (document as any).pageCount ||
    (document as any).nb_pages ||
    0;

  const categorieColor = getCouleurCategorie(document.categorie);
  const styles = getStyles(couleurs, categorieColor);

  return (
    <Animated.View
      style={[
        styles.carteContainer,
        largeur ? { width: largeur } : null,
        { transform: [{ scale: scaleAnim }] },
      ]}
    >
      <TouchableOpacity
        style={styles.carteInner}
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
      >
        {/* En-tête de la carte : Badges Catégorie + Certification */}
        <View style={styles.enteteCarte}>
          <View style={styles.badgeCategorie}>
            <View style={styles.dotCategorie} />
            <Text style={styles.texteBadgeCategorie} numberOfLines={1}>
              {document.categorie || 'Général'}
            </Text>
          </View>

          {document.estCertifie && (
            <View style={styles.badgeCertifie}>
              <Ionicons name="ribbon-outline" size={10} color="#10B981" />
              <Text style={styles.texteBadgeCertifie}>Certifié</Text>
            </View>
          )}
        </View>

        {/* Zone Visuel / Miniature */}
        <View style={styles.conteneurMiniature}>
          {document.coverUrl ? (
            <Image
              source={{ uri: document.coverUrl }}
              style={styles.imageMiniature}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.placeholderMiniature}>
              <View style={styles.iconCircle}>
                <Ionicons
                  name="newspaper-outline"
                  size={26}
                  color={couleurs.primaire}
                />
              </View>
              <Text style={styles.placeholderLabel}>cauZon Reader</Text>
            </View>
          )}

          {/* Badge État : Débloqué / Inclus VIP / Verrouillé */}
          {estAcquis ? (
            <View style={[styles.badgeStatut, styles.badgeStatutAcquis]}>
              <View style={styles.pulseDotAcquis} />
              <Text style={styles.texteStatutAcquis}>Débloqué</Text>
            </View>
          ) : isVipUser ? (
            <View style={[styles.badgeStatut, styles.badgeStatutVip]}>
              <Ionicons name="sparkles" size={10} color="#FAF6EB" />
              <Text style={styles.texteStatutVip}>Inclus VIP</Text>
            </View>
          ) : (
            <View style={[styles.badgeStatut, styles.badgeStatutVerrouille]}>
              <Ionicons name="lock-closed" size={10} color="#FFFFFF" />
              <Text style={styles.texteStatutVerrouille}>Verrouillé</Text>
            </View>
          )}
        </View>

        {/* Corps de la carte */}
        <View style={styles.contenuCarte}>
          <Text style={styles.titreDocument} numberOfLines={2}>
            {document.titre}
          </Text>

          <View style={styles.ligneMeta}>
            <View style={styles.metaChip}>
              <Ionicons
                name="document-text-outline"
                size={11}
                color={couleurs.texteSecondaire}
              />
              <Text style={styles.metaDocument}>
                {nbPagesReel > 0 ? `${nbPagesReel} p.` : '1 p.'}
              </Text>
            </View>

            <View style={styles.metaChip}>
              <Ionicons
                name="cloud-outline"
                size={11}
                color={couleurs.texteSecondaire}
              />
              <Text style={styles.metaDocument}>
                {document.tailleMo ? `${document.tailleMo} Mo` : '1.5 Mo'}
              </Text>
            </View>
          </View>

          {document.description ? (
            <Text style={styles.descriptionDocument} numberOfLines={2}>
              {document.description}
            </Text>
          ) : null}
        </View>

        {/* Pied de carte : Prix et Bouton d'action (avec mode VIP Débloquer) */}
        <View style={styles.piedCarte}>
          <View style={styles.blocPrix}>
            {estAcquis ? (
              <View style={styles.prixAcquisTag}>
                <Ionicons name="checkmark-done" size={13} color="#2ECC71" />
                <Text style={styles.textePrixAcquis}>Disponible</Text>
              </View>
            ) : isVipUser ? (
              <View style={styles.prixVipTag}>
                <Ionicons name="sparkles" size={12} color="#6B1124" />
                <Text style={styles.textePrixVip}>0 FCFA (VIP)</Text>
              </View>
            ) : (
              <View style={styles.prixVerrouilleTag}>
                <Text style={styles.texteMontantPrix}>{document.prix}</Text>
                <Text style={styles.texteDevise}>FCFA</Text>
              </View>
            )}
          </View>

          {estAcquis ? (
            <View style={[styles.boutonAction, styles.boutonActionAcquis]}>
              <Ionicons name="book-outline" size={14} color="#FFFFFF" />
            </View>
          ) : isVipUser ? (
            <TouchableOpacity
              style={[styles.boutonAction, styles.boutonActionVip]}
              onPress={(e) => {
                e.stopPropagation();
                if (onUnlockPress) onUnlockPress();
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="download-outline" size={14} color="#FAF6EB" />
            </TouchableOpacity>
          ) : onUnlockPress ? (
            <TouchableOpacity
              style={styles.boutonAction}
              onPress={(e) => {
                e.stopPropagation();
                onUnlockPress();
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="key-outline" size={13} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <View style={styles.boutonAction}>
              <Ionicons name="arrow-forward" size={13} color="#FFFFFF" />
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const getStyles = (couleurs: any, categorieColor: string) =>
  StyleSheet.create({
    carteContainer: {
      width: LARGEUR_CARTE,
      marginBottom: 16,
    },
    carteInner: {
      backgroundColor: couleurs.fondCarte,
      borderRadius: 18,
      padding: 12,
      borderWidth: 1,
      borderColor: couleurs.bordure,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: couleurs.estSombre ? 0.25 : 0.06,
      shadowRadius: 12,
      elevation: 3,
      justifyContent: 'space-between',
    },
    enteteCarte: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
      gap: 4,
    },
    badgeCategorie: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: couleurs.estSombre
        ? 'rgba(255, 255, 255, 0.07)'
        : 'rgba(127, 1, 31, 0.06)',
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 6,
      maxWidth: '65%',
    },
    dotCategorie: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: categorieColor,
      marginRight: 5,
    },
    texteBadgeCategorie: {
      fontSize: 9.5,
      fontWeight: '700',
      color: couleurs.texte,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    badgeCertifie: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: 'rgba(16, 185, 129, 0.12)',
      borderWidth: 0.5,
      borderColor: 'rgba(16, 185, 129, 0.3)',
      gap: 3,
    },
    texteBadgeCertifie: {
      fontSize: 9,
      fontWeight: '800',
      color: '#10B981',
    },
    conteneurMiniature: {
      height: 84,
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: couleurs.estSombre
        ? 'rgba(255, 255, 255, 0.03)'
        : 'rgba(127, 1, 31, 0.03)',
      marginBottom: 10,
      position: 'relative',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 0.5,
      borderColor: couleurs.bordure,
    },
    imageMiniature: {
      width: '100%',
      height: '100%',
    },
    placeholderMiniature: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    iconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: couleurs.estSombre
        ? 'rgba(255, 255, 255, 0.08)'
        : 'rgba(127, 1, 31, 0.08)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    placeholderLabel: {
      fontSize: 8.5,
      fontWeight: '700',
      color: couleurs.texteSecondaire,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    badgeStatut: {
      position: 'absolute',
      bottom: 6,
      right: 6,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    badgeStatutAcquis: {
      backgroundColor: 'rgba(46, 204, 113, 0.92)',
    },
    badgeStatutVip: {
      backgroundColor: '#6B1124',
      borderWidth: 1,
      borderColor: '#8B0000',
    },
    texteStatutVip: {
      fontSize: 8.5,
      color: '#FAF6EB',
      fontWeight: '800',
    },
    pulseDotAcquis: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: '#FFFFFF',
    },
    texteStatutAcquis: {
      fontSize: 8.5,
      color: '#FFFFFF',
      fontWeight: '800',
    },
    badgeStatutVerrouille: {
      backgroundColor: 'rgba(20, 20, 20, 0.85)',
    },
    texteStatutVerrouille: {
      fontSize: 8.5,
      color: '#FFFFFF',
      fontWeight: '700',
    },
    contenuCarte: {
      marginBottom: 10,
    },
    titreDocument: {
      fontSize: 13,
      fontWeight: '800',
      color: couleurs.texte,
      lineHeight: 18,
      marginBottom: 6,
      minHeight: 36,
    },
    ligneMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    metaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    metaDocument: {
      fontSize: 10.5,
      color: couleurs.texteSecondaire,
      fontWeight: '600',
    },
    descriptionDocument: {
      fontSize: 10,
      color: couleurs.texteSecondaire,
      lineHeight: 14,
    },
    piedCarte: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: couleurs.bordure,
      paddingTop: 8,
      marginTop: 2,
    },
    blocPrix: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    prixAcquisTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    textePrixAcquis: {
      fontSize: 11.5,
      fontWeight: '800',
      color: '#2ECC71',
    },
    prixVipTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(107, 17, 36, 0.12)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    textePrixVip: {
      fontSize: 11,
      fontWeight: '800',
      color: '#6B1124',
    },
    prixVerrouilleTag: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 2,
    },
    texteMontantPrix: {
      fontSize: 13.5,
      fontWeight: '900',
      color: couleurs.primaire,
    },
    texteDevise: {
      fontSize: 9.5,
      fontWeight: '700',
      color: couleurs.primaire,
    },
    boutonAction: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: couleurs.primaire,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: couleurs.primaire,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 2,
    },
    boutonActionAcquis: {
      backgroundColor: '#2ECC71',
      shadowColor: '#2ECC71',
    },
    boutonActionVip: {
      backgroundColor: '#6B1124',
      shadowColor: '#6B1124',
    },
  });
