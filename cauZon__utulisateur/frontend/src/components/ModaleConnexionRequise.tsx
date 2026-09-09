import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from './AppIcon';
import { useApp } from '../store/ContexteApp';
import ModaleLegale from './ModaleLegale';

export type MotifGating = 'bienvenue' | 'achat' | 'vip' | 'import' | 'general';

interface ModaleConnexionRequiseProps {
  visible: boolean;
  onClose: () => void;
  motif?: MotifGating;
  titreDocument?: string;
  onConnexionReussie?: () => void;
}

export default function ModaleConnexionRequise({
  visible,
  onClose,
  motif = 'bienvenue',
  titreDocument,
  onConnexionReussie,
}: ModaleConnexionRequiseProps) {
  const { couleurs, connexionGoogle, estConnecteGoogle, afficherToast } = useApp();
  const [consentement, setConsentement] = useState<boolean>(true);
  const [chargementGoogle, setChargementGoogle] = useState<boolean>(false);
  const [modaleLegaleVisible, setModaleLegaleVisible] = useState<boolean>(false);
  const [ongletLegal, setOngletLegal] = useState<'cgu' | 'confidentialite'>('cgu');

  // Auto-fermeture et reprise immédiate de l'action dès que la connexion Google est active
  useEffect(() => {
    if (estConnecteGoogle && visible) {
      onClose();
      if (onConnexionReussie) {
        onConnexionReussie();
      }
    }
  }, [estConnecteGoogle, visible]);

  const styles = getStyles(couleurs);

  const getContenuMotif = () => {
    switch (motif) {
      case 'bienvenue':
        return {
          icone: 'gift' as const,
          couleurIcone: '#D97706',
          fondIcone: 'rgba(217, 119, 6, 0.12)',
          titre: 'Document Offert de Bienvenue 🎁',
          sousTitre: 'Pour activer votre cadeau de bienvenue et enregistrer définitivement ce document dans votre bibliothèque, connectez-vous avec votre compte Google.',
          avantages: [
            { icone: 'checkmark-circle', texte: '1er cours universitaire 100% offert' },
            { icone: 'cloud-done', texte: 'Sauvegarde définitive dans votre bibliothèque' },
            { icone: 'phone-portrait', texte: 'Lecture hors-ligne disponible immédiatement' },
          ],
        };
      case 'achat':
        return {
          icone: 'lock-closed' as const,
          couleurIcone: '#6B1124',
          fondIcone: 'rgba(107, 17, 36, 0.12)',
          titre: 'Authentification Requise 🔒',
          sousTitre: titreDocument 
            ? `Pour finaliser l'acquisition de "${titreDocument}", veuillez vous connecter avec votre compte Google.`
            : 'Pour sécuriser votre acquisition et conserver vos documents sur tous vos appareils, une authentification Google est requise.',
          avantages: [
            { icone: 'shield-checkmark', texte: 'Achat sécurisé lié à votre compte' },
            { icone: 'infinite', texte: 'Accès permanent et illimité sans expiration' },
            { icone: 'sync', texte: 'Synchronisation automatique entre vos appareils' },
          ],
        };
      case 'vip':
        return {
          icone: 'sparkles' as const,
          couleurIcone: '#F59E0B',
          fondIcone: 'rgba(245, 158, 11, 0.15)',
          titre: 'Activation du Pass VIP 👑',
          sousTitre: 'Connectez-vous pour associer votre abonnement VIP à votre profil et débloquer tout le catalogue en illimité.',
          avantages: [
            { icone: 'book', texte: 'Accès illimité à tous les cours et annales' },
            { icone: 'folder', texte: 'Extension de stockage personnel (75+ docs)' },
            { icone: 'star', texte: 'Badge VIP exclusif et support prioritaire' },
          ],
        };
      case 'import':
        return {
          icone: 'cloud-upload' as const,
          couleurIcone: '#6B1124',
          fondIcone: 'rgba(107, 17, 36, 0.12)',
          titre: 'Sauvegarde Cloud Personnelle ☁️',
          sousTitre: 'Connectez-vous avec votre compte Google pour téléverser et synchroniser vos documents PDF personnels dans le Cloud sécurisé cauZon.',
          avantages: [
            { icone: 'cloud-done', texte: 'Stockage Cloud permanent lié à votre compte' },
            { icone: 'shield-checkmark', texte: 'Accès garanti même en cas de changement d\'appareil' },
            { icone: 'lock-closed', texte: 'Documents privés et sécurisés sur vos dossiers' },
          ],
        };
      default:
        return {
          icone: 'school' as const,
          couleurIcone: '#6B1124',
          fondIcone: 'rgba(107, 17, 36, 0.12)',
          titre: 'Connexion Étudiante 🎓',
          sousTitre: 'Identifiez-vous en un clic avec Google pour débloquer toutes les fonctionnalités de la plateforme cauZon.',
          avantages: [
            { icone: 'shield-checkmark', texte: 'Espace académique personnalisé' },
            { icone: 'cloud', texte: 'Sauvegarde sécurisée de vos données' },
          ],
        };
    }
  };

  const contenu = getContenuMotif();

  const handleConnexion = async () => {
    if (!consentement) {
      afficherToast(
        'Veuillez accepter les conditions d\'utilisation et la politique de confidentialité pour continuer.',
        'Conditions requises ⚠️',
        'erreur'
      );
      return;
    }

    setChargementGoogle(true);
    try {
      const redirectWeb = (Platform.OS === 'web' && typeof window !== 'undefined' && window?.location?.href)
        ? window.location.href
        : undefined;
      const res = await connexionGoogle(redirectWeb);
      if (res.success) {
        onClose();
        if (onConnexionReussie) {
          setTimeout(() => {
            onConnexionReussie();
          }, 400);
        }
      } else if (res.error && res.error !== 'Connexion annulée') {
        afficherToast(res.error, 'Échec de la connexion ⚠️', 'erreur');
      }
    } catch (err: any) {
      console.error('Erreur connexion dans pop-up gating :', err);
      afficherToast(err?.message || 'Impossible d\'effectuer la connexion.', 'Erreur', 'erreur');
    } finally {
      setChargementGoogle(false);
    }
  };

  const ouvrirLegal = (onglet: 'cgu' | 'confidentialite') => {
    setOngletLegal(onglet);
    setModaleLegaleVisible(true);
  };

  return (
    <>
      <Modal
        animationType="fade"
        transparent={true}
        visible={visible}
        onRequestClose={onClose}
        statusBarTranslucent={true}
      >
        <View style={styles.overlay}>
          <View style={styles.card}>
            {/* Bouton fermeture */}
            <TouchableOpacity 
              onPress={onClose} 
              style={styles.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color={couleurs.texteSecondaire} />
            </TouchableOpacity>

            <ScrollView 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {/* En-tête avec Icône */}
              <View style={[styles.iconeContainer, { backgroundColor: contenu.fondIcone }]}>
                <Ionicons name={contenu.icone} size={36} color={contenu.couleurIcone} />
              </View>

              <Text style={styles.titre}>{contenu.titre}</Text>
              <Text style={styles.sousTitre}>{contenu.sousTitre}</Text>

              {/* Bloc des avantages */}
              <View style={styles.avantagesCard}>
                {contenu.avantages.map((item, idx) => (
                  <View key={idx} style={styles.avantageLigne}>
                    <Ionicons 
                      name={item.icone as any} 
                      size={18} 
                      color={couleurs.primaire} 
                      style={styles.avantageIcone}
                    />
                    <Text style={styles.avantageTexte}>{item.texte}</Text>
                  </View>
                ))}
              </View>

              {/* Case à cocher des conditions */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setConsentement(!consentement)}
                style={styles.consentementConteneur}
              >
                <View style={[
                  styles.checkbox,
                  consentement && { backgroundColor: couleurs.primaire, borderColor: couleurs.primaire }
                ]}>
                  {consentement && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                </View>
                <Text style={styles.consentementTexte}>
                  J'accepte les{' '}
                  <Text 
                    style={styles.lienLegal}
                    onPress={(e) => {
                      e.stopPropagation();
                      ouvrirLegal('cgu');
                    }}
                  >
                    Conditions d'Utilisation
                  </Text>
                  {' '}et la{' '}
                  <Text 
                    style={styles.lienLegal}
                    onPress={(e) => {
                      e.stopPropagation();
                      ouvrirLegal('confidentialite');
                    }}
                  >
                    Politique de Confidentialité
                  </Text>
                  {' '}de cauZon.
                </Text>
              </TouchableOpacity>

              {/* Bouton de connexion Google */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleConnexion}
                disabled={chargementGoogle || !consentement}
                style={[
                  styles.boutonGoogle,
                  (!consentement || chargementGoogle) && styles.boutonGoogleDesactive,
                ]}
              >
                {chargementGoogle ? (
                  <ActivityIndicator size="small" color="#6B1124" />
                ) : (
                  <>
                    <Ionicons name="logo-google" size={20} color="#EA4335" />
                    <Text style={styles.boutonGoogleTexte}>
                      Continuer avec Google
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Action secondaire d'annulation */}
              <TouchableOpacity
                onPress={onClose}
                style={styles.boutonSecondaire}
              >
                <Text style={styles.boutonSecondaireTexte}>
                  Plus tard, continuer la lecture
                </Text>
              </TouchableOpacity>

              {/* Mention de réassurance */}
              <View style={styles.reassuranceRow}>
                <Ionicons name="shield-checkmark-outline" size={14} color={couleurs.texteSecondaire} />
                <Text style={styles.reassuranceTexte}>
                  Connexion chiffrée & authentifiée par Supabase
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modale d'affichage des conditions et politique si l'utilisateur clique sur les liens */}
      <ModaleLegale
        visible={modaleLegaleVisible}
        onClose={() => setModaleLegaleVisible(false)}
        ongletInitial={ongletLegal}
      />
    </>
  );
}

const getStyles = (couleurs: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: couleurs.fondCarte,
      borderRadius: 22,
      paddingTop: 24,
      paddingBottom: 20,
      paddingHorizontal: 22,
      borderWidth: 1,
      borderColor: couleurs.bordure,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.25,
      shadowRadius: 20,
      elevation: 10,
      position: 'relative',
    },
    closeBtn: {
      position: 'absolute',
      top: 14,
      right: 14,
      zIndex: 10,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: couleurs.estSombre ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    scrollContent: {
      alignItems: 'center',
    },
    iconeContainer: {
      width: 72,
      height: 72,
      borderRadius: 36,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
      marginTop: 6,
    },
    titre: {
      fontSize: 20,
      fontWeight: '800',
      color: couleurs.texte,
      textAlign: 'center',
      marginBottom: 8,
      letterSpacing: -0.3,
    },
    sousTitre: {
      fontSize: 13.5,
      color: couleurs.texteSecondaire,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 18,
      paddingHorizontal: 6,
    },
    avantagesCard: {
      width: '100%',
      backgroundColor: couleurs.estSombre ? 'rgba(255, 255, 255, 0.04)' : 'rgba(107, 17, 36, 0.04)',
      borderRadius: 14,
      padding: 14,
      marginBottom: 18,
      borderWidth: 1,
      borderColor: couleurs.estSombre ? 'rgba(255, 255, 255, 0.08)' : 'rgba(107, 17, 36, 0.1)',
      gap: 10,
    },
    avantageLigne: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    avantageIcone: {
      marginRight: 2,
    },
    avantageTexte: {
      fontSize: 13,
      fontWeight: '600',
      color: couleurs.texte,
      flex: 1,
    },
    consentementConteneur: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      width: '100%',
      marginBottom: 20,
      paddingHorizontal: 2,
      gap: 10,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: '#94A3B8',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 2,
    },
    consentementTexte: {
      flex: 1,
      fontSize: 12.5,
      color: couleurs.texteSecondaire,
      lineHeight: 18,
    },
    lienLegal: {
      color: couleurs.primaire,
      fontWeight: '700',
      textDecorationLine: 'underline',
    },
    boutonGoogle: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      backgroundColor: '#FFFFFF',
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#CBD5E1',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 4,
      elevation: 3,
      marginBottom: 10,
    },
    boutonGoogleDesactive: {
      opacity: 0.5,
    },
    boutonGoogleTexte: {
      fontSize: 15,
      fontWeight: '700',
      color: '#1E293B',
    },
    boutonSecondaire: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    boutonSecondaireTexte: {
      fontSize: 13,
      color: couleurs.texteSecondaire,
      fontWeight: '600',
    },
    reassuranceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
    },
    reassuranceTexte: {
      fontSize: 11,
      color: couleurs.texteSecondaire,
    },
  });
