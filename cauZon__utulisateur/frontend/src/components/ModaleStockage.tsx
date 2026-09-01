import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
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

interface StorageModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ModaleStockage({ visible, onClose, onSuccess }: StorageModalProps) {
  const { couleurs, telephoneFacturation, acheterExtensionStockage, nomUtilisateur, limiteStockage } = useApp();
  const styles = getStyles(couleurs);

  const limiteActuelle = limiteStockage || 75;
  const nouvelleLimite = limiteActuelle + 75;

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

  // Récupérer l'email Supabase à l'ouverture de la modale
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
  }, [visible, nouvelleLimite]);

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
  const demarrerPaiementStockage = () => {
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

  /** Traitement unifié du résultat de paiement Stockage */
  const traiterResultatPaiement = async (data: any) => {
    console.log('📌 Résultat Stockage FeexPay reçu :', data);
    setShowFeexPay(false);

    const isSuccess =
      data.status === 'SUCCESS' ||
      data.status === 'success' ||
      data.status === 'approved';

    if (isSuccess) {
      setChargementEnCours(true);
      // Persistance cumulative dans Supabase (+75 docs)
      await acheterExtensionStockage();
      setChargementEnCours(false);
      Alert.alert(
        'Espace Stockage Étendu 📁',
        `Votre extension de stockage est active ! Votre limite passe désormais à ${nouvelleLimite} documents hors-ligne.`,
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
      console.error('Erreur traitement message WebView Stockage :', err);
      setChargementEnCours(false);
      setShowFeexPay(false);
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
        <View style={styles.modalContainer}>
          {/* Entête */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Ionicons name="cloud-upload" size={22} color={couleurs.primaire} />
              <Text style={styles.title}>
                {showFeexPay
                  ? 'Guichet FeexPay'
                  : showOperateurSelector
                  ? 'Choisir mon opérateur'
                  : 'Extension de Stockage'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={showOperateurSelector ? () => setShowOperateurSelector(false) : onClose}
              style={styles.closeBtn}
            >
              <Ionicons
                name={showOperateurSelector ? 'arrow-back' : 'close'}
                size={24}
                color={couleurs.texte}
              />
            </TouchableOpacity>
          </View>

          {showFeexPay ? (
            /* Guichet FeexPay WebView (Mobile) ou Iframe Interactif (Web/PC) */
            <View style={styles.webviewWrapper}>
              {Platform.OS === 'web' ? (
                <iframe
                  srcDoc={generateFeexPayHtml(
                    {
                      amount: 1000,
                      description: 'Extension Stockage +75 Docs Personnels',
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
                  title="Guichet FeexPay Stockage"
                />
              ) : (
                <WebView
                  originWhitelist={['*']}
                  source={{
                    html: generateFeexPayHtml(
                      {
                        amount: 1000,
                        description: 'Extension Stockage +75 Docs Personnels',
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
            /* Sélection rapide de l'opérateur Mobile Money & Saisie du numéro */
            <View style={styles.contentWrapper}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: couleurs.texte,
                  marginBottom: 6,
                }}
              >
                Numéro de facturation Mobile Money :
              </Text>

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

              <Text
                style={{
                  fontSize: 12,
                  color: couleurs.texteSecondaire,
                  fontWeight: '600',
                  marginBottom: 12,
                }}
              >
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
                      borderRadius: 16,
                      borderWidth: 2.5,
                      borderColor: op.couleur,
                      backgroundColor: couleurs.estSombre
                        ? 'rgba(255,255,255,0.05)'
                        : '#FFFFFF',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.08,
                      shadowRadius: 6,
                      elevation: 3,
                    }}
                    onPress={() => choisirOperateur(op.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 34, marginBottom: 6 }}>{op.emoji}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: op.couleur }}>
                      {op.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={{
                  marginTop: 20,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: couleurs.estSombre
                    ? 'rgba(255,255,255,0.06)'
                    : '#F1F5F9',
                  alignItems: 'center',
                }}
                onPress={() => choisirOperateur(undefined)}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: couleurs.texteSecondaire,
                    fontWeight: '700',
                  }}
                >
                  🌐 Guichet Web Universel & Carte Bancaire
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Infos Offre & Trigger */
            <View style={styles.contentWrapper}>
              {/* Infos Offre */}
              <View style={styles.offerBox}>
                <View style={styles.offerDetails}>
                  <Text style={styles.offerTitle}>Pack Stockage Cloud (+75 Docs)</Text>
                  <Text style={styles.offerDesc}>
                    Passez de votre quota actuel ({limiteActuelle} docs) à {nouvelleLimite} documents personnels cloud.
                  </Text>
                </View>
                <View style={styles.priceContainer}>
                  <Text style={styles.priceValue}>1000 FCFA</Text>
                  <Text style={styles.pricePeriod}>+75 docs</Text>
                </View>
              </View>

              {/* Numéro de Facturation */}
              <View style={styles.phoneBox}>
                <Ionicons
                  name="phone-portrait-outline"
                  size={16}
                  color={couleurs.texteSecondaire}
                />
                <Text style={styles.phoneText}>
                  Numéro de facturation : {telephoneFacturation}
                </Text>
              </View>

              {chargementEnCours ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={couleurs.primaire} />
                  <Text style={styles.loadingText}>Traitement en cours...</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.payBtn}
                  onPress={demarrerPaiementStockage}
                >
                  <Ionicons
                    name="card"
                    size={18}
                    color="#FFFFFF"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.payText}>Payer 1000 FCFA par FeexPay</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Mention de Sécurité */}
          <Text style={styles.secureText}>
            🔒 Transaction sécurisée et chiffrée par la passerelle FeexPay.
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
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 16,
    },
    modalContainer: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: couleurs.fondCarte,
      borderRadius: 24,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: couleurs.bordure,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.25,
      shadowRadius: 20,
      elevation: 10,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: couleurs.bordure,
      backgroundColor: couleurs.estSombre
        ? 'rgba(255, 255, 255, 0.03)'
        : 'rgba(127, 1, 31, 0.02)',
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    title: {
      fontSize: 16,
      fontWeight: '800',
      color: couleurs.texte,
    },
    closeBtn: {
      padding: 4,
      borderRadius: 20,
    },
    contentWrapper: {
      padding: 20,
    },
    offerBox: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: couleurs.estSombre
        ? 'rgba(255, 255, 255, 0.05)'
        : 'rgba(127, 1, 31, 0.04)',
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: couleurs.bordure,
      marginBottom: 16,
    },
    offerDetails: {
      flex: 1,
      marginRight: 12,
    },
    offerTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: couleurs.texte,
      marginBottom: 4,
    },
    offerDesc: {
      fontSize: 12,
      color: couleurs.texteSecondaire,
      lineHeight: 16,
    },
    priceContainer: {
      alignItems: 'flex-end',
    },
    priceValue: {
      fontSize: 17,
      fontWeight: '900',
      color: couleurs.primaire,
    },
    pricePeriod: {
      fontSize: 10.5,
      fontWeight: '700',
      color: couleurs.texteSecondaire,
      marginTop: 2,
    },
    phoneBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: couleurs.estSombre
        ? 'rgba(255, 255, 255, 0.03)'
        : '#F8FAFC',
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: couleurs.bordure,
      marginBottom: 20,
    },
    phoneText: {
      fontSize: 12,
      color: couleurs.texteSecondaire,
      fontWeight: '600',
    },
    payBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: couleurs.primaire,
      paddingVertical: 14,
      borderRadius: 14,
      shadowColor: couleurs.primaire,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    payText: {
      color: '#FFFFFF',
      fontSize: 14.5,
      fontWeight: '800',
    },
    loadingContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      gap: 8,
    },
    loadingText: {
      fontSize: 13,
      color: couleurs.texteSecondaire,
      fontWeight: '600',
    },
    secureText: {
      textAlign: 'center',
      fontSize: 11,
      color: couleurs.texteSecondaire,
      paddingBottom: 16,
      paddingHorizontal: 20,
    },
    webviewWrapper: {
      height: 480,
      width: '100%',
    },
    webview: {
      flex: 1,
      backgroundColor: 'transparent',
    },
  });
