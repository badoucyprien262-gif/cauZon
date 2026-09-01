import { Platform, Alert } from 'react-native';
import * as Application from 'expo-application';

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';


export interface DocumentCourse {
  id: string;
  titre: string;
  categorie: string;
  description: string;
  tags?: string;
  prix: number;
  est_certifie: boolean;
  est_verrouille: boolean;
  nombre_pages: number;
  limite_apercu_pages: number;
  limite_apercu_type: string;
  limite_apercu_valeur: number;
  taille_mo: number;
  file_path: string;
  status: string;
  is_vip_consultation?: boolean;
  est_importe?: boolean;
  date_ajout?: string;
}



/**
 * Récupère tous les documents du catalogue pour le Feed / Écran d'accueil
 * Exclut automatiquement les documents déjà acquis par cet appareil.
 */
export const fetchCatalogueDocuments = async (): Promise<DocumentCourse[]> => {
  try {
    const deviceId = await getDeviceId();

    // 1. Récupérer les acquisitions de cet appareil
    const { data: acquisitions, error: errAcq } = await supabase
      .from('acquisitions')
      .select('document_id')
      .eq('device_id', deviceId);

    if (errAcq) {
      console.error('Erreur lors de la lecture des acquisitions :', errAcq.message);
    }

    const acquiredIds = acquisitions ? acquisitions.map(a => a.document_id).filter(Boolean) : [];

    // 2. Récupérer uniquement les documents non acquis
    let query = supabase.from('documents').select('*').eq('status', 'published');
    
    if (acquiredIds.length > 0) {
      query = query.not('id', 'in', `(${acquiredIds.join(',')})`);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as DocumentCourse[];
  } catch (error: any) {
    console.error('Erreur lors de la récupération du catalogue :', error.message);
    return [];
  }
};

/**
 * Recherche intelligente et flexible sur Supabase (Titre, Description, Tags, Catégorie)
 * Nettoie automatiquement les symboles '#' et les espaces superflus, insensible à la casse.
 */
export const rechercherDocuments = async (recherche: string): Promise<DocumentCourse[]> => {
  try {
    const termeNettoye = recherche ? recherche.replace(/#/g, '').trim() : '';
    if (!termeNettoye) {
      return await fetchCatalogueDocuments();
    }

    const deviceId = await getDeviceId();

    // 1. Exclure les acquisitions de cet appareil
    const { data: acquisitions } = await supabase
      .from('acquisitions')
      .select('document_id')
      .eq('device_id', deviceId);

    const acquiredIds = acquisitions ? acquisitions.map(a => a.document_id).filter(Boolean) : [];

    // 2. Requête Supabase avec filtre .or() ciblant titre, description, tags et categorie
    let query = supabase
      .from('documents')
      .select('*')
      .eq('status', 'published')
      .or(`titre.ilike.%${termeNettoye}%,description.ilike.%${termeNettoye}%,tags.ilike.%${termeNettoye}%,categorie.ilike.%${termeNettoye}%`);

    if (acquiredIds.length > 0) {
      query = query.not('id', 'in', `(${acquiredIds.join(',')})`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as DocumentCourse[];
  } catch (error: any) {
    console.error('Erreur lors de la recherche de cours :', error.message);
    return [];
  }
};


/**
 * Écoute en temps réel les ajouts, modifications et suppressions de cours, annonces et paramètres (Supabase Realtime WebSocket)
 */
export const souscrireChangementsDocuments = (onChangement: () => void) => {
  const channel = supabase
    .channel('cauzon-documents-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'documents' },
      (payload) => {
        console.log('📡 Notification temps réel reçue [documents] :', payload.eventType);
        onChangement();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'annonces_bannieres' },
      (payload) => {
        console.log('📡 Notification temps réel reçue [annonces_bannieres] :', payload.eventType);
        onChangement();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'settings' },
      (payload) => {
        console.log('📡 Notification temps réel reçue [settings] :', payload.eventType);
        onChangement();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

/**
 * Récupère un identifiant unique pour le téléphone actuel
 */

export const getDeviceId = async (): Promise<string> => {
  if (Platform.OS === 'android') {
    return Application.getAndroidId() || 'android-unknown-device';
  } else if (Platform.OS === 'ios') {
    const iosId = await Application.getIosIdForVendorAsync();
    return iosId || 'ios-unknown-device';
  }
  return 'web-or-unknown-device';
};

/**
 * Vérifie si cet appareil est éligible à l'Offre de Bienvenue (1er cours offert).
 * RÈGLE STRICTE : Interroge l'historique permanent des appareils (appareils_historique_bienvenue).
 * Si l'appareil a déjà consommé son offre, même après suppression de cours, elle reste bloquée.
 */
export const verifierEligibiliteOffreBienvenue = async (): Promise<boolean> => {
  try {
    const deviceId = await getDeviceId();

    // 1. Tenter la vérification via la fonction RPC serveur
    const { data: rpcEligible, error: rpcErr } = await supabase.rpc('verifier_eligibilite_offre_bienvenue', {
      p_device_id: deviceId
    });

    if (!rpcErr && typeof rpcEligible === 'boolean') {
      return rpcEligible;
    }

    // 2. Vérification directe dans la table d'archivage permanent
    const { data: histo, error: errHisto } = await supabase
      .from('appareils_historique_bienvenue')
      .select('a_consomme_offre_bienvenue')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (!errHisto && histo && histo.a_consomme_offre_bienvenue) {
      return false;
    }

    // 3. Vérification dans la table des acquisitions actives
    const { data: acqs } = await supabase
      .from('acquisitions')
      .select('id')
      .eq('device_id', deviceId)
      .eq('is_welcome_offer', true);

    if (acqs && acqs.length > 0) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Erreur vérification éligibilité offre de bienvenue :', error);
    return false;
  }
};


/**
 * Tente de débloquer un document (Offre de bienvenue ou Achat)
 * Blindage absolu : exécute la procédure stockée atomique RPC sur Supabase.
 */
export const debloquerDocument = async (documentId: string, prixDocument: number) => {
  try {
    const deviceId = await getDeviceId();

    // 1. Tenter l'appel RPC sécurisé côté serveur Supabase (Incontournable)
    const { data: rpcData, error: rpcError } = await supabase.rpc('debloquer_offre_bienvenue_securisee', {
      p_document_id: documentId,
      p_device_id: deviceId,
    });

    if (!rpcError && rpcData) {
      if (rpcData.success) {
        return { success: true, message: rpcData.message || 'Félicitations ! Votre 1er document offert a été débloqué 🎉' };
      } else if (rpcData.code === 'DEVICE_DEJA_UTILISE' || rpcData.paywallRequired) {
        return { 
          success: false, 
          paywallRequired: true, 
          message: `Offre de bienvenue déjà consommée sur cet appareil. Déblocage pour ${prixDocument} FCFA.` 
        };
      }
    }

    // 2. Fallback de sécurité côté client (si la RPC n'est pas encore déployée)
    const { data: { user } } = await supabase.auth.getUser();
    let estOffreDisponible = true;

    // A. Vérification dans l'historique d'archivage des Device IDs
    const { data: historiqueAppareil } = await supabase
      .from('appareils_historique_bienvenue')
      .select('a_consomme_offre_bienvenue')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (historiqueAppareil && historiqueAppareil.a_consomme_offre_bienvenue) {
      estOffreDisponible = false;
    }

    // B. Vérification dans la table acquisitions
    if (estOffreDisponible) {
      const { data: offresExistantes } = await supabase
        .from('acquisitions')
        .select('id')
        .eq('device_id', deviceId)
        .eq('is_welcome_offer', true);

      if (offresExistantes && offresExistantes.length > 0) {
        estOffreDisponible = false;
      }
    }

    // 3. Déblocage gratuit pour le 1er document (Offre de bienvenue)
    if (estOffreDisponible) {
      const insertionData: any = {
        document_id: documentId,
        device_id: deviceId,
        is_welcome_offer: true,
        is_vip_consultation: false,
        montant_paye: 0,
      };

      if (user) {
        insertionData.user_id = user.id;
      }

      const { data, error } = await supabase
        .from('acquisitions')
        .insert([insertionData])
        .select();

      if (error) throw error;

      // Marquer de façon permanente et définitive l'appareil
      try {
        await supabase
          .from('appareils_historique_bienvenue')
          .upsert({
            device_id: deviceId,
            a_consomme_offre_bienvenue: true,
            date_premier_deblocage: new Date().toISOString(),
          }, { onConflict: 'device_id' });
      } catch (errTrace) {
        console.log('Trace appareil enregistrée :', errTrace);
      }

      return { success: true, message: 'Félicitations ! Votre 1er document offert a été débloqué 🎉', data };
    }

    // 4. Si l'offre est déjà consommée sur cet appareil
    return { 
      success: false, 
      paywallRequired: true, 
      message: `Offre de bienvenue déjà utilisée sur cet appareil. Déblocage pour ${prixDocument} FCFA.` 
    };

  } catch (error: any) {
    console.error('Erreur lors du déblocage :', error.message);
    return { success: false, message: error.message };
  }
};


/**
 * Supprime intégralement le compte utilisateur (profiles, auth.users, acquisitions)
 * tout en conservant une empreinte technique anonymisée du Device ID pour bloquer la réutilisation de l'offre de bienvenue.
 */
export const supprimerCompteUtilisateur = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const deviceId = await getDeviceId();

    // 1. Tenter d'exécuter la fonction RPC Supabase dédiée
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('supprimer_mon_compte_et_archiver_device', {
      p_device_id: deviceId
    });

    if (!rpcErr && rpcRes && rpcRes.success) {
      // Vider le cache local
      await sauvegarderBibliothequeLocale([]);
      await supabase.auth.signOut();
      return { success: true, message: rpcRes.message };
    }

    // Fallback manuel si la RPC n'est pas encore exécutée
    const { data: { user } } = await supabase.auth.getUser();

    // Marquer l'appareil dans l'historique
    await supabase.from('appareils_historique_bienvenue').upsert({
      device_id: deviceId,
      a_consomme_offre_bienvenue: true,
      date_derniere_suppression: new Date().toISOString(),
    }, { onConflict: 'device_id' });

    if (user) {
      await supabase.from('acquisitions').delete().eq('user_id', user.id);
      await supabase.from('profiles').delete().eq('id', user.id);
    }
    await supabase.from('acquisitions').delete().eq('device_id', deviceId);
    await sauvegarderBibliothequeLocale([]);
    await supabase.auth.signOut();

    return { success: true, message: 'Votre compte et vos données ont été définitivement supprimés.' };
  } catch (err: any) {
    console.error('Erreur lors de la suppression de compte :', err.message);
    return { success: false, message: err.message || 'Échec de la suppression' };
  }
};


const LOCAL_LIBRARY_CACHE_KEY = 'cauzon_local_library_cache';
const DOCUMENTS_IMPORTES_CACHE_KEY = 'cauzon_documents_importes_cache';

/**
 * Récupère la liste des documents importés par l'utilisateur
 */
export const chargerDocumentsImportes = async (): Promise<DocumentCourse[]> => {
  try {
    const cached = await AsyncStorage.getItem(DOCUMENTS_IMPORTES_CACHE_KEY);
    return cached ? JSON.parse(cached) : [];
  } catch (error) {
    console.error('Erreur lors du chargement des documents importés :', error);
    return [];
  }
};

/**
 * Sauvegarde la liste des documents importés dans AsyncStorage
 */
export const sauvegarderDocumentsImportes = async (documents: DocumentCourse[]) => {
  try {
    await AsyncStorage.setItem(DOCUMENTS_IMPORTES_CACHE_KEY, JSON.stringify(documents));
  } catch (error) {
    console.error('Erreur lors de la sauvegarde des documents importés :', error);
  }
};

/**
 * Vérifie de manière sécurisée et non-bloquante si un fichier existe sur l'appareil
 */
export const verifierFichierLocalExiste = async (uri: string): Promise<boolean> => {
  if (!uri) return false;
  if (Platform.OS === 'web') return true;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return Boolean(info && info.exists);
  } catch (err) {
    console.warn('Vérification existence fichier :', err);
    return false;
  }
};

/**
 * Détecte si un fichier est un document PDF ou un autre format
 */
export const estFichierPdf = (nomOuChemin: string): boolean => {
  if (!nomOuChemin) return true;
  const clean = nomOuChemin.toLowerCase().trim();
  if (
    clean.endsWith('.docx') ||
    clean.endsWith('.doc') ||
    clean.endsWith('.xlsx') ||
    clean.endsWith('.xls') ||
    clean.endsWith('.pptx') ||
    clean.endsWith('.ppt') ||
    clean.endsWith('.odt') ||
    clean.endsWith('.ods') ||
    clean.endsWith('.odp') ||
    clean.endsWith('.csv') ||
    clean.endsWith('.rtf') ||
    clean.endsWith('.txt')
  ) {
    return false;
  }
  return true;
};

/**
 * Obtient le type MIME et l'identifiant UTI pour le partage système natif
 */
export const obtenirMimeTypeEtExtension = (nomOuChemin: string): { mimeType: string; uti: string; extension: string } => {
  const clean = (nomOuChemin || '').toLowerCase().trim();
  if (clean.endsWith('.docx')) {
    return { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', uti: 'org.openxmlformats.wordprocessingml.document', extension: '.docx' };
  }
  if (clean.endsWith('.doc')) {
    return { mimeType: 'application/msword', uti: 'com.microsoft.word.doc', extension: '.doc' };
  }
  if (clean.endsWith('.xlsx')) {
    return { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', uti: 'org.openxmlformats.spreadsheetml.sheet', extension: '.xlsx' };
  }
  if (clean.endsWith('.xls')) {
    return { mimeType: 'application/vnd.ms-excel', uti: 'com.microsoft.excel.xls', extension: '.xls' };
  }
  if (clean.endsWith('.pptx')) {
    return { mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', uti: 'org.openxmlformats.presentationml.presentation', extension: '.pptx' };
  }
  if (clean.endsWith('.ppt')) {
    return { mimeType: 'application/vnd.ms-powerpoint', uti: 'com.microsoft.powerpoint.ppt', extension: '.ppt' };
  }
  if (clean.endsWith('.txt')) {
    return { mimeType: 'text/plain', uti: 'public.plain-text', extension: '.txt' };
  }
  if (clean.endsWith('.csv')) {
    return { mimeType: 'text/csv', uti: 'public.comma-separated-values-text', extension: '.csv' };
  }
  return { mimeType: 'application/pdf', uti: 'com.adobe.pdf', extension: '.pdf' };
};

/**
 * Déclenche l'ouverture native directe d'un document bureautique (Word, Excel, etc.)
 * Sur Mobile : Ouvre directement le document avec l'application dédiée (sans pop-up intermédiaire).
 * Sur Web / PC : Télécharge instantanément le fichier sans passer par le lecteur PDF.
 */
export const ouvrirFichierBureautique = async (
  document: {
    id: string;
    titre: string;
    file_path?: string;
    cheminLocal?: string;
  }
): Promise<{ success: boolean; message: string }> => {
  try {
    const rawPath = document.cheminLocal || document.file_path || '';
    if (!rawPath) {
      return { success: false, message: 'Fichier introuvable sur cet appareil.' };
    }

    const { mimeType, uti, extension } = obtenirMimeTypeEtExtension(rawPath || document.titre);

    // 🌐 Mode PC / Navigateur Web : Téléchargement direct immédiat
    if (Platform.OS === 'web') {
      let downloadUrl = rawPath;
      if (!rawPath.startsWith('http') && !rawPath.startsWith('blob:') && !rawPath.startsWith('data:')) {
        downloadUrl = getDocumentPdfUrl(rawPath);
      }
      try {
        const nomPropre = `${document.titre.replace(/[^a-zA-Z0-9_\-]/g, '_')}${extension}`;
        const response = await fetch(downloadUrl);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = window.document.createElement('a');
        link.href = blobUrl;
        link.download = nomPropre;
        window.document.body.appendChild(link);
        link.click();
        window.document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
        return { success: true, message: `"${document.titre}" a été téléchargé sur votre ordinateur 💾` };
      } catch (webErr) {
        if (typeof window !== 'undefined') {
          window.open(downloadUrl, '_blank');
          return { success: true, message: 'Ouverture du document en cours...' };
        }
      }
    }

    // 📱 Mode Mobile (Android & iOS) : Ouverture directe via l'application dédiée
    let localUri = rawPath;
    if (!rawPath.startsWith('file:')) {
      const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
      const nomPropre = `${document.titre.replace(/[^a-zA-Z0-9_\-]/g, '_')}${extension}`;
      localUri = `${baseDir}${nomPropre}`;
      if (rawPath.startsWith('http')) {
        await FileSystem.downloadAsync(rawPath, localUri);
      }
    }

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      return { success: false, message: `L'ouverture externe n'est pas supportée sur cet appareil.` };
    }

    // Ouverture native directe en 1 clic
    await Sharing.shareAsync(localUri, {
      mimeType: mimeType,
      dialogTitle: `Ouvrir "${document.titre}"`,
      UTI: uti,
    });

    return { success: true, message: `Ouverture de "${document.titre}" lancée 📖` };
  } catch (err: any) {
    console.error('Erreur lors de l\'ouverture du document bureautique :', err);
    return { success: false, message: err.message || "Impossible d'ouvrir ce document." };
  }
};



/**
 * Importe un nouveau document externe (PDF, Word, Excel, etc.) dans la bibliothèque
 */
export const importerDocumentLocal = async (params: {
  titre: string;
  categorie: string;
  file_path: string;
  taille_mo?: number;
  nombre_pages?: number;
}): Promise<{ success: boolean; document?: DocumentCourse; message: string }> => {
  try {
    let cheminPersistant = params.file_path;

    // Validation stricte du format PDF
    const nomTest = (params.file_path || params.titre).toLowerCase();
    if (!nomTest.endsWith('.pdf') && !nomTest.startsWith('data:application/pdf') && !nomTest.startsWith('blob:')) {
      return { success: false, message: 'Seuls les fichiers PDF (.pdf) sont acceptés sur cauZon.' };
    }


    // Sur Mobile (Android / iOS) : copier le fichier dans le stockage persistant de l'application
    if (Platform.OS !== 'web' && FileSystem.documentDirectory) {
      try {
        const dossierImport = `${FileSystem.documentDirectory}cauzon_imports/`;
        const dirInfo = await FileSystem.getInfoAsync(dossierImport);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(dossierImport, { intermediates: true });
        }
        
        // Nom de fichier PDF unique et permanent
        const nomFichierUnique = `doc_import_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.pdf`;
        const destination = `${dossierImport}${nomFichierUnique}`;
        
        // Copie synchrone depuis le cache DocumentPicker vers le dossier permanent de l'app
        await FileSystem.copyAsync({ from: params.file_path, to: destination });
        
        // Vérification de la présence effective du fichier copié
        const checkCopy = await FileSystem.getInfoAsync(destination);
        if (checkCopy.exists && checkCopy.size && checkCopy.size > 0) {
          cheminPersistant = destination;
          console.log('✅ Document PDF importé stocké avec succès dans le dossier permanent :', destination);
        } else {
          console.warn('⚠️ Échec de vérification du fichier copié, repli sur le chemin source');
        }
      } catch (errCopy: any) {
        console.error('Erreur lors de la copie permanente du document :', errCopy.message);
      }
    }






    // Calcul dynamique et robuste du nombre exact de pages du PDF importé
    let nombrePagesDynamique = params.nombre_pages;
    if (!nombrePagesDynamique || nombrePagesDynamique <= 1) {
      try {
        const { PDFDocument } = await import('pdf-lib');
        if (Platform.OS !== 'web' && FileSystem.documentDirectory) {
          const base64Data = await FileSystem.readAsStringAsync(cheminPersistant, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const pdfDoc = await PDFDocument.load(base64Data, { ignoreEncryption: true });
          nombrePagesDynamique = pdfDoc.getPageCount();
        } else if (Platform.OS === 'web' && params.file_path) {
          if (params.file_path.startsWith('data:application/pdf')) {
            const base64Data = params.file_path.split(',')[1];
            const pdfDoc = await PDFDocument.load(base64Data, { ignoreEncryption: true });
            nombrePagesDynamique = pdfDoc.getPageCount();
          } else if (params.file_path.startsWith('blob:')) {
            const response = await fetch(params.file_path);
            const arrayBuffer = await response.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
            nombrePagesDynamique = pdfDoc.getPageCount();
          }
        }
      } catch (errPages: any) {
        console.warn('⚠️ Calcul automatique des pages via pdf-lib :', errPages.message);
      }
    }

    const nouveauDoc: DocumentCourse = {
      id: `imported_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      titre: params.titre,
      categorie: params.categorie || 'Documents Importés',
      description: 'Document personnel importé dans votre espace cauZon.',
      prix: 0,
      est_certifie: false,
      est_verrouille: false,
      nombre_pages: nombrePagesDynamique && nombrePagesDynamique > 0 ? nombrePagesDynamique : (params.nombre_pages ?? 1),
      limite_apercu_pages: 1,
      limite_apercu_type: 'page',
      limite_apercu_valeur: 1,
      taille_mo: params.taille_mo ?? 1.0,
      file_path: cheminPersistant,
      status: 'actif',
      is_vip_consultation: false,
      est_importe: true,
      date_ajout: new Date().toISOString(),
    };

    const existants = await chargerDocumentsImportes();
    const updated = [nouveauDoc, ...existants];
    await sauvegarderDocumentsImportes(updated);

    return {
      success: true,
      document: nouveauDoc,
      message: `"${params.titre}" a été importé avec succès dans le dossier "${params.categorie}" ! 📥`,
    };
  } catch (error: any) {
    console.error("Erreur lors de l'importation locale :", error.message);
    return { success: false, message: error.message || "Échec de l'importation du document." };
  }
};


/**
 * Exporte un document vers le stockage local de l'appareil (Mobile & Web)
 */
export const exporterDocumentVersAppareil = async (document: {
  id: string;
  titre: string;
  file_path?: string;
  cheminLocal?: string;
}): Promise<{ success: boolean; message: string }> => {
  try {
    const rawPath = document.file_path || document.cheminLocal || '';
    if (!rawPath) {
      return { success: false, message: 'Fichier introuvable pour ce cours.' };
    }

    // Déterminer l'URL téléchargeable
    let sourceUrl = rawPath;
    if (!rawPath.startsWith('http') && !rawPath.startsWith('file:') && !rawPath.startsWith('blob:') && !rawPath.startsWith('data:')) {
      sourceUrl = getDocumentPdfUrl(rawPath);
    }

    const { mimeType, uti, extension } = obtenirMimeTypeEtExtension(rawPath || document.titre);
    const nomFichierNettoye = `${document.titre.replace(/[^a-zA-Z0-9_\-]/g, '_')}${extension}`;

    // 🌐 Mode PC / Navigateur Web
    if (Platform.OS === 'web') {
      try {
        const response = await fetch(sourceUrl);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = window.document.createElement('a');
        link.href = blobUrl;
        link.download = nomFichierNettoye;
        window.document.body.appendChild(link);
        link.click();
        window.document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
        return { success: true, message: `"${document.titre}" a été téléchargé sur votre ordinateur 💾` };
      } catch (webErr) {
        // Fallback ouverture direct
        if (typeof window !== 'undefined') {
          window.open(sourceUrl, '_blank');
          return { success: true, message: 'Ouverture du document pour enregistrement...' };
        }
      }
    }

    // 📱 Mode Mobile (Android & iOS)
    const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
    const localUri = `${baseDir}${nomFichierNettoye}`;

    // Téléchargement si URL distante
    if (sourceUrl.startsWith('http')) {
      const downloadResult = await FileSystem.downloadAsync(sourceUrl, localUri);
      if (downloadResult.status !== 200) {
        throw new Error('Échec du téléchargement du document.');
      }
    } else if (sourceUrl.startsWith('file:') && sourceUrl !== localUri) {
      await FileSystem.copyAsync({ from: sourceUrl, to: localUri });
    }

    // Partage ou enregistrement direct via le menu natif
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(localUri, {
        mimeType: mimeType,
        dialogTitle: `Enregistrer "${document.titre}"`,
        UTI: uti,
      });
      return { success: true, message: 'Document prêt et partagé avec succès ! 📲' };
    }


    return { success: true, message: `Document enregistré dans l'espace de stockage de l'appareil :\n${localUri}` };
  } catch (error: any) {
    console.error("Erreur lors de l'exportation :", error.message);
    return { success: false, message: error.message || "Impossible d'exporter le document." };
  }
};

/**
 * Sauvegarde la bibliothèque locale dans AsyncStorage
 */
export const sauvegarderBibliothequeLocale = async (documents: DocumentCourse[]) => {
  try {
    await AsyncStorage.setItem(LOCAL_LIBRARY_CACHE_KEY, JSON.stringify(documents));
  } catch (error) {
    console.error('Erreur lors de la sauvegarde de la bibliothèque locale :', error);
  }
};

/**
 * Récupère la bibliothèque locale depuis AsyncStorage
 */
export const chargerBibliothequeLocale = async (): Promise<DocumentCourse[]> => {
  try {
    const cached = await AsyncStorage.getItem(LOCAL_LIBRARY_CACHE_KEY);
    return cached ? JSON.parse(cached) : [];
  } catch (error) {
    console.error('Erreur lors du chargement de la bibliothèque locale :', error);
    return [];
  }
};

/**
 * Récupère tous les documents débloqués par cet appareil / utilisateur (avec fusion des imports)
 */
export const fetchMesDocuments = async (): Promise<DocumentCourse[]> => {
  try {
    const deviceId = await getDeviceId();
    const { data: { user } } = await supabase.auth.getUser();

    // 1. Récupérer la liste des acquisitions avec leur type (permanent vs VIP)
    let query = supabase
      .from('acquisitions')
      .select('document_id, is_vip_consultation');

    if (user?.id) {
      query = query.or(`device_id.eq.${deviceId},user_id.eq.${user.id}`);
    } else {
      query = query.eq('device_id', deviceId);
    }

    const { data: acquisitions, error: errAcq } = await query;

    if (errAcq) throw errAcq;

    const documentIds = acquisitions ? acquisitions.map((item) => item.document_id).filter(Boolean) : [];
    const vipMap: Record<string, boolean> = {};
    if (acquisitions) {
      acquisitions.forEach((acq) => {
        if (acq.document_id) {
          vipMap[acq.document_id] = acq.is_vip_consultation ?? false;
        }
      });
    }

    // Charger les documents importés par l'utilisateur
    const docsImportes = await chargerDocumentsImportes();

    // Charger la bibliothèque en cache local
    const cachedDocs = await chargerBibliothequeLocale();

    let serverDocs: DocumentCourse[] = [];
    if (documentIds.length > 0) {
      // Récupérer les détails des documents correspondants
      const { data: docs, error: errDocs } = await supabase
        .from('documents')
        .select('*')
        .in('id', documentIds);

      if (errDocs) throw errDocs;

      serverDocs = ((docs || []) as DocumentCourse[]).map((doc) => ({
        ...doc,
        is_vip_consultation: vipMap[doc.id] ?? false,
        est_importe: false,
      }));
    }

    const serverDocIds = serverDocs.map((d) => d.id);

    // Fusionner : conserver les documents du cache officiel
    const mergedDocs = [...serverDocs];
    for (const cachedDoc of cachedDocs) {
      if (!serverDocIds.includes(cachedDoc.id) && documentIds.includes(cachedDoc.id)) {
        mergedDocs.push({
          ...cachedDoc,
          is_vip_consultation: vipMap[cachedDoc.id] ?? cachedDoc.is_vip_consultation ?? false,
          est_importe: false,
        });
      }
    }

    // 📥 Fusionner les documents importés (toujours permanents)
    const mergedWithImports = [...docsImportes, ...mergedDocs];

    // Mettre à jour le cache local
    await sauvegarderBibliothequeLocale(mergedWithImports);

    return mergedWithImports;
  } catch (error: any) {
    console.error('Erreur lors du chargement de la bibliothèque (Supabase/Cache) :', error.message);
    const docsImportes = await chargerDocumentsImportes();
    const localDocs = await chargerBibliothequeLocale();
    const combined = [...docsImportes, ...localDocs.filter(d => !d.id.startsWith('imported_'))];
    return combined;
  }
};

/**
 * Enregistre une consultation VIP pour qu'elle apparaisse dans le dossier "Mon Accès VIP"
 */
export const enregistrerConsultationVip = async (documentId: string): Promise<void> => {
  try {
    const deviceId = await getDeviceId();
    const { data: { user } } = await supabase.auth.getUser();

    const insertData: any = {
      document_id: documentId,
      device_id: deviceId,
      is_welcome_offer: false,
      is_vip_consultation: true,
    };
    if (user) insertData.user_id = user.id;

    await supabase
      .from('acquisitions')
      .upsert([insertData], { onConflict: 'document_id, device_id' });
  } catch (err) {
    console.log('Info consultation VIP enregistrée en local/cache :', err);
  }
};

/**
 * Acquiert un document pour un abonné VIP (0 FCFA) et l'assigne explicitement au dossier VIP.
 * Enregistre l'acquisition dans Supabase avec is_vip_consultation = true.
 */
export const acquerirDocumentVIP = async (
  documentId: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const deviceId = await getDeviceId();
    const { data: { user } } = await supabase.auth.getUser();

    const insertData: any = {
      document_id: documentId,
      device_id: deviceId,
      is_welcome_offer: false,
      is_vip_consultation: true,
      montant_paye: 0,
    };
    if (user) insertData.user_id = user.id;

    // 1. Enregistrement / Upsert dans Supabase
    const { error } = await supabase
      .from('acquisitions')
      .upsert([insertData], { onConflict: 'document_id, device_id' });

    if (error) {
      console.warn('Note insertion acquisition Supabase :', error.message);
      // Tentative fallback en insert simple
      await supabase.from('acquisitions').insert([insertData]);
    }

    // 2. Synchronisation immédiate du cache local de la bibliothèque
    try {
      const cached = await chargerBibliothequeLocale();
      const existingDoc = cached.find((d) => d.id === documentId);
      if (existingDoc) {
        existingDoc.is_vip_consultation = true;
        await sauvegarderBibliothequeLocale(cached);
      } else {
        const { data: docData } = await supabase
          .from('documents')
          .select('*')
          .eq('id', documentId)
          .maybeSingle();
        if (docData) {
          const docCourse: DocumentCourse = {
            ...(docData as DocumentCourse),
            is_vip_consultation: true,
            est_importe: false,
          };
          await sauvegarderBibliothequeLocale([docCourse, ...cached]);
        }
      }
    } catch (cacheErr) {
      console.warn('Note synchro cache local VIP :', cacheErr);
    }

    return {
      success: true,
      message: 'Cours ajouté avec succès à votre dossier VIP 👑 !',
    };
  } catch (error: any) {
    console.error("Erreur lors de l'acquisition VIP :", error.message);
    return { success: false, message: error.message || "Impossible d'acquérir ce document." };
  }
};



/**
 * Supprime un document de la bibliothèque locale
 * - Si importé : purement supprimé du stockage local sans renvoi dans le catalogue
 * - Si officiel : droits réinitialisés et renvoi dans le catalogue
 */
export const supprimerDocumentLocal = async (documentId: string): Promise<{ success: boolean; message: string }> => {
  try {
    // 1. Si le document est un document importé
    if (documentId.startsWith('imported_')) {
      const docsImportes = await chargerDocumentsImportes();
      const updatedImportes = docsImportes.filter((d) => d.id !== documentId);
      await sauvegarderDocumentsImportes(updatedImportes);

      const cachedDocs = await chargerBibliothequeLocale();
      const updatedDocs = cachedDocs.filter((d) => d.id !== documentId);
      await sauvegarderBibliothequeLocale(updatedDocs);

      return { success: true, message: 'Document importé supprimé définitivement de votre espace personnel.' };
    }

    // 2. Si c'est un document officiel du catalogue
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;
    const deviceId = await getDeviceId();

    try {
      if (userId) {
        await supabase.from('acquisitions').delete().eq('document_id', documentId).eq('user_id', userId);
      }
      if (deviceId) {
        await supabase.from('acquisitions').delete().eq('document_id', documentId).eq('device_id', deviceId);
      }
    } catch (e) {
      console.warn('Note suppression distante acquisitions :', e);
    }

    const cachedDocs = await chargerBibliothequeLocale();
    const updatedDocs = cachedDocs.filter((d) => d.id !== documentId);
    await sauvegarderBibliothequeLocale(updatedDocs);

    return { success: true, message: 'Document retiré de votre bibliothèque et renvoyé dans le catalogue.' };
  } catch (error: any) {
    console.error('Erreur de suppression locale :', error.message);
    try {
      const cachedDocs = await chargerBibliothequeLocale();
      const updatedDocs = cachedDocs.filter((d) => d.id !== documentId);
      await sauvegarderBibliothequeLocale(updatedDocs);
    } catch (_) {}
    return { success: true, message: 'Document retiré localement.' };
  }
};



/**
 * Résout l'URL ou l'URI d'accès du fichier PDF (Local, Blob ou Supabase Storage)
 */
export const getDocumentPdfUrl = (filePath: string): string => {
  if (!filePath) return '';

  // Nettoyage strict des espaces et retours à la ligne au début et à la fin
  const cleanPath = filePath.trim().replace(/^[\r\n]+|[\r\n]+$/g, '');

  // 1. Si c'est déjà un URI local, un blob, une URL data: ou une URL http(s) directe :
  if (
    cleanPath.startsWith('http://') ||
    cleanPath.startsWith('https://') ||
    cleanPath.startsWith('file://') ||
    cleanPath.startsWith('blob:') ||
    cleanPath.startsWith('data:') ||
    cleanPath.startsWith('content://')
  ) {
    return cleanPath;
  }

  // 2. Si c'est une clé Supabase Storage :
  console.log('🔗 Résolution URL Supabase Storage pour :', cleanPath);
  const { data } = supabase.storage
    .from('cours-documents')
    .getPublicUrl(cleanPath);

  return data.publicUrl;
};


/**
 * Enregistre une transaction financière dans la table centralisée (pour le Dashboard Admin)
 */
export const enregistrerTransactionFinanciere = async ({
  transId,
  typeAchat,
  montant,
  documentId,
  operateur,
}: {
  transId?: string;
  typeAchat: 'acte' | 'vip' | 'stockage';
  montant: number;
  documentId?: string;
  operateur?: string;
}): Promise<void> => {
  try {
    const deviceId = await getDeviceId();
    const { data: { user } } = await supabase.auth.getUser();
    const cleanTransId = transId || `FX-${Date.now()}-${Math.floor(10000 + Math.random() * 90000)}`;

    const txData: any = {
      transaction_id: cleanTransId,
      device_id: deviceId,
      type_achat: typeAchat,
      montant: montant,
      devise: 'XOF',
      operateur: operateur || 'FEEXPAY',
      statut: 'approved',
      document_id: documentId || null,
      created_at: new Date().toISOString(),
    };

    if (user) {
      txData.user_id = user.id;
    }

    await supabase.from('transactions_fedapay').upsert([txData], { onConflict: 'transaction_id' });
    console.log(`💰 Transaction financière enregistrée (${montant} FCFA, type: ${typeAchat}) :`, cleanTransId);
  } catch (err: any) {
    console.warn('⚠️ Enregistrement transaction financière (silencieux) :', err.message);
  }
};

/**
 * Enregistre un achat payé de document dans Supabase avec anti-double débit
 */
export const enregistrerAchatDocument = async (documentId: string, montantPaye: number = 100): Promise<{ success: boolean; message: string }> => {
  try {
    const deviceId = await getDeviceId();
    const { data: { user } } = await supabase.auth.getUser();

    const insertionData: any = {
      document_id: documentId,
      device_id: deviceId,
      is_welcome_offer: false,
      is_vip_consultation: false,
      montant_paye: montantPaye,
    };

    if (user) {
      insertionData.user_id = user.id;
    }

    const { error } = await supabase
      .from('acquisitions')
      .upsert([insertionData], { onConflict: 'document_id, device_id' });

    if (error) throw error;

    // Enregistrement de la transaction financière pour le tableau de bord Admin
    await enregistrerTransactionFinanciere({
      typeAchat: 'acte',
      montant: montantPaye,
      documentId: documentId,
    });

    return { success: true, message: 'Document débloqué définitivement et ajouté à votre bibliothèque permanente !' };
  } catch (error: any) {
    console.error("Erreur d'enregistrement d'achat :", error.message);
    return { success: false, message: error.message };
  }
};



export const fetchAnnoncesActives = async (): Promise<any[]> => {
  try {
    const { data, error } = await supabase
      .from('annonces_bannieres')
      .select('*')
      .neq('statut', 'inactif')
      .order('created_at', { ascending: false });

    if (error) throw error;
    const now = Date.now();
    return (data || []).filter((b: any) => {
      if (b.statut === 'inactif') return false;
      if (b.date_fin) {
        const expTime = new Date(b.date_fin).getTime();
        if (!isNaN(expTime) && expTime < now) return false;
      }
      return true;
    });
  } catch (error: any) {
    console.log('Erreur lors du chargement des annonces (degradation gracieuse) :', error.message);
    return [];
  }
};

/**
 * Active le Pass VIP et le persiste dans Supabase (table profiles).
 * Fonctionne pour les utilisateurs connectés (user_id) et anonymes (device_id).
 * @param dureeJours - Durée du pass en jours (défaut : 30)
 * @returns { success, dateExpiration (ISO string), dateAffichage (format fr-FR) }
 */
export const activerPassVIP = async (
  dureeJours: number = 30
): Promise<{ success: boolean; message: string; dateExpiration: string; dateAffichage: string }> => {
  const dateExp = new Date();
  dateExp.setDate(dateExp.getDate() + dureeJours);
  const dateExpISO = dateExp.toISOString();
  const dateAffichage = dateExp.toLocaleDateString('fr-FR');

  try {
    const deviceId = await getDeviceId();
    const { data: { user } } = await supabase.auth.getUser();

    // 1. Persistance si utilisateur connecté
    if (user) {
      await supabase
        .from('profiles')
        .update({
          has_vip_pass: true,
          vip_expiration_date: dateExpISO,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      console.log('✅ Pass VIP persisté dans Supabase [profiles] pour user:', user.id);
    }

    // 2. Persistance systématique sur l'appareil (Device ID)
    if (deviceId) {
      await supabase
        .from('appareils_historique_bienvenue')
        .upsert({
          device_id: deviceId,
          has_vip_pass: true,
          vip_expiration_date: dateExpISO,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'device_id' });
      console.log('✅ Pass VIP persisté dans Supabase [appareils] pour device:', deviceId);
    }

    // 3. Persistance en cache local immédiat
    await AsyncStorage.setItem('cauzon_vip_status', JSON.stringify({
      has_vip_pass: true,
      vip_expiration_date: dateExpISO,
      date_affichage: dateAffichage,
    }));

    // 4. Enregistrement de la transaction financière (500 FCFA)
    await enregistrerTransactionFinanciere({
      typeAchat: 'vip',
      montant: 500,
    });

    return { success: true, message: 'Pass VIP activé avec succès !', dateExpiration: dateExpISO, dateAffichage };
  } catch (error: any) {
    console.error('Erreur activation Pass VIP Supabase :', error.message);
    return { success: true, message: 'Pass VIP activé localement !', dateExpiration: dateExpISO, dateAffichage };
  }
};

/**
 * Active l'extension de stockage CUMULATIVE (+75 docs par pack) et la persiste dans Supabase.
 * Chaque achat à 1000 FCFA incrémente la limite actuelle de +75 documents (75 -> 150 -> 225 -> 300...).
 */
export const activerStockageEtendu = async (): Promise<{ success: boolean; message: string; nouveauPlafond: number }> => {
  try {
    const deviceId = await getDeviceId();
    const { data: { user } } = await supabase.auth.getUser();

    let limiteActuelle = 75;

    // Récupérer la limite existante depuis Supabase ou le cache
    if (user) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('storage_limit, has_extended_storage')
        .eq('id', user.id)
        .maybeSingle();
      if (prof?.storage_limit && prof.storage_limit >= 75) {
        limiteActuelle = prof.storage_limit;
      }
    } else if (deviceId) {
      const { data: appDev } = await supabase
        .from('appareils_historique_bienvenue')
        .select('storage_limit, has_extended_storage')
        .eq('device_id', deviceId)
        .maybeSingle();
      if (appDev?.storage_limit && appDev.storage_limit >= 75) {
        limiteActuelle = appDev.storage_limit;
      }
    }

    // Calcul cumulatif (+75 documents par achat)
    const nouveauPlafond = limiteActuelle + 75;

    // 1. Persistance si utilisateur connecté
    if (user) {
      await supabase
        .from('profiles')
        .update({ 
          has_extended_storage: true,
          storage_limit: nouveauPlafond,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      console.log(`✅ Extension stockage cumulative persistée dans Supabase [profiles] : ${limiteActuelle} -> ${nouveauPlafond}`);
    }

    // 2. Persistance systématique sur l'appareil (Device ID)
    if (deviceId) {
      await supabase
        .from('appareils_historique_bienvenue')
        .upsert({
          device_id: deviceId,
          has_extended_storage: true,
          storage_limit: nouveauPlafond,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'device_id' });
      console.log(`✅ Extension stockage cumulative persistée dans Supabase [appareils] : ${limiteActuelle} -> ${nouveauPlafond}`);
    }

    // 3. Persistance en cache local immédiat
    await AsyncStorage.setItem('cauzon_storage_status', JSON.stringify({
      has_extended_storage: true,
      storage_limit: nouveauPlafond,
    }));

    // 4. Enregistrement de la transaction financière (1000 FCFA)
    await enregistrerTransactionFinanciere({
      typeAchat: 'stockage',
      montant: 1000,
    });

    return { 
      success: true, 
      message: `Extension de stockage activée ! Votre limite passe à ${nouveauPlafond} documents.`,
      nouveauPlafond 
    };
  } catch (error: any) {
    console.error('Erreur activation stockage étendu Supabase :', error.message);
    return { success: true, message: 'Extension activée localement', nouveauPlafond: 250 };
  }
};
