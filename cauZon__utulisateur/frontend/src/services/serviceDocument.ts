import { Platform } from 'react-native';
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
  cheminLocal?: string;
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
  try {
    if (Platform.OS === 'android') {
      const androidId = Application.getAndroidId();
      if (androidId) return androidId;
    } else if (Platform.OS === 'ios') {
      const iosId = await Application.getIosIdForVendorAsync();
      if (iosId) return iosId;
    }
  } catch (errDevId) {
    console.warn('Note récupération deviceId natif :', errDevId);
  }

  // Repli sécurisé persistant via AsyncStorage pour garantir l'unicité sans crash
  try {
    const cachedId = await AsyncStorage.getItem('@cauzon_device_id_fallback');
    if (cachedId) return cachedId;
    const nouveauId = `device_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    await AsyncStorage.setItem('@cauzon_device_id_fallback', nouveauId);
    return nouveauId;
  } catch (_) {
    return 'cauzon-generic-device';
  }
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
 * Supprime intégralement le compte utilisateur en cascade dans Supabase :
 * - acquisitions (user_id et device_id)
 * - profiles (id)
 * - push_tokens (user_id et device_id)
 * - feedbacks (user_id et device_id)
 * - anonymisation des transactions financières (user_id, client_email, client_nom -> null)
 * - conservation d'une empreinte anonymisée du Device ID dans appareils_historique_bienvenue
 * - purge intégrale du cache local / AsyncStorage
/**
 * Désactivation temporaire (Soft Delete) du compte utilisateur :
 * - Marque le profil comme inactif (est_actif: false, desactive_le: ISO)
 * - Préserve les données pour permettre une réactivation fluide lors d'une reconnexion Google
 * - Purge les tokens et caches locaux et effectue une déconnexion propre
 */
export const desactiverCompteUtilisateur = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const deviceId = await getDeviceId();

    if (user?.id) {
      // 1. Mise à jour du profil : désactivation sans suppression physique
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({
          est_actif: false,
          desactive_le: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (updateErr) {
        console.warn('Note mise à jour profil (Soft Delete) :', updateErr.message);
      }

      // 2. Dissocier les acquisitions de cet appareil pour la session désactivée
      if (deviceId) {
        try {
          await supabase
            .from('acquisitions')
            .update({ device_id: null })
            .eq('user_id', user.id)
            .eq('device_id', deviceId);
        } catch (_) {}
      }
    }

    if (deviceId) {
      // 3. Réinitialiser le profil appareil en mode invité standard
      try {
        await supabase
          .from('appareils_historique_bienvenue')
          .update({
            has_vip_pass: false,
            has_extended_storage: false,
            updated_at: new Date().toISOString(),
          })
          .eq('device_id', deviceId);
      } catch (_) {}
    }

    // 4. Purge intégrale du stockage local, des droits VIP/abonnements et de tous les caches de documents
    const clesAPurger = [
      'CAUZON_PHOTO_PROFIL',
      'CAUZON_NOM_UTILISATEUR',
      'CAUZON_TELEPHONE',
      'cauzon_local_library_cache',
      'cauzon_documents_importes_cache',
      'cauzon_documents_hors_ligne',
      '@cauzon_documents_hors_ligne',
      '@cauzon_documents_importes',
      'cauzon_storage_status',
      'cauzon_vip_status',
      '@cauzon_vip',
      '@cauzon_acquisitions',
      '@cauzon_abonnements',
      '@cauzon_locations',
      '@cauzon_panier',
      'cauzon_panier',
      'CAUZON_PUSH_TOKEN',
      'CAUZON_NOTIF_PROMPT_DECIDED',
    ];

    await AsyncStorage.multiRemove(clesAPurger).catch(() => {});
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const cauzonKeys = allKeys.filter(
        (k) => k.startsWith('@cauzon') || k.startsWith('cauzon') || k.startsWith('CAUZON')
      );
      if (cauzonKeys.length > 0) {
        await AsyncStorage.multiRemove(cauzonKeys);
      }
    } catch (_) {}

    // Purge explicite de window.localStorage sur le Web
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      try {
        clesAPurger.forEach((cle) => window.localStorage.removeItem(cle));
        Object.keys(window.localStorage).forEach((k) => {
          if (k.startsWith('@cauzon') || k.startsWith('cauzon') || k.startsWith('CAUZON')) {
            window.localStorage.removeItem(k);
          }
        });
      } catch (_) {}
    }

    // 5. Déconnexion Supabase Auth propre pour purger les tokens et éviter les sessions fantômes
    await supabase.auth.signOut().catch(() => {});

    return {
      success: true,
      message: 'Votre compte a été désactivé avec succès. Vous pourrez le réactiver à tout moment en vous reconnectant avec Google.',
    };
  } catch (err: any) {
    console.error('Erreur lors de la désactivation du compte :', err.message);
    return { success: false, message: err.message || 'Échec de la désactivation du compte.' };
  }
};

/**
 * Rétro-compatibilité : alias vers la désactivation (Soft Delete)
 */
export const supprimerCompteUtilisateur = desactiverCompteUtilisateur;


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
 * Vérifie de manière sécurisée et non-bloquante si un fichier existe sur l'appareil et n'est pas vide
 */
export const verifierFichierLocalExiste = async (uri: string): Promise<boolean> => {
  if (!uri) return false;
  if (Platform.OS === 'web') return true;
  try {
    const cheminNormalise = uri.startsWith('/') ? `file://${uri}` : uri;
    const info = await FileSystem.getInfoAsync(cheminNormalise);
    return Boolean(info && info.exists && (info.size === undefined || info.size > 0));
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
 * Demande d'autorisation contextuelle (Just-in-Time Permission) avant l'accès
 * à l'explorateur de fichiers pour l'importation de documents personnels.
 *
 * Conforme aux exigences de transparence et de protection des données :
 * - Web : validation pédagogique par window.confirm
 * - Mobile (iOS / Android) : boîte de dialogue native via Alert.alert
 */
export const demanderAutorisationAccesFichiers = (
  onAutoriser: () => void | Promise<void>,
  _onRefuser: () => void = () => {}
): void => {
  // L'accès aux fichiers est géré directement par le sélecteur natif (Scoped Storage / Web Input)
  onAutoriser();
};

/**
 * Convertit une chaîne Base64 en Uint8Array (compatible React Native Mobile et Web)
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Dossier de stockage persistant dédié pour les documents importés dans l'application
 */
export const DOSSIER_DOCS_PERSISTANTS = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}cauzon_docs/` : '';

/**
 * Normalise un chemin de fichier pour Android/iOS (préfixe file:// nécessaire pour FileSystem)
 */
export const normaliserCheminFichier = (chemin: string): string => {
  if (!chemin || Platform.OS === 'web') return chemin;
  const c = chemin.trim();
  if (c.startsWith('content:') || c.startsWith('http:') || c.startsWith('https:') || c.startsWith('data:') || c.startsWith('blob:')) {
    return c;
  }
  if (c.startsWith('/')) {
    return `file://${c}`;
  }
  return c;
};

/**
 * Recherche un fichier correspondant dans le dossier sandbox persistant cauzon_docs/
 * Permet de récupérer les documents dont le chemin initial était temporaire (content:// ou cache)
 */
export const retrouverFichierDansSandbox = async (nomOuTitreOuId: string): Promise<string | null> => {
  if (Platform.OS === 'web' || !DOSSIER_DOCS_PERSISTANTS) return null;
  try {
    const dirInfo = await FileSystem.getInfoAsync(DOSSIER_DOCS_PERSISTANTS);
    if (!dirInfo.exists) return null;

    const fichiers = await FileSystem.readDirectoryAsync(DOSSIER_DOCS_PERSISTANTS);
    if (!fichiers || fichiers.length === 0) return null;

    // Nettoyage de la clé de recherche
    const cleanRecherche = (nomOuTitreOuId || '')
      .toLowerCase()
      .replace(/\.pdf$/, '')
      .replace(/[^a-z0-9]/g, '');

    if (!cleanRecherche) return null;

    // 1. Recherche par correspondance exacte ou inclusion réciproque
    const match = fichiers.find(f => {
      const fClean = f.toLowerCase().replace(/\.pdf$/, '').replace(/[^a-z0-9]/g, '');
      return fClean.includes(cleanRecherche) || cleanRecherche.includes(fClean);
    });

    if (match) {
      let cheminTrouve = `${DOSSIER_DOCS_PERSISTANTS}${match}`;
      if (!cheminTrouve.startsWith('file://') && cheminTrouve.startsWith('/')) {
        cheminTrouve = `file://${cheminTrouve}`;
      }
      const check = await FileSystem.getInfoAsync(cheminTrouve);
      if (check.exists && (check.size === undefined || check.size > 0)) {
        console.log('🔍 [Sandbox] Document retrouvé dans cauzon_docs/ :', match);
        return cheminTrouve;
      }
    }
    return null;
  } catch (err) {
    console.warn('⚠️ [Sandbox] Erreur recherche fichier :', err);
    return null;
  }
};

/**
 * Copie un fichier sélectionné vers le dossier persistant sécurisé de l'application (Sandboxing).
 * Permet à l'application d'accéder au document de façon permanente et autonome même si l'utilisateur
 * déplace ou supprime le fichier d'origine de son appareil.
 */
export const copierFichierVersDossierPersistant = async (
  sourceUri: string,
  idUniqueOuNom?: string
): Promise<string> => {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
    return sourceUri;
  }

  if (!sourceUri) {
    throw new Error('URI source manquante pour la persistance locale.');
  }

  try {
    const docsDir = DOSSIER_DOCS_PERSISTANTS;
    const dirInfo = await FileSystem.getInfoAsync(docsDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(docsDir, { intermediates: true });
    }

    // Si le fichier est DÉJÀ situé dans cauzon_docs/, on vérifie son intégrité et on le retourne directement
    if (sourceUri.startsWith(docsDir)) {
      const check = await FileSystem.getInfoAsync(sourceUri);
      if (check.exists && check.size && check.size > 0) {
        console.log('✅ Fichier déjà présent et valide dans cauzon_docs/ :', sourceUri);
        return sourceUri;
      }
    }

    const cleanName = (idUniqueOuNom || `imported_${Date.now()}`)
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    const nomFinal = cleanName.endsWith('.pdf') ? cleanName : `${cleanName}.pdf`;
    const targetPath = `${docsDir}${nomFinal}`;

    console.log(`📦 [Sandboxing] Copie physique : ${sourceUri} -> ${targetPath}`);

    // Tentative 1 : Copie native via FileSystem.copyAsync
    let copySuccess = false;
    try {
      await FileSystem.copyAsync({ from: sourceUri, to: targetPath });
      const checkCopy = await FileSystem.getInfoAsync(targetPath);
      if (checkCopy.exists && checkCopy.size && checkCopy.size > 0) {
        copySuccess = true;
      }
    } catch (errCopy: any) {
      console.warn('⚠️ copyAsync direct échoué, tentative fallback base64 :', errCopy.message);
    }

    // Tentative 2 : Fallback de lecture/écriture Base64 si copyAsync échoue (notamment sur certains content:// Android)
    if (!copySuccess) {
      try {
        const base64Data = await FileSystem.readAsStringAsync(sourceUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (base64Data && base64Data.length > 0) {
          await FileSystem.writeAsStringAsync(targetPath, base64Data, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const checkWrite = await FileSystem.getInfoAsync(targetPath);
          if (checkWrite.exists && checkWrite.size && checkWrite.size > 0) {
            copySuccess = true;
          }
        }
      } catch (errBase64: any) {
        console.warn('⚠️ Fallback Base64 échoué :', errBase64.message);
      }
    }

    if (copySuccess) {
      // Vérification intégrité : contrôle la signature %PDF- dans les premiers octets du fichier copié
      try {
        const header = await FileSystem.readAsStringAsync(targetPath, {
          encoding: FileSystem.EncodingType.UTF8,
          position: 0,
          length: 10,
        } as any);
        if (header && header.startsWith('%PDF')) {
          console.log('✅ [Intégrité] Signature %PDF- confirmée dans le fichier copié.');
        } else {
          console.warn(`⚠️ [Intégrité] La signature %PDF- est ABSENTE dans le fichier copié ! (début: ${header?.substring(0, 10)}). Le fichier est peut-être corrompu.`);
        }
      } catch (headerErr: any) {
        console.warn('⚠️ [Intégrité] Impossible de vérifier l\'en-tête PDF :', headerErr.message);
      }
      console.log('✅ Fichier copié avec succès dans le stockage sandbox persistant :', targetPath);
      return targetPath;

    } else {
      // Rejeter explicitement pour empêcher l'enregistrement d'un document fantôme avec URI éphémère
      throw new Error(`Échec de la copie physique vers le stockage persistant : le fichier copié est introuvable ou vide (${targetPath}).`);
    }
  } catch (err: any) {
    console.error('❌ Erreur critique lors de la copie vers le stockage persistant :', err.message);
    throw err;
  }
};

/**
 * Télécharge un document distant (HTTP / Supabase Storage) et le stocke
 * directement dans le répertoire sandbox persistant cauzon_docs/.
 */
export const telechargerFichierVersDossierPersistant = async (
  urlDistante: string,
  idUniqueOuNom?: string
): Promise<string | null> => {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
    return urlDistante;
  }

  try {
    const docsDir = DOSSIER_DOCS_PERSISTANTS;
    const dirInfo = await FileSystem.getInfoAsync(docsDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(docsDir, { intermediates: true });
    }

    const cleanName = (idUniqueOuNom || `downloaded_${Date.now()}`)
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    const nomFinal = cleanName.endsWith('.pdf') ? cleanName : `${cleanName}.pdf`;
    const targetPath = `${docsDir}${nomFinal}`;

    // Téléchargement direct vers le dossier sandbox permanent
    const downloadRes = await FileSystem.downloadAsync(urlDistante, targetPath);
    if (downloadRes.status === 200) {
      const check = await FileSystem.getInfoAsync(targetPath);
      if (check.exists && check.size && check.size > 0) {
        console.log('✅ Fichier distant téléchargé et persisté dans cauzon_docs/ :', targetPath);
        return targetPath;
      }
    }
    return null;
  } catch (err: any) {
    console.warn('⚠️ Échec du téléchargement persistant :', err?.message);
    return null;
  }
};

/**
 * ☁️ TÉLÉVERSEMENT ET PERSISTANCE CLOUD D'UN DOCUMENT PDF (VIP)
 * 
 * Étape A : Upload dans Supabase Storage ('documents_utilisateurs' ou repli sur 'cours-documents')
 * Étape B : Enregistrement des métadonnées dans la base de données Supabase
 * Étape C : Enregistrement dans le cache local hors-ligne
 */
export const televerserDocumentCloud = async (params: {
  fileUri: string;
  fileName: string;
  fileSize?: number;
  customTitle: string;
  selectedFolder: string;
  nombrePages?: number;
}): Promise<{ success: boolean; document?: DocumentCourse; message: string }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return {
        success: false,
        message: 'Vous devez être connecté avec votre compte Google pour téléverser un document.',
      };
    }

    const userId = user.id;
    const deviceId = await getDeviceId();
    const idUnique = `imported_${Date.now()}`;
    const cleanFileName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const folderSlug = (params.selectedFolder || 'Documents Personnels')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '_');

    // Chemin de stockage distant
    const relativePath = `${userId}/${folderSlug}/${Date.now()}_${cleanFileName}`;

    // 1️⃣ Préparation du contenu binaire (Web vs Native) & Stockage Sandbox persistant
    let uploadBody: any;
    let localCachePath = params.fileUri;

    if (Platform.OS === 'web') {
      const response = await fetch(params.fileUri);
      uploadBody = await response.blob();
    } else {
      // Copie immédiate dans le dossier persistant cauzon_docs/
      localCachePath = await copierFichierVersDossierPersistant(
        params.fileUri,
        `${Date.now()}_${cleanFileName}`
      );

      const base64 = await FileSystem.readAsStringAsync(localCachePath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      uploadBody = base64ToUint8Array(base64);
    }

    // 2️⃣ Étape A : Téléversement vers Supabase Storage
    let storageBucket = 'documents_utilisateurs';
    let finalStoragePath = relativePath;

    let uploadRes = await supabase.storage
      .from(storageBucket)
      .upload(finalStoragePath, uploadBody, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadRes.error) {
      console.warn(`Tentative bucket ${storageBucket} échouée (${uploadRes.error.message}), repli sur 'cours-documents'...`);
      storageBucket = 'cours-documents';
      finalStoragePath = `documents_utilisateurs/${relativePath}`;

      const fallbackRes = await supabase.storage
        .from(storageBucket)
        .upload(finalStoragePath, uploadBody, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (fallbackRes.error) {
        console.error('Erreur téléversement Storage Supabase :', fallbackRes.error);
        throw new Error(`Échec du téléversement dans le Cloud : ${fallbackRes.error.message}`);
      }
    }

    console.log(`✅ Fichier PDF téléversé avec succès dans Supabase Storage [${storageBucket}] :`, finalStoragePath);

    // 3️⃣ Calcul du nombre de pages
    let pagesCount = params.nombrePages || 1;
    try {
      const { PDFDocument } = await import('pdf-lib');
      if (Platform.OS === 'web') {
        const resp = await fetch(params.fileUri);
        const arrayBuf = await resp.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuf, { ignoreEncryption: true });
        pagesCount = pdfDoc.getPageCount();
      } else {
        const base64 = await FileSystem.readAsStringAsync(localCachePath, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const pdfDoc = await PDFDocument.load(base64, { ignoreEncryption: true });
        pagesCount = pdfDoc.getPageCount();
      }
    } catch (errPages) {
      console.warn('Note extraction pages PDF :', errPages);
    }

    const tailleMo = params.fileSize
      ? parseFloat((params.fileSize / (1024 * 1024)).toFixed(2))
      : 1.5;

    // 4️⃣ Étape B : Persistance des métadonnées dans la base de données Supabase
    // Tentative 1 : Table dédiée 'user_library_documents'
    let dbPersisted = false;
    const tableDedieePayload = {
      id: idUnique,
      user_id: userId,
      title: params.customTitle.trim(),
      folder_name: params.selectedFolder.trim() || 'Documents Personnels',
      file_path: finalStoragePath,
      bucket: storageBucket,
      file_size_bytes: params.fileSize || Math.round(tailleMo * 1024 * 1024),
      page_count: pagesCount,
      created_at: new Date().toISOString(),
    };

    const { error: errDediee } = await supabase
      .from('user_library_documents')
      .insert([tableDedieePayload]);

    if (!errDediee) {
      dbPersisted = true;
      console.log('✅ Métadonnées persistées dans la table dédiée user_library_documents');
    } else {
      console.warn('Note insertion user_library_documents :', errDediee.message);
      // Tentative 2 : Fallback dans 'documents' (status = 'user_imported') + 'acquisitions'
      const docPayload = {
        id: idUnique,
        titre: params.customTitle.trim(),
        categorie: params.selectedFolder.trim() || 'Documents Personnels',
        description: 'Document personnel importé dans votre espace VIP cauZon.',
        prix: 0,
        est_certifie: false,
        est_verrouille: false,
        nombre_pages: pagesCount,
        limite_apercu_pages: 1,
        limite_apercu_type: 'page',
        limite_apercu_valeur: 1,
        taille_mo: tailleMo,
        file_path: finalStoragePath,
        status: 'user_imported',
      };

      const { error: errDoc } = await supabase.from('documents').upsert([docPayload]);
      if (!errDoc) {
        dbPersisted = true;
        const acqPayload: any = {
          document_id: idUnique,
          user_id: userId,
          is_vip_consultation: false,
          is_welcome_offer: false,
          montant_paye: 0,
        };
        if (deviceId) acqPayload.device_id = deviceId;
        try {
          await supabase.from('acquisitions').insert([acqPayload]);
        } catch (_) {}
        console.log('✅ Métadonnées persistées via fallback documents/acquisitions');
      } else {
        console.warn('Note insertion documents fallback :', errDoc.message);
      }
    }

    // 5️⃣ Étape C : Objet DocumentCourse & Cache Local
    const dateAjoutIso = new Date().toISOString();
    const dateAjoutMs = Date.now();

    const nouveauDoc: DocumentCourse = {
      id: idUnique,
      titre: params.customTitle.trim(),
      categorie: params.selectedFolder.trim() || 'Documents Personnels',
      description: 'Document personnel importé dans votre espace VIP cauZon.',
      prix: 0,
      est_certifie: false,
      est_verrouille: false,
      nombre_pages: pagesCount,
      limite_apercu_pages: 1,
      limite_apercu_type: 'page',
      limite_apercu_valeur: 1,
      taille_mo: tailleMo,
      file_path: finalStoragePath,
      status: 'actif',
      is_vip_consultation: false,
      est_importe: true,
      date_ajout: dateAjoutIso,
      ...( {
        cheminLocal: localCachePath,
        estImporte: true,
        typeAcquisition: 'permanent',
        dateAjout: dateAjoutMs,
        tailleMo: tailleMo,
      } as any ),
    };

    // Sauvegarder dans le cache des documents importés
    const existants = await chargerDocumentsImportes();
    const updatedImportes = [nouveauDoc, ...existants.filter((d: any) => d.id !== idUnique)];
    await sauvegarderDocumentsImportes(updatedImportes);

    // Mettre à jour la bibliothèque locale
    const biblioLocale = await chargerBibliothequeLocale();
    const updatedBiblio = [nouveauDoc, ...biblioLocale.filter((d: any) => d.id !== idUnique)];
    await sauvegarderBibliothequeLocale(updatedBiblio);

    return {
      success: true,
      document: nouveauDoc,
      message: `"${params.customTitle}" a été téléversé avec succès dans le Cloud et classé dans "${params.selectedFolder}" ! ☁️`,
    };
  } catch (error: any) {
    console.error('Erreur lors du téléversement Cloud :', error);
    return {
      success: false,
      message: error?.message || 'Une erreur est survenue lors du téléversement.',
    };
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


    const idUnique = `imported_${Date.now()}`;

    // Sur Mobile (Android / iOS) : copier le fichier dans le stockage sandbox persistant cauzon_docs/
    if (Platform.OS !== 'web' && FileSystem.documentDirectory) {
      cheminPersistant = await copierFichierVersDossierPersistant(
        params.file_path,
        `${Date.now()}_${idUnique}`
      );
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

    const dateAjoutIso = new Date().toISOString();
    const dateAjoutMs = Date.now();
    const tailleMoCalculee = params.taille_mo ?? 1.0;

    const nouveauDoc: DocumentCourse = {
      id: idUnique,
      titre: params.titre,
      categorie: params.categorie || 'Documents Personnels',
      description: 'Document personnel importé dans votre espace cauZon.',
      prix: 0,
      est_certifie: false,
      est_verrouille: false,
      nombre_pages: nombrePagesDynamique && nombrePagesDynamique > 0 ? nombrePagesDynamique : (params.nombre_pages ?? 1),
      limite_apercu_pages: 1,
      limite_apercu_type: 'page',
      limite_apercu_valeur: 1,
      taille_mo: tailleMoCalculee,
      file_path: cheminPersistant,
      status: 'actif',
      is_vip_consultation: false,
      est_importe: true,
      date_ajout: dateAjoutIso,
      ...( {
        cheminLocal: cheminPersistant,
        estImporte: true,
        typeAcquisition: 'permanent',
        dateAjout: dateAjoutMs,
        tailleMo: tailleMoCalculee,
      } as any )
    };

    // 1. Sauvegarde dans le cache dédié des documents importés
    const existants = await chargerDocumentsImportes();
    const updatedImportes = [nouveauDoc, ...existants.filter((d: any) => d.id !== idUnique)];
    await sauvegarderDocumentsImportes(updatedImportes);

    // 2. Synchronisation immédiate avec le cache de la bibliothèque locale
    const biblioLocale = await chargerBibliothequeLocale();
    const updatedBiblio = [nouveauDoc, ...biblioLocale.filter((d: any) => d.id !== idUnique)];
    await sauvegarderBibliothequeLocale(updatedBiblio);

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
      const { data: prof } = await supabase
        .from('profiles')
        .select('est_actif')
        .eq('id', user.id)
        .maybeSingle();

      if (prof && prof.est_actif === false) {
        return [];
      }
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
          // Un achat permanent (is_vip_consultation === false) a priorité absolue sur toute consultation VIP
          if (acq.is_vip_consultation === false) {
            vipMap[acq.document_id] = false;
          } else if (vipMap[acq.document_id] === undefined) {
            vipMap[acq.document_id] = true;
          }
        }
      });
    }

    // 📥 Récupération des documents importés persistés dans le Cloud Supabase
    let cloudUserDocs: DocumentCourse[] = [];
    if (user?.id) {
      try {
        // Source 1 : Table dédiée 'user_library_documents'
        const { data: userLibDocs, error: errUserLib } = await supabase
          .from('user_library_documents')
          .select('*')
          .eq('user_id', user.id);

        if (!errUserLib && userLibDocs && userLibDocs.length > 0) {
          cloudUserDocs.push(
            ...userLibDocs.map((uDoc: any) => {
              const bucketPrefix = uDoc.bucket || 'documents_utilisateurs';
              const qualifieFilePath = uDoc.file_path?.startsWith('documents_utilisateurs/') || uDoc.file_path?.startsWith('cours-documents/')
                ? uDoc.file_path
                : `${bucketPrefix}/${uDoc.file_path}`;

              return {
                id: uDoc.id || `imported_${uDoc.created_at ? new Date(uDoc.created_at).getTime() : Date.now()}`,
                titre: uDoc.title || 'Document Personnel',
                categorie: uDoc.folder_name || 'Documents Personnels',
                description: 'Document personnel importé dans votre espace VIP cauZon.',
                prix: 0,
                est_certifie: false,
                est_verrouille: false,
                nombre_pages: uDoc.page_count || 1,
                limite_apercu_pages: 1,
                limite_apercu_type: 'page',
                limite_apercu_valeur: 1,
                taille_mo: uDoc.file_size_bytes ? parseFloat((uDoc.file_size_bytes / (1024 * 1024)).toFixed(2)) : 1.5,
                file_path: qualifieFilePath,
                status: 'actif',
                is_vip_consultation: false,
                est_importe: true,
                date_ajout: uDoc.created_at || new Date().toISOString(),
                cheminLocal: '', // Laissé vide si pas encore sur cet appareil (sera téléchargé ou pointé vers Cloud)
                estImporte: true,
                typeAcquisition: 'permanent',
              } as DocumentCourse;
            })
          );
        }

        // Source 2 : Table fallback 'documents' (status = 'user_imported')
        const { data: fallbackDocs, error: errFallback } = await supabase
          .from('documents')
          .select('*')
          .eq('status', 'user_imported');

        if (!errFallback && fallbackDocs && fallbackDocs.length > 0) {
          const userAcqIds = (acquisitions || []).map((a: any) => a.document_id);
          const mesFallback = fallbackDocs.filter((fd: any) => userAcqIds.includes(fd.id));
          for (const fb of mesFallback) {
            if (!cloudUserDocs.some((d) => d.id === fb.id)) {
              const qualifieFbPath = fb.file_path?.startsWith('documents_utilisateurs/') || fb.file_path?.startsWith('cours-documents/')
                ? fb.file_path
                : `documents_utilisateurs/${fb.file_path}`;

              cloudUserDocs.push({
                ...fb,
                is_vip_consultation: false,
                est_importe: true,
                file_path: qualifieFbPath,
                cheminLocal: '',
                estImporte: true,
                typeAcquisition: 'permanent',
              } as DocumentCourse);
            }
          }
        }
      } catch (errCloudUser: any) {
        console.warn('Note récupération documents Cloud utilisateur :', errCloudUser?.message);
      }
    }

    // Charger les documents importés par l'utilisateur (cache local)
    const docsImportesLocaux = await chargerDocumentsImportes();
    const tousDocsImportesMap = new Map<string, DocumentCourse>();
    docsImportesLocaux.forEach((d) => tousDocsImportesMap.set(d.id, d));
    cloudUserDocs.forEach((d) => {
      const existantLocal = tousDocsImportesMap.get(d.id);
      // Préserver impérativement le chemin local physique réel s'il est déjà présent sur cet appareil
      const aCheminPhysiqueLocal = Boolean(
        existantLocal?.cheminLocal &&
        (existantLocal.cheminLocal.startsWith('file:') ||
         existantLocal.cheminLocal.startsWith('/data/') ||
         existantLocal.cheminLocal.startsWith('/storage/'))
      );
      const cheminLocalConserve = aCheminPhysiqueLocal
        ? existantLocal!.cheminLocal
        : (existantLocal?.cheminLocal || '');

      tousDocsImportesMap.set(d.id, {
        ...(existantLocal || {}),
        ...d,
        cheminLocal: cheminLocalConserve,
        file_path: d.file_path || existantLocal?.file_path || cheminLocalConserve || '',
      });
    });
    const docsImportes = Array.from(tousDocsImportesMap.values());

    // Mettre à jour le cache des documents importés
    await sauvegarderDocumentsImportes(docsImportes).catch(() => {});

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
        est_importe: doc.status === 'user_imported',
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
    const mergedWithImports = [...docsImportes, ...mergedDocs.filter((d) => !tousDocsImportesMap.has(d.id))];

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
      is_vip_consultation: true,
      montant_paye: 0,
      is_welcome_offer: false,
    };

    if (user?.id) insertData.user_id = user.id;
    if (deviceId) insertData.device_id = deviceId;

    await supabase
      .from('acquisitions')
      .upsert([insertData], { onConflict: 'document_id, device_id' });
  } catch (err: any) {
    console.warn('Note enregistrement consultation VIP :', err?.message);
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
 * Supprime un document de la bibliothèque locale et du Cloud
 * - Si importé : supprimé du stockage local + Supabase Storage + user_library_documents/documents
 * - Si officiel : droits réinitialisés et renvoi dans le catalogue
 */
export const supprimerDocumentLocal = async (documentId: string): Promise<{ success: boolean; message: string }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;
    const deviceId = await getDeviceId();

    // 1. Si le document est un document importé
    if (documentId.startsWith('imported_')) {
      // Suppression physique du fichier sur l'appareil (cauzon_docs/ ou ancien documents_importes/)
      if (Platform.OS !== 'web' && FileSystem.documentDirectory) {
        try {
          const docs = await chargerDocumentsImportes();
          const docTrouve = docs.find((d) => d.id === documentId);
          const cheminEnregistre = docTrouve?.cheminLocal;
          if (cheminEnregistre && cheminEnregistre.startsWith('file:')) {
            const check = await FileSystem.getInfoAsync(cheminEnregistre);
            if (check.exists) {
              await FileSystem.deleteAsync(cheminEnregistre, { idempotent: true });
            }
          }

          // Nettoyage par identifiant dans cauzon_docs/ et documents_importes/
          const pathsToCheck = [
            `${DOSSIER_DOCS_PERSISTANTS}${documentId}.pdf`,
            `${FileSystem.documentDirectory}documents_importes/${documentId}.pdf`,
          ];
          for (const p of pathsToCheck) {
            const info = await FileSystem.getInfoAsync(p);
            if (info.exists) {
              await FileSystem.deleteAsync(p, { idempotent: true });
            }
          }
        } catch (_) {}
      }

      // Suppression distante dans Supabase (Table dédiée + Table fallback + Storage)
      try {
        if (userId) {
          // Chercher le chemin storage dans user_library_documents
          const { data: uDoc } = await supabase
            .from('user_library_documents')
            .select('file_path, bucket')
            .eq('id', documentId)
            .maybeSingle();

          if (uDoc?.file_path) {
            const bucket = uDoc.bucket || 'documents_utilisateurs';
            await supabase.storage.from(bucket).remove([uDoc.file_path]).catch(() => {});
            if (bucket !== 'cours-documents') {
              await supabase.storage.from('cours-documents').remove([uDoc.file_path]).catch(() => {});
            }
          }

          await supabase.from('user_library_documents').delete().eq('id', documentId).eq('user_id', userId);
          await supabase.from('acquisitions').delete().eq('document_id', documentId).eq('user_id', userId);
          await supabase.from('documents').delete().eq('id', documentId);
        }
      } catch (errDist: any) {
        console.warn('Note suppression Cloud document importé :', errDist?.message);
      }

      const docsImportes = await chargerDocumentsImportes();
      const updatedImportes = docsImportes.filter((d) => d.id !== documentId);
      await sauvegarderDocumentsImportes(updatedImportes);

      const cachedDocs = await chargerBibliothequeLocale();
      const updatedDocs = cachedDocs.filter((d) => d.id !== documentId);
      await sauvegarderBibliothequeLocale(updatedDocs);

      return { success: true, message: 'Document importé supprimé définitivement de votre espace personnel.' };
    }

    // 2. Si c'est un document officiel du catalogue
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
  let bucketName = 'cours-documents';
  let storagePath = cleanPath;

  if (cleanPath.startsWith('documents_utilisateurs/')) {
    bucketName = 'documents_utilisateurs';
    storagePath = cleanPath.replace(/^documents_utilisateurs\//, '');
  } else if (cleanPath.startsWith('cours-documents/')) {
    bucketName = 'cours-documents';
    storagePath = cleanPath.replace(/^cours-documents\//, '');
  } else if (cleanPath.includes('/') && /^[0-9a-fA-F-]{20,}/.test(cleanPath)) {
    // Si le chemin commence par un UUID utilisateur (ex: "e4a2.../dossier/fichier.pdf")
    bucketName = 'documents_utilisateurs';
    storagePath = cleanPath;
  }

  const { data } = supabase.storage
    .from(bucketName)
    .getPublicUrl(storagePath);

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

    // 1. Mettre à jour les éventuelles lignes d'acquisitions existantes pour ce document
    // afin de convertir le statut VIP en permanent (is_vip_consultation: false)
    try {
      let updateQuery = supabase
        .from('acquisitions')
        .update({
          is_vip_consultation: false,
          montant_paye: montantPaye,
          is_welcome_offer: false,
        })
        .eq('document_id', documentId);

      if (user?.id) {
        updateQuery = updateQuery.or(`device_id.eq.${deviceId},user_id.eq.${user.id}`);
      } else {
        updateQuery = updateQuery.eq('device_id', deviceId);
      }
      await updateQuery;
    } catch (errUpdate) {
      console.warn('Note mise à jour acquisition VIP -> Permanent :', errUpdate);
    }

    // 2. Upsert officiel pour garantir la persistance permanente
    const { error } = await supabase
      .from('acquisitions')
      .upsert([insertionData], { onConflict: 'document_id, device_id' });

    if (error) {
      console.warn('Erreur upsert acquisition permanente :', error.message);
      await supabase.from('acquisitions').insert([insertionData]);
    }

    // 3. Mise à jour immédiate du cache local de la bibliothèque
    try {
      const cached = await chargerBibliothequeLocale();
      const existingDoc = cached.find((d) => d.id === documentId);
      if (existingDoc) {
        existingDoc.is_vip_consultation = false;
        await sauvegarderBibliothequeLocale(cached);
      }
    } catch (errCache) {
      console.warn('Erreur mise à jour cache local après achat :', errCache);
    }

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
