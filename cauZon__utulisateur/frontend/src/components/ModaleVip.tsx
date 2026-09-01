import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { useApp } from '../store/ContexteApp';
import {
  generateFeexPayHtml,
  generateFeexPayTransactionId,
  FEEXPAY_PUBLIC_KEY,
  CustomerFeexPay,
  buildFeexPayCheckoutUrl,
  formatPhoneFeexPay,
  FeexPayOperateur,
} from '../services/payment/feexpay';
import { activerPassVIP } from '../services/serviceDocument';

interface VipModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ModaleVip({ visible, onClose, onSuccess }: VipModalProps) {
  const {
    couleurs,
    estAbonneVIP,
    dateExpirationAbonnement,
    sAbonnerVIPCinetPay,
    nomUtilisateur,
    telephoneFacturation,
  } = useApp();
  const styles = getStyles(couleurs);

  const [chargementEnCours, setChargementEnCours] = useState<boolean>(false);
  const [emailUtilisateur, setEmailUtilisateur] = useState<string>('');

  // FeexPay states
  const [showFeexPay, setShowFeexPay] = useState<boolean>(false);
  const [showOperateurSelector, setShowOperateurSelector] = useState<boolean>(false);
  const [operateurSelectionne, setOperateurSelectionne] = useState<FeexPayOperateur | undefined>(
    undefined
  );
  const [transId, setTransId] = useState<string>('');
  const [telephonePaiement, setTelephonePaiement] = useState<string>(telephoneFacturation || '');

  // Récupérer l'email Supabase au montage / ouverture
  useEffect(() => {
    if (!visible) return;
    setShowFeexPay(false);
    setShowOperateurSelector(false);
    setOperateurSelectionne(undefined);
    setTelephonePaiement(telephoneFacturation || '');
    (async () => {
      try {
        const { supabase } = await import('../lib/supabase');
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.email) setEmailUtilisateur(user.email);
      } catch (_) {}
    })();
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
  }, [visible]);

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

  /** Étape 1 : afficher le sélecteur d'opérateur */
  const demarrerPaiementVIP = () => {
    const newTransId = generateFeexPayTransactionId();
    setTransId(newTransId);
    setShowOperateurSelector(true);
  };

  /** Étape 2 : opérateur choisi → ouvre le guichet FeexPay interactif (Web & Mobile) */
  const choisirOperateur = (operateur?: FeexPayOperateur) => {
    setOperateurSelectionne(operateur);
    setShowOperateurSelector(false);
    setShowFeexPay(true);
  };

  /** Traitement unifié du résultat de paiement VIP */
  const traiterResultatPaiement = async (data: any) => {
    console.log('📌 Résultat VIP FeexPay reçu :', data);
    setShowFeexPay(false);

    const isSuccess =
      data.status === 'SUCCESS' ||
      data.status === 'success' ||
      data.status === 'approved';

    if (isSuccess) {
      setChargementEnCours(true);
      // Persister le VIP dans Supabase (profiles.has_vip_pass + vip_expiration_date)
      const vipResult = await activerPassVIP(30);
      setChargementEnCours(false);

      // Mettre à jour l'état global du contexte (affichage immédiat)
      sAbonnerVIPCinetPay(vipResult.dateAffichage);

      Alert.alert(
        'Formule Location Activée 👑',
        `Félicitations ! Votre formule de location est active jusqu'au ${vipResult.dateAffichage}. Accès illimité à tous les cours et import personnel débloqués.`,
        [{ text: 'Super !', onPress: () => { onSuccess(); onClose(); } }]
      );
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
      console.error('Erreur traitement message WebView VIP :', err);
      setChargementEnCours(false);
      setShowFeexPay(false);
    }
  };

  const avantages = [
    {
      icon: 'library-outline',
      title: 'Accès Intégral au Catalogue',
      description: 'Consultez et téléchargez l\'ensemble des annales, corrigés et cours universitaires.',
    },
    {
      icon: 'cloud-upload-outline',
      title: 'Import & Stockage Cloud Personnel',
      description: 'Importez et conservez jusqu\'à 75 documents PDF personnels dans votre espace sécurisé.',
    },
    {
      icon: 'cloud-offline-outline',
      title: 'Lecture Hors-Ligne Illimitée',
      description: 'Révisez tous vos documents débloqués à tout moment, sans connexion Internet.',
    },
  ];

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Bouton de fermeture */}
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {showFeexPay ? (
              /* Guichet FeexPay WebView Location (Mobile) ou Iframe Interactif (Web/PC) */
              <View style={styles.webviewContainer}>
                <Text style={styles.webviewHeader}>Guichet de Paiement FeexPay</Text>
                <View style={styles.webviewWrapper}>
                  {Platform.OS === 'web' ? (
                    <iframe
                      srcDoc={generateFeexPayHtml(
                        {
                          amount: 500,
                          description: 'Location Mensuelle Catalogue cauZon',
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
                      title="Guichet FeexPay Location"
                    />
                  ) : (
                    <WebView
                      originWhitelist={['*']}
                      source={{
                        html: generateFeexPayHtml(
                          {
                            amount: 500,
                            description: 'Location Mensuelle Catalogue cauZon',
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
              </View>
            ) : showOperateurSelector ? (
              /* Sélection rapide de l'opérateur Mobile Money */
              <View style={{ paddingVertical: 20 }}>
                <TouchableOpacity
                  onPress={() => setShowOperateurSelector(false)}
                  style={{ position: 'absolute', top: 0, left: 0, padding: 8, zIndex: 10 }}
                >
                  <Ionicons
                    name="arrow-back"
                    size={24}
                    color={couleurs.estSombre ? '#FFFFFF' : '#FAF6EB'}
                  />
                </TouchableOpacity>
                <Text
                  style={[
                    styles.vipTitle,
                    { fontSize: 18, marginTop: 32, marginBottom: 12, textAlign: 'center' },
                  ]}
                >
                  Location du Catalogue (500 FCFA)
                </Text>

                {/* Saisie / Confirmation Numéro Mobile */}
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: 'rgba(0,0,0,0.25)',
                  borderWidth: 1.5,
                  borderColor: 'rgba(255,255,255,0.2)',
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: Platform.OS === 'ios' ? 12 : 6,
                  marginBottom: 16,
                  gap: 8,
                }}>
                  <Ionicons name="phone-portrait-outline" size={18} color="#10B981" />
                  <TextInput
                    style={{ flex: 1, fontSize: 14, fontWeight: '700', color: '#FFFFFF', padding: 0 }}
                    value={telephonePaiement}
                    onChangeText={setTelephonePaiement}
                    placeholder="Ex: 0701020304"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    keyboardType="phone-pad"
                  />
                  {telephonePaiement.length > 0 && (
                    <TouchableOpacity onPress={() => setTelephonePaiement('')} style={{ padding: 2 }}>
                      <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.6)" />
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.85)', marginBottom: 10, textAlign: 'center' }}>
                  Sélectionnez votre moyen de paiement :
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 12,
                    justifyContent: 'center',
                  }}
                >
                  {[
                    {
                      id: 'WAVE_CI' as FeexPayOperateur,
                      label: 'Wave CI',
                      emoji: '🌊',
                      couleur: '#1B75BB',
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
                      style={{
                        width: '44%',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 20,
                        borderRadius: 18,
                        borderWidth: 2.5,
                        borderColor: op.couleur,
                        backgroundColor: couleurs.estSombre
                          ? 'rgba(255,255,255,0.06)'
                          : '#FFFFFF',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 3 },
                        shadowOpacity: 0.1,
                        shadowRadius: 8,
                        elevation: 4,
                      }}
                      onPress={() => choisirOperateur(op.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 36, marginBottom: 6 }}>{op.emoji}</Text>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: op.couleur }}>
                        {op.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={{
                    marginTop: 24,
                    paddingVertical: 14,
                    borderRadius: 12,
                    backgroundColor: 'rgba(255,255,255,0.12)',
                    alignItems: 'center',
                  }}
                  onPress={() => choisirOperateur(undefined)}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: '#FAF6EB',
                      fontWeight: '700',
                    }}
                  >
                    Payer via le guichet standard FeexPay (Web & CB)
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.vipHeader}>
                  <View style={styles.crownBadge}>
                    <Ionicons name="sparkles" size={30} color="#10B981" />
                  </View>
                  <Text style={styles.vipTitle}>Location du Catalogue</Text>
                  <Text style={styles.vipSubtitle}>
                    Accédez à l'intégralité des cours & débloquez l'import de documents personnels
                  </Text>
                </View>

                {/* Prix Card */}
                <View style={styles.priceCard}>
                  <View style={styles.priceHeader}>
                    <Text style={styles.priceLabel}>Formule Location Mensuelle</Text>
                    <View style={styles.promoBadge}>
                      <Text style={styles.promoText}>PRIX NET</Text>
                    </View>
                  </View>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceCurrency}>FCFA</Text>
                    <Text style={styles.priceAmount}>500</Text>
                    <Text style={styles.pricePeriod}>/ 30 jours</Text>
                  </View>
                  <Text style={styles.priceSubtext}>Frais d'opérateur inclus · Zéro surcoût</Text>
                </View>

                {/* Avantages */}
                <View style={styles.benefitsContainer}>
                  {avantages.map((item, index) => (
                    <View key={index} style={styles.benefitRow}>
                      <View style={styles.benefitIcon}>
                        <Ionicons name={item.icon as any} size={20} color="#10B981" />
                      </View>
                      <View style={styles.benefitText}>
                        <Text style={styles.benefitTitle}>{item.title}</Text>
                        <Text style={styles.benefitDescription}>{item.description}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                {/* CTA Button */}
                {estAbonneVIP ? (
                  <View style={styles.vipActiveBox}>
                    <Ionicons name="checkmark-circle" size={20} color="#10B981" style={{ marginRight: 6 }} />
                    <Text style={styles.vipActiveText}>Votre formule de location est active</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.subscribeBtn} onPress={demarrerPaiementVIP}>
                    <Text style={styles.subscribeText}>Louer le catalogue (500 FCFA / 30j)</Text>
                    <Ionicons
                      name="arrow-forward"
                      size={18}
                      color="#FFFFFF"
                    />
                  </TouchableOpacity>
                )}

                <Text style={styles.cancelMention}>
                  Paiement sécurisé par FeexPay (Wave, Orange, MTN, Moov). Zéro engagement.
                </Text>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (couleurs: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 40,
    },
    modalContainer: {
      width: '100%',
      maxWidth: 460,
      backgroundColor: couleurs.primaire,
      borderRadius: 24,
      padding: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.4,
      shadowRadius: 20,
      elevation: 12,
      position: 'relative',
    },
    closeBtn: {
      position: 'absolute',
      right: 20,
      top: 20,
      zIndex: 100,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(0, 0, 0, 0.25)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    scrollContent: {
      paddingBottom: 10,
    },
    vipHeader: {
      alignItems: 'center',
      marginBottom: 20,
      marginTop: 10,
    },
    crownBadge: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: 'rgba(16, 185, 129, 0.15)',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
      borderWidth: 1.5,
      borderColor: '#10B981',
    },
    crownEmoji: {
      fontSize: 32,
    },
    vipTitle: {
      fontSize: 22,
      fontWeight: 'bold',
      color: '#FFFFFF',
      letterSpacing: 0.5,
    },
    vipSubtitle: {
      fontSize: 13,
      color: 'rgba(255, 255, 255, 0.8)',
      textAlign: 'center',
      marginTop: 6,
      paddingHorizontal: 10,
    },
    priceCard: {
      backgroundColor: 'rgba(0, 0, 0, 0.25)',
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: 'rgba(16, 185, 129, 0.4)',
    },
    priceHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    priceLabel: {
      fontSize: 13,
      color: 'rgba(255, 255, 255, 0.8)',
      fontWeight: '600',
    },
    promoBadge: {
      backgroundColor: '#10B981',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    promoText: {
      fontSize: 10,
      fontWeight: 'bold',
      color: '#FFFFFF',
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginBottom: 4,
    },
    priceCurrency: {
      fontSize: 16,
      fontWeight: 'bold',
      color: '#10B981',
      marginRight: 4,
    },
    priceAmount: {
      fontSize: 36,
      fontWeight: '900',
      color: '#FFFFFF',
      letterSpacing: -1,
    },
    pricePeriod: {
      fontSize: 13,
      color: 'rgba(255, 255, 255, 0.7)',
      marginLeft: 4,
    },
    priceSubtext: {
      fontSize: 11,
      color: 'rgba(255, 255, 255, 0.6)',
    },
    benefitsContainer: {
      marginBottom: 24,
    },
    benefitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 14,
    },
    benefitIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(0, 0, 0, 0.2)',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    benefitText: {
      flex: 1,
    },
    benefitTitle: {
      fontSize: 14,
      fontWeight: 'bold',
      color: '#FFFFFF',
    },
    benefitDescription: {
      fontSize: 11.5,
      color: 'rgba(255, 255, 255, 0.75)',
      marginTop: 2,
    },
    subscribeBtn: {
      backgroundColor: '#10B981',
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 16,
      borderRadius: 14,
      shadowColor: '#10B981',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
      marginBottom: 12,
    },
    subscribeText: {
      color: '#FFFFFF',
      fontSize: 14.5,
      fontWeight: 'bold',
      marginRight: 6,
    },
    vipActiveBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(46, 204, 113, 0.2)',
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#2ECC71',
      marginBottom: 12,
    },
    vipActiveText: {
      color: '#2ECC71',
      fontSize: 13.5,
      fontWeight: 'bold',
    },
    cancelMention: {
      fontSize: 11,
      color: 'rgba(255, 255, 255, 0.6)',
      textAlign: 'center',
    },
    webviewContainer: {
      paddingVertical: 10,
    },
    webviewHeader: {
      fontSize: 16,
      fontWeight: 'bold',
      color: '#FFFFFF',
      textAlign: 'center',
      marginBottom: 12,
    },
    webviewWrapper: {
      height: 480,
      width: '100%',
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: '#FFFFFF',
    },
    webview: {
      flex: 1,
      backgroundColor: 'transparent',
    },
  });
