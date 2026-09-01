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
  Alert,
  Dimensions,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useApp } from '../store/ContexteApp';
import { importerDocumentLocal } from '../services/serviceDocument';
import ToastNotification from './ToastNotification';

interface ModaleImportDocumentProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  categoriesExistantes: string[];
}

export default function ModaleImportDocument({
  visible,
  onClose,
  onSuccess,
  categoriesExistantes,
}: ModaleImportDocumentProps) {
  const { couleurs } = useApp();
  const styles = getStyles(couleurs);

  const [fichierSelectionne, setFichierSelectionne] = useState<{
    name: string;
    uri: string;
    size?: number;
  } | null>(null);

  const [modeDossier, setModeDossier] = useState<'existant' | 'nouveau'>('existant');
  const [dossierExistant, setDossierExistant] = useState<string>(
    categoriesExistantes.length > 0 ? categoriesExistantes[0] : 'Documents Personnels'
  );
  const [nouveauDossier, setNouveauDossier] = useState<string>('');
  const [titrePersonnalise, setTitrePersonnalise] = useState<string>('');
  const [enCours, setEnCours] = useState<boolean>(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    titre?: string;
    type?: 'success' | 'info' | 'error';
  }>({ visible: false, message: '' });

  const afficherToast = (message: string, titre?: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ visible: true, message, titre, type });
  };

  // Réinitialiser les états à l'ouverture
  React.useEffect(() => {
    if (visible) {
      setFichierSelectionne(null);
      setTitrePersonnalise('');
      setNouveauDossier('');
      setModeDossier('existant');
      if (categoriesExistantes.length > 0) {
        setDossierExistant(categoriesExistantes[0]);
      }
    }
  }, [visible, categoriesExistantes]);

  const handleSelectionnerFichier = async () => {
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
          afficherToast("Seuls les fichiers PDF (.pdf) sont acceptés sur cauZon.", "Format Non Supporté 📄", "error");
          return;
        }

        setFichierSelectionne({
          name: asset.name,
          uri: asset.uri,
          size: asset.size,
        });
        // Pré-remplir le titre avec le nom du fichier sans extension
        const titreSansExt = asset.name.replace(/\.[^/.]+$/, '');
        setTitrePersonnalise(titreSansExt);
        afficherToast(`Fichier "${asset.name}" sélectionné.`, "Fichier Prêt 📄", "success");
      }
    } catch (err: any) {
      console.error('Erreur sélection document :', err);
      afficherToast("Impossible de sélectionner le document.", "Erreur ⚠️", "error");
    }
  };


  const handleValiderImport = async () => {
    if (!fichierSelectionne) {
      afficherToast('Veuillez sélectionner un fichier PDF à importer.', 'Fichier Requis ⚠️', 'error');
      return;
    }

    const titreFinal = titrePersonnalise.trim() || fichierSelectionne.name;
    const dossierFinal = modeDossier === 'nouveau'
      ? (nouveauDossier.trim() || 'Nouveau Dossier')
      : dossierExistant;

    const tailleMo = fichierSelectionne.size ? parseFloat((fichierSelectionne.size / (1024 * 1024)).toFixed(2)) : 1.5;

    setEnCours(true);
    const res = await importerDocumentLocal({
      titre: titreFinal,
      categorie: dossierFinal,
      file_path: fichierSelectionne.uri,
      taille_mo: tailleMo,
    });
    setEnCours(false);

    if (res.success) {
      afficherToast(res.message || 'Votre document a été importé avec succès.', 'Import Réussi 📥', 'success');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 500);
    } else {
      afficherToast(res.message || "Échec de l'importation.", 'Erreur ❌', 'error');
    }
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent={true}
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
        <View style={styles.modalContainer}>
          {/* Entête fixe */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Ionicons name="cloud-upload" size={22} color={couleurs.primaire} />
              <Text style={styles.title}>Importer un Document</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={couleurs.texte} />
            </TouchableOpacity>
          </View>


          <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
            {/* Zone de sélection de fichier */}
            <TouchableOpacity
              style={[
                styles.fileDropZone,
                fichierSelectionne ? styles.fileDropZoneSelected : null,
              ]}
              onPress={handleSelectionnerFichier}
              activeOpacity={0.8}
            >
              <Ionicons
                name={fichierSelectionne ? 'document-text' : 'cloud-upload-outline'}
                size={36}
                color={fichierSelectionne ? '#10B981' : couleurs.primaire}
              />
              <Text style={styles.fileDropTitle}>
                {fichierSelectionne ? fichierSelectionne.name : 'Choisir un fichier PDF'}
              </Text>
              <Text style={styles.fileDropSubtitle}>
                {fichierSelectionne
                  ? `${fichierSelectionne.size ? (fichierSelectionne.size / (1024 * 1024)).toFixed(2) + ' Mo' : 'Prêt'} • Toucher pour changer`
                  : 'Appuyez pour parcourir votre téléphone ou PC'}
              </Text>
            </TouchableOpacity>

            {/* Titre du document */}
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
              </View>
            </View>

            {/* Choix du Dossier / Catégorie */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Dossier de Destination</Text>
              
              <View style={styles.modeDossierTabs}>
                <TouchableOpacity
                  style={[
                    styles.modeTab,
                    modeDossier === 'existant' && styles.modeTabActive,
                  ]}
                  onPress={() => setModeDossier('existant')}
                >
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
                  <Text
                    style={[
                      styles.modeTabText,
                      modeDossier === 'nouveau' && styles.modeTabTextActive,
                    ]}
                  >
                    + Nouveau Dossier
                  </Text>
                </TouchableOpacity>
              </View>

              {modeDossier === 'existant' ? (
                <View style={styles.categoriesList}>
                  {categoriesExistantes.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.catBadge,
                        dossierExistant === cat && styles.catBadgeActive,
                      ]}
                      onPress={() => setDossierExistant(cat)}
                    >
                      <Ionicons
                        name="folder"
                        size={14}
                        color={dossierExistant === cat ? '#FFFFFF' : couleurs.texteSecondaire}
                      />
                      <Text
                        style={[
                          styles.catBadgeText,
                          dossierExistant === cat && styles.catBadgeTextActive,
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={styles.inputContainer}>
                  <Ionicons name="folder-open-outline" size={18} color={couleurs.texteSecondaire} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={nouveauDossier}
                    onChangeText={setNouveauDossier}
                    placeholder="Ex: Mathématiques, MIAGE..."
                    placeholderTextColor={couleurs.texteSecondaire}
                  />
                </View>
              )}
            </View>

            {/* Note informative */}
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={16} color={couleurs.primaire} />
              <Text style={styles.infoText}>
                Les documents importés sont stockés dans votre espace <Text style={{ fontWeight: 'bold' }}>Permanent</Text> avec le badge distinctif "Importé".
              </Text>
            </View>
          </ScrollView>

          {/* Footer d'action */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.submitBtn,
                (!fichierSelectionne || enCours) && { opacity: 0.6 },
              ]}
              onPress={handleValiderImport}
              disabled={!fichierSelectionne || enCours}
              activeOpacity={0.8}
            >
              {enCours ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.submitBtnText}>Ajouter à ma bibliothèque</Text>
                </>
              )}
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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Platform.OS === 'web' ? 20 : 16,
    zIndex: 99999,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 480,
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
  scrollBody: {
    flex: 1,
    minHeight: 200,
  },
  scrollContent: {
    padding: 18,
    gap: 14,
    paddingBottom: 24,
  },

  fileDropZone: {
    borderWidth: 2,
    borderColor: couleurs.primaire,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: couleurs.estSombre ? 'rgba(255,255,255,0.03)' : 'rgba(107, 17, 36, 0.03)',
  },
  fileDropZoneSelected: {
    borderColor: '#10B981',
    borderStyle: 'solid',
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
  },
  fileDropTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: couleurs.texte,
    marginTop: 10,
    textAlign: 'center',
  },
  fileDropSubtitle: {
    fontSize: 12,
    color: couleurs.texteSecondaire,
    marginTop: 4,
    textAlign: 'center',
  },
  formGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: couleurs.texte,
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
    fontSize: 14,
    color: couleurs.texte,
  },
  modeDossierTabs: {
    flexDirection: 'row',
    backgroundColor: couleurs.fond,
    borderRadius: 10,
    padding: 3,
    marginBottom: 8,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
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
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    backgroundColor: couleurs.fond,
  },
  submitBtn: {
    flexDirection: 'row',
    backgroundColor: couleurs.primaire,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
