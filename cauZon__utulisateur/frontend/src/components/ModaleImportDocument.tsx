import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  ActivityIndicator,
  Dimensions,
} from 'react-native';

import { Ionicons } from './AppIcon';
import * as DocumentPicker from 'expo-document-picker';
import { useApp } from '../store/ContexteApp';
import { importerDocumentLocal, televerserDocumentCloud, copierFichierVersDossierPersistant, stockerDansCoffreFortLocal } from '../services/serviceDocument';
import type { DocumentCourse } from '../types';

export interface FichierImporte {
  name: string;
  uri: string;
  size?: number;
}

interface ModaleImportDocumentProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (nouveauDoc?: DocumentCourse) => void;
  categoriesExistantes: string[];
  initialFile?: FichierImporte | null;
}

export default function ModaleImportDocument({
  visible,
  onClose,
  onSuccess,
  categoriesExistantes,
  initialFile,
}: ModaleImportDocumentProps) {
  const { couleurs, afficherToast, aAccesVip, estVip, estAbonneVIP, debloquerDocument } = useApp();
  const styles = getStyles(couleurs);

  const isVipActive = aAccesVip ?? (estVip || estAbonneVIP);

  const [fichierSelectionne, setFichierSelectionne] = useState<FichierImporte | null>(null);

  // Catégories valides déduites
  const categoriesDisponibles = React.useMemo(() => {
    const list = (categoriesExistantes || []).filter(
      (c) => c && typeof c === 'string' && c.trim().length > 0 && c.toLowerCase() !== 'tout'
    );
    if (!list.includes('Documents Personnels')) {
      list.push('Documents Personnels');
    }
    return Array.from(new Set(list));
  }, [categoriesExistantes]);

  const [modeDossier, setModeDossier] = useState<'existant' | 'nouveau'>('existant');
  const [dossierExistant, setDossierExistant] = useState<string>('Documents Personnels');
  const [nouveauDossier, setNouveauDossier] = useState<string>('');
  const [titrePersonnalise, setTitrePersonnalise] = useState<string>('');
  const [enCours, setEnCours] = useState<boolean>(false);

  // Initialiser / Réinitialiser les états à chaque ouverture de la modale
  React.useEffect(() => {
    if (visible) {
      if (initialFile) {
        setFichierSelectionne(initialFile);
        const titreSansExt = initialFile.name.replace(/\.[^/.]+$/, '');
        setTitrePersonnalise(titreSansExt);
      } else {
        setFichierSelectionne(null);
        setTitrePersonnalise('');
      }
      setNouveauDossier('');
      setModeDossier('existant');
      setDossierExistant(categoriesDisponibles[0] || 'Documents Personnels');
      setEnCours(false);
    }
  }, [visible, initialFile, categoriesDisponibles]);

  // 1️⃣ Étape A : Sélection du fichier PDF via DocumentPicker
  const executerSelectionFichier = async () => {
    // 👑 Vérification stricte du statut VIP
    if (!isVipActive) {
      afficherToast(
        "L'importation de documents personnels (PDF) est réservée aux abonnés VIP. Passez VIP pour débloquer le stockage illimité !",
        "Pass VIP Requis 👑",
        "erreur"
      );
      onClose();
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const nomFichier = (asset.name || '').toLowerCase();

        // Validation stricte de l'extension PDF
        if (!nomFichier.endsWith('.pdf') && asset.mimeType !== 'application/pdf') {
          afficherToast("Seuls les fichiers PDF (.pdf) sont acceptés sur cauZon.", "Format Non Supporté 📄", "erreur");
          return;
        }

        // 🔒 Sandboxing & Coffre-fort immédiat (cauzon_vault/)
        const persistentUri = await stockerDansCoffreFortLocal(
          asset.uri,
          `import_${Date.now()}_${nomFichier.replace(/\.pdf$/, '')}`
        );

        // ✅ Étape A réussie — Mémoriser le fichier et basculer vers l'écran de rangement
        const titreSansExt = asset.name.replace(/\.[^/.]+$/, '');
        setFichierSelectionne({
          name: asset.name,
          uri: persistentUri,
          size: asset.size,
        });
        setTitrePersonnalise(titreSansExt);
        afficherToast(
          `📄 "${asset.name}" sélectionné. Choisissez votre dossier de destination.`,
          "Fichier Prêt ✅",
          "succes"
        );
      }
    } catch (err: any) {
      setEnCours(false);
      console.error('Erreur sélection document :', err);
      const msg = String(err?.message || '').toLowerCase();
      const isPermissionDenied =
        msg.includes('permission') ||
        msg.includes('denied') ||
        msg.includes('access') ||
        msg.includes('storage') ||
        msg.includes('authorized');

      if (isPermissionDenied) {
        afficherToast(
          "L'accès aux fichiers est requis. Veuillez l'activer dans les paramètres de votre appareil.",
          "Accès aux Fichiers Requis 📁",
          "erreur"
        );
      } else {
        afficherToast("Impossible de sélectionner le document.", "Erreur ⚠️", "erreur");
      }
    }
  };

  // 2️⃣ Étape B : Enregistrement Cloud final avec métadonnées complètes
  const handleValiderImport = async () => {
    if (!fichierSelectionne) {
      afficherToast('Veuillez sélectionner un fichier PDF à importer.', 'Fichier Requis ⚠️', 'erreur');
      return;
    }

    const titreFinal = titrePersonnalise.trim() || fichierSelectionne.name.replace(/\.[^/.]+$/, '');
    const dossierFinal = modeDossier === 'nouveau'
      ? (nouveauDossier.trim() || 'Nouveau Dossier')
      : (dossierExistant || 'Documents Personnels');

    setEnCours(true);
    try {
      // ☁️ Téléversement Cloud Supabase (Storage + Database)
      const res = await televerserDocumentCloud({
        fileUri: fichierSelectionne.uri,
        fileName: fichierSelectionne.name,
        fileSize: fichierSelectionne.size,
        customTitle: titreFinal,
        selectedFolder: dossierFinal,
      });

      setEnCours(false);

      if (res.success && res.document) {
        if (res.document?.id && debloquerDocument) {
          debloquerDocument(res.document.id);
        }
        afficherToast(
          `"${titreFinal}" a été sauvegardé dans le Cloud et rangé dans "${dossierFinal}".`,
          'Téléversement Réussi ☁️',
          'succes'
        );
        onSuccess(res.document);
        onClose();
      } else {
        afficherToast(res.message || "Échec du téléversement Cloud.", 'Erreur ❌', 'erreur');
      }
    } catch (e: any) {
      setEnCours(false);
      console.error('Erreur téléversement Cloud document :', e);
      afficherToast("Une erreur inattendue est survenue.", 'Erreur ❌', 'erreur');
    }
  };

  const dossierCibleAffiche = modeDossier === 'nouveau'
    ? (nouveauDossier.trim() || 'Nouveau Dossier')
    : (dossierExistant || 'Documents Personnels');

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
              <Ionicons
                name={fichierSelectionne ? 'folder-open' : 'cloud-upload'}
                size={22}
                color={couleurs.primaire}
              />
              <View>
                <Text style={styles.title}>
                  {fichierSelectionne ? 'Dossier de Destination' : 'Importer un Document'}
                </Text>
                <Text style={styles.stepBadge}>
                  {fichierSelectionne ? 'Étape 2 sur 2 : Organisation & Rangement' : 'Étape 1 sur 2 : Choix du PDF'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={couleurs.texte} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
            {/* ========================================================= */}
            {/* ÉCRAN 1 : SÉLECTION DU FICHIER SI AUCUN PDF CHOISI         */}
            {/* ========================================================= */}
            {!fichierSelectionne ? (
              <View style={styles.stepOneContainer}>
                <TouchableOpacity
                  style={styles.fileDropZone}
                  onPress={executerSelectionFichier}
                  activeOpacity={0.8}
                >
                  <View style={styles.dropIconWrapper}>
                    <Ionicons name="cloud-upload" size={42} color={couleurs.primaire} />
                  </View>
                  <Text style={styles.fileDropTitle}>Choisir un document PDF</Text>
                  <Text style={styles.fileDropSubtitle}>
                    Appuyez pour parcourir votre appareil (.pdf)
                  </Text>
                  <View style={styles.selectFileBtn}>
                    <Ionicons name="document-text" size={16} color="#FFFFFF" />
                    <Text style={styles.selectFileBtnText}>Sélectionner le fichier</Text>
                  </View>
                </TouchableOpacity>

                {/* Information VIP */}
                <View style={styles.vipPerkBox}>
                  <Ionicons name="ribbon" size={20} color="#D4AF37" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vipPerkTitle}>Avantage Pass VIP CauZon 👑</Text>
                    <Text style={styles.vipPerkText}>
                      Vos documents personnels importés sont conservés de manière permanente, classés dans vos dossiers et accessibles hors-ligne à tout moment.
                    </Text>
                  </View>
                </View>

                {/* Note de sécurité */}
                <View style={styles.infoBox}>
                  <Ionicons name="shield-checkmark" size={18} color={couleurs.primaire} />
                  <Text style={styles.infoText}>
                    CauZon accède uniquement au fichier PDF sélectionné pour votre bibliothèque locale sécurisée.
                  </Text>
                </View>
              </View>
            ) : (
              /* ========================================================= */
              /* ÉCRAN 2 : CONFIGURATION, TITRE & CLASSEMENT EN DOSSIER    */
              /* ========================================================= */
              <View style={styles.stepTwoContainer}>
                {/* Résumé du fichier sélectionné avec option de changement */}
                <View style={styles.selectedFileCard}>
                  <View style={styles.fileCardIconWrap}>
                    <Ionicons name="document-text" size={24} color="#10B981" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedFileName} numberOfLines={1}>
                      {fichierSelectionne.name}
                    </Text>
                    <Text style={styles.selectedFileSize}>
                      {fichierSelectionne.size
                        ? `${(fichierSelectionne.size / (1024 * 1024)).toFixed(2)} Mo • Fichier PDF prêt`
                        : 'Document PDF prêt'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.changeFileBtn}
                    onPress={executerSelectionFichier}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="refresh" size={14} color={couleurs.primaire} />
                    <Text style={styles.changeFileBtnText}>Changer</Text>
                  </TouchableOpacity>
                </View>

                {/* Champ 1 : Titre du document */}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Titre du Document</Text>
                  <View style={styles.inputContainer}>
                    <Ionicons name="book-outline" size={18} color={couleurs.texteSecondaire} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      value={titrePersonnalise}
                      onChangeText={setTitrePersonnalise}
                      placeholder="Ex: Cours d'Algèbre Linéaire"
                      placeholderTextColor={couleurs.texteSecondaire}
                    />
                    {titrePersonnalise.length > 0 && (
                      <TouchableOpacity onPress={() => setTitrePersonnalise('')}>
                        <Ionicons name="close-circle" size={16} color={couleurs.texteSecondaire} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Champ 2 : Dossier de rangement */}
                <View style={styles.formGroup}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.label}>Dossier de Rangement</Text>
                    <Text style={styles.labelSub}>Bibliothèque Permanente</Text>
                  </View>

                  {/* Onglets Dossier existant / Nouveau dossier */}
                  <View style={styles.modeDossierTabs}>
                    <TouchableOpacity
                      style={[
                        styles.modeTab,
                        modeDossier === 'existant' && styles.modeTabActive,
                      ]}
                      onPress={() => setModeDossier('existant')}
                    >
                      <Ionicons
                        name="folder"
                        size={14}
                        color={modeDossier === 'existant' ? '#FFFFFF' : couleurs.texteSecondaire}
                      />
                      <Text
                        style={[
                          styles.modeTabText,
                          modeDossier === 'existant' && styles.modeTabTextActive,
                        ]}
                      >
                        Dossier Existant
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.modeTab,
                        modeDossier === 'nouveau' && styles.modeTabActive,
                      ]}
                      onPress={() => setModeDossier('nouveau')}
                    >
                      <Ionicons
                        name="add-circle"
                        size={14}
                        color={modeDossier === 'nouveau' ? '#FFFFFF' : couleurs.texteSecondaire}
                      />
                      <Text
                        style={[
                          styles.modeTabText,
                          modeDossier === 'nouveau' && styles.modeTabTextActive,
                        ]}
                      >
                        Nouveau Dossier
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Choix dans liste existante */}
                  {modeDossier === 'existant' ? (
                    <View style={styles.categoriesList}>
                      {categoriesDisponibles.map((cat) => {
                        const isSelected = dossierExistant === cat;
                        return (
                          <TouchableOpacity
                            key={cat}
                            style={[
                              styles.catBadge,
                              isSelected && styles.catBadgeActive,
                            ]}
                            onPress={() => setDossierExistant(cat)}
                            activeOpacity={0.7}
                          >
                            <Ionicons
                              name={isSelected ? 'checkmark-circle' : 'folder'}
                              size={14}
                              color={isSelected ? '#FFFFFF' : couleurs.texteSecondaire}
                            />
                            <Text
                              style={[
                                styles.catBadgeText,
                                isSelected && styles.catBadgeTextActive,
                              ]}
                            >
                              {cat}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    /* Saisie nouveau dossier */
                    <View style={styles.inputContainer}>
                      <Ionicons name="folder-open-outline" size={18} color={couleurs.texteSecondaire} style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        value={nouveauDossier}
                        onChangeText={setNouveauDossier}
                        placeholder="Ex: Informatique, Anglais L2, Annales..."
                        placeholderTextColor={couleurs.texteSecondaire}
                        autoFocus={true}
                      />
                    </View>
                  )}
                </View>

                {/* Récapitulatif du rangement */}
                <View style={styles.infoBox}>
                  <Ionicons name="information-circle-outline" size={18} color={couleurs.primaire} />
                  <Text style={styles.infoText}>
                    Ce document sera rangé dans votre dossier permanent <Text style={{ fontWeight: 'bold', color: couleurs.texte }}>"{dossierCibleAffiche}"</Text> avec le badge distinctif "Document Importé".
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer d'action final */}
          <View style={styles.footer}>
            {fichierSelectionne && (
              <View style={styles.destinationSummary}>
                <Ionicons name="folder" size={14} color={couleurs.primaire} />
                <Text style={styles.destinationSummaryText} numberOfLines={1}>
                  Destination :{' '}
                  <Text style={{ fontWeight: 'bold', color: couleurs.primaire }}>
                    {dossierCibleAffiche}
                  </Text>
                </Text>
              </View>
            )}

            {fichierSelectionne ? (
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  enCours && { opacity: 0.6 },
                ]}
                onPress={handleValiderImport}
                disabled={enCours}
                activeOpacity={0.8}
              >
                {enCours ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload" size={18} color="#E5C158" style={{ marginRight: 8 }} />
                    <Text style={styles.submitBtnText}>Téléverser ce document</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={executerSelectionFichier}
                activeOpacity={0.8}
              >
                <Ionicons name="cloud-upload" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.submitBtnText}>Parcourir mes documents PDF</Text>
              </TouchableOpacity>
            )}
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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Platform.OS === 'web' ? 20 : 16,
    zIndex: 99999,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 500,
    height: Platform.OS === 'web' ? 'auto' : Math.min(screenHeight * 0.88, 640),
    maxHeight: Math.min(screenHeight * 0.92, 680),
    backgroundColor: couleurs.blanc,
    borderRadius: 22,
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
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
    backgroundColor: couleurs.fondCarte,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: couleurs.texte,
  },
  stepBadge: {
    fontSize: 11,
    color: couleurs.texteSecondaire,
    marginTop: 2,
    fontWeight: '500',
  },
  closeBtn: {
    padding: 4,
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    padding: 18,
    gap: 14,
    paddingBottom: 20,
  },
  stepOneContainer: {
    gap: 14,
  },
  stepTwoContainer: {
    gap: 14,
  },
  fileDropZone: {
    borderWidth: 2,
    borderColor: couleurs.primaire,
    borderStyle: 'dashed',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: couleurs.estSombre ? 'rgba(255,255,255,0.03)' : 'rgba(107, 17, 36, 0.03)',
  },
  dropIconWrapper: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: couleurs.estSombre ? 'rgba(255,255,255,0.08)' : 'rgba(107, 17, 36, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  fileDropTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: couleurs.texte,
    marginTop: 6,
    textAlign: 'center',
  },
  fileDropSubtitle: {
    fontSize: 12,
    color: couleurs.texteSecondaire,
    marginTop: 4,
    textAlign: 'center',
    marginBottom: 14,
  },
  selectFileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: couleurs.primaire,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  selectFileBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  vipPerkBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: couleurs.estSombre ? 'rgba(212, 175, 55, 0.1)' : '#FFFBEB',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
  },
  vipPerkTitle: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: couleurs.estSombre ? '#F59E0B' : '#B45309',
    marginBottom: 2,
  },
  vipPerkText: {
    fontSize: 11.5,
    color: couleurs.texte,
    lineHeight: 16,
  },
  selectedFileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  fileCardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedFileName: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: couleurs.texte,
  },
  selectedFileSize: {
    fontSize: 11.5,
    color: '#10B981',
    fontWeight: '600',
    marginTop: 2,
  },
  changeFileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: couleurs.fond,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  changeFileBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: couleurs.primaire,
  },
  formGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: couleurs.texte,
  },
  labelSub: {
    fontSize: 11,
    color: couleurs.texteSecondaire,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: couleurs.fond,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    paddingHorizontal: 12,
    height: 46,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 13.5,
    color: couleurs.texte,
  },
  modeDossierTabs: {
    flexDirection: 'row',
    backgroundColor: couleurs.fond,
    borderRadius: 10,
    padding: 3,
    marginBottom: 8,
    gap: 4,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  modeTabActive: {
    backgroundColor: couleurs.primaire,
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  modeTabTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  categoriesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: couleurs.fond,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  catBadgeActive: {
    backgroundColor: couleurs.primaire,
    borderColor: couleurs.primaire,
  },
  catBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  catBadgeTextActive: {
    color: '#FFFFFF',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: couleurs.estSombre ? 'rgba(255,255,255,0.04)' : '#F8FAFC',
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  infoText: {
    flex: 1,
    fontSize: 11.5,
    color: couleurs.texteSecondaire,
    lineHeight: 16,
  },
  footer: {
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    backgroundColor: couleurs.fond,
  },
  destinationSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  destinationSummaryText: {
    flex: 1,
    fontSize: 12,
    color: couleurs.texteSecondaire,
  },
  submitBtn: {
    flexDirection: 'row',
    backgroundColor: couleurs.primaire,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: 'bold',
    textAlign: 'center',
    flexShrink: 1,
  },
});
