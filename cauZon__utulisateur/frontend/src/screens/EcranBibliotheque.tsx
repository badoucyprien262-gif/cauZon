import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Platform,
  StatusBar,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '../components/AppIcon';
import { Document, DocumentCourse } from '../types';
import { RootStackParamList } from '../navigation/NavigateurApp';
import { useApp } from '../store/ContexteApp';
import ListeDossiers from '../components/ListeDossiers';
import JaugeStockage from '../components/JaugeStockage';
import ModaleVip from '../components/ModaleVip';
import ModaleStockage from '../components/ModaleStockage';
import ModaleAchat from '../components/ModaleAchat';
import ModaleImportDocument, { FichierImporte } from '../components/ModaleImportDocument';
import ModaleConnexionRequise from '../components/ModaleConnexionRequise';
import ModaleConfirmationCauzon from '../components/ModaleConfirmationCauzon';
import { fetchMesDocuments, exporterDocumentVersAppareil, chargerBibliothequeLocale, chargerDocumentsImportes, copierFichierVersDossierPersistant } from '../services/serviceDocument';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;




export default function EcranBibliotheque() {
  const navigation = useNavigation<NavigationProp>();
  const {
    docsDebloquesIds,
    setDocsDebloquesIds,
    setAcquisitions: setAcquisitionsContexte,
    setDocumentsImportes: setDocumentsImportesContexte,
    couleurs,
    retirerDocumentDebloque,
    estVip,
    estAbonneVIP,
    aAccesVip,
    afficherToast,
    dateExpirationAbonnement,
    estEnLigne,
    debloquerDocument,
    utilisateur,
    estConnecteGoogle,
  } = useApp();
  
  const [dossierActif, setDossierActif] = useState<'permanent' | 'vip'>('permanent');
  const [vipModalVisible, setVipModalVisible] = useState(false);
  const [storageModalVisible, setStorageModalVisible] = useState(false);
  const [achatModalVisible, setAchatModalVisible] = useState(false);
  const [forcerAchatPermanent, setForcerAchatPermanent] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [fichierImportSelectionne, setFichierImportSelectionne] = useState<FichierImporte | null>(null);
  const [connexionModalVisible, setConnexionModalVisible] = useState(false);
  const [documentPourAchat, setDocumentPourAchat] = useState<Document | null>(null);

  // Modale de confirmation de suppression personnalisée CauZon
  const [modaleSuppressionVisible, setModaleSuppressionVisible] = useState(false);
  const [docASupprimer, setDocASupprimer] = useState<{ id: string; titre: string; estImporte: boolean } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [mesDocs, setMesDocs] = useState<Document[]>([]);
  const [documentsImportes, setDocumentsImportes] = useState<Document[]>([]);
  const [acquisitions, setAcquisitions] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const styles = getStyles(couleurs);

  const isVipActive = aAccesVip ?? (estVip || estAbonneVIP);

  const executerSuppression = async (docId: string, estImporte: boolean = false) => {
    try {
      const { supprimerDocumentLocal } = await import('../services/serviceDocument');
      const result = await supprimerDocumentLocal(docId);
      if (result.success) {
        retirerDocumentDebloque(docId);
        // Mise à jour optimiste immédiate de la liste locale
        setMesDocs((prev) => prev.filter((d) => d.id !== docId));
        await loadLibrary();
        afficherToast(
          estImporte
            ? "Le document importé a été supprimé de votre appareil."
            : "Le cours a été retiré et renvoyé dans le catalogue.",
          "Succès 🗑️",
          "succes"
        );
      } else {
        afficherToast(result.message || "Impossible de supprimer le document.", "Erreur ⚠️", "erreur");
      }
    } catch (err: any) {
      console.error('Erreur exécution suppression :', err);
      afficherToast("Une erreur est survenue lors de la suppression.", "Erreur ⚠️", "erreur");
    }
  };

  const confirmerSuppression = (docId: string, docTitre: string, estImporte: boolean = false) => {
    setDocASupprimer({ id: docId, titre: docTitre, estImporte });
    setModaleSuppressionVisible(true);
  };

  useEffect(() => {
    loadLibrary();
  }, [docsDebloquesIds]);

  useFocusEffect(
    useCallback(() => {
      loadLibrary();
    }, [docsDebloquesIds])
  );


  const formaterDocsPourAffichage = (data: any[]) => {
    return data.map((dbDoc: any) => {
      const rawType = (dbDoc.limite_apercu_type || 'pourcentage').toLowerCase().trim();
      let parsedType: 'page' | 'pourcentage' | 'fluide' | 'neutre' = 'pourcentage';
      let parsedVal = dbDoc.limite_apercu_valeur ?? 30;

      if (rawType.startsWith('fluide:') || rawType.startsWith('neutre:')) {
        parsedType = 'fluide';
        const dec = parseFloat(rawType.split(':')[1]);
        if (!isNaN(dec)) parsedVal = dec;
      } else if (rawType === 'fluide' || rawType === 'neutre') {
        parsedType = 'fluide';
      } else if (rawType === 'page') {
        parsedType = 'page';
      }

      return {
        id: dbDoc.id,
        titre: dbDoc.titre,
        categorie: dbDoc.categorie,
        estCertifie: dbDoc.est_certifie ?? false,
        estPretHorsLigne: dbDoc.est_pret_hors_ligne ?? true,
        prix: dbDoc.prix ?? 100,
        estVerrouille: false,
        nombrePages: dbDoc.total_pages || dbDoc.page_count || dbDoc.nombre_pages || dbDoc.pages || dbDoc.nombrePages || 1,
        tailleMo: dbDoc.taille_mo ?? 1.5,
        limiteApercuPages: dbDoc.limite_apercu_pages ?? 2,
        limiteApercuType: parsedType,
        limiteApercuValeur: parsedVal,
        description: dbDoc.description ?? '',
        cheminLocal: dbDoc.cheminLocal || dbDoc.file_path || '',
        is_vip_consultation: dbDoc.is_vip_consultation ?? false,
        estImporte: dbDoc.est_importe ?? dbDoc.id?.startsWith('imported_') ?? false,
      };
    });
  };

  const loadLibrary = async () => {
    try {
      // 1. Chargement instantané des documents importés locaux et du cache de la bibliothèque
      const imported = await chargerDocumentsImportes();
      const cached = await chargerBibliothequeLocale();

      // Les documents importés sont TOUJOURS valides et accessibles sur cet appareil
      const cachedOfficiels = (cached || []).filter(
        (d: any) => !d.id?.startsWith('imported_') && !d.est_importe && !d.estImporte
      );

      // Filtrer les cours officiels du cache par les IDs débloqués
      const officielsValides = cachedOfficiels.filter((d: any) =>
        docsDebloquesIds && docsDebloquesIds.includes(d.id)
      );

      // Fusion locale : Documents importés locaux + cours officiels débloqués
      const localCombines = [...(imported || []), ...officielsValides];

      if (localCombines.length > 0) {
        const formates = formaterDocsPourAffichage(localCombines);
        setMesDocs(formates);
        setDocumentsImportes(formates.filter((d) => d.estImporte));
        setAcquisitions(formates.filter((d) => !d.estImporte));
        setAcquisitionsContexte(formates.filter((d) => !d.estImporte));
        setDocumentsImportesContexte(formates.filter((d) => d.estImporte));
        setLoading(false);
      } else {
        setMesDocs([]);
        setDocumentsImportes([]);
        setAcquisitions([]);
        setAcquisitionsContexte([]);
        setDocumentsImportesContexte([]);
      }

      // 2. Si hors-ligne, s'arrêter immédiatement sans attendre de requêtes distantes
      if (estEnLigne === false) {
        setLoading(false);
        return;
      }

      // 3. Si en ligne, rafraîchir en arrière-plan avec la base distante Supabase
      const data = await fetchMesDocuments();
      if (data && data.length > 0) {
        // Toujours re-fusionner avec le stockage local des documents importés pour ne jamais les effacer
        const importsLocaux = await chargerDocumentsImportes();
        const serverOfficiels = data.filter(
          (d: any) => !d.id?.startsWith('imported_') && !d.est_importe && !d.estImporte
        );
        const serverValides = serverOfficiels.filter(
          (d: any) => docsDebloquesIds && docsDebloquesIds.includes(d.id)
        );

        const fusionFinale = [...(importsLocaux || []), ...serverValides];
        const formates = formaterDocsPourAffichage(fusionFinale);
        setMesDocs(formates);
        setDocumentsImportes(formates.filter((d) => d.estImporte));
        setAcquisitions(formates.filter((d) => !d.estImporte));
        setAcquisitionsContexte(formates.filter((d) => !d.estImporte));
        setDocumentsImportesContexte(formates.filter((d) => d.estImporte));
      } else if (localCombines.length === 0) {
        setMesDocs([]);
        setDocumentsImportes([]);
        setAcquisitions([]);
        setAcquisitionsContexte([]);
        setDocumentsImportesContexte([]);
      }
    } catch (error) {
      console.error('Erreur lors du chargement de la bibliothèque réelle :', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImportSuccess = async (nouveauDoc?: DocumentCourse) => {
    // 📁 Basculer immédiatement vers l'onglet Permanent
    setDossierActif('permanent');
    setSearchQuery('');

    if (nouveauDoc) {
      if (debloquerDocument) {
        debloquerDocument(nouveauDoc.id);
      }
      const formates = formaterDocsPourAffichage([nouveauDoc]);
      const docFormate = formates[0];
      setMesDocs((prev) => [docFormate, ...prev.filter((d) => d.id !== nouveauDoc.id)]);
      setDocumentsImportes((prev) => [docFormate, ...prev.filter((d) => d.id !== nouveauDoc.id)]);
      if (setDocumentsImportesContexte) {
        setDocumentsImportesContexte((prev) => [docFormate, ...prev.filter((d: any) => d.id !== nouveauDoc.id)]);
      }
      // 📂 Ouvrir directement le dossier de destination du document importé
      // afin que l'utilisateur voie son document immédiatement dans le bon dossier.
      if (nouveauDoc.categorie) {
        setSelectedCategory(nouveauDoc.categorie);
      } else {
        setSelectedCategory(null);
      }
    } else {
      setSelectedCategory(null);
    }
    // Synchronisation en tâche de fond
    await loadLibrary();
  };


  // Séparation en deux grands dossiers
  const docsPermanents = mesDocs.filter(d => !d.is_vip_consultation);
  const docsVip = mesDocs.filter(d => d.is_vip_consultation);

  // Docs de la vue active
  const docsDeLaVue = dossierActif === 'permanent' ? docsPermanents : docsVip;

  // Filtrage global pour l'affichage
  const docsFiltresGlobaux = docsDeLaVue.filter((doc) =>
    doc.titre.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.categorie.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filtrage spécifique à l'intérieur d'une catégorie
  const docsCategorie = docsDeLaVue.filter(
    (doc) => doc.categorie === selectedCategory
  );
  const docsFiltresCategorie = docsCategorie.filter((doc) =>
    doc.titre.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={couleurs.primaire} />
      </View>
    );
  }

  const ouvrirDocument = (doc: Document) => {
    // Si document VIP et pass expiré -> bloquer et proposer l'achat
    if (doc.is_vip_consultation && !isVipActive) {
      setDocumentPourAchat(doc);
      setAchatModalVisible(true);
      return;
    }

    const cheminFichier = doc.cheminLocal || (doc as any).file_path || '';

    // Ouverture directe et garantie dans le lecteur PDF intégré
    navigation.navigate('DocumentViewer', { 
      document: { 
        ...doc, 
        estVerrouille: false,
        cheminLocal: cheminFichier,
        estImporte: (doc as any).estImporte ?? doc.id.startsWith('imported_') ?? false
      } 
    });
  };




  const exporterDocument = async (doc: Document) => {
    const res = await exporterDocumentVersAppareil(doc);
    afficherToast(
      res.message,
      "Exportation 💾",
      res.success ? "succes" : "erreur"
    );
  };

  const ouvrirDossier = (categorie: string) => {
    setSelectedCategory(categorie);
    setSearchQuery('');
  };

  // 📥 Processus d'importation PDF sécurisé & vérifié
  const demarrerProcessusImport = async () => {
    // 1. Vérification de la connexion Google
    if (!estConnecteGoogle && !utilisateur) {
      afficherToast(
        "Connectez-vous avec votre compte Google pour sauvegarder vos documents personnels dans le Cloud sécurisé.",
        "Connexion Requise 🔒",
        "info"
      );
      setConnexionModalVisible(true);
      return;
    }

    // 2. Vérification des droits VIP
    if (!isVipActive) {
      afficherToast(
        "L'importation de documents personnels (PDF) est réservée aux abonnés VIP. Passez VIP pour débloquer le stockage illimité !",
        "Pass VIP Requis 👑",
        "info"
      );
      setVipModalVisible(true);
      return;
    }

    // 3. Ouverture du sélecteur natif de PDF (DocumentPicker)
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const nomFichier = (asset.name || '').toLowerCase();

        // Validation stricte du format PDF
        if (!nomFichier.endsWith('.pdf') && asset.mimeType !== 'application/pdf') {
          afficherToast("Seuls les fichiers PDF (.pdf) sont acceptés sur cauZon.", "Format Non Supporté 📄", "erreur");
          return;
        }

        // Copie immédiate dans le stockage persistant cauzon_docs/ (Sandboxing)
        const persistentUri = await copierFichierVersDossierPersistant(
          asset.uri,
          `${Date.now()}_${nomFichier}`
        );

        // Fichier sélectionné : on prépare les données et on ouvre la modale de configuration
        setFichierImportSelectionne({
          name: asset.name,
          uri: persistentUri,
          size: asset.size,
        });
        setImportModalVisible(true);
      }
    } catch (err: any) {
      console.error('Erreur sélection document dans EcranBibliotheque :', err);
      afficherToast("Impossible d'accéder aux fichiers de votre appareil.", "Erreur ⚠️", "erreur");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 1. Entête avec Switch Double Dossier & Bouton Importer */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <View>
            <Text style={styles.title}>Ma Bibliothèque</Text>
            <Text style={styles.subtitle}>Gérez vos espaces d'apprentissage</Text>
          </View>

          {/* 📥 Bouton Importer un Document (Réservé aux VIP) */}
          <TouchableOpacity
            style={styles.boutonImporterHeader}
            onPress={demarrerProcessusImport}
            activeOpacity={0.8}
          >
            <Ionicons name="cloud-upload" size={15} color="#FFFFFF" />
            <Text style={styles.texteBoutonImporter}>Importer</Text>
          </TouchableOpacity>
        </View>

        {/* Double Dossier Switch */}
        <View style={styles.folderSwitchContainer}>

          <TouchableOpacity
            style={[
              styles.folderSwitchTab,
              dossierActif === 'permanent' && styles.folderSwitchTabActive
            ]}
            onPress={() => {
              setDossierActif('permanent');
              setSelectedCategory(null);
            }}
          >
            <Ionicons 
              name="folder" 
              size={18} 
              color={dossierActif === 'permanent' ? '#FFFFFF' : couleurs.texteSecondaire} 
            />
            <Text style={[
              styles.folderSwitchText,
              dossierActif === 'permanent' && styles.folderSwitchTextActive
            ]}>
              📁 Permanente ({docsPermanents.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.folderSwitchTab,
              dossierActif === 'vip' && styles.folderSwitchTabActiveVip
            ]}
            onPress={() => {
              setDossierActif('vip');
              setSelectedCategory(null);
            }}
          >
            <Ionicons 
              name="gift" 
              size={18} 
              color={dossierActif === 'vip' ? '#6B1124' : '#E5C158'} 
            />
            <Text style={[
              styles.folderSwitchText,
              dossierActif === 'vip' && styles.folderSwitchTextActiveVip
            ]}>
              👑 Accès VIP ({docsVip.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Bandeau d'information contextuel du dossier */}
        {dossierActif === 'permanent' ? (
          <View style={styles.infoBannerPermanent}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#15803D" />
            <Text style={styles.infoBannerPermanentText}>
              Accès permanent illimité à vie • Stockage hors-ligne & Exportation autorisée
            </Text>
          </View>
        ) : (
          <View style={[styles.infoBannerVip, !isVipActive && styles.infoBannerVipExpired]}>
            <Ionicons 
              name={isVipActive ? "sparkles" : "lock-closed"} 
              size={16} 
              color={isVipActive ? "#B45309" : "#DC2626"} 
            />
            <Text style={[styles.infoBannerVipText, !isVipActive && { color: "#DC2626" }]}>
              {isVipActive 
                ? `Location active jusqu'au ${dateExpirationAbonnement || 'prochaine échéance'}. Lecture illimitée.`
                : "Période de location expirée. Achetez vos cours à 100 FCFA pour les transférer dans votre dossier permanent."}
            </Text>
          </View>
        )}
      </View>

      {/* 2. Recherche */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={20} color={couleurs.texteSecondaire} />
          <TextInput
            placeholder={
              selectedCategory 
                ? `Rechercher dans ${selectedCategory}...` 
                : dossierActif === 'permanent' ? "Rechercher un cours permanent..." : "Rechercher un cours en location..."
            }
            placeholderTextColor={couleurs.texteSecondaire}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={couleurs.texteSecondaire} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 3. Contenu (Vue Dossiers ou Vue Catégorie) */}
      {selectedCategory === null ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Jauge de capacité */}
          <JaugeStockage 
            nombreDocuments={mesDocs.length} 
            surClicAmeliorer={() => setStorageModalVisible(true)} 
          />

          {/* Grille de Dossiers */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>
              {dossierActif === 'permanent' ? 'Matières & Catégories Permanentes' : 'Matières & Catégories en Location'}
            </Text>
            {docsDeLaVue.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons 
                  name={dossierActif === 'permanent' ? "folder-open-outline" : "gift-outline"} 
                  size={48} 
                  color={couleurs.texteSecondaire} 
                />
                <Text style={styles.emptyText}>
                  {dossierActif === 'permanent'
                    ? "Aucun cours permanent pour le moment.\nVos achats individuels à 100 FCFA apparaîtront ici à vie."
                    : "Aucun cours consulté en mode Location.\nLes cours consultés pendant votre période de location s'affichent ici."}
                </Text>
              </View>
            ) : (
              <ListeDossiers 
                documents={docsFiltresGlobaux} 
                surClicDossier={ouvrirDossier} 
              />
            )}
          </View>
        </ScrollView>
      ) : (
        /* Vue Contenu de la Catégorie */
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.folderHeader}>
            <TouchableOpacity 
              onPress={() => { setSelectedCategory(null); setSearchQuery(''); }} 
              style={styles.backBtn}
            >
              <Ionicons name="arrow-back" size={24} color={couleurs.primaire} />
            </TouchableOpacity>
            <View style={styles.headerTextContainer}>
              <Text style={styles.title} numberOfLines={1}>{selectedCategory}</Text>
              <Text style={styles.subtitle}>
                {dossierActif === 'permanent' ? 'Dossier Permanent • À vie' : 'Dossier Accès VIP'}
              </Text>
            </View>
          </View>

          <View style={styles.sectionContainer}>
            <View style={styles.listHeader}>
              <Text style={styles.sectionTitle}>Documents ({docsFiltresCategorie.length})</Text>
              <View style={styles.offlineStatus}>
                <View style={[styles.statusDot, { backgroundColor: dossierActif === 'permanent' ? '#22C55E' : (isVipActive ? '#E5C158' : '#EF4444') }]} />
                <Text style={styles.statusText}>
                  {dossierActif === 'permanent' ? 'Permanent' : (isVipActive ? 'VIP Actif' : 'VIP Expiré')}
                </Text>
              </View>
            </View>

            <View style={styles.docsList}>
              {docsFiltresCategorie.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="search-outline" size={40} color={couleurs.texteSecondaire} />
                  <Text style={styles.emptyText}>Aucun document ne correspond dans ce dossier</Text>
                </View>
              ) : (
                docsFiltresCategorie.map((doc) => {
                  const estVerrouilleVip = doc.is_vip_consultation && !isVipActive;

                  return (
                    <View key={doc.id} style={[styles.docItemCard, estVerrouilleVip && styles.docItemCardLocked]}>
                      <View style={styles.docItemInfo}>
                        <View style={[styles.iconContainer, estVerrouilleVip && { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                          <Ionicons 
                            name={estVerrouilleVip ? "lock-closed" : (doc.is_vip_consultation ? "gift" : "document-text")} 
                            size={24} 
                            color={estVerrouilleVip ? "#DC2626" : (doc.is_vip_consultation ? "#E5C158" : couleurs.primaire)} 
                          />
                        </View>
                        <View style={styles.docTextContainer}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={styles.docTitle} numberOfLines={1}>
                              {doc.titre}
                            </Text>
                            {doc.estImporte && (
                              <View style={styles.badgeImporte}>
                                <Ionicons name="document-attach" size={12} color="#7F011F" />
                                <Text style={styles.texteBadgeImporte}>Document Importé</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.docMeta}>
                            {doc.categorie} • {(doc.nombrePages || (doc as any).total_pages || (doc as any).page_count || (doc as any).nombre_pages || 0) > 0 ? `${doc.nombrePages || (doc as any).total_pages || (doc as any).page_count || (doc as any).nombre_pages} p.` : 'Document'} • {doc.tailleMo ? `${doc.tailleMo} Mo` : '1.5 Mo'}
                          </Text>
                          {estVerrouilleVip ? (
                            <Text style={styles.lockedWarningText}>
                              🔒 VIP expiré : Achetez à 100 F pour le transférer en permanent
                            </Text>
                          ) : doc.description ? (
                            <Text style={styles.docDescription} numberOfLines={2}>
                              {doc.description}
                            </Text>
                          ) : null}
                        </View>
                      </View>

                      {/* Boutons d'Action */}
                      <View style={styles.actionsRow}>
                        {!estVerrouilleVip ? (
                          <>
                            <TouchableOpacity 
                              style={[styles.actionBtn, styles.readBtn]} 
                              onPress={() => ouvrirDocument(doc)}
                            >
                              <Ionicons name="eye-outline" size={14} color={couleurs.accent} style={{ marginRight: 4 }} />
                              <Text style={styles.readBtnText}>Lire</Text>
                            </TouchableOpacity>

                            {/* Exportation vers stockage local (PC ou Téléphone) */}
                            {dossierActif === 'permanent' && (
                              <TouchableOpacity 
                                style={[styles.actionBtn, styles.exportBtn]}
                                onPress={() => exporterDocument(doc)}
                              >
                                <Ionicons name="share-outline" size={14} color={couleurs.primaire} style={{ marginRight: 4 }} />
                                <Text style={styles.exportBtnText}>Exporter</Text>
                              </TouchableOpacity>
                            )}

                            {/* Option d'achat direct pour transférer un doc VIP en Permanent */}
                            {dossierActif === 'vip' && (
                              <TouchableOpacity 
                                style={[styles.actionBtn, styles.buyTransferBtn]}
                                onPress={() => {
                                  setDocumentPourAchat(doc);
                                  setForcerAchatPermanent(true);
                                  setAchatModalVisible(true);
                                }}
                              >
                                <Ionicons name="shield-checkmark" size={14} color="#15803D" style={{ marginRight: 4 }} />
                                <Text style={styles.buyTransferBtnText}>Transférer à vie ({doc.prix ?? 100} F)</Text>
                              </TouchableOpacity>
                            )}

                            <TouchableOpacity 
                              style={[styles.actionBtn, styles.deleteBtn]}
                              onPress={() => confirmerSuppression(doc.id, doc.titre, doc.estImporte)}
                            >
                              <Ionicons name="trash-outline" size={14} color="#C0392B" style={{ marginRight: 4 }} />
                              <Text style={styles.deleteBtnText}>Retirer</Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <>
                            <TouchableOpacity 
                              style={[styles.actionBtn, styles.buyNowLockedBtn]}
                              onPress={() => {
                                setDocumentPourAchat(doc);
                                setForcerAchatPermanent(true);
                                setAchatModalVisible(true);
                              }}
                            >
                              <Ionicons name="cart-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                              <Text style={styles.buyNowLockedBtnText}>Débloquer à vie ({doc.prix ?? 100} FCFA)</Text>
                            </TouchableOpacity>

                            <TouchableOpacity 
                              style={[styles.actionBtn, styles.deleteBtn]}
                              onPress={() => confirmerSuppression(doc.id, doc.titre, doc.estImporte)}
                            >
                              <Ionicons name="trash-outline" size={14} color="#C0392B" style={{ marginRight: 4 }} />
                              <Text style={styles.deleteBtnText}>Retirer</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        </ScrollView>
      )}

      {/* Modale d'achat direct (pour conversion VIP -> Permanent) */}
      {documentPourAchat && (
        <ModaleAchat
          visible={achatModalVisible}
          onClose={() => {
            setAchatModalVisible(false);
            setDocumentPourAchat(null);
            setForcerAchatPermanent(false);
          }}
          onSuccess={() => {
            setAchatModalVisible(false);
            setDocumentPourAchat(null);
            setForcerAchatPermanent(false);
            setDossierActif('permanent'); // Bascule immédiatement vers l'espace Permanent
            loadLibrary();
          }}
          documentId={documentPourAchat.id}
          documentTitle={documentPourAchat.titre}
          documentPrix={documentPourAchat.prix ?? 100}
          forcerAchatPermanent={forcerAchatPermanent}
        />
      )}

      {/* Modale VIP */}
      <ModaleVip 
        visible={vipModalVisible} 
        onClose={() => setVipModalVisible(false)} 
        onSuccess={() => {
          setVipModalVisible(false);
          loadLibrary();
        }} 
      />

      {/* Modale Stockage */}
      <ModaleStockage
        visible={storageModalVisible}
        onClose={() => setStorageModalVisible(false)}
        onSuccess={() => {
          setStorageModalVisible(false);
          loadLibrary();
        }}
      />

      {/* Modale d'Importation de Document */}
      <ModaleImportDocument
        visible={importModalVisible}
        onClose={() => {
          setImportModalVisible(false);
          setFichierImportSelectionne(null);
        }}
        onSuccess={(doc) => {
          setFichierImportSelectionne(null);
          handleImportSuccess(doc);
        }}
        categoriesExistantes={Array.from(new Set(mesDocs.map(d => d.categorie).filter(Boolean)))}
        initialFile={fichierImportSelectionne}
      />

      {/* Modale de Connexion Requise pour Sauvegarde Cloud */}
      <ModaleConnexionRequise
        visible={connexionModalVisible}
        onClose={() => setConnexionModalVisible(false)}
        motif="import"
        onConnexionReussie={() => {
          setConnexionModalVisible(false);
          demarrerProcessusImport();
        }}
      />

      {/* Modale de Confirmation de Suppression Personnalisée CauZon */}
      <ModaleConfirmationCauzon
        visible={modaleSuppressionVisible}
        titre={docASupprimer?.estImporte ? "Supprimer le document ? 🗑️" : "Retirer le cours ? ⚠️"}
        message={
          docASupprimer?.estImporte
            ? `Êtes-vous sûr de vouloir supprimer définitivement le document "${docASupprimer?.titre}" de votre appareil ?`
            : `Êtes-vous sûr de vouloir retirer "${docASupprimer?.titre}" de votre bibliothèque ?`
        }
        texteConfirmer="Oui, supprimer"
        texteAnnuler="Annuler"
        type="danger"
        icone="trash-outline"
        onConfirmer={() => {
          if (docASupprimer) {
            const { id, estImporte } = docASupprimer;
            setModaleSuppressionVisible(false);
            setDocASupprimer(null);
            executerSuppression(id, estImporte);
          }
        }}
        onAnnuler={() => {
          setModaleSuppressionVisible(false);
          setDocASupprimer(null);
        }}
      />
    </SafeAreaView>
  );
}


const getStyles = (couleurs: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: couleurs.fond,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ? StatusBar.currentHeight + 8 : 28) : 0,
    width: '100%',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 10,
  },
  boutonImporterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: couleurs.primaire,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  texteBoutonImporter: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  badgeImporte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FAF6EB',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  texteBadgeImporte: {
    fontSize: 10,
    color: '#7F011F',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  // Double Dossier Switch & Bannières

  folderSwitchContainer: {
    flexDirection: 'row',
    backgroundColor: couleurs.estSombre ? '#1e1e1e' : '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginTop: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  folderSwitchTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  folderSwitchTabActive: {
    backgroundColor: couleurs.primaire,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  folderSwitchTabActiveVip: {
    backgroundColor: '#E5C158',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  folderSwitchText: {
    fontSize: 13,
    fontWeight: '700',
    color: couleurs.texteSecondaire,
  },
  folderSwitchTextActive: {
    color: '#FFFFFF',
  },
  folderSwitchTextActiveVip: {
    color: '#6B1124',
  },
  infoBannerPermanent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: couleurs.estSombre ? 'rgba(34, 197, 94, 0.1)' : '#F0FDF4',
    borderWidth: 1,
    borderColor: couleurs.estSombre ? 'rgba(34, 197, 94, 0.25)' : '#BBF7D0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
    gap: 8,
  },
  infoBannerPermanentText: {
    fontSize: 11.5,
    color: '#15803D',
    fontWeight: '600',
    flex: 1,
  },
  infoBannerVip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: couleurs.estSombre ? 'rgba(229, 193, 88, 0.12)' : '#FFFBEB',
    borderWidth: 1,
    borderColor: couleurs.estSombre ? 'rgba(229, 193, 88, 0.3)' : '#FDE68A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
    gap: 8,
  },
  infoBannerVipExpired: {
    backgroundColor: couleurs.estSombre ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
    borderColor: couleurs.estSombre ? 'rgba(239, 68, 68, 0.3)' : '#FECACA',
  },
  infoBannerVipText: {
    fontSize: 11.5,
    color: '#B45309',
    fontWeight: '600',
    flex: 1,
  },
  docItemCardLocked: {
    borderColor: '#EF4444',
    borderWidth: 1.5,
    backgroundColor: couleurs.estSombre ? '#1A1414' : '#FFFBFB',
  },
  lockedWarningText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '700',
    marginTop: 4,
  },
  buyTransferBtn: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: '#15803D',
  },
  buyTransferBtnText: {
    color: '#15803D',
    fontSize: 11.5,
    fontWeight: 'bold',
  },
  buyNowLockedBtn: {
    backgroundColor: '#DC2626',
  },
  buyNowLockedBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },

  folderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 10,
    gap: 12,
  },
  backBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: couleurs.estSombre ? 'rgba(255, 255, 255, 0.08)' : 'rgba(127, 1, 31, 0.05)',
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: couleurs.primaire,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: couleurs.texteSecondaire,
    marginTop: 2,
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: couleurs.blanc,
    borderRadius: 25,
    paddingHorizontal: 15,
    height: 48,
    borderWidth: 1.5,
    borderColor: couleurs.bordure,
    shadowColor: couleurs.primaire,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    color: couleurs.texte,
    fontSize: 14,
    fontWeight: '500',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 40,
    gap: 24,
  },
  sectionContainer: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: couleurs.primaire,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  offlineStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: couleurs.estSombre ? 'rgba(255, 255, 255, 0.08)' : 'rgba(12, 30, 27, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#38A169',
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: couleurs.primaire,
  },
  docsList: {
    gap: 12,
  },
  docItemCard: {
    backgroundColor: couleurs.blanc,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    gap: 14,
  },
  docItemInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: couleurs.fond,
    justifyContent: 'center',
    alignItems: 'center',
  },
  docTextContainer: {
    flex: 1,
  },
  docTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: couleurs.texte,
  },
  docMeta: {
    fontSize: 11,
    color: couleurs.texteSecondaire,
    marginTop: 2,
  },
  docDescription: {
    fontSize: 11,
    color: couleurs.texteSecondaire,
    marginTop: 6,
    lineHeight: 15,
    fontStyle: 'italic',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    paddingTop: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  readBtn: {
    backgroundColor: couleurs.primaire,
  },
  readBtnText: {
    color: couleurs.accent,
    fontSize: 12,
    fontWeight: 'bold',
  },
  exportBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: couleurs.primaire,
  },
  exportBtnText: {
    color: couleurs.primaire,
    fontSize: 12,
    fontWeight: 'bold',
  },
  deleteBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#C0392B',
  },
  deleteBtnText: {
    color: '#C0392B',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyContainer: {
    padding: 30,
    alignItems: 'center',
    backgroundColor: couleurs.blanc,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: 12,
    color: couleurs.texteSecondaire,
    marginTop: 8,
    fontWeight: '500',
    textAlign: 'center',
  },
});
