import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from './AppIcon';
import { useApp } from '../store/ContexteApp';
import { demanderPermissionNotifications, marquerInviteNotificationTraitee } from '../services/serviceNotifications';

interface ModaleDemandeNotificationProps {
  visible: boolean;
  onClose: (active: boolean) => void;
}

export default function ModaleDemandeNotification({
  visible,
  onClose,
}: ModaleDemandeNotificationProps) {
  const { couleurs } = useApp();
  const styles = getStyles(couleurs);
  const [enCours, setEnCours] = useState(false);

  const handleActiver = async () => {
    setEnCours(true);
    const res = await demanderPermissionNotifications();
    await marquerInviteNotificationTraitee();
    setEnCours(false);
    onClose(res.success);
  };

  const handlePlusTard = async () => {
    await marquerInviteNotificationTraitee();
    onClose(false);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handlePlusTard}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Badge Icone */}
          <View style={styles.iconCircle}>
            <Ionicons name="notifications" size={36} color="#FAF6EB" />
            <View style={styles.sparkBadge}>
              <Ionicons name="sparkles" size={14} color="#10B981" />
            </View>
          </View>

          {/* Titre & Sous-titre */}
          <Text style={styles.titre}>Alertes Académiques</Text>
          <Text style={styles.sousTitre}>
            Ne manquez aucune publication cruciale pour vos révisions et examens.
          </Text>

          {/* Points Clés */}
          <View style={styles.pointsList}>
            <View style={styles.pointItem}>
              <View style={styles.pointIconBox}>
                <Ionicons name="book" size={18} color="#6B1124" />
              </View>
              <View style={styles.pointContent}>
                <Text style={styles.pointTitre}>Nouveaux Cours & Sujets</Text>
                <Text style={styles.pointDesc}>
                  Soyez prévenu dès la mise en ligne d'épreuves et de corrigés certifiés.
                </Text>
              </View>
            </View>

            <View style={styles.pointItem}>
              <View style={styles.pointIconBox}>
                <Ionicons name="megaphone" size={18} color="#6B1124" />
              </View>
              <View style={styles.pointContent}>
                <Text style={styles.pointTitre}>Annonces Administratives</Text>
                <Text style={styles.pointDesc}>
                  Accédez aux communiqués officiels et dates clés universitaires.
                </Text>
              </View>
            </View>

            <View style={styles.pointItem}>
              <View style={styles.pointIconBox}>
                <Ionicons name="shield-checkmark" size={18} color="#10B981" />
              </View>
              <View style={styles.pointContent}>
                <Text style={styles.pointTitre}>100% Utile, Zéro Spam</Text>
                <Text style={styles.pointDesc}>
                  Uniquement des notifications éducatives adaptées à vos besoins.
                </Text>
              </View>
            </View>
          </View>

          {/* Boutons d'Action */}
          {enCours ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color="#6B1124" />
              <Text style={styles.loadingText}>Activation en cours...</Text>
            </View>
          ) : (
            <View style={styles.actionsBox}>
              <TouchableOpacity
                style={styles.boutonActiver}
                onPress={handleActiver}
                activeOpacity={0.85}
              >
                <Ionicons name="notifications-outline" size={18} color="#FAF6EB" style={{ marginRight: 8 }} />
                <Text style={styles.texteBoutonActiver}>Activer les notifications</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.boutonPlusTard}
                onPress={handlePlusTard}
                activeOpacity={0.7}
              >
                <Text style={styles.texteBoutonPlusTard}>Plus tard</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (couleurs: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    container: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: couleurs.arrierePlan,
      borderRadius: 24,
      padding: 24,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: couleurs.bordure,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.25,
      shadowRadius: 20,
      elevation: 10,
    },
    iconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: '#6B1124',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
      position: 'relative',
      shadowColor: '#6B1124',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 10,
      elevation: 6,
    },
    sparkBadge: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      backgroundColor: '#FFFFFF',
      borderRadius: 12,
      width: 24,
      height: 24,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: '#FAF6EB',
    },
    titre: {
      fontSize: 20,
      fontWeight: '800',
      color: couleurs.texte,
      textAlign: 'center',
      marginBottom: 6,
    },
    sousTitre: {
      fontSize: 13,
      color: couleurs.texteSecondaire,
      textAlign: 'center',
      lineHeight: 18,
      marginBottom: 20,
      paddingHorizontal: 8,
    },
    pointsList: {
      width: '100%',
      backgroundColor: couleurs.estSombre ? 'rgba(255,255,255,0.04)' : '#FDFBF7',
      borderRadius: 16,
      padding: 14,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: couleurs.bordure,
      gap: 12,
    },
    pointItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    pointIconBox: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: 'rgba(107, 17, 36, 0.08)',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 2,
    },
    pointContent: {
      flex: 1,
    },
    pointTitre: {
      fontSize: 13,
      fontWeight: '700',
      color: couleurs.texte,
      marginBottom: 2,
    },
    pointDesc: {
      fontSize: 12,
      color: couleurs.texteSecondaire,
      lineHeight: 16,
    },
    loadingBox: {
      paddingVertical: 16,
      alignItems: 'center',
      gap: 8,
    },
    loadingText: {
      fontSize: 13,
      color: '#6B1124',
      fontWeight: '600',
    },
    actionsBox: {
      width: '100%',
      gap: 10,
    },
    boutonActiver: {
      width: '100%',
      backgroundColor: '#6B1124',
      paddingVertical: 14,
      borderRadius: 14,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#6B1124',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 4,
    },
    texteBoutonActiver: {
      color: '#FAF6EB',
      fontSize: 14,
      fontWeight: '700',
    },
    boutonPlusTard: {
      paddingVertical: 8,
      alignItems: 'center',
    },
    texteBoutonPlusTard: {
      color: couleurs.texteSecondaire,
      fontSize: 13,
      fontWeight: '600',
    },
  });
