import React, { useState, useEffect } from 'react';
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
  Image,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from './AppIcon';
import { useApp } from '../store/ContexteApp';
import {
  publierDocumentPosteur,
  ParametresPublicationPosteur,
} from '../services/servicePublicationPosteur';
import {
  TAILLE_MAX_PDF_MO,
  GAIN_PAR_ACQUISITION_FCFA,
  SEUIL_RETRAIT_FCFA,
} from '../services/serviceEspacePosteur';

interface ModalePublicationPosteurProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  quotaActuelMo: number;
  espaceUtiliseMo: number;
  authorPseudo: string;
  authorAvatarUrl?: string | null;
  onDemanderExtension: () => void;
}

const CATEGORIES_SUGGESTEES = [
  'Droit',
  'Médecine & Santé',
  'Économie & Gestion',
  'Informatique & Tech',
  'Mathématiques',
  'Sciences Physiques',
  'Lettres & Langues',
  'Sciences Humaines',
  'Concours & Examens',
  'Général',
];

export default function ModalePublicationPosteur({
  visible,
  onClose,
  onSuccess,
  quotaActuelMo,
  espaceUtiliseMo,
  authorPseudo,
  authorAvatarUrl,
  onDemanderExtension,
}: ModalePublicationPosteurProps) {
  const { couleurs, utilisateur, photoProfil, nomUtilisateur, afficherToast } = useApp();
  const styles = getStyles(couleurs);

  // ── États du formulaire ──────────────────────────────────────────────
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileSizeBytes, setFileSizeBytes] = useState<number>(0);

  const [titre, setTitre] = useState('');
  const [categorie, setCategorie] = useState('Droit');
  const [categoriePersonnalisee, setCategoriePersonnalisee] = useState('');
  const [tags, setTags] = useState('');
  const [description, setDescription] = useState('');

  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [pagesGratuites, setPagesGratuites] = useState<number>(2);
  const [totalDetectedPages, setTotalDetectedPages] = useState<number>(0);

  // ── États d'upload & progression ────────────────────────────────────
  const [enCours, setEnCours] = useState(false);
  const [progression, setProgression] = useState(0);
  const [libelleProgression, setLibelleProgression] = useState('');

  // Réinitialisation à l'ouverture
  useEffect(() => {
    if (visible) {
      setFileUri(null);
      setFileName('');
      setFileSizeBytes(0);
      setTitre('');
      setCategorie('Droit');
      setCategoriePersonnalisee('');
      setTags('');
      setDescription('');
      setCoverUri(null);
      setPagesGratuites(2);
      setTotalDetectedPages(0);
      setEnCours(false);
      setProgression(0);
      setLibelleProgression('');
    }
  }, [visible]);

  const tailleFichierMo = fileSizeBytes > 0 ? fileSizeBytes / (1024 * 1024) : 0;
  const espaceRestantMo = Math.max(0, quotaActuelMo - espaceUtiliseMo);
  const tailleTropGrande = tailleFichierMo > TAILLE_MAX_PDF_MO;
  const quotaDepasse = tailleFichierMo > espaceRestantMo;

  /**
   * Sélecteur de fichier PDF via expo-document-picker
   */
  const choisirFichierPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        setFileUri(file.uri);
        setFileName(file.name);
        setFileSizeBytes(file.size || 0);

        // Pré-remplir le titre si vide
        if (!titre.trim()) {
          const titreNettoye = file.name
            .replace(/\.pdf$/i, '')
            .replace(/[_-]+/g, ' ')
            .trim();
          setTitre(titreNettoye);
        }
      }
    } catch (err: any) {
      afficherToast('Impossible de sélectionner le document PDF.', 'Erreur', 'erreur');
    }
  };

  /**
   * Sélecteur optionnel d'image de couverture
   */
  const choisirCouverture = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status === 'denied') {
          afficherToast('Activez l\'accès aux photos dans vos réglages.', 'Galerie', 'erreur');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setCoverUri(result.assets[0].uri);
      }
    } catch (_) {
      afficherToast('Impossible de sélectionner l\'image.', 'Erreur', 'erreur');
    }
  };

  /**
   * Soumission et publication du cours
   */
  const handlePublier = async () => {
    if (!utilisateur?.id) {
      afficherToast('Vous devez être connecté pour publier.', 'Erreur', 'erreur');
      return;
    }
    if (!fileUri) {
      afficherToast('Veuillez sélectionner un fichier PDF.', 'Fichier requis', 'erreur');
      return;
    }
    if (tailleTropGrande) {
      afficherToast(`Le fichier dépasse 100 Mo (${tailleFichierMo.toFixed(1)} Mo).`, 'Fichier trop lourd', 'erreur');
      return;
    }
    if (quotaDepasse) {
      afficherToast('Votre quota posteur est insuffisant pour ce fichier.', 'Quota insuffisant', 'erreur');
      return;
    }
    if (!titre.trim() || titre.trim().length < 3) {
      afficherToast('Veuillez renseigner un titre explicite (au moins 3 caractères).', 'Titre requis', 'erreur');
      return;
    }
    if (!description.trim() || description.trim().length < 20) {
      afficherToast('Veuillez rédiger une description plus complète (au moins 20 caractères).', 'Description détaillée', 'erreur');
      return;
    }

    const categorieFinale = categorie === 'Autre' && categoriePersonnalisee.trim()
      ? categoriePersonnalisee.trim()
      : categorie;

    setEnCours(true);
    setProgression(10);
    setLibelleProgression('Initialisation de la publication…');

    const params: ParametresPublicationPosteur = {
      userId: utilisateur.id,
      authorPseudo: authorPseudo || nomUtilisateur,
      authorAvatarUrl: authorAvatarUrl || photoProfil || null,
      fileUri,
      fileName: fileName || 'cours.pdf',
      fileSizeBytes,
      titre: titre.trim(),
      categorie: categorieFinale,
      tags: tags.trim(),
      description: description.trim(),
      coverImageUri: coverUri,
      pagesGratuites: pagesGratuites,
      quotaActuelMo,
      espaceUtiliseMo,
      onProgress: (p, label) => {
        setProgression(p);
        setLibelleProgression(label);
      },
    };

    const res = await publierDocumentPosteur(params);
    setEnCours(false);

    if (res.success) {
      afficherToast(res.message, 'Publication Réussie 🎓', 'succes');
      onSuccess();
      onClose();
    } else {
      afficherToast(res.message, 'Échec de publication', 'erreur');
    }
  };

  const avatarCreateur = authorAvatarUrl || photoProfil;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalConteneur}>
          {/* En-tête de la modale */}
          <View style={styles.entete}>
            <View>
              <Text style={styles.titreModal}>Publier un cours</Text>
              <Text style={styles.sousTitreModal}>
                Rémunération créateur : +{GAIN_PAR_ACQUISITION_FCFA} FCFA par acquisition
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.boutonFermer} disabled={enCours}>
              <Ionicons name="close" size={24} color={couleurs.texte} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* 1. SÉLECTION DU FICHIER PDF */}
            <Text style={styles.labelSection}>1. Fichier PDF du cours (100 Mo max) *</Text>
            {fileUri ? (
              <View style={[styles.carteFichier, tailleTropGrande && styles.carteFichierErreur]}>
                <View style={styles.iconeFichierWrap}>
                  <Ionicons name="document-text" size={30} color={couleurs.primaire} />
                </View>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.nomFichierTxt} numberOfLines={1}>
                    {fileName}
                  </Text>
                  <Text style={styles.metaFichierTxt}>
                    {tailleFichierMo.toFixed(1)} Mo · {tailleTropGrande ? 'Dépasse 100 Mo ❌' : 'Valide ✓'}
                  </Text>
                </View>
                <TouchableOpacity onPress={choisirFichierPdf} style={styles.boutonChangerFichier} disabled={enCours}>
                  <Text style={styles.boutonChangerFichierTxt}>Modifier</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={choisirFichierPdf} style={styles.zoneDrop} activeOpacity={0.8} disabled={enCours}>
                <Ionicons name="cloud-upload-outline" size={40} color={couleurs.primaire} />
                <Text style={styles.zoneDropTitre}>Sélectionner un fichier PDF</Text>
                <Text style={styles.zoneDropTexte}>PDF uniquement · Jusqu'à 100 Mo par document</Text>
              </TouchableOpacity>
            )}

            {/* Alerte si le quota est dépassé */}
            {quotaDepasse && (
              <View style={styles.alerteQuota}>
                <Ionicons name="alert-circle" size={20} color="#EF4444" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.alerteQuotaTitre}>Espace posteur insuffisant</Text>
                  <Text style={styles.alerteQuotaTexte}>
                    Ce fichier ({tailleFichierMo.toFixed(1)} Mo) dépasse vos {espaceRestantMo.toFixed(1)} Mo restants.
                  </Text>
                  <TouchableOpacity
                    style={styles.boutonExtensionDirect}
                    onPress={() => {
                      onClose();
                      setTimeout(onDemanderExtension, 300);
                    }}
                  >
                    <Text style={styles.boutonExtensionDirectTxt}>+400 Mo pour 1 500 FCFA</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* 2. TITRE DU DOCUMENT */}
            <Text style={styles.labelSection}>2. Titre complet du cours *</Text>
            <TextInput
              style={styles.input}
              value={titre}
              onChangeText={setTitre}
              placeholder="Ex: Droit des Obligations — Cours & Cas pratiques L2"
              placeholderTextColor={couleurs.texteSecondaire}
              maxLength={120}
              editable={!enCours}
            />

            {/* 3. DOMAINE / CATÉGORIE / MATIÈRE */}
            <Text style={styles.labelSection}>3. Domaine / Catégorie universitaire *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsContainer}>
              {CATEGORIES_SUGGESTEES.map((cat) => {
                const estSelectionne = categorie === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.pill, estSelectionne && styles.pillActive]}
                    onPress={() => setCategorie(cat)}
                    activeOpacity={0.7}
                    disabled={enCours}
                  >
                    <Text style={[styles.pillTxt, estSelectionne && styles.pillActiveTxt]}>{cat}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[styles.pill, categorie === 'Autre' && styles.pillActive]}
                onPress={() => setCategorie('Autre')}
                activeOpacity={0.7}
                disabled={enCours}
              >
                <Text style={[styles.pillTxt, categorie === 'Autre' && styles.pillActiveTxt]}>Autre / Spécifique</Text>
              </TouchableOpacity>
            </ScrollView>

            {categorie === 'Autre' && (
              <TextInput
                style={[styles.input, { marginTop: 8 }]}
                value={categoriePersonnalisee}
                onChangeText={setCategoriePersonnalisee}
                placeholder="Précisez votre domaine (ex: Génie Civil, Agronomie...)"
                placeholderTextColor={couleurs.texteSecondaire}
                maxLength={50}
                editable={!enCours}
              />
            )}

            {/* 4. HASHTAGS */}
            <Text style={styles.labelSection}>4. Hashtags & mots-clés</Text>
            <TextInput
              style={styles.input}
              value={tags}
              onChangeText={setTags}
              placeholder="#droit #licence2 #semestre1 #cours #td"
              placeholderTextColor={couleurs.texteSecondaire}
              maxLength={100}
              editable={!enCours}
            />

            {/* 5. DESCRIPTION DÉTAILLÉE (5 À 10 LIGNES) */}
            <Text style={styles.labelSection}>5. Description du document (5 à 10 lignes) *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Décrivez précisément le contenu de ce document, les chapitres abordés, l'université ou l'école, le professeur référent et les notions clés pour aider les étudiants à réviser..."
              placeholderTextColor={couleurs.texteSecondaire}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              maxLength={1000}
              editable={!enCours}
            />
            <Text style={styles.compteurTxt}>{description.length} / 1000 caractères</Text>

            {/* 5. PAGES GRATUITES EN APERÇU (DÉCISION DU POSTEUR) */}
            <Text style={styles.labelSection}>5. Pages gratuites en aperçu</Text>
            <Text style={styles.aideSection}>
              Choisissez le nombre de pages accessibles gratuitement pour donner envie aux étudiants avant de bloquer la lecture (achat à 200 FCFA ou abonnement).
            </Text>
            <View style={styles.cartePagesGratuites}>
              <View style={styles.stepperLigne}>
                <TouchableOpacity
                  style={[styles.stepperBouton, pagesGratuites <= 1 && styles.stepperBoutonDesactive]}
                  onPress={() => setPagesGratuites((p) => Math.max(1, p - 1))}
                  disabled={pagesGratuites <= 1 || enCours}
                  activeOpacity={0.8}
                >
                  <Ionicons name="remove" size={20} color={pagesGratuites <= 1 ? couleurs.texteSecondaire : couleurs.texte} />
                </TouchableOpacity>

                <View style={styles.stepperValeurWrap}>
                  <Text style={styles.stepperValeurTxt}>
                    {pagesGratuites} {pagesGratuites > 1 ? 'pages' : 'page'}
                  </Text>
                  <Text style={styles.stepperSousTxt}>
                    {pagesGratuites === 1 ? '1ère page en aperçu libre' : `${pagesGratuites} premières pages gratuites`}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.stepperBouton, pagesGratuites >= 50 && styles.stepperBoutonDesactive]}
                  onPress={() => setPagesGratuites((p) => Math.min(50, p + 1))}
                  disabled={pagesGratuites >= 50 || enCours}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add" size={20} color={pagesGratuites >= 50 ? couleurs.texteSecondaire : couleurs.texte} />
                </TouchableOpacity>
              </View>
            </View>

            {/* 6. IDENTITÉ DU POSTEUR SUR LA CARTE & COUVERTURE */}
            <Text style={styles.labelSection}>6. Identité créateur & Visuel de la carte</Text>
            <View style={styles.carteApercuIdentite}>
              <View style={styles.badgePosteurApercu}>
                {avatarCreateur ? (
                  <Image source={{ uri: avatarCreateur }} style={styles.avatarMini} resizeMode="cover" />
                ) : (
                  <View style={[styles.avatarMini, styles.avatarVide]}>
                    <Text style={styles.initialeTxt}>{(authorPseudo || 'P').charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.pseudoApercuTxt}>{authorPseudo || nomUtilisateur}</Text>
              </View>
              <Text style={styles.explicationAuteurTxt}>
                Votre photo de créateur apparaîtra sur la carte dans le catalogue d'accueil, différenciant vos cours des documents officiels cauZon.
              </Text>
            </View>

            {/* Option image de couverture personnalisée */}
            <View style={{ marginTop: 10 }}>
              {coverUri ? (
                <View style={styles.coverPreviewContainer}>
                  <Image source={{ uri: coverUri }} style={styles.coverPreviewImage} resizeMode="cover" />
                  <TouchableOpacity onPress={() => setCoverUri(null)} style={styles.boutonSupprCover}>
                    <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={choisirCouverture} style={styles.boutonAjoutCover} activeOpacity={0.8} disabled={enCours}>
                  <Ionicons name="image-outline" size={18} color={couleurs.primaire} />
                  <Text style={styles.boutonAjoutCoverTxt}>+ Ajouter une miniature de cours (optionnel)</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* RAPPEL FINANCIER & SÉCURITÉ */}
            <View style={styles.carteRappelFinancier}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#10B981" />
              <View style={{ flex: 1 }}>
                <Text style={styles.rappelFinancierTitre}>Rémunération Créateur & Sécurité</Text>
                <Text style={styles.rappelFinancierTexte}>
                  • Votre rémunération : +{GAIN_PAR_ACQUISITION_FCFA} FCFA crédités à chaque déblocage ou acquisition de votre cours.{'\n'}
                  • Retrait Mobile Money disponible dès {SEUIL_RETRAIT_FCFA.toLocaleString('fr-FR')} FCFA sans stockage permanent de votre numéro.{'\n'}
                  • Anti-fraude absolue : Vous ne pouvez pas acquérir votre propre document.
                </Text>
              </View>
            </View>

            {/* BARRE DE PROGRESSION EN CAS D'UPLOAD */}
            {enCours && (
              <View style={styles.blocProgression}>
                <View style={styles.ligneProgression}>
                  <Text style={styles.labelProgression}>{libelleProgression}</Text>
                  <Text style={styles.pctProgression}>{progression}%</Text>
                </View>
                <View style={styles.barreFond}>
                  <View style={[styles.barreRemplie, { width: `${progression}%` }]} />
                </View>
                <ActivityIndicator color={couleurs.primaire} style={{ marginTop: 8 }} />
              </View>
            )}

            {/* BOUTON D'ACTION PUBLIER */}
            <TouchableOpacity
              style={[
                styles.boutonPublier,
                (!fileUri || tailleTropGrande || quotaDepasse || !titre.trim() || enCours) && styles.boutonDesactive,
              ]}
              onPress={handlePublier}
              activeOpacity={0.85}
              disabled={!fileUri || tailleTropGrande || quotaDepasse || !titre.trim() || enCours}
            >
              <Ionicons name="paper-plane" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.boutonPublierTxt}>Publier le document sur cauZon</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (c: any) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalConteneur: {
      backgroundColor: c.fond,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      maxHeight: '92%',
      paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    },
    entete: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.bordure,
    },
    titreModal: { fontSize: 18, fontWeight: '900', color: c.texte },
    sousTitreModal: { fontSize: 12, fontWeight: '700', color: '#10B981', marginTop: 2 },
    boutonFermer: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    scrollContent: { padding: 20, gap: 10 },
    labelSection: { fontSize: 13, fontWeight: '800', color: c.texte, marginTop: 8 },
    aideSection: { fontSize: 12, color: c.texteSecondaire, marginBottom: 4, lineHeight: 16 },
    zoneDrop: {
      borderWidth: 2,
      borderStyle: 'dashed',
      borderColor: c.primaire,
      borderRadius: 18,
      padding: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.estSombre ? 'rgba(255,255,255,0.03)' : 'rgba(127,1,31,0.03)',
      gap: 6,
    },
    zoneDropTitre: { fontSize: 15, fontWeight: '800', color: c.texte },
    zoneDropTexte: { fontSize: 12, color: c.texteSecondaire },
    carteFichier: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.fondCarte,
      borderRadius: 16,
      padding: 12,
      borderWidth: 1,
      borderColor: c.bordure,
    },
    carteFichierErreur: { borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.05)' },
    iconeFichierWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(127,1,31,0.08)', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    nomFichierTxt: { fontSize: 13, fontWeight: '800', color: c.texte },
    metaFichierTxt: { fontSize: 11, color: c.texteSecondaire, marginTop: 2 },
    boutonChangerFichier: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: c.bordure },
    boutonChangerFichierTxt: { fontSize: 11.5, fontWeight: '700', color: c.texte },
    alerteQuota: {
      flexDirection: 'row',
      backgroundColor: 'rgba(239,68,68,0.1)',
      borderWidth: 1,
      borderColor: '#EF4444',
      borderRadius: 14,
      padding: 12,
      gap: 10,
      marginTop: 4,
    },
    alerteQuotaTitre: { fontSize: 13, fontWeight: '800', color: '#EF4444' },
    alerteQuotaTexte: { fontSize: 12, color: c.texte, marginTop: 2 },
    boutonExtensionDirect: {
      backgroundColor: '#EF4444',
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 10,
      marginTop: 6,
      alignSelf: 'flex-start',
    },
    boutonExtensionDirectTxt: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '800' },
    input: {
      borderWidth: 1.5,
      borderColor: c.bordure,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === 'ios' ? 12 : 9,
      fontSize: 13.5,
      color: c.texte,
      backgroundColor: c.fondCarte,
    },
    pillsContainer: { gap: 8, paddingVertical: 4 },
    pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: c.bordure, backgroundColor: c.fondCarte },
    pillActive: { backgroundColor: c.primaire, borderColor: c.primaire },
    pillTxt: { fontSize: 12, fontWeight: '700', color: c.texte },
    pillActiveTxt: { color: '#FFFFFF' },
    textArea: { height: 120, lineHeight: 20 },
    compteurTxt: { fontSize: 11, color: c.texteSecondaire, textAlign: 'right', marginTop: -4 },
    cartePagesGratuites: {
      backgroundColor: c.fondCarte,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: c.bordure,
      marginBottom: 10,
    },
    stepperLigne: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    stepperBouton: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: c.fond,
      borderWidth: 1.5,
      borderColor: c.bordure,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperBoutonDesactive: {
      opacity: 0.35,
    },
    stepperValeurWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    stepperValeurTxt: {
      fontSize: 18,
      fontWeight: '900',
      color: c.texte,
    },
    stepperSousTxt: {
      fontSize: 11,
      color: c.texteSecondaire,
      marginTop: 2,
    },
    carteApercuIdentite: {
      backgroundColor: c.fondCarte,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: c.bordure,
      gap: 8,
    },
    badgePosteurApercu: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 14,
      backgroundColor: c.estSombre ? 'rgba(255,255,255,0.08)' : 'rgba(127,1,31,0.06)',
      alignSelf: 'flex-start',
      gap: 6,
    },
    avatarMini: { width: 22, height: 22, borderRadius: 11 },
    avatarVide: { backgroundColor: c.primaire, alignItems: 'center', justifyContent: 'center' },
    initialeTxt: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
    pseudoApercuTxt: { fontSize: 12, fontWeight: '800', color: c.texte },
    explicationAuteurTxt: { fontSize: 11.5, color: c.texteSecondaire, lineHeight: 16 },
    boutonAjoutCover: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.bordure,
      borderRadius: 12,
    },
    boutonAjoutCoverTxt: { fontSize: 12, fontWeight: '700', color: c.primaire },
    coverPreviewContainer: { position: 'relative', height: 110, borderRadius: 12, overflow: 'hidden' },
    coverPreviewImage: { width: '100%', height: '100%' },
    boutonSupprCover: { position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    carteRappelFinancier: {
      flexDirection: 'row',
      backgroundColor: 'rgba(16,185,129,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(16,185,129,0.3)',
      borderRadius: 14,
      padding: 12,
      gap: 10,
      marginTop: 6,
    },
    rappelFinancierTitre: { fontSize: 12.5, fontWeight: '800', color: '#10B981' },
    rappelFinancierTexte: { fontSize: 11, color: c.texte, marginTop: 4, lineHeight: 16 },
    blocProgression: { backgroundColor: c.fondCarte, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.bordure, marginTop: 8 },
    ligneProgression: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    labelProgression: { fontSize: 12, fontWeight: '700', color: c.texte },
    pctProgression: { fontSize: 12, fontWeight: '900', color: c.primaire },
    barreFond: { height: 8, borderRadius: 4, backgroundColor: c.bordure, overflow: 'hidden' },
    barreRemplie: { height: 8, borderRadius: 4, backgroundColor: c.primaire },
    boutonPublier: {
      flexDirection: 'row',
      backgroundColor: c.primaire,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
      marginBottom: 20,
    },
    boutonPublierTxt: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
    boutonDesactive: { opacity: 0.5 },
  });
