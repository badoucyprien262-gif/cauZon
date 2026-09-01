import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as Application from 'expo-application';
import { useApp } from '../store/ContexteApp';
import {
  debloquerDocument as welcomeUnlock,
  enregistrerAchatDocument as paidUnlock,
  acquerirDocumentVIP,
  activerPassVIP,
} from '../services/serviceDocument';
import {
  generateFeexPayHtml,
  generateFeexPayTransactionId,
  FEEXPAY_PUBLIC_KEY,
  CustomerFeexPay,
  buildFeexPayCheckoutUrl,
  formatPhoneFeexPay,
  FeexPayOperateur,
} from '../services/payment/feexpay';

interface PurchaseModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  documentTitle: string;
  documentId: string;
  documentPrix?: number;
}

export default function ModaleAchat({
  visible,
  onClose,
  onSuccess,
  documentTitle,
  documentId,
  documentPrix,
}: PurchaseModalProps) {
  const {
    couleurs,
    docsDebloquesIds,
    debloquerDocument,
    estEligibleOffreBienvenue,
    consommerOffreBienvenueLocal,
    estVip,
    estAbonneVIP,
    sAbonnerVIPCinetPay,
    nomUtilisateur,
    telephoneFacturation,
  } = useApp();
  const styles = getStyles(couleurs);

  // L'utilisateur est-il abonné VIP ?
  const isVipUser = estVip || estAbonneVIP;

  // Prix dynamique réel du document (fallback à 100 FCFA si non spécifié)
  const prixReel = typeof documentPrix === 'number' && documentPrix > 0 ? documentPrix : 100;

  const [identifiantAppareil, setIdentifiantAppareil] = useState<string>('Chargement...');
  const [chargementEnCours, setChargementEnCours] = useState<boolean>(false);
  const [emailUtilisateur, setEmailUtilisateur] = useState<string>('');

  // FeexPay integration states
  const [selectedOption, setSelectedOption] = useState<'single' | 'vip'>('single');
  const [showFeexPay, setShowFeexPay] = useState<boolean>(false);
  const [showOperateurSelector, setShowOperateurSelector] = useState<boolean>(false);
  const [operateurSelectionne, setOperateurSelectionne] = useState<FeexPayOperateur | undefined>(
    undefined
  );
  const [transId, setTransId] = useState<string>('');
  const [payAmount, setPayAmount] = useState<number>(100);
  const [payDescription, setPayDescription] = useState<string>('');
  const [telephonePaiement, setTelephonePaiement] = useState<string>(telephoneFacturation || '');

  const offreBienvenueDisponible = estEligibleOffreBienvenue;

  // Récupérer l'identifiant unique de l'appareil + email Supabase
  useEffect(() => {
    async function initialiser() {
      try {
        if (Platform.OS === 'android') {
          setIdentifiantAppareil(Application.getAndroidId() || 'MOCK_ANDROID_ID_789456');
        } else if (Platform.OS === 'ios') {
          const iosId = await Application.getIosIdForVendorAsync();
          setIdentifiantAppareil(iosId || 'MOCK_IOS_ID_789456');
        } else {
          setIdentifiantAppareil('IDENTIFIANT_NAVIGATEUR_WEB');
        }
      } catch (erreur) {
        console.error("Échec de la récupération de l'ID appareil :", erreur);
        setIdentifiantAppareil('ERREUR_ID_APPAREIL');
      }
      // Récupérer l'email depuis la session Supabase
      try {
        const { supabase } = await import('../lib/supabase');
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.email) setEmailUtilisateur(user.email);
      } catch (_) {}
    }

    if (visible) {
      initialiser();
      setShowFeexPay(false);
      setShowOperateurSelector(false);
      setOperateurSelectionne(undefined);
      setTelephonePaiement(telephoneFacturation || '');
    }
  }, [visible, telephoneFacturation]);

  // Écouteur global de messages pour le mode Web (Iframe / postMessage)
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;

    const handleWebMessage = (event: MessageEvent) => {
      try {
        if (!event.data) return;
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (
          data &&
          (data.status === 'SUCCESS' ||
            data.status === 'success' ||
            data.status === 'CANCELLED' ||
            data.status === 'FAILED')
        ) {
          traiterResultatPaiement(data);
        }
      } catch (_) {}
    };

    window.addEventListener('message', handleWebMessage);
    return () => {
      window.removeEventListener('message', handleWebMessage);
    };
  }, [visible, selectedOption, payAmount, documentId, documentTitle]);

  /** Construit le CustomerFeexPay depuis les données disponibles (100% pré-rempli & éditable) */
  const buildCustomer = (): CustomerFeexPay => {
    const parts = (nomUtilisateur || 'Étudiant cauZon').trim().split(' ');
    const prenom = parts[0] || 'Étudiant';
    const nom = parts.slice(1).join(' ') || 'cauZon';
    const email = emailUtilisateur || `${prenom.toLowerCase()}@cauzon.app`;
    return {
      firstname: prenom,
      lastname: nom,
      email: email,
      phone: formatPhoneFeexPay(telephonePaiement || telephoneFacturation || '0701020304'),
      country: 'ci',
    };
  };

  /** Action d'acquisition directe VIP (0 FCFA) */
  const executerAcquisitionVip = async () => {
    setChargementEnCours(true);
    const res = await acquerirDocumentVIP(documentId);
    setChargementEnCours(false);

    if (res.success) {
      debloquerDocument(documentId);
      Alert.alert(
        'Accès VIP 👑',
        res.message || 'Cours débloqué et ajouté à votre dossier VIP !',
        [{ text: 'Accéder au cours', onPress: () => { onSuccess(); onClose(); } }]
      );
    } else {
      Alert.alert('Erreur ❌', res.message || "Échec de l'acquisition VIP.");
    }
  };

  /** Étape 1 : afficher le sélecteur d'opérateur pour non-VIP */
  const demarrerPaiementFeexPay = () => {
    const amount = selectedOption === 'single' ? prixReel : 500;
    const desc =
      selectedOption === 'single'
        ? `Achat Cours (${prixReel} F): ${documentTitle}`
        : 'Location Mensuelle Catalogue cauZon';
    const newTransId = generateFeexPayTransactionId();
    setPayAmount(amount);
    setPayDescription(desc);
    setTransId(newTransId);
    setShowOperateurSelector(true);
  };

  /** Étape 2 : opérateur choisi → ouvre le guichet FeexPay interactif (Web & Mobile) */
  const choisirOperateur = (operateur?: FeexPayOperateur) => {
    setOperateurSelectionne(operateur);
    setShowOperateurSelector(false);
    setShowFeexPay(true);
  };

  /** Traitement unifié du résultat de paiement (Web iframe & Mobile WebView) */
  const traiterResultatPaiement = async (data: any) => {
    console.log('📌 Résultat Paiement FeexPay reçu :', data);
    setShowFeexPay(false);

    const isSuccess =
      data.status === 'SUCCESS' ||
      data.status === 'success' ||
      data.status === 'approved';

    if (isSuccess) {
      setChargementEnCours(true);

      if (selectedOption === 'single') {
        // Achat à l'acte (100 FCFA)
        const result = await paidUnlock(documentId, payAmount);
        setChargementEnCours(false);

        if (result.success) {
          debloquerDocument(documentId);
          Alert.alert(
            'Achat Réussi 🎉',
            `Le document "${documentTitle}" a été débloqué définitivement sur cet appareil !`,
            [{ text: 'Super !', onPress: () => { onSuccess(); onClose(); } }]
          );
        } else {
          Alert.alert('Attention ⚠️', result.message);
        }
      } else {
        // Location Mensuelle (500 FCFA)
        const vipResult = await activerPassVIP(30);
        setChargementEnCours(false);

        sAbonnerVIPCinetPay(vipResult.dateAffichage);
        debloquerDocument(documentId);

        Alert.alert(
          'Formule Location Activée 👑',
          `Félicitations ! Votre formule de location est active jusqu'au ${vipResult.dateAffichage}. Accès illimité à tous les cours et import personnel débloqués.`,
          [{ text: 'Profiter', onPress: () => { onSuccess(); onClose(); } }]
        );
      }
    } else {
      Alert.alert(
        'Annulé ❌',
        data.message || 'La transaction FeexPay a été annulée ou a échoué.'
      );
    }
  };

  const handleWebViewMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      await traiterResultatPaiement(data);
    } catch (err) {
      console.error('Erreur traitement message WebView :', err);
      setChargementEnCours(false);
      setShowFeexPay(false);
    }
  };

  /** Offre de bienvenue (1er cours offert) */
  const executerOffreBienvenue = async () => {
    setChargementEnCours(true);
    const result = await welcomeUnlock(documentId, prixReel);
    setChargementEnCours(false);

    if (result.success) {
      consommerOffreBienvenueLocal();
      debloquerDocument(documentId);
      Alert.alert(
        'Offre de Bienvenue 🎁',
        result.message || 'Félicitations ! Votre 1er document offert a été débloqué avec succès.',
        [{ text: 'Super !', onPress: () => { onSuccess(); onClose(); } }]
      );
    } else {
      Alert.alert('Information', result.message);
    }
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {isVipUser ? 'Accès VIP au Document' : 'Débloquer le Document'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={couleurs.texte} />
            </TouchableOpacity>
          </View>

          {showFeexPay ? (
            /* Guichet FeexPay WebView (Mobile) ou Iframe Interactif (Web/PC) */
            <View style={styles.webviewWrapper}>
              {Platform.OS === 'web' ? (
                <iframe
                  srcDoc={generateFeexPayHtml(
                    {
                      amount: payAmount,
                      description: payDescription,
                      transId: transId,
                      customer: buildCustomer(),
                      operator: operateurSelectionne,
                    },
                    FEEXPAY_PUBLIC_KEY
                  )}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    backgroundColor: '#FFFFFF',
                  }}
                  title="Guichet FeexPay"
                />
              ) : (
                <WebView
                  originWhitelist={['*']}
                  source={{
                    html: generateFeexPayHtml(
                      {
                        amount: payAmount,
                        description: payDescription,
                        transId: transId,
                        customer: buildCustomer(),
                        operator: operateurSelectionne,
                      },
                      FEEXPAY_PUBLIC_KEY
                    ),
                  }}
                  onMessage={handleWebViewMessage}
                  style={styles.webview}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                />
              )}
            </View>
          ) : showOperateurSelector ? (
            /* Étape 2 & 3 : Saisie du numéro & Sélecteur d'opérateur FeexPay */
            <View style={styles.optionsWrapper}>
              <Text style={[styles.sectionLabel, { marginBottom: 4 }]}>Numéro de facturation Mobile Money :</Text>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: couleurs.estSombre ? 'rgba(255,255,255,0.06)' : '#F8FAFC',
                borderWidth: 1.5,
                borderColor: couleurs.bordure,
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: Platform.OS === 'ios' ? 12 : 6,
                marginBottom: 16,
                gap: 8,
              }}>
                <Ionicons name="phone-portrait-outline" size={18} color={couleurs.primaire} />
                <TextInput
                  style={{ flex: 1, fontSize: 14, fontWeight: '700', color: couleurs.texte, padding: 0 }}
                  value={telephonePaiement}
                  onChangeText={setTelephonePaiement}
                  placeholder="Ex: 0701020304"
                  placeholderTextColor={couleurs.texteSecondaire}
                  keyboardType="phone-pad"
                />
                {telephonePaiement.length > 0 && (
                  <TouchableOpacity onPress={() => setTelephonePaiement('')} style={{ padding: 2 }}>
                    <Ionicons name="close-circle" size={16} color={couleurs.texteSecondaire} />
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.sectionLabel}>Sélectionnez votre moyen de paiement :</Text>
              <View style={styles.operateursGrid}>
                {[
                  {
                    id: 'WAVE_CI' as FeexPayOperateur,
                    label: 'Wave CI',
                    emoji: '🌊',
                    couleur: '#1DC3EB',
                  },
                  {
                    id: 'MTN_CI' as FeexPayOperateur,
                    label: 'MTN CI',
                    emoji: '💛',
                    couleur: '#FFCC00',
                  },
                  {
                    id: 'ORANGE_CI' as FeexPayOperateur,
                    label: 'Orange CI',
                    emoji: '🟠',
                    couleur: '#FF6600',
                  },
                  {
                    id: 'MOOV_CI' as FeexPayOperateur,
                    label: 'Moov CI',
                    emoji: '🔵',
                    couleur: '#0057A8',
                  },
                ].map((op) => (
                  <TouchableOpacity
                    key={op.id}
                    style={[styles.operateurBtn, { borderColor: op.couleur }]}
                    onPress={() => choisirOperateur(op.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.operateurEmoji}>{op.emoji}</Text>
                    <Text style={[styles.operateurLabel, { color: op.couleur }]}>{op.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.tousOperateursBtn}
                onPress={() => choisirOperateur(undefined)}
              >
                <Text style={styles.tousOperateursText}>🌐 Guichet Web Universel & Carte Bancaire</Text>
              </TouchableOpacity>
            </View>
          ) : isVipUser ? (
            /* 👑 VUE VIP : BOUTON "ACQUÉRIR (VIP · 0 FCFA)" DYNAMIQUE */
            <View style={styles.optionsWrapper}>
              <View style={styles.docInfoBox}>
                <Ionicons name="document-text" size={24} color={couleurs.primaire} />
                <Text style={styles.docTitle} numberOfLines={2}>
                  {documentTitle}
                </Text>
              </View>

              <View style={styles.vipIncludedCard}>
                <View style={styles.vipCrownCircle}>
                  <Ionicons name="sparkles" size={24} color="#10B981" />
                </View>
                <Text style={styles.vipIncludedTitle}>Inclus dans votre Pass VIP</Text>
                <Text style={styles.vipIncludedSub}>
                  En tant que membre VIP cauZon, ce cours est accessible gratuitement et sera automatiquement ajouté à votre espace VIP.
                </Text>
                <View style={styles.vipPriceRow}>
                  <Text style={styles.vipPriceFree}>0 FCFA</Text>
                  <Text style={styles.vipPriceOld}>{prixReel} FCFA</Text>
                </View>
              </View>

              {chargementEnCours ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={couleurs.primaire} />
                  <Text style={styles.loadingText}>Attribution VIP en cours...</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.vipAcquireBtn}
                  onPress={executerAcquisitionVip}
                  activeOpacity={0.85}
                >
                  <Ionicons name="sparkles" size={20} color="#FAF6EB" style={{ marginRight: 8 }} />
                  <Text style={styles.vipAcquireText}>Acquérir (VIP · 0 FCFA)</Text>
                  <Ionicons name="arrow-forward" size={18} color="#FAF6EB" style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              )}
            </View>
          ) : (
            /* VUE STANDARD NON-VIP : Choix Single / VIP */
            <View style={styles.optionsWrapper}>
              {/* Infos Fichier */}
              <View style={styles.docInfoBox}>
                <Ionicons name="document-text" size={24} color={couleurs.primaire} />
                <Text style={styles.docTitle} numberOfLines={2}>
                  {documentTitle}
                </Text>
              </View>

              {/* Options Selection Cards */}
              <Text style={styles.sectionLabel}>Choisissez votre formule :</Text>

              {/* Option A: Single Purchase */}
              <TouchableOpacity
                style={[
                  styles.optionCard,
                  selectedOption === 'single' && styles.optionCardActive,
                ]}
                onPress={() => setSelectedOption('single')}
              >
                <View style={styles.optionHeader}>
                  <Text style={styles.optionTitle}>📚 Achat Unique</Text>
                  <Text style={styles.optionPrice}>{prixReel} FCFA</Text>
                </View>
                <Text style={styles.optionDesc}>
                  Accès à vie pour ce cours sur cet appareil, mode hors-ligne inclus.
                </Text>
              </TouchableOpacity>

              {/* Option B: Location Mensuelle */}
              <TouchableOpacity
                style={[
                  styles.optionCard,
                  selectedOption === 'vip' && styles.optionCardActive,
                  styles.optionCardVip,
                ]}
                onPress={() => setSelectedOption('vip')}
              >
                <View style={styles.optionHeader}>
                  <View style={styles.vipTag}>
                    <Text style={styles.vipTagText}>👑 CATALOGUE ENTIER</Text>
                  </View>
                  <Text style={[styles.optionPrice, { color: '#10B981' }]}>500 FCFA</Text>
                </View>
                <Text style={styles.optionTitleVip}>Formule Location (30 jours)</Text>
                <Text style={styles.optionDesc}>
                  Accès illimité à tout le catalogue + Import & Stockage de 75 documents personnels.
                </Text>
              </TouchableOpacity>

              {/* Action Buttons */}
              {chargementEnCours ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={couleurs.primaire} />
                  <Text style={styles.loadingText}>Veuillez patienter...</Text>
                </View>
              ) : (
                <View style={styles.actionsContainer}>
                  {offreBienvenueDisponible && (
                    <TouchableOpacity
                      style={styles.freeBtn}
                      onPress={executerOffreBienvenue}
                    >
                      <Ionicons name="gift" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.freeText}>Profiter du cours gratuit</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.payBtn}
                    onPress={demarrerPaiementFeexPay}
                  >
                    <Ionicons name="card" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.payText}>
                      Payer {selectedOption === 'single' ? prixReel : '500'} FCFA par FeexPay
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Secure mention */}
          <Text style={styles.secureText}>
            🔒 Transactions FeexPay sécurisées et cryptées en conformité PCI-DSS.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (couleurs: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: couleurs.estSombre ? 'rgba(0, 0, 0, 0.85)' : 'rgba(12, 30, 27, 0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    operateursGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      justifyContent: 'space-between',
      marginTop: 8,
    },
    operateurBtn: {
      width: '48%',
      paddingVertical: 14,
      paddingHorizontal: 10,
      borderRadius: 14,
      borderWidth: 2,
      backgroundColor: couleurs.estSombre ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    operateurEmoji: {
      fontSize: 26,
      marginBottom: 4,
    },
    operateurLabel: {
      fontSize: 13,
      fontWeight: '700',
    },
    tousOperateursBtn: {
      marginTop: 12,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: couleurs.estSombre ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
      alignItems: 'center',
    },
    tousOperateursText: {
      fontSize: 12,
      color: couleurs.texteSecondaire,
      fontWeight: '600',
    },
    modalContent: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: couleurs.fondModal || (couleurs.estSombre ? '#1A1A1A' : '#FFFFFF'),
      borderRadius: 24,
      padding: 22,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.25,
      shadowRadius: 20,
      elevation: 8,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: couleurs.texte,
    },
    closeBtn: {
      padding: 4,
    },
    optionsWrapper: {
      marginBottom: 14,
    },
    docInfoBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: couleurs.estSombre ? 'rgba(255, 255, 255, 0.05)' : '#F4EFE6',
      padding: 12,
      borderRadius: 12,
      marginBottom: 16,
    },
    docTitle: {
      flex: 1,
      marginLeft: 10,
      fontSize: 13,
      fontWeight: '600',
      color: couleurs.texte,
    },
    vipIncludedCard: {
      backgroundColor: couleurs.estSombre ? 'rgba(212, 175, 55, 0.1)' : '#FDF8E7',
      borderRadius: 18,
      padding: 18,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: 'rgba(212, 175, 55, 0.4)',
      marginBottom: 18,
    },
    vipCrownCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: 'rgba(16, 185, 129, 0.12)',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 10,
    },
    vipIncludedTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: '#10B981',
      marginBottom: 6,
    },
    vipIncludedSub: {
      fontSize: 12,
      color: couleurs.texteSecondaire,
      textAlign: 'center',
      lineHeight: 16,
      marginBottom: 12,
      paddingHorizontal: 8,
    },
    vipPriceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
    },
    vipPriceFree: {
      fontSize: 22,
      fontWeight: '900',
      color: '#2ECC71',
    },
    vipPriceOld: {
      fontSize: 14,
      fontWeight: '600',
      color: couleurs.texteSecondaire,
      textDecorationLine: 'line-through',
    },
    vipAcquireBtn: {
      backgroundColor: '#6B1124',
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 16,
      borderRadius: 14,
      shadowColor: '#6B1124',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 8,
      elevation: 4,
    },
    vipAcquireText: {
      fontSize: 15,
      fontWeight: '900',
      color: '#121212',
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: couleurs.texteSecondaire,
      marginBottom: 10,
    },
    optionCard: {
      borderWidth: 1.5,
      borderColor: couleurs.bordure,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      backgroundColor: 'transparent',
    },
    optionCardActive: {
      borderColor: couleurs.primaire,
      backgroundColor: couleurs.estSombre ? 'rgba(255, 255, 255, 0.03)' : '#FFFDF9',
    },
    optionCardVip: {
      borderColor: 'rgba(229, 193, 88, 0.4)',
    },
    optionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    optionTitle: {
      fontSize: 14,
      fontWeight: 'bold',
      color: couleurs.texte,
    },
    optionTitleVip: {
      fontSize: 14,
      fontWeight: 'bold',
      color: '#E5C158',
    },
    optionPrice: {
      fontSize: 14,
      fontWeight: 'bold',
      color: couleurs.primaire,
    },
    optionDesc: {
      fontSize: 11.5,
      color: couleurs.texteSecondaire,
      lineHeight: 15,
      marginTop: 2,
    },
    vipTag: {
      backgroundColor: '#E5C158',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    vipTagText: {
      fontSize: 9,
      fontWeight: 'bold',
      color: '#121212',
    },
    actionsContainer: {
      gap: 10,
      marginTop: 6,
    },
    freeBtn: {
      backgroundColor: '#27AE60',
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 14,
      borderRadius: 12,
    },
    freeText: {
      color: '#FFFFFF',
      fontSize: 13.5,
      fontWeight: 'bold',
    },
    payBtn: {
      backgroundColor: couleurs.primaire,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 14,
      borderRadius: 12,
    },
    payText: {
      color: '#FFFFFF',
      fontSize: 13.5,
      fontWeight: 'bold',
    },
    loadingContainer: {
      paddingVertical: 20,
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 8,
      fontSize: 12,
      color: couleurs.texteSecondaire,
    },
    secureText: {
      fontSize: 10.5,
      color: couleurs.texteSecondaire,
      textAlign: 'center',
      marginTop: 8,
    },
    webviewWrapper: {
      height: 480,
      width: '100%',
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: '#FFFFFF',
      marginBottom: 10,
    },
    webview: {
      flex: 1,
      backgroundColor: 'transparent',
    },
  });
