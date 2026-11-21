import React, { useState, useEffect, useRef } from 'react';
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
import { Ionicons } from './AppIcon';
import { useApp } from '../store/ContexteApp';
import {
  SEUIL_RETRAIT_FCFA,
  demanderRetraitPosteur,
  genererCleIdempotenceRetrait,
} from '../services/serviceEspacePosteur';

interface Props {
  visible: boolean;
  soldeRetirable: number;
  onClose: () => void;
  onRetraitTermine: () => void;
}

const OPERATEURS = [
  { id: 'WAVE_CI', label: 'Wave CI', emoji: '🌊', couleur: '#1DC3EB' },
  { id: 'MTN_CI', label: 'MTN CI', emoji: '💛', couleur: '#FFCC00' },
  { id: 'ORANGE_CI', label: 'Orange CI', emoji: '🟠', couleur: '#FF6600' },
  { id: 'MOOV_CI', label: 'Moov CI', emoji: '🔵', couleur: '#0057A8' },
];

/**
 * Retrait Mobile Money ≥ 5 000 FCFA.
 * Le numéro n'existe que dans l'état local de ce composant : envoyé une seule fois à
 * l'Edge Function puis effacé (fermeture, succès ou échec). Jamais écrit en base ni en AsyncStorage.
 */
export default function ModaleRetraitPosteur({ visible, soldeRetirable, onClose, onRetraitTermine }: Props) {
  const { couleurs, afficherToast } = useApp();
  const styles = getStyles(couleurs);

  const [operateur, setOperateur] = useState<string>('WAVE_CI');
  const [telephone, setTelephone] = useState('');
  const [enCours, setEnCours] = useState(false);
  // Clé stable pendant toute la durée de la tentative => un double-clic ne débite jamais deux fois
  const cleRef = useRef<string>(genererCleIdempotenceRetrait());

  const montant = Math.floor(soldeRetirable); // retrait de la totalité du solde disponible

  useEffect(() => {
    if (visible) {
      cleRef.current = genererCleIdempotenceRetrait();
    } else {
      setTelephone('');
      setEnCours(false);
    }
  }, [visible]);

  const confirmer = async () => {
    if (enCours) return;
    if (montant < SEUIL_RETRAIT_FCFA) return;
    if (telephone.replace(/\D/g, '').length < 8) {
      afficherToast('Saisissez le numéro Mobile Money de réception.', 'Numéro requis', 'erreur');
      return;
    }
    setEnCours(true);
    const res = await demanderRetraitPosteur({
      montant,
      operateur,
      telephone,
      idempotencyKey: cleRef.current,
    });
    setTelephone(''); // oubli immédiat du numéro
    setEnCours(false);

    if (res.success) {
      afficherToast(`${montant.toLocaleString('fr-FR')} FCFA envoyés sur votre compte Mobile Money.`, 'Retrait effectué 💸', 'succes');
      onRetraitTermine();
      onClose();
    } else {
      afficherToast(res.message, 'Retrait impossible', 'erreur');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={enCours ? undefined : onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Retirer mes gains</Text>
            <TouchableOpacity onPress={onClose} disabled={enCours} style={{ padding: 6 }}>
              <Ionicons name="close" size={22} color={couleurs.texte} />
            </TouchableOpacity>
          </View>

          <View style={styles.montantBox}>
            <Text style={styles.montantLabel}>Montant à recevoir</Text>
            <Text style={styles.montant}>{montant.toLocaleString('fr-FR')} FCFA</Text>
          </View>

          <Text style={styles.label}>Opérateur de réception</Text>
          <View style={styles.grid}>
            {OPERATEURS.map((op) => (
              <TouchableOpacity
                key={op.id}
                style={[styles.opBtn, { borderColor: op.couleur }, operateur === op.id && { backgroundColor: op.couleur + '22' }]}
                onPress={() => setOperateur(op.id)}
                disabled={enCours}
              >
                <Text style={{ fontSize: 20 }}>{op.emoji}</Text>
                <Text style={[styles.opLabel, { color: op.couleur }]}>{op.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Numéro Mobile Money de réception</Text>
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
              editable={!enCours}
              secureTextEntry={false}
            />
          </View>
          <Text style={styles.note}>
            🔒 Ce numéro n'est utilisé que pour ce virement. cauZon ne l'enregistre jamais.
          </Text>

          {enCours ? (
            <View style={styles.loading}>
              <ActivityIndicator color={couleurs.primaire} />
              <Text style={styles.loadingTxt}>Virement en cours, ne fermez pas cette fenêtre…</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.btn} onPress={confirmer} activeOpacity={0.85}>
              <Ionicons name="cash-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.btnTxt}>Confirmer le retrait</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (c: any) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 },
    container: { width: '100%', maxWidth: 440, backgroundColor: c.fondCarte, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: c.bordure, gap: 10 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: 17, fontWeight: '800', color: c.texte },
    montantBox: { alignItems: 'center', paddingVertical: 14, borderRadius: 16, backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1.5, borderColor: '#10B981' },
    montantLabel: { fontSize: 12, fontWeight: '700', color: c.texteSecondaire },
    montant: { fontSize: 26, fontWeight: '900', color: '#10B981', marginTop: 2 },
    label: { fontSize: 12, fontWeight: '700', color: c.texteSecondaire, marginTop: 4 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
    opBtn: { width: '48%', borderWidth: 2, borderRadius: 14, paddingVertical: 10, alignItems: 'center', gap: 2 },
    opLabel: { fontSize: 12, fontWeight: '800' },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: c.bordure, borderRadius: 14, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 6 },
    input: { flex: 1, fontSize: 14, fontWeight: '700', color: c.texte, padding: 0 },
    note: { fontSize: 11, color: c.texteSecondaire },
    btn: { flexDirection: 'row', backgroundColor: c.primaire, borderRadius: 16, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    btnTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
    loading: { alignItems: 'center', gap: 8, paddingVertical: 12 },
    loadingTxt: { fontSize: 12, color: c.texteSecondaire, textAlign: 'center' },
  });
