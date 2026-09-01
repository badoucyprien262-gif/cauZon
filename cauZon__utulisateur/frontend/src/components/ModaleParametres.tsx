import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../store/ContexteApp';
import ModaleVip from './ModaleVip';
import ModaleLegale from './ModaleLegale';
import AvatarDynamique from './AvatarDynamique';
import BoutonThemeAnime from './BoutonThemeAnime';
import ToastNotification from './ToastNotification';
import { supabase } from '../lib/supabase';
import { getDeviceId } from '../services/serviceDocument';




interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export const LISTE_AVATARS = [
  { id: 'avatar-1', emoji: '👨‍🎓', nom: 'Étudiant' },
  { id: 'avatar-2', emoji: '👩‍🎓', nom: 'Étudiante' },
  { id: 'avatar-3', emoji: '🧑‍🔬', nom: 'Chercheur' },
  { id: 'avatar-4', emoji: '📚', nom: 'Bibliophile' },
  { id: 'avatar-5', emoji: '💡', nom: 'Créatif' },
  { id: 'avatar-6', emoji: '💼', nom: 'Droit/Pro' },
  { id: 'photo-perso', emoji: '📸', nom: 'Photo Perso' },
];

export const getEmojiAvatar = (id: string) => {
  const avatar = LISTE_AVATARS.find(item => item.id === id);
  return avatar ? avatar.emoji : '👨‍🎓';
};

export default function ModaleParametres({ visible, onClose }: SettingsModalProps) {
  const { 
    couleurs, 
    nomUtilisateur, 
    emailUtilisateur,
    telephoneFacturation, 
    photoProfil,
    estConnecteGoogle,
    connexionGoogle,
    deconnexion,
    mettreAJourProfil, 
    reinitialiserDemo, 
    modeTheme, 
    basculerTheme,
    estVip,
    aReponseNonLue,
    marquerCommentairesCommeLus
  } = useApp();
  const styles = getStyles(couleurs);

  const [nomLocal, setNomLocal] = useState(nomUtilisateur);
  const [telephoneLocal, setTelephoneLocal] = useState(telephoneFacturation);
  const [photoLocal, setPhotoLocal] = useState(photoProfil);
  const [vipVisible, setVipVisible] = useState(false);
  const [chargementGoogle, setChargementGoogle] = useState(false);
  const [consentementDeviceId, setConsentementDeviceId] = useState<boolean>(false);
  const [afficherChoixAvatar, setAfficherChoixAvatar] = useState(false);
  const [modaleLegaleVisible, setModaleLegaleVisible] = useState(false);
  const [ongletLegal, setOngletLegal] = useState<'cgu' | 'confidentialite'>('cgu');



  const [chargementPhoto, setChargementPhoto] = useState(false);
  const [commentSectionOpen, setCommentSectionOpen] = useState(false);
  const [commentaireTexte, setCommentaireTexte] = useState('');
  const [fichierJoint, setFichierJoint] = useState('');
  const [chargementCommentaire, setChargementCommentaire] = useState(false);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  const [historiqueFeedbacks, setHistoriqueFeedbacks] = useState<any[]>([]);

  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    titre?: string;
    type?: 'success' | 'info' | 'error';
  }>({ visible: false, message: '' });

  const afficherToast = (message: string, titre?: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ visible: true, message, titre, type });
  };

  const chargerHistoriqueFeedbacks = async () => {
    try {
      const deviceId = await getDeviceId();
      const { data, error } = await supabase
        .from('feedbacks')
        .select('id, message, reponse, repondu_a, created_at, statut')
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!error && data) {
        setHistoriqueFeedbacks(data);
      }
    } catch (errFeed) {
      console.log('Info chargement feedbacks utilisateur :', errFeed);
    }
  };

  // Synchroniser l'état local quand la modale s'ouvre
  useEffect(() => {
    if (visible) {
      setNomLocal(nomUtilisateur);
      setTelephoneLocal(telephoneFacturation);
      setPhotoLocal(photoProfil);
      setAfficherChoixAvatar(false);
      chargerHistoriqueFeedbacks();
    }
  }, [visible, nomUtilisateur, telephoneFacturation, photoProfil]);


  const handleSave = () => {
    if (telephoneLocal.trim() === '') {
      afficherToast('Veuillez saisir votre numéro mobile pour les paiements.', 'Numéro Requis ⚠️', 'error');
      return;
    }

    mettreAJourProfil(nomLocal.trim(), telephoneLocal.trim(), photoLocal);
    afficherToast('Votre numéro et vos préférences ont été enregistrés.', 'Profil Mis à Jour 💾', 'success');
    setTimeout(() => {
      onClose();
    }, 400);
  };


  const handleGoogleAuth = async () => {
    if (estConnecteGoogle) {
      Alert.alert(
        'Déconnexion 🚪',
        `Voulez-vous vous déconnecter de votre compte Google (${emailUtilisateur}) ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          { 
            text: 'Se déconnecter', 
            style: 'destructive',
            onPress: async () => {
              await deconnexion();
              Alert.alert('Déconnecté', 'Vous avez été déconnecté avec succès.');
            }
          }
        ]
      );
    } else {
      setChargementGoogle(true);
      const res = await connexionGoogle();
      setChargementGoogle(false);
      if (res.success) {
        Alert.alert('Succès 🎉', 'Connexion avec Google réussie ! Vos informations ont été synchronisées.');
      } else if (res.error && res.error !== 'Connexion annulée') {
        Alert.alert('Erreur de connexion ⚠️', res.error);
      }
    }
  };

  /**
   * Sélectionne une image depuis la galerie avec expo-image-picker (Android / iOS / Web)
   */
  const handleChoisirImageGalerie = async () => {
    try {
      setChargementPhoto(true);

      // Sur Mobile : demande de permission média (avec tolérance pour Android 13+ Photo Picker)
      if (Platform.OS !== 'web') {
        try {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status === 'denied') {
            Alert.alert(
              'Accès Galerie ⚠️',
              'L\'accès aux photos a été refusé. Vous pouvez l\'activer dans les Paramètres de votre téléphone.'
            );
          }
        } catch (permErr) {
          console.warn('Note permission galerie :', permErr);
        }
      }

      // Lancement du sélecteur d'images
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uriChoisie = result.assets[0].uri;
        setPhotoLocal(uriChoisie);
        mettreAJourProfil(nomLocal, telephoneLocal, uriChoisie);

        // Persistance Supabase si connecté
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.from('profiles').update({ avatar_url: uriChoisie }).eq('id', user.id);
          }
        } catch (dbErr) {
          console.warn('Note enregistrement avatar Supabase :', dbErr);
        }

        if (Platform.OS === 'web') {
          afficherToast('Votre photo de profil a été mise à jour !', 'Photo Enregistrée 📸', 'success');
        } else {
          afficherToast('Votre photo de profil a été mise à jour !', 'Photo Enregistrée 📸', 'success');
        }
      }
    } catch (err: any) {
      console.error('Erreur galerie :', err);
      const msg = err.message || 'Impossible d\'ouvrir le sélecteur d\'images.';
      afficherToast(msg, 'Erreur Galerie ⚠️', 'error');
    } finally {
      setChargementPhoto(false);
    }
  };

  /**
   * Prend une photo en direct avec la caméra (Android / iOS / Web)
   */
  const handlePrendrePhotoCamera = async () => {
    try {
      setChargementPhoto(true);

      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          afficherToast('Veuillez autoriser l\'accès à l\'appareil photo dans les paramètres.', 'Permission Requise ⚠️', 'error');
          setChargementPhoto(false);
          return;
        }
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uriChoisie = result.assets[0].uri;
        setPhotoLocal(uriChoisie);
        mettreAJourProfil(nomLocal, telephoneLocal, uriChoisie);

        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.from('profiles').update({ avatar_url: uriChoisie }).eq('id', user.id);
          }
        } catch (dbErr) {
          console.warn('Note enregistrement avatar Supabase :', dbErr);
        }

        afficherToast('Votre photo a été prise et définie comme avatar.', 'Photo Enregistrée 📸', 'success');
      }
    } catch (err: any) {
      console.error('Erreur caméra :', err);
      const msg = err.message || 'Impossible d\'accéder à la caméra.';
      afficherToast(msg, 'Erreur Caméra ⚠️', 'error');
    } finally {
      setChargementPhoto(false);
    }
  };



  const handleReset = () => {
    Alert.alert(
      'Réinitialisation 🔄',
      'Voulez-vous réinitialiser toutes les acquisitions de documents et restaurer la démo ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { 
          text: 'Oui, réinitialiser', 
          onPress: () => {
            reinitialiserDemo();
            setNomLocal('Jean Dupont');
            setTelephoneLocal('+221 77 123 45 67');
            setPhotoLocal('avatar-1');
            Alert.alert('Succès', 'Les acquisitions, photo et thèmes ont été réinitialisés.');
          } 
        }
      ]
    );
  };

  /**
   * Suppression définitive du compte — Étape 1 : première confirmation
   */
  const handleSupprimerCompte = () => {
    Alert.alert(
      '⚠️ Supprimer mon compte',
      'Cette action est irréversible. Toutes vos acquisitions et données de profil seront définitivement supprimées.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Continuer',
          style: 'destructive',
          onPress: () => {
            // Étape 2 : deuxième confirmation explicite
            Alert.alert(
              '❌ Dernière confirmation',
              'Confirmez-vous vouloir supprimer DÉFINITIVEMENT votre compte cauZon et toutes vos données ?',
              [
                { text: 'Non, conserver mon compte', style: 'cancel' },
                {
                  text: 'Oui, supprimer définitivement',
                  style: 'destructive',
                  onPress: executerSuppressionCompte,
                },
              ]
            );
          },
        },
      ]
    );
  };

  /**
   * Exécution de la suppression : purge des données personnelles et traçabilité anonyme du Device ID
   */
  const executerSuppressionCompte = async () => {
    setSuppressionEnCours(true);
    try {
      const { supprimerCompteUtilisateur } = await import('../services/serviceDocument');
      const resultat = await supprimerCompteUtilisateur();

      if (!resultat.success) {
        throw new Error(resultat.message);
      }

      // Réinitialisation complète du contexte local
      reinitialiserDemo();
      onClose();

      Alert.alert(
        'Compte supprimé ✅',
        'Toutes vos données personnelles ont été supprimées définitivement (Droit à l\'oubli respecté).'
      );
    } catch (err: any) {
      console.error('Erreur suppression compte :', err.message);
      Alert.alert(
        'Erreur ❌',
        err.message || 'Impossible de supprimer le compte. Veuillez réessayer.'
      );
    } finally {
      setSuppressionEnCours(false);
    }
  };


  const handleSendCommentaire = async () => {
    if (commentaireTexte.trim() === '') {
      Alert.alert('Message vide ⚠️', 'Veuillez saisir votre message avant de l\'envoyer.');
      return;
    }

    setChargementCommentaire(true);
    try {
      const deviceId = await getDeviceId();
      const user = (await supabase.auth.getUser()).data.user;

      const payload = {
        device_id: deviceId,
        user_id: user?.id || null,
        username: nomLocal || nomUtilisateur || 'Étudiant cauZon',
        email: emailUtilisateur || user?.email || null,
        telephone: telephoneLocal || telephoneFacturation || null,
        message: commentaireTexte.trim(),
        fichier_joint: fichierJoint.trim() || null,
        statut: 'nouveau'
      };

      const { error } = await supabase
        .from('feedbacks')
        .insert([payload]);

      if (error) throw error;

      setCommentaireTexte('');
      setFichierJoint('');
      await chargerHistoriqueFeedbacks();

      afficherToast('Votre message a été transmis à l\'équipe administrative.', 'Message Envoyé 📩', 'success');
    } catch (err: any) {
      console.error('Erreur transmission feedback :', err);
      afficherToast(err.message || 'Impossible d\'envoyer le message.', 'Erreur ⚠️', 'error');
    } finally {
      setChargementCommentaire(false);
    }
  };


  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Toast Notification Glissante */}
        <ToastNotification
          visible={toast.visible}
          message={toast.message}
          titre={toast.titre}
          type={toast.type}
          onFermer={() => setToast((prev) => ({ ...prev, visible: false }))}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardContainer}
        >
          <View style={styles.modalContainer}>
            {/* Barre de drag sur mobile */}
            {Platform.OS !== 'web' && (
              <View style={{ alignItems: 'center', marginBottom: 10 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: couleurs.estSombre ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }} />
              </View>
            )}

            {/* Entête */}
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <Ionicons name="settings-sharp" size={22} color={couleurs.primaire} />
                <Text style={styles.title}>Paramètres du Compte</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={couleurs.texte} />
              </TouchableOpacity>
            </View>

            <ScrollView 
              showsVerticalScrollIndicator={true} 
              style={{ flex: 1, width: '100%' }}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: Platform.OS === 'web' ? 24 : 45 }]}
              keyboardShouldPersistTaps="handled"
              bounces={true}
            >
              {/* Photo de profil interactive */}
              <View style={styles.sectionPhoto}>
                <TouchableOpacity 
                  style={styles.conteneurPhotoPrincipale} 
                  onPress={() => setAfficherChoixAvatar(!afficherChoixAvatar)}
                  activeOpacity={0.8}
                >
                  <View style={styles.cerclePhoto}>
                    {chargementPhoto ? (
                      <ActivityIndicator size="small" color={couleurs.primaire} />
                    ) : (
                      <AvatarDynamique
                        taille={90}
                        photoUrl={photoLocal}
                        nom={nomLocal}
                        estVip={estVip}
                      />
                    )}
                    <View style={styles.badgeEditerPhoto}>
                      <Ionicons name="camera" size={12} color="#FFFFFF" />
                    </View>
                  </View>
                  <Text style={styles.texteChangerPhoto}>Modifier la photo de profil</Text>
                </TouchableOpacity>

                {afficherChoixAvatar && (
                  <View style={styles.conteneurChoixAvatar}>
                    <Text style={styles.titreChoixAvatar}>Choisissez votre avatar ou photo :</Text>
                    <View style={styles.grilleAvatars}>
                      {LISTE_AVATARS.map((item) => (
                        <TouchableOpacity
                          key={item.id}
                          style={[
                            styles.avatarItem,
                            photoLocal === item.id && styles.avatarItemSelectionne
                          ]}
                          onPress={() => {
                            setPhotoLocal(item.id);
                            mettreAJourProfil(nomLocal, telephoneLocal, item.id);
                          }}
                        >
                          <Text style={styles.emojiAvatarMini}>{item.emoji}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                      <TouchableOpacity 
                        style={[styles.boutonPhotoPerso, { flex: 1, marginTop: 0 }]} 
                        onPress={handleChoisirImageGalerie}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="images-outline" size={16} color={couleurs.primaire} />
                        <Text style={styles.texteBoutonPhotoPerso}>Galerie</Text>
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={[styles.boutonPhotoPerso, { flex: 1, marginTop: 0 }]} 
                        onPress={handlePrendrePhotoCamera}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="camera-outline" size={16} color={couleurs.primaire} />
                        <Text style={styles.texteBoutonPhotoPerso}>Caméra</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>


              {/* Formulaire */}
              <View style={styles.form}>
                {/* Champ Nom complet (Compte Google - STRICTEMENT NON MODIFIABLE) */}
                <View style={styles.inputGroup}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={styles.label}>Nom complet (Compte Google)</Text>
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      backgroundColor: couleurs.estSombre ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      borderRadius: 6,
                    }}>
                      <Ionicons name="lock-closed" size={11} color={couleurs.texteSecondaire} />
                      <Text style={{ fontSize: 10, color: couleurs.texteSecondaire, fontWeight: '700' }}>Non modifiable</Text>
                    </View>
                  </View>

                  <View style={[
                    styles.inputContainer,
                    { 
                      backgroundColor: couleurs.estSombre ? 'rgba(255,255,255,0.04)' : '#F1F5F9', 
                      borderColor: couleurs.estSombre ? 'rgba(255,255,255,0.1)' : '#E2E8F0',
                      opacity: 0.85 
                    }
                  ]}>
                    <Ionicons name="person" size={18} color={couleurs.texteSecondaire} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, { color: couleurs.texteSecondaire }]}
                      value={nomLocal}
                      editable={false}
                      selectTextOnFocus={false}
                      placeholder="Issu du compte Google"
                      placeholderTextColor={couleurs.texteSecondaire}
                    />
                  </View>
                  <Text style={[styles.helpText, { fontStyle: 'italic', marginTop: 4 }]}>
                    Votre nom et prénom proviennent de votre compte Google et ne peuvent pas être modifiés.
                  </Text>
                </View>

                {/* Champ Numéro Mobile de Facturation (MODIFIABLE À TOUT MOMENT) */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Numéro Mobile de Facturation (Mobile Money)</Text>
                  <View style={styles.inputContainer}>
                    <Ionicons name="call-outline" size={18} color={couleurs.primaire} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      value={telephoneLocal}
                      onChangeText={setTelephoneLocal}
                      keyboardType="phone-pad"
                      placeholder="Ex: +221 77 123 45 67"
                      placeholderTextColor={couleurs.texteSecondaire}
                    />
                  </View>
                  <Text style={styles.helpText}>
                    Ce numéro sera pré-rempli lors de vos paiements FeexPay (Orange Money, Wave, MTN, Moov).
                  </Text>
                </View>


                {/* 🚀 Connexion Rapide Google OAuth */}
                <View style={{
                  marginTop: 12,
                  padding: 14,
                  borderRadius: 14,
                  backgroundColor: couleurs.estSombre ? 'rgba(255,255,255,0.05)' : '#F8FAFC',
                  borderWidth: 1,
                  borderColor: couleurs.estSombre ? 'rgba(255,255,255,0.1)' : '#E2E8F0',
                }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: couleurs.texte, marginBottom: 4 }}>
                    Compte & Authentification Google
                  </Text>
                  <Text style={{ fontSize: 11.5, color: couleurs.texteSecondaire, marginBottom: 12 }}>
                    Synchronise vos cours et pré-remplit automatiquement vos paiements FeexPay.
                  </Text>

                  {estConnecteGoogle ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: couleurs.estSombre ? '#18181B' : '#FFFFFF', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#10B981' }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                          <Text style={{ fontSize: 12.5, fontWeight: 'bold', color: couleurs.texte }}>Connecté avec Google</Text>
                        </View>
                        <Text style={{ fontSize: 11.5, color: couleurs.texteSecondaire, marginTop: 2 }} numberOfLines={1}>
                          {emailUtilisateur || 'Compte Google actif'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={handleGoogleAuth}
                        style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 8 }}
                      >
                        <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: 'bold' }}>Déconnexion</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ gap: 12 }}>
                      {/* 🛡️ Case à cocher de consentement légal obligatoire (Device ID, CGU, Confidentialité) */}
                      <TouchableOpacity
                        onPress={() => setConsentementDeviceId(!consentementDeviceId)}
                        activeOpacity={0.8}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                          gap: 10,
                          backgroundColor: couleurs.estSombre ? 'rgba(0,0,0,0.2)' : '#FFFFFF',
                          padding: 10,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: consentementDeviceId ? '#10B981' : (couleurs.estSombre ? '#3F3F46' : '#E2E8F0'),
                        }}
                      >
                        <View style={{
                          width: 20,
                          height: 20,
                          borderRadius: 5,
                          borderWidth: 2,
                          borderColor: consentementDeviceId ? '#10B981' : couleurs.texteSecondaire,
                          backgroundColor: consentementDeviceId ? '#10B981' : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginTop: 1,
                        }}>
                          {consentementDeviceId && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                        </View>
                        <Text style={{
                          flex: 1,
                          fontSize: 11,
                          lineHeight: 16,
                          color: couleurs.texte,
                        }}>
                          J'accepte les{' '}
                          <Text
                            onPress={() => {
                              setOngletLegal('cgu');
                              setModaleLegaleVisible(true);
                            }}
                            style={{ fontWeight: 'bold', color: couleurs.primaire, textDecorationLine: 'underline' }}
                          >
                            CGU
                          </Text>
                          {' '}& la{' '}
                          <Text
                            onPress={() => {
                              setOngletLegal('confidentialite');
                              setModaleLegaleVisible(true);
                            }}
                            style={{ fontWeight: 'bold', color: couleurs.primaire, textDecorationLine: 'underline' }}
                          >
                            Politique de Confidentialité
                          </Text>
                          . Je consens expressément à la collecte et à l'association de l'<Text style={{ fontWeight: 'bold' }}>identifiant unique de mon appareil (Device ID)</Text> pour la gestion sécurisée de mes documents, le respect des quotas de stockage et l'accès hors-ligne.
                        </Text>
                      </TouchableOpacity>


                      {/* Bouton Google désactivé tant que la case n'est pas cochée */}
                      <TouchableOpacity
                        onPress={handleGoogleAuth}
                        disabled={chargementGoogle || !consentementDeviceId}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 10,
                          backgroundColor: '#FFFFFF',
                          paddingVertical: 12,
                          paddingHorizontal: 16,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: consentementDeviceId ? '#CBD5E1' : '#E2E8F0',
                          opacity: consentementDeviceId ? 1 : 0.45,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: consentementDeviceId ? 0.1 : 0,
                          shadowRadius: 2,
                          elevation: consentementDeviceId ? 2 : 0,
                        }}
                      >
                        {chargementGoogle ? (
                          <ActivityIndicator size="small" color="#6B1124" />
                        ) : (
                          <>
                            <Ionicons name="logo-google" size={18} color="#EA4335" />
                            <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#1E293B' }}>
                              Se connecter avec Google
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>



              {/* Préférences (Thème & VIP) */}
              <View style={styles.preferencesSection}>
                <Text style={styles.prefTitle}>Préférences & Offres</Text>

                {/* Mode Sombre */}
                <View style={styles.settingRow}>
                  <View style={styles.settingLabelRow}>
                    <Ionicons 
                      name={modeTheme === 'dark' ? "moon" : "sunny"} 
                      size={20} 
                      color={couleurs.primaire} 
                    />
                    <Text style={styles.settingLabel}>Mode Sombre</Text>
                  </View>
                  <BoutonThemeAnime
                    isDark={modeTheme === 'dark'}
                    onToggle={basculerTheme}
                  />
                </View>

                {/* Option Location du Catalogue */}
                <View style={styles.settingRow}>
                  <View style={styles.settingLabelRow}>
                    <Ionicons name="ribbon" size={20} color={couleurs.primaire} />
                    <Text style={styles.settingLabel}>Location du Catalogue (500F)</Text>
                  </View>
                  {estVip ? (
                    <View style={styles.activeBadge}>
                      <Text style={styles.activeBadgeText}>Actif ✓</Text>
                    </View>
                  ) : (
                    <TouchableOpacity 
                      style={styles.actionBtnMini} 
                      onPress={() => setVipVisible(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.actionBtnMiniText}>Louer</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Espace Commentaires / Feedback */}
                <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: 12 }}>
                  <TouchableOpacity
                    style={styles.settingRow}
                    activeOpacity={0.7}
                    onPress={() => {
                      setCommentSectionOpen(!commentSectionOpen);
                      if (aReponseNonLue) {
                        marquerCommentairesCommeLus();
                      }
                    }}
                  >
                    <View style={styles.settingLabelRow}>
                      <Ionicons name="chatbubble-ellipses" size={20} color={couleurs.primaire} />
                      <Text style={styles.settingLabel}>Écrire à l'Équipe / Retours</Text>
                      {aReponseNonLue && (
                        <View style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: '#E74C3C',
                          marginLeft: 4
                        }} />
                      )}
                    </View>
                    <Ionicons name={commentSectionOpen ? "chevron-up" : "chevron-down"} size={18} color={couleurs.texteSecondaire} />
                  </TouchableOpacity>

                  {commentSectionOpen && (
                    <View style={{ paddingVertical: 12, gap: 12 }}>
                      {/* Messages et Réponses Administratives Réelles */}
                      {historiqueFeedbacks.length > 0 ? (
                        <View style={{ gap: 8 }}>
                          {historiqueFeedbacks.map((item) => (
                            <View 
                              key={item.id} 
                              style={{ 
                                padding: 12, 
                                backgroundColor: couleurs.fond, 
                                borderRadius: 8, 
                                borderLeftWidth: 3, 
                                borderLeftColor: item.reponse ? '#2ECC71' : couleurs.primaire,
                                gap: 4
                              }}
                            >
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={{ fontSize: 11, fontWeight: 'bold', color: couleurs.primaire }}>
                                  Votre message ({item.created_at ? new Date(item.created_at).toLocaleDateString('fr-FR') : 'Récent'}) :
                                </Text>
                                <Text style={{ fontSize: 10, color: item.reponse ? '#2ECC71' : couleurs.texteSecondaire, fontWeight: '600' }}>
                                  {item.reponse ? '✅ Répondu' : '⏳ En attente'}
                                </Text>
                              </View>
                              <Text style={{ fontSize: 12, color: couleurs.texte }}>
                                {item.message}
                              </Text>

                              {item.reponse && (
                                <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: couleurs.bordure }}>
                                  <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#2ECC71' }}>
                                    Réponse de l'Équipe cauZon :
                                  </Text>
                                  <Text style={{ fontSize: 12, color: couleurs.texte, marginTop: 2, fontStyle: 'italic' }}>
                                    "{item.reponse}"
                                  </Text>
                                </View>
                              )}
                            </View>
                          ))}
                        </View>
                      ) : (
                        <View style={{ padding: 12, backgroundColor: couleurs.fond, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: couleurs.primaire }}>
                          <Text style={{ fontSize: 11, fontWeight: 'bold', color: couleurs.primaire }}>Messagerie d'assistance directe :</Text>
                          <Text style={{ fontSize: 12, color: couleurs.texte, marginTop: 4 }}>
                            Posez vos questions ou signalez un problème. L'équipe administrative vous répondra directement ici.
                          </Text>
                        </View>
                      )}


                      {/* Text Input */}
                      <View style={{ gap: 6 }}>
                        <Text style={{ fontSize: 11, fontWeight: 'bold', color: couleurs.texteSecondaire }}>Votre Message</Text>
                        <TextInput
                          style={{
                            borderWidth: 1,
                            borderColor: couleurs.bordure,
                            borderRadius: 8,
                            padding: 10,
                            fontSize: 13,
                            color: couleurs.texte,
                            backgroundColor: couleurs.fondCarte,
                            minHeight: 60,
                            textAlignVertical: 'top'
                          }}
                          multiline
                          numberOfLines={3}
                          placeholder="Saisissez votre remarque, signalement ou question..."
                          placeholderTextColor={couleurs.texteSecondaire}
                          value={commentaireTexte}
                          onChangeText={setCommentaireTexte}
                        />
                      </View>

                      {/* PDF Attachment Select Simulation */}
                      <View style={{ gap: 6 }}>
                        <Text style={{ fontSize: 11, fontWeight: 'bold', color: couleurs.texteSecondaire }}>Joindre un document PDF (Optionnel)</Text>
                        <TextInput
                          style={{
                            borderWidth: 1,
                            borderColor: couleurs.bordure,
                            borderRadius: 8,
                            padding: 10,
                            fontSize: 12,
                            color: couleurs.texte,
                            backgroundColor: couleurs.fondCarte,
                          }}
                          placeholder="Nom du fichier joint (ex: recu_paiement.pdf)"
                          placeholderTextColor={couleurs.texteSecondaire}
                          value={fichierJoint}
                          onChangeText={setFichierJoint}
                        />
                      </View>

                      {chargementCommentaire ? (
                        <ActivityIndicator size="small" color={couleurs.primaire} style={{ marginVertical: 8 }} />
                      ) : (
                        <TouchableOpacity
                          style={{
                            backgroundColor: couleurs.primaire,
                            borderRadius: 8,
                            padding: 12,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: 4
                          }}
                          onPress={handleSendCommentaire}
                        >
                          <Text style={{ color: couleurs.blanc, fontWeight: 'bold', fontSize: 13 }}>
                            Envoyer le message
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              </View>

              {/* Actions de sauvegarde */}
              <View style={styles.actions}>
                <TouchableOpacity style={[styles.btn, styles.saveBtn]} onPress={handleSave}>
                  <Text style={styles.saveBtnText}>Enregistrer</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={onClose}>
                  <Text style={styles.cancelBtnText}>Fermer</Text>
                </TouchableOpacity>
              </View>

              {/* Section développeur */}
              <View style={styles.devSection}>
                <Text style={styles.devTitle}>Options de Démo</Text>
                <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
                  <Ionicons name="refresh-outline" size={16} color={couleurs.erreur} />
                  <Text style={styles.resetBtnText}>Réinitialiser la démo</Text>
                </TouchableOpacity>
              </View>

              {/* Zone dangereuse — Suppression de compte */}
              <View style={styles.dangerSection}>
                <View style={styles.dangerHeader}>
                  <Ionicons name="warning-outline" size={14} color="#B91C1C" />
                  <Text style={styles.dangerTitle}>Zone dangereuse</Text>
                </View>
                <Text style={styles.dangerDesc}>
                  La suppression de votre compte est irréversible. Toutes vos acquisitions et données personnelles seront définitivement effacées.
                </Text>
                {suppressionEnCours ? (
                  <View style={styles.dangerLoadingBox}>
                    <ActivityIndicator size="small" color="#B91C1C" />
                    <Text style={styles.dangerLoadingText}>Suppression en cours…</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.deleteAccountBtn} onPress={handleSupprimerCompte}>
                    <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.deleteAccountText}>Supprimer mon compte</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>

      {/* Modale VIP intégrée */}
      <ModaleVip
        visible={vipVisible}
        onClose={() => setVipVisible(false)}
        onSuccess={() => {}}
      />

      {/* Modale Juridique (CGU & Politique de Confidentialité) */}
      <ModaleLegale
        visible={modaleLegaleVisible}
        onClose={() => setModaleLegaleVisible(false)}
        ongletInitial={ongletLegal}
      />
    </Modal>
  );
}


const getStyles = (couleurs: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: couleurs.estSombre ? 'rgba(0, 0, 0, 0.85)' : 'rgba(12, 30, 27, 0.6)',
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
    alignItems: 'center',
    padding: Platform.OS === 'web' ? 16 : 0,
  },
  keyboardContainer: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 560 : '100%',
    height: Platform.OS === 'web' ? undefined : '92%',
    maxHeight: Platform.OS === 'web' ? '90%' : '94%',
    alignItems: 'center',
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
  },
  modalContainer: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 560 : '100%',
    height: Platform.OS === 'web' ? undefined : '100%',
    maxHeight: Platform.OS === 'web' ? '88%' : '100%',
    backgroundColor: couleurs.blanc,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: Platform.OS === 'web' ? 24 : 0,
    borderBottomRightRadius: Platform.OS === 'web' ? 24 : 0,
    padding: Platform.OS === 'web' ? 20 : 18,
    display: 'flex',
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
    borderWidth: couleurs.estSombre ? 1.5 : 0,
    borderColor: couleurs.bordure,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
    paddingBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: couleurs.primaire,
  },
  closeBtn: {
    padding: 4,
  },
  scrollContent: {
    paddingTop: 12,
    gap: 16,
  },
  sectionPhoto: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  conteneurPhotoPrincipale: {
    alignItems: 'center',
    gap: 6,
  },
  cerclePhoto: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: couleurs.fond,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 2,
    borderColor: couleurs.accent,
  },
  emojiAvatar: {
    fontSize: 38,
  },
  badgeEditerPhoto: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: couleurs.primaire,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: couleurs.blanc,
  },
  texteChangerPhoto: {
    fontSize: 11,
    fontWeight: 'bold',
    color: couleurs.primaire,
  },
  conteneurChoixAvatar: {
    backgroundColor: couleurs.fond,
    borderRadius: 16,
    padding: 12,
    marginTop: 10,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: couleurs.bordure,
    gap: 10,
  },
  titreChoixAvatar: {
    fontSize: 11,
    fontWeight: 'bold',
    color: couleurs.texte,
    textAlign: 'center',
  },
  grilleAvatars: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  avatarItem: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: couleurs.blanc,
    borderWidth: 1.5,
    borderColor: couleurs.bordure,
  },
  avatarItemSelectionne: {
    borderColor: couleurs.primaire,
    backgroundColor: couleurs.accent,
  },
  emojiAvatarMini: {
    fontSize: 20,
  },
  boutonPhotoPerso: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: couleurs.blanc,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
    width: '90%',
  },
  texteBoutonPhotoPerso: {
    fontSize: 10,
    fontWeight: 'bold',
    color: couleurs.texte,
  },
  form: {
    gap: 12,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    color: couleurs.primaire,
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: couleurs.fond,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: couleurs.texte,
    fontSize: 14,
    fontWeight: '600',
  },
  helpText: {
    fontSize: 10,
    color: couleurs.texteSecondaire,
    lineHeight: 14,
    marginLeft: 4,
    marginTop: 2,
  },
  preferencesSection: {
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    paddingTop: 12,
    gap: 12,
  },
  prefTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: couleurs.texteSecondaire,
    marginLeft: 4,
    marginBottom: 4,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  settingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: couleurs.texte,
  },
  switchContainer: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: couleurs.estSombre ? '#3A3A3C' : '#E2E8F0',
    padding: 2,
    justifyContent: 'center',
  },
  switchContainerActive: {
    backgroundColor: couleurs.estSombre ? '#FFFFFF' : couleurs.primaire,
  },
  switchCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  switchCircleActive: {
    alignSelf: 'flex-end',
    backgroundColor: couleurs.estSombre ? '#1C1C1E' : '#FFFFFF',
  },
  activeBadge: {
    backgroundColor: 'rgba(56, 161, 105, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  activeBadgeText: {
    color: '#38A169',
    fontSize: 12,
    fontWeight: 'bold',
  },
  actionBtnMini: {
    backgroundColor: couleurs.primaire,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  actionBtnMiniText: {
    color: couleurs.estSombre ? couleurs.fond : couleurs.accent,
    fontSize: 12,
    fontWeight: 'bold',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtn: {
    backgroundColor: couleurs.primaire,
  },
  saveBtnText: {
    color: couleurs.estSombre ? couleurs.fond : couleurs.accent,
    fontWeight: 'bold',
    fontSize: 14,
  },
  cancelBtn: {
    borderWidth: 1.5,
    borderColor: couleurs.primaire,
    backgroundColor: 'transparent',
  },
  cancelBtnText: {
    color: couleurs.primaire,
    fontWeight: 'bold',
    fontSize: 14,
  },
  devSection: {
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    paddingTop: 14,
    gap: 8,
  },
  devTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: couleurs.texteSecondaire,
    marginLeft: 4,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: couleurs.erreur,
    backgroundColor: 'rgba(229, 62, 98, 0.03)',
    gap: 6,
  },
  resetBtnText: {
    color: couleurs.erreur,
    fontSize: 11,
    fontWeight: 'bold',
  },
  dangerSection: {
    borderTopWidth: 1,
    borderTopColor: '#FEE2E2',
    paddingTop: 16,
    marginTop: 4,
    gap: 10,
    backgroundColor: 'rgba(185, 28, 28, 0.02)',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  dangerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dangerTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B91C1C',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dangerDesc: {
    fontSize: 11,
    color: '#6B7280',
    lineHeight: 16,
  },
  deleteAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#B91C1C',
    gap: 8,
  },
  deleteAccountText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  dangerLoadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  dangerLoadingText: {
    fontSize: 12,
    color: '#B91C1C',
    fontWeight: '600',
  },
});
