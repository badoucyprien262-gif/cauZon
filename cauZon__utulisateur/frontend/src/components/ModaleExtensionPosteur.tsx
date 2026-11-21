import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  Platform,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from './AppIcon';
import { useApp } from '../store/ContexteApp';
import {
  generateFeexPayHtml,
  generateFeexPayTransactionId,
  FEEXPAY_PUBLIC_KEY,
  CustomerFeexPay,
  formatPhoneFeexPay,
  FeexPayOperateur,
} from '../services/payment/feexpay';
import { verifierEligibiliteAchat } from '../services/servicePaiement';
import {
  EXTENSION_POSTEUR_MO,
  PRIX_EXTENSION_POSTEUR_FCFA,
} from '../services/serviceEspacePosteur';

interface Props {
  visible: boolean;
  quotaActuelMo: number;
  onClose: () => void;
  /** Appelé après paiement validé côté guichet ; le crédit réel est fait par le webhook serveur. */
  onPaiementTermine: () => void;
}

const OPERATEURS: { id: FeexPayOperateur; label: string; emoji: string; couleur: string }[] = [
  { id: 'WAVE_CI', label: 'Wave CI', emoji: '🌊', couleur: '#1DC3EB' },
  { id: 'MTN_CI', label: 'MTN CI', emoji: '💛', couleur: '#FFCC00' },
  { id: 'ORANGE_CI', label: 'Orange CI', emoji: '🟠', couleur: '#FF6600' },
  { id: 'MOOV_CI', label: 'Moov CI', emoji: '🔵', couleur: '#0057A8' },
];

/**
 * Extension d'espace posteur : +400 Mo pour 1 500 FCFA (typeAchat 'extension_posteur').
 * Le numéro Mobile Money est saisi ICI, uniquement pour ce paiement : jamais pré-rempli
 * depuis le profil, jamais persisté. Le quota est crédité par le webhook FeexPay (serveur).
 */
export default function ModaleExtensionPosteur({ visible, quotaActuelMo, onClose, onPaiementTermine }: Props) {
  const { couleurs, nomUtilisateur, emailUtilisateur, utilisateur, estConnecteGoogle, afficherToast } = useApp();
  const styles = getStyles(couleurs);

  const [etape, setEtape] = useState<'offre' | 'operateur' | 'guichet'>('offre');
  const [telephone, setTelephone] = useState('');
  const [operateur, setOperateur] = useState<FeexPayOperateur | undefined>(undefined);
  const [transId, setTransId] = useState('');

  useEffect(() => {
    if (!visible) {
      setEtape('offre');
      setTelephone(''); // aucune rétention du numéro
      setOperateur(undefined);
    }
  }, [visible]);

  const traiterResultat = (data: any) => {
    const ok = ['SUCCESS', 'success', 'approved'].includes(data?.status);
    setEtape('offre');
    if (ok) {
      afficherToast(
        `Paiement reçu. Votre espace passera à ${quotaActuelMo + EXTENSION_POSTEUR_MO} Mo dans quelques secondes.`,
        'Extension en cours 🚀',
        'succes'
      );
      onPaiementTermine();
      onClose();
    } else {
      afficherToast(data?.message || 'Paiement annulé ou échoué.', 'Annulé ❌', 'erreur');
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const handler = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data && ['SUCCESS', 'success', 'CANCELLED', 'FAILED'].includes(data.status)) traiterResultat(data);
      } catch (_) {}
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [visible, quotaActuelMo]);

  const garde = async () =>
    verifierEligibiliteAchat({
      utilisateur,
      estConnecteGoogle,
      afficherToast,
      onDeclencherAuth: () => {},
      motif: 'achat',
    });

  const buildCustomer = (): CustomerFeexPay => {
    const parts = (nomUtilisateur || 'Posteur cauZon').trim().split(' ');
    return {
      firstname: parts[0] || 'Posteur',
      lastname: parts.slice(1).join(' ') || 'cauZon',
      email: emailUtilisateur || `${(parts[0] || 'posteur').toLowerCase()}@cauzon.app`,
      phone: formatPhoneFeexPay(telephone),
      country: 'ci',
    };
  };

  const htmlGuichet = () =>
    generateFeexPayHtml(
      {
        amount: PRIX_EXTENSION_POSTEUR_FCFA,
        description: `Extension Espace Posteur +${EXTENSION_POSTEUR_MO} Mo`,
        transId,
        customer: buildCustomer(),
        operator: operateur,
        metadata: {
          userId: utilisateur?.id || null,
          typeAchat: 'extension_posteur',
          documentId: null,
          deviceId: null,
        },
      },
      FEEXPAY_PUBLIC_KEY
    );

  const lancer = async () => {
    if (!(await garde())) return;
    setTransId(generateFeexPayTransactionId());
    setEtape('operateur');
  };

  const choisir = async (op?: FeexPayOperateur) => {
    if (telephone.replace(/\D/g, '').length < 8) {
      afficherToast('Saisissez le numéro Mobile Money qui effectuera le paiement.', 'Numéro requis', 'erreur');
      return;
    }
    if (!(await garde())) return;
    setOperateur(op);
    setEtape('guichet');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {etape === 'guichet' ? 'Guichet FeexPay' : etape === 'operateur' ? 'Mode de paiement' : 'Étendre mon espace'}
            </Text>
            <TouchableOpacity onPress={etape === 'operateur' ? () => setEtape('offre') : onClose} style={styles.closeBtn}>
              <Ionicons name={etape === 'operateur' ? 'arrow-back' : 'close'} size={22} color={couleurs.texte} />
            </TouchableOpacity>
          </View>

          {etape === 'guichet' ? (
            <View style={styles.guichet}>
              {Platform.OS === 'web' ? (
                <iframe
                  srcDoc={htmlGuichet()}
                  style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#FFFFFF' }}
                  title="Guichet FeexPay"
                />
              ) : (
                <WebView
                  originWhitelist={['*']}
                  source={{ html: htmlGuichet() }}
                  onMessage={(e) => {
                    try {
                      traiterResultat(JSON.parse(e.nativeEvent.data));
                    } catch (_) {
                      setEtape('offre');
                    }
                  }}
                  javaScriptEnabled
                  domStorageEnabled
                />
              )}
            </View>
          ) : etape === 'operateur' ? (
            <View style={styles.body}>
              <Text style={styles.label}>Numéro Mobile Money (utilisé uniquement pour ce paiement)</Text>
              <View style={styles.inputRow}>
                <Ionicons name="phone-portrait-outline" size={18} color={couleurs.primaire} />
                <TextInput
                  style={styles.input}
                  value={telephone}
                  onChangeText={setTelephone}
                  placeholder="Ex: 0701020304"
                  placeholderTextColor={couleurs.texteSecondaire}
                  keyboardType="phone-pad"
                  autoComplete="off"
                />
              </View>
              <View style={styles.grid}>
                {OPERATEURS.map((op) => (
                  <TouchableOpacity
                    key={op.id}
                    style={[styles.opBtn, { borderColor: op.couleur }]}
                    onPress={() => choisir(op.id)}
                  >
                    <Text style={{ fontSize: 22 }}>{op.emoji}</Text>
                    <Text style={[styles.opLabel, { color: op.couleur }]}>{op.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.universelBtn} onPress={() => choisir(undefined)}>
                <Text style={styles.universelTxt}>🌐 Guichet Web Universel & Carte Bancaire</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.body}>
              <View style={styles.offre}>
                <Ionicons name="server" size={28} color="#10B981" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.offreTitre}>+{EXTENSION_POSTEUR_MO} Mo d'espace de publication</Text>
                  <Text style={styles.offreDesc}>
                    Votre quota passe de {quotaActuelMo} Mo à {quotaActuelMo + EXTENSION_POSTEUR_MO} Mo. Extension cumulable.
                  </Text>
                </View>
                <Text style={styles.prix}>{PRIX_EXTENSION_POSTEUR_FCFA.toLocaleString('fr-FR')} F</Text>
              </View>
              <TouchableOpacity style={styles.payBtn} onPress={lancer} activeOpacity={0.85}>
                <Ionicons name="card" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.payTxt}>Payer {PRIX_EXTENSION_POSTEUR_FCFA.toLocaleString('fr-FR')} FCFA par FeexPay</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.secure}>🔒 Paiement FeexPay sécurisé. Aucun numéro n'est conservé par cauZon.</Text>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (c: any) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 },
    container: { width: '100%', maxWidth: 440, maxHeight: '90%', minHeight: 320, backgroundColor: c.fondCarte, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: c.bordure },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    title: { fontSize: 17, fontWeight: '800', color: c.texte },
    closeBtn: { padding: 6 },
    body: { gap: 12 },
    guichet: { height: 460, borderRadius: 16, overflow: 'hidden' },
    label: { fontSize: 12, fontWeight: '700', color: c.texteSecondaire },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: c.bordure, borderRadius: 14, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 6 },
    input: { flex: 1, fontSize: 14, fontWeight: '700', color: c.texte, padding: 0 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
    opBtn: { width: '48%', borderWidth: 2, borderRadius: 14, paddingVertical: 12, alignItems: 'center', gap: 4 },
    opLabel: { fontSize: 13, fontWeight: '800' },
    universelBtn: { paddingVertical: 12, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: c.bordure },
    universelTxt: { fontSize: 13, fontWeight: '700', color: c.texte },
    offre: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,0.08)' },
    offreTitre: { fontSize: 14, fontWeight: '800', color: c.texte },
    offreDesc: { fontSize: 12, color: c.texteSecondaire, marginTop: 2 },
    prix: { fontSize: 16, fontWeight: '900', color: '#10B981' },
    payBtn: { flexDirection: 'row', backgroundColor: c.primaire, borderRadius: 16, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
    payTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
    secure: { marginTop: 14, fontSize: 11, textAlign: 'center', color: c.texteSecondaire },
  });
