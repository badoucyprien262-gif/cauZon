import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../store/ContexteApp';

interface ModaleLegaleProps {
  visible: boolean;
  onClose: () => void;
  ongletInitial?: 'cgu' | 'confidentialite';
}

export default function ModaleLegale({
  visible,
  onClose,
  ongletInitial = 'cgu',
}: ModaleLegaleProps) {
  const { couleurs } = useApp();
  const [ongletActif, setOngletActif] = useState<'cgu' | 'confidentialite'>(ongletInitial);
  const styles = getStyles(couleurs);

  React.useEffect(() => {
    if (visible) {
      setOngletActif(ongletInitial);
    }
  }, [visible, ongletInitial]);

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Entête fixe */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Ionicons name="shield-checkmark" size={22} color={couleurs.primaire} />
              <Text style={styles.title}>Informations Juridiques</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={couleurs.texte} />
            </TouchableOpacity>
          </View>


          {/* Onglets de sélection */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[
                styles.tab,
                ongletActif === 'cgu' && styles.tabActive,
              ]}
              onPress={() => setOngletActif('cgu')}
            >
              <Text
                style={[
                  styles.tabText,
                  ongletActif === 'cgu' && styles.tabTextActive,
                ]}
              >
                CGU
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tab,
                ongletActif === 'confidentialite' && styles.tabActive,
              ]}
              onPress={() => setOngletActif('confidentialite')}
            >
              <Text
                style={[
                  styles.tabText,
                  ongletActif === 'confidentialite' && styles.tabTextActive,
                ]}
              >
                Politique de Confidentialité
              </Text>
            </TouchableOpacity>
          </View>

          {/* Contenu textuel juridique */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
          >
            {ongletActif === 'cgu' ? (
              <View style={styles.textSection}>
                <Text style={styles.sectionTitle}>Conditions Générales d'Utilisation (CGU)</Text>
                <Text style={styles.paragraph}>
                  Dernière mise à jour : 26 Août 2026
                </Text>

                <Text style={styles.subTitle}>1. Objet du Service</Text>
                <Text style={styles.paragraph}>
                  L'application cauZon est une plateforme éducative dédiée à la consultation, au partage et à l'acquisition de ressources pédagogiques universitaires et professionnelles.
                </Text>

                <Text style={styles.subTitle}>2. Accès et Création de Compte</Text>
                <Text style={styles.paragraph}>
                  L'accès à la plateforme s'effectue via l'authentification Google OAuth. L'utilisateur s'engage à fournir des informations véridiques et à maintenir la confidentialité de son compte.
                </Text>

                <Text style={styles.subTitle}>3. Modèle d'Acquisition et Tarification</Text>
                <Text style={styles.paragraph}>
                  - Achat à l'acte : L'acquisition d'un cours confère un droit d'accès illimité et permanent sur l'appareil associé.`n
                  - Pass VIP : Donne un accès complet à tous les documents pendant la durée de validité souscrite (30 jours).`n
                  - Offre de bienvenue : Le premier cours gratuit est strictement limité à un unique déblocage par appareil matériel (Device ID).
                </Text>

                <Text style={styles.subTitle}>4. Propriété Intellectuelle</Text>
                <Text style={styles.paragraph}>
                  Tous les supports, cours et documents certifiés demeurent la propriété exclusive de leurs auteurs et de cauZon. Toute reproduction, revente ou diffusion non autorisée est formellement interdite.
                </Text>

                <Text style={styles.subTitle}>5. Droit à l'Oubli et Suppression</Text>
                <Text style={styles.paragraph}>
                  L'utilisateur peut à tout moment supprimer définitivement son compte depuis les paramètres de l'application, entraînant l'effacement de l'ensemble de ses données nominatives.
                </Text>
              </View>
            ) : (
              <View style={styles.textSection}>
                <Text style={styles.sectionTitle}>Politique de Confidentialité</Text>
                <Text style={styles.paragraph}>
                  Conformité Google Play Store & Protection des Données Personnelles
                </Text>

                <Text style={styles.subTitle}>1. Données Collectées</Text>
                <Text style={styles.paragraph}>
                  Nous collectons uniquement les informations nécessaires au bon fonctionnement de vos services d'apprentissage :
                </Text>
                <View style={styles.bulletList}>
                  <Text style={styles.bulletItem}>• <Text style={styles.bold}>Identité Google</Text> : Nom complet, prénom et adresse email (via Google OAuth) pour certifier votre profil et sécuriser vos accès.</Text>
                  <Text style={styles.bulletItem}>• <Text style={styles.bold}>Numéro de Téléphone</Text> : Utilisé exclusivement pour pré-remplir vos transactions de paiement Mobile Money (FeexPay).</Text>
                  <Text style={styles.bulletItem}>• <Text style={styles.bold}>Identifiant Appareil (Device ID)</Text> : Empreinte technique anonymisée servant à la gestion du cache hors-ligne et à la protection contre la fraude de l'offre de bienvenue.</Text>
                </View>

                <Text style={styles.subTitle}>2. Utilisation des Données</Text>
                <Text style={styles.paragraph}>
                  Vos données personnelles ne sont JAMAIS vendues, louées ou cédées à des tiers. Elles sont uniquement utilisées pour l'accès aux cours, la synchronisation multiplateforme et le support technique.
                </Text>

                <Text style={styles.subTitle}>3. Sécurité et Chiffrement</Text>
                <Text style={styles.paragraph}>
                  Toutes les communications entre l'application et nos serveurs Supabase sont chiffrées de bout en bout via SSL/TLS. Les paiements Mobile Money sont traités selon les normes de sécurité bancaire PCI-DSS par notre partenaire agréé FeexPay.
                </Text>

                <Text style={styles.subTitle}>4. Vos Droits (Droit d'accès, rectification et effacement)</Text>
                <Text style={styles.paragraph}>
                  Conformément aux réglementations sur la protection des données personnelles, vous disposez d'un droit total d'accès, de modification et d'effacement complet de votre compte en un clic dans la section "Paramètres" de l'application.
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Bouton de validation / fermeture */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.confirmBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.confirmBtnText}>J'ai compris</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const { height: screenHeight } = Dimensions.get('window');

const getStyles = (couleurs: any) => StyleSheet.create({

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Platform.OS === 'web' ? 20 : 16,
    zIndex: 100000,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 500,
    height: Platform.OS === 'web' ? 'auto' : Math.min(screenHeight * 0.85, 620),
    maxHeight: Math.min(screenHeight * 0.88, 640),
    backgroundColor: couleurs.blanc,
    borderRadius: 20,

    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
    borderWidth: couleurs.estSombre ? 1 : 0,
    borderColor: couleurs.bordure,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
    backgroundColor: couleurs.fondCarte,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: couleurs.texte,
  },
  closeBtn: {
    padding: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: couleurs.estSombre ? 'rgba(255,255,255,0.05)' : '#F1F5F9',
    padding: 4,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: couleurs.primaire,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
    minHeight: 250,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    paddingBottom: 24,
  },
  textSection: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: couleurs.primaire,
    marginBottom: 4,
  },
  subTitle: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: couleurs.texte,
    marginTop: 10,
    marginBottom: 2,
  },
  paragraph: {
    fontSize: 12.5,
    color: couleurs.texte,
    lineHeight: 19,
  },
  bulletList: {
    paddingLeft: 4,
    gap: 6,
    marginTop: 4,
  },
  bulletItem: {
    fontSize: 12,
    color: couleurs.texte,
    lineHeight: 18,
  },
  bold: {
    fontWeight: 'bold',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    backgroundColor: couleurs.fond,
  },
  confirmBtn: {
    backgroundColor: couleurs.primaire,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
