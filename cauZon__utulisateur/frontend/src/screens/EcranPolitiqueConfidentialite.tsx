import React, { useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Platform,
  StatusBar,
  Linking,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '../components/AppIcon';
import { useApp } from '../store/ContexteApp';
import { RootStackParamList } from '../navigation/NavigateurApp';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function EcranPolitiqueConfidentialite() {
  const navigation = useNavigation<NavigationProp>();
  const { couleurs } = useApp();

  const handleRetour = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  };

  // Interception du bouton retour matériel Android
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleRetour();
      return true;
    });
    return () => sub.remove();
  }, [navigation]);

  const handleOuvrirEmail = () => {
    Linking.openURL('mailto:support@cauzon.ci?subject=Demande%20relative%20aux%20donn%C3%A9es%20personnelles').catch(() => {});
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: couleurs.fond }]} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={couleurs.estSombre ? 'light-content' : 'dark-content'} />

      {/* ─── Barre de Navigation Supérieure ──────────────────────────────── */}
      <View style={[styles.topBar, { backgroundColor: couleurs.fondCarte, borderBottomColor: couleurs.bordure }]}>
        <TouchableOpacity
          onPress={handleRetour}
          style={[styles.backButton, { backgroundColor: couleurs.estSombre ? 'rgba(255,255,255,0.08)' : 'rgba(127,1,31,0.06)' }]}
          activeOpacity={0.7}
          accessibilityLabel="Retour à l'accueil"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={20} color={couleurs.primaire} />
          <Text style={[styles.backButtonText, { color: couleurs.primaire }]}>Retour</Text>
        </TouchableOpacity>

        <View style={styles.brandContainer}>
          <Text style={[styles.brandText, { color: couleurs.texte }]}>cauZon</Text>
          <View style={styles.brandBadge}>
            <Text style={styles.brandBadgeText}>Légal</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleOuvrirEmail}
          style={[styles.contactIconButton, { backgroundColor: couleurs.estSombre ? 'rgba(255,255,255,0.08)' : 'rgba(127,1,31,0.06)' }]}
          activeOpacity={0.7}
          accessibilityLabel="Contacter le support DPO"
          accessibilityRole="button"
        >
          <Ionicons name="mail-outline" size={18} color={couleurs.primaire} />
        </TouchableOpacity>
      </View>

      {/* ─── Contenu Déroulant ────────────────────────────────────────────── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.pageWrapper}>
          {/* Bannière d'en-tête (Hero) */}
          <View style={[styles.heroCard, { backgroundColor: couleurs.fondCarte, borderColor: couleurs.bordure }]}>
            <View style={styles.heroIconBadge}>
              <Ionicons name="shield-checkmark" size={32} color="#FFFFFF" />
            </View>
            <Text style={[styles.heroTitle, { color: couleurs.texte }]}>
              Politique de Confidentialité
            </Text>
            <Text style={[styles.heroSubtitle, { color: couleurs.texteSecondaire }]}>
              Engagements de la plateforme académique cauZon relatifs à la protection de vos données personnelles, conformément aux exigences du Google Play Store et aux standards internationaux.
            </Text>
            <View style={styles.metaRow}>
              <View style={[styles.metaBadge, { backgroundColor: 'rgba(46, 204, 113, 0.12)' }]}>
                <Ionicons name="checkmark-circle" size={14} color="#2ECC71" />
                <Text style={[styles.metaBadgeText, { color: '#27AE60' }]}>Conforme Google Play</Text>
              </View>
              <Text style={[styles.metaDateText, { color: couleurs.texteSecondaire }]}>
                Dernière révision : 26 Septembre 2026
              </Text>
            </View>
          </View>

          {/* Grille des 3 Piliers de Sécurité */}
          <View style={styles.pillarsGrid}>
            <View style={[styles.pillarCard, { backgroundColor: couleurs.fondCarte, borderColor: couleurs.bordure }]}>
              <View style={[styles.pillarIconWrap, { backgroundColor: 'rgba(127, 1, 31, 0.1)' }]}>
                <Ionicons name="lock-closed" size={20} color="#7F011F" />
              </View>
              <Text style={[styles.pillarTitle, { color: couleurs.texte }]}>Chiffrement SSL/TLS</Text>
              <Text style={[styles.pillarDesc, { color: couleurs.texteSecondaire }]}>
                Toutes les communications et sessions sont intégralement chiffrées de bout en bout.
              </Text>
            </View>

            <View style={[styles.pillarCard, { backgroundColor: couleurs.fondCarte, borderColor: couleurs.bordure }]}>
              <View style={[styles.pillarIconWrap, { backgroundColor: 'rgba(46, 204, 113, 0.1)' }]}>
                <Ionicons name="card-outline" size={20} color="#2ECC71" />
              </View>
              <Text style={[styles.pillarTitle, { color: couleurs.texte }]}>0 Donnée Bancaire</Text>
              <Text style={[styles.pillarDesc, { color: couleurs.texteSecondaire }]}>
                Aucun numéro de carte ni code Mobile Money n'est stocké sur nos serveurs.
              </Text>
            </View>

            <View style={[styles.pillarCard, { backgroundColor: couleurs.fondCarte, borderColor: couleurs.bordure }]}>
              <View style={[styles.pillarIconWrap, { backgroundColor: 'rgba(52, 152, 219, 0.1)' }]}>
                <Ionicons name="person-remove-outline" size={20} color="#3498DB" />
              </View>
              <Text style={[styles.pillarTitle, { color: couleurs.texte }]}>Suppression en 1 Clic</Text>
              <Text style={[styles.pillarDesc, { color: couleurs.texteSecondaire }]}>
                Contrôle total : effacement autonome de votre compte et de vos données à tout instant.
              </Text>
            </View>
          </View>

          {/* ─── SECTION 1 : Responsable du traitement ──────────────────── */}
          <View style={[styles.sectionCard, { backgroundColor: couleurs.fondCarte, borderColor: couleurs.bordure }]}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionNumberBadge, { backgroundColor: '#7F011F' }]}>
                <Text style={styles.sectionNumberText}>1</Text>
              </View>
              <Text style={[styles.sectionTitle, { color: couleurs.texte }]}>
                Responsable du Traitement
              </Text>
            </View>
            <Text style={[styles.paragraph, { color: couleurs.texte }]}>
              Le traitement de vos données à caractère personnel est assuré par la <Text style={styles.bold}>plateforme académique cauZon</Text>, service d'accès et d'apprentissage numérique dédié aux étudiants, chercheurs et enseignants de Côte d'Ivoire et de l'espace francophone.
            </Text>
            <View style={[styles.infoBox, { backgroundColor: couleurs.estSombre ? 'rgba(255,255,255,0.04)' : '#F8FAFC', borderColor: couleurs.bordure }]}>
              <Ionicons name="business-outline" size={18} color={couleurs.primaire} />
              <View style={styles.infoBoxContent}>
                <Text style={[styles.infoBoxLabel, { color: couleurs.texteSecondaire }]}>Entité responsable :</Text>
                <Text style={[styles.infoBoxValue, { color: couleurs.texte }]}>Plateforme Académique cauZon</Text>
                <Text style={[styles.infoBoxLabel, { color: couleurs.texteSecondaire, marginTop: 4 }]}>Contact Protection des Données :</Text>
                <TouchableOpacity onPress={handleOuvrirEmail}>
                  <Text style={[styles.linkText, { color: couleurs.primaire }]}>support@cauzon.ci</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* ─── SECTION 2 : Données Collectées ─────────────────────────── */}
          <View style={[styles.sectionCard, { backgroundColor: couleurs.fondCarte, borderColor: couleurs.bordure }]}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionNumberBadge, { backgroundColor: '#7F011F' }]}>
                <Text style={styles.sectionNumberText}>2</Text>
              </View>
              <Text style={[styles.sectionTitle, { color: couleurs.texte }]}>
                Données Personnelles Collectées
              </Text>
            </View>
            <Text style={[styles.paragraph, { color: couleurs.texte }]}>
              Conformément au principe de minimisation des données, cauZon collecte exclusivement les informations strictement indispensables à la fourniture et à la sécurité du service éducatif :
            </Text>

            <View style={styles.dataItem}>
              <View style={styles.bulletRow}>
                <Ionicons name="person-circle-outline" size={18} color="#7F011F" />
                <Text style={[styles.dataItemTitle, { color: couleurs.texte }]}>Données de Compte & Identité :</Text>
              </View>
              <Text style={[styles.dataItemDesc, { color: couleurs.texteSecondaire }]}>
                Nom, prénom et adresse e-mail recueillis lors de l'authentification sécurisée Google OAuth. Ces données permettent d'identifier votre profil et de synchroniser vos cours sur tous vos appareils.
              </Text>
            </View>

            <View style={styles.dataItem}>
              <View style={styles.bulletRow}>
                <Ionicons name="book-outline" size={18} color="#7F011F" />
                <Text style={[styles.dataItemTitle, { color: couleurs.texte }]}>Données d'Utilisation Académique :</Text>
              </View>
              <Text style={[styles.dataItemDesc, { color: couleurs.texteSecondaire }]}>
                Historique des documents et cours consultés, favoris enregistrés, progression de lecture et acquisitions pour assurer la continuité de votre expérience pédagogique.
              </Text>
            </View>

            <View style={styles.dataItem}>
              <View style={styles.bulletRow}>
                <Ionicons name="hardware-chip-outline" size={18} color="#7F011F" />
                <Text style={[styles.dataItemTitle, { color: couleurs.texte }]}>Identifiants Techniques Anonymisés :</Text>
              </View>
              <Text style={[styles.dataItemDesc, { color: couleurs.texteSecondaire }]}>
                Identifiant unique d'appareil matériel (Device ID anonymisé) strictement nécessaire à la gestion du cache de lecture hors-ligne, au respect des quotas de stockage et à la protection contre la fraude de l'offre de bienvenue (un cours gratuit par appareil).
              </Text>
            </View>
          </View>

          {/* ─── SECTION 3 : Transactions et Paiements ──────────────────── */}
          <View style={[styles.sectionCard, { backgroundColor: couleurs.fondCarte, borderColor: couleurs.bordure }]}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionNumberBadge, { backgroundColor: '#7F011F' }]}>
                <Text style={styles.sectionNumberText}>3</Text>
              </View>
              <Text style={[styles.sectionTitle, { color: couleurs.texte }]}>
                Transactions et Paiements Sécurisés
              </Text>
            </View>
            <View style={[styles.securityHighlightBox, { backgroundColor: 'rgba(127, 1, 31, 0.08)', borderColor: 'rgba(127, 1, 31, 0.25)' }]}>
              <Ionicons name="shield-half-outline" size={24} color="#7F011F" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.securityHighlightTitle, { color: '#7F011F' }]}>
                  Zéro Donnée Bancaire Conservée
                </Text>
                <Text style={[styles.securityHighlightText, { color: couleurs.texte }]}>
                  cauZon ne stocke, ne traite ni n'a accès à aucun numéro de carte bancaire, mot de passe ou code confidentiel de compte Mobile Money.
                </Text>
              </View>
            </View>
            <Text style={[styles.paragraph, { color: couleurs.texte, marginTop: 12 }]}>
              Toutes les transactions financières (achats de cours individuels ou abonnements Pass VIP) sont déléguées et traitées directement par des passerelles de paiement partenaires agréées et certifiées (notamment <Text style={styles.bold}>FeexPay</Text>), conformes aux exigences strictes de sécurité bancaire et de chiffrement PCI-DSS.
            </Text>
          </View>

          {/* ─── SECTION 4 : Stockage et Sécurité ───────────────────────── */}
          <View style={[styles.sectionCard, { backgroundColor: couleurs.fondCarte, borderColor: couleurs.bordure }]}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionNumberBadge, { backgroundColor: '#7F011F' }]}>
                <Text style={styles.sectionNumberText}>4</Text>
              </View>
              <Text style={[styles.sectionTitle, { color: couleurs.texte }]}>
                Stockage et Sécurité des Données
              </Text>
            </View>
            <Text style={[styles.paragraph, { color: couleurs.texte }]}>
              Nous appliquons des mesures techniques et organisationnelles conformes aux standards de l'industrie pour prévenir toute altération, perte ou accès non autorisé à vos informations :
            </Text>
            <View style={styles.bulletList}>
              <View style={styles.bulletItemRow}>
                <Ionicons name="checkmark" size={16} color="#2ECC71" />
                <Text style={[styles.bulletItemText, { color: couleurs.texte }]}>
                  <Text style={styles.bold}>Hébergement Sécurisé Cloud :</Text> Données persistées sur une infrastructure cloud moderne et certifiée (<Text style={styles.bold}>Supabase</Text> / Postgres Enterprise).
                </Text>
              </View>
              <View style={styles.bulletItemRow}>
                <Ionicons name="checkmark" size={16} color="#2ECC71" />
                <Text style={[styles.bulletItemText, { color: couleurs.texte }]}>
                  <Text style={styles.bold}>Chiffrement en Transit :</Text> Toutes les communications réseau sont chiffrées selon le protocole de pointe SSL/TLS (HTTPS forcé).
                </Text>
              </View>
              <View style={styles.bulletItemRow}>
                <Ionicons name="checkmark" size={16} color="#2ECC71" />
                <Text style={[styles.bulletItemText, { color: couleurs.texte }]}>
                  <Text style={styles.bold}>Cloisonnement Strict RLS :</Text> Politiques de sécurité au niveau de chaque ligne (Row-Level Security) interdisant à un tiers d'accéder aux données d'un autre apprenant.
                </Text>
              </View>
            </View>
          </View>

          {/* ─── SECTION 5 : Droits de l'Utilisateur ────────────────────── */}
          <View style={[styles.sectionCard, { backgroundColor: couleurs.fondCarte, borderColor: couleurs.bordure }]}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionNumberBadge, { backgroundColor: '#7F011F' }]}>
                <Text style={styles.sectionNumberText}>5</Text>
              </View>
              <Text style={[styles.sectionTitle, { color: couleurs.texte }]}>
                Vos Droits et Suppression de Compte
              </Text>
            </View>
            <Text style={[styles.paragraph, { color: couleurs.texte }]}>
              Vous disposez à tout moment des droits fondamentaux suivants sur vos données personnelles :
            </Text>
            <View style={styles.rightsContainer}>
              <View style={[styles.rightPill, { backgroundColor: couleurs.estSombre ? 'rgba(255,255,255,0.05)' : '#F1F5F9' }]}>
                <Ionicons name="eye-outline" size={16} color={couleurs.primaire} />
                <Text style={[styles.rightPillText, { color: couleurs.texte }]}>Droit d'accès</Text>
              </View>
              <View style={[styles.rightPill, { backgroundColor: couleurs.estSombre ? 'rgba(255,255,255,0.05)' : '#F1F5F9' }]}>
                <Ionicons name="create-outline" size={16} color={couleurs.primaire} />
                <Text style={[styles.rightPillText, { color: couleurs.texte }]}>Droit de rectification</Text>
              </View>
              <View style={[styles.rightPill, { backgroundColor: couleurs.estSombre ? 'rgba(255,255,255,0.05)' : '#F1F5F9' }]}>
                <Ionicons name="trash-outline" size={16} color="#E74C3C" />
                <Text style={[styles.rightPillText, { color: '#E74C3C' }]}>Droit à l'effacement</Text>
              </View>
            </View>

            <View style={[styles.actionCallout, { backgroundColor: couleurs.estSombre ? 'rgba(231,76,60,0.1)' : 'rgba(231,76,60,0.06)', borderColor: 'rgba(231,76,60,0.2)' }]}>
              <Text style={[styles.actionCalloutTitle, { color: '#E74C3C' }]}>
                Comment exercer la suppression de vos données ?
              </Text>
              <Text style={[styles.actionCalloutText, { color: couleurs.texte }]}>
                • <Text style={styles.bold}>Directement dans l'application :</Text> Ouvrez les Réglages (icône profil/roue crantée) &gt; rubrique « Zone sensible » &gt; appuyez sur « Désactiver mon compte » pour effacer instantanément vos données d'accès.{'\n'}
                • <Text style={styles.bold}>Par simple e-mail :</Text> Adressez votre demande à <Text style={[styles.bold, { color: couleurs.primaire }]}>support@cauzon.ci</Text>. Vos informations seront définitivement purgées sous 48 heures ouvrées.
              </Text>
            </View>
          </View>

          {/* ─── SECTION 6 : Services Tiers ─────────────────────────────── */}
          <View style={[styles.sectionCard, { backgroundColor: couleurs.fondCarte, borderColor: couleurs.bordure }]}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionNumberBadge, { backgroundColor: '#7F011F' }]}>
                <Text style={styles.sectionNumberText}>6</Text>
              </View>
              <Text style={[styles.sectionTitle, { color: couleurs.texte }]}>
                Services Tiers et Sous-Traitants
              </Text>
            </View>
            <Text style={[styles.paragraph, { color: couleurs.texte }]}>
              Pour garantir une infrastructure sécurisée, performante et certifiée, cauZon s'appuie sur des prestataires tiers rigoureusement sélectionnés :
            </Text>

            <View style={styles.thirdPartyRow}>
              <View style={styles.thirdPartyIconWrap}>
                <Ionicons name="logo-google" size={18} color="#EA4335" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.thirdPartyTitle, { color: couleurs.texte }]}>
                  Google Play Services & Authentification Google
                </Text>
                <Text style={[styles.thirdPartyDesc, { color: couleurs.texteSecondaire }]}>
                  Authentification fédérée OAuth 2.0 sécurisée, distribution officielle de l'application Android et gestion des mises à jour applicatives.
                </Text>
              </View>
            </View>

            <View style={styles.thirdPartyRow}>
              <View style={styles.thirdPartyIconWrap}>
                <Ionicons name="notifications-outline" size={18} color="#F39C12" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.thirdPartyTitle, { color: couleurs.texte }]}>
                  Firebase Cloud Messaging (FCM)
                </Text>
                <Text style={[styles.thirdPartyDesc, { color: couleurs.texteSecondaire }]}>
                  Acheminement des notifications push administratives (nouveaux cours certifiés et alertes relatives à votre compte).
                </Text>
              </View>
            </View>

            <View style={styles.thirdPartyRow}>
              <View style={styles.thirdPartyIconWrap}>
                <Ionicons name="card" size={18} color="#2ECC71" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.thirdPartyTitle, { color: couleurs.texte }]}>
                  FeexPay (Passerelle de Paiement Sécurisée)
                </Text>
                <Text style={[styles.thirdPartyDesc, { color: couleurs.texteSecondaire }]}>
                  Traitement direct et chiffré des paiements électroniques Mobile Money conformément aux normes financières.
                </Text>
              </View>
            </View>
          </View>

          {/* ─── Contact & Pied de page ─────────────────────────────────── */}
          <View style={[styles.contactCard, { backgroundColor: couleurs.fondCarte, borderColor: couleurs.bordure }]}>
            <Ionicons name="mail" size={28} color={couleurs.primaire} />
            <Text style={[styles.contactTitle, { color: couleurs.texte }]}>Une question juridique ou technique ?</Text>
            <Text style={[styles.contactDesc, { color: couleurs.texteSecondaire }]}>
              Notre équipe d'assistance et notre délégué à la protection des données sont à votre entière disposition.
            </Text>
            <TouchableOpacity
              style={[styles.contactButton, { backgroundColor: '#7F011F' }]}
              onPress={handleOuvrirEmail}
              activeOpacity={0.8}
            >
              <Ionicons name="paper-plane-outline" size={18} color="#FFFFFF" />
              <Text style={styles.contactButtonText}>Écrire à support@cauzon.ci</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.homeReturnButton}
              onPress={handleRetour}
              activeOpacity={0.7}
            >
              <Ionicons name="home-outline" size={16} color={couleurs.texteSecondaire} />
              <Text style={[styles.homeReturnText, { color: couleurs.texteSecondaire }]}>Retourner à l'accueil</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footerCopyright}>
            <Text style={[styles.footerCopyrightText, { color: couleurs.texteSecondaire }]}>
              © 2026 cauZon. Tous droits réservés. Plateforme académique certifiée.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandText: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  brandBadge: {
    backgroundColor: '#7F011F',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  brandBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  contactIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  pageWrapper: {
    width: '100%',
    maxWidth: 780,
    gap: 16,
  },
  heroCard: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    textAlign: 'center',
  },
  heroIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#7F011F',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#7F011F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 620,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  metaBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  metaDateText: {
    fontSize: 12,
    fontWeight: '500',
  },
  pillarsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  pillarCard: {
    flex: 1,
    minWidth: Platform.OS === 'web' ? 220 : '100%',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  pillarIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillarTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  pillarDesc: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  sectionCard: {
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  sectionNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionNumberText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    flex: 1,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 22,
  },
  bold: {
    fontWeight: '700',
  },
  infoBox: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 12,
    marginTop: 6,
  },
  infoBoxContent: {
    flex: 1,
  },
  infoBoxLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  infoBoxValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  linkText: {
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  dataItem: {
    gap: 4,
    marginTop: 6,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dataItemTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  dataItemDesc: {
    fontSize: 13,
    lineHeight: 19,
    paddingLeft: 26,
  },
  securityHighlightBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  securityHighlightTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  securityHighlightText: {
    fontSize: 13,
    lineHeight: 18,
  },
  bulletList: {
    gap: 10,
    marginTop: 4,
  },
  bulletItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletItemText: {
    fontSize: 13.5,
    lineHeight: 20,
    flex: 1,
  },
  rightsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  rightPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  rightPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  actionCallout: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    marginTop: 8,
  },
  actionCalloutTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  actionCalloutText: {
    fontSize: 13,
    lineHeight: 20,
  },
  thirdPartyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 8,
  },
  thirdPartyIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  thirdPartyTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  thirdPartyDesc: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  contactCard: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    textAlign: 'center',
    gap: 10,
    marginTop: 8,
  },
  contactTitle: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  contactDesc: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 480,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 8,
  },
  contactButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  homeReturnButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  homeReturnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  footerCopyright: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  footerCopyrightText: {
    fontSize: 11.5,
    textAlign: 'center',
  },
});
