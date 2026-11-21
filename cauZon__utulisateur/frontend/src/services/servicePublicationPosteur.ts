// ==============================================================================
// 📚 cauZon — Service de Publication de Documents par les Créateurs / Posteurs
// Gère l'optimisation PDF in-browser (pdf-lib), le contrôle du plafond 100 Mo,
// la vérification de l'espace disponible en Mo, le téléversement chiffré vers
// Supabase Storage ('cours-documents') et l'insertion dans la table 'documents'.
// ==============================================================================

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { supabase } from '../lib/supabase';
import { TAILLE_MAX_PDF_MO, GAIN_PAR_ACQUISITION_FCFA } from './serviceEspacePosteur';

export const BUCKET_DOCUMENTS = 'cours-documents';

export interface ParametresPublicationPosteur {
  userId: string;
  authorPseudo: string;
  authorAvatarUrl?: string | null;
  fileUri: string;
  fileName: string;
  fileSizeBytes: number;
  titre: string;
  categorie: string;
  tags?: string;
  description: string;
  coverImageUri?: string | null;
  quotaActuelMo: number;
  espaceUtiliseMo: number;
  onProgress?: (pourcentage: number, libelle: string) => void;
}

export interface ResultatPublicationPosteur {
  success: boolean;
  message: string;
  documentId?: string;
  tailleMo?: number;
  codeErreur?: 'FICHIER_INVALIDE' | 'TAILLE_TROP_GRANDE' | 'QUOTA_EXCEDE' | 'UPLOAD_ECHOUE' | 'DB_ECHOUE';
}

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
 * Optimisation turbo du PDF via pdf-lib :
 * - Calcule le nombre exact de pages
 * - Injecte les métadonnées créateur cauZon
 * - Applique une sérialisation rapide (< 250ms)
 */
async function optimiserPdfPosteur(
  fileUri: string,
  titre: string
): Promise<{ bytes: Uint8Array | Blob; nombrePages: number; tailleMo: number }> {
  const pdfLibModule = await import('pdf-lib');
  const PDFDocumentClass = pdfLibModule.PDFDocument || (pdfLibModule as any).default?.PDFDocument;

  let rawBytes: Uint8Array;

  if (Platform.OS === 'web') {
    const response = await fetch(fileUri);
    const arrayBuffer = await response.arrayBuffer();
    rawBytes = new Uint8Array(arrayBuffer);
  } else {
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    rawBytes = base64ToUint8Array(base64);
  }

  let nombrePages = 1;
  let bytesFinaux: Uint8Array = rawBytes;

  try {
    if (PDFDocumentClass && typeof PDFDocumentClass.load === 'function') {
      const pdfDoc = await PDFDocumentClass.load(rawBytes, {
        ignoreEncryption: true,
        updateMetadata: false,
      });

      nombrePages = pdfDoc.getPageCount() || 1;

      try {
        pdfDoc.setTitle(titre);
        pdfDoc.setProducer('cauZon Platform');
        pdfDoc.setCreator('cauZon Posteur');
      } catch (_) {}

      // Sérialisation turbo rapide sans recalcul d'arborescences lourdes
      const fastSaved = await pdfDoc.save({
        useObjectStreams: false,
        addDefaultPage: false,
        objectsPerTick: 300,
      });

      if (fastSaved && fastSaved.length > 0) {
        bytesFinaux = fastSaved;
      }
    }
  } catch (errOpt) {
    console.warn('[pdf-lib posteur] Optimisation tolérée (conservation binaire) :', errOpt);
    bytesFinaux = rawBytes;
  }

  const tailleMo = parseFloat((bytesFinaux.byteLength / (1024 * 1024)).toFixed(2));

  if (Platform.OS === 'web') {
    return {
      bytes: new Blob([bytesFinaux as any], { type: 'application/pdf' }),
      nombrePages,
      tailleMo,
    };
  }

  return {
    bytes: bytesFinaux,
    nombrePages,
    tailleMo,
  };
}

/**
 * Téléverse une image de couverture optionnelle
 */
async function televerserImageCouverture(
  imageUri: string,
  userId: string,
  docId: string
): Promise<string | null> {
  try {
    let body: any;
    const coverPath = `covers/${userId}/${docId}_cover.jpg`;

    if (Platform.OS === 'web') {
      const resp = await fetch(imageUri);
      body = await resp.blob();
    } else {
      const b64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      body = base64ToUint8Array(b64);
    }

    const { error } = await supabase.storage
      .from(BUCKET_DOCUMENTS)
      .upload(coverPath, body, { contentType: 'image/jpeg', upsert: true });

    if (error) {
      console.warn('Note upload couverture :', error.message);
      return null;
    }

    const { data: pubData } = supabase.storage.from(BUCKET_DOCUMENTS).getPublicUrl(coverPath);
    return pubData?.publicUrl || null;
  } catch (err) {
    console.warn('Exception upload couverture :', err);
    return null;
  }
}

/**
 * Publie un document complet par un créateur / posteur connecté.
 */
export async function publierDocumentPosteur(
  params: ParametresPublicationPosteur
): Promise<ResultatPublicationPosteur> {
  try {
    // 1. Validation préalable du fichier
    if (!params.fileUri) {
      return { success: false, message: 'Veuillez sélectionner un fichier PDF.', codeErreur: 'FICHIER_INVALIDE' };
    }

    const tailleEstimeeMo = params.fileSizeBytes / (1024 * 1024);

    // 2. Vérification du plafond strict de 100 Mo
    if (tailleEstimeeMo > TAILLE_MAX_PDF_MO) {
      return {
        success: false,
        message: `Le fichier dépasse la taille maximale autorisée (${tailleEstimeeMo.toFixed(1)} Mo / 100 Mo max).`,
        codeErreur: 'TAILLE_TROP_GRANDE',
      };
    }

    // 3. Vérification du quota posteur disponible en Mo
    const espaceDisponibleMo = Math.max(0, params.quotaActuelMo - params.espaceUtiliseMo);
    if (tailleEstimeeMo > espaceDisponibleMo) {
      return {
        success: false,
        message: `Espace insuffisant (${tailleEstimeeMo.toFixed(1)} Mo requis, ${espaceDisponibleMo.toFixed(1)} Mo restants). Veuillez étendre votre espace (+400 Mo).`,
        codeErreur: 'QUOTA_EXCEDE',
      };
    }

    // 4. Étape A : Optimisation turbo et extraction pages
    params.onProgress?.(20, 'Optimisation haute performance du PDF (pdf-lib)…');
    const { bytes, nombrePages, tailleMo } = await optimiserPdfPosteur(params.fileUri, params.titre);

    // 5. Génération identifiants et chemins de stockage
    const docId = `doc_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
    const cleanFileName = params.fileName
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '_')
      .replace(/\.pdf$/i, '');
    const storagePath = `posteurs/${params.userId}/${Date.now()}_${cleanFileName}.pdf`;

    // 6. Étape B : Téléversement du binaire PDF vers Supabase Storage
    params.onProgress?.(50, 'Téléversement sécurisé vers le Cloud de distribution…');
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET_DOCUMENTS)
      .upload(storagePath, bytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadErr) {
      console.error('[Upload Posteur Error]', uploadErr);
      return {
        success: false,
        message: `Échec du téléversement vers le stockage : ${uploadErr.message}`,
        codeErreur: 'UPLOAD_ECHOUE',
      };
    }

    // 7. Étape C : Téléversement de l'image de couverture si personnalisée
    params.onProgress?.(75, 'Préparation de la vignette et des métadonnées…');
    let finalCoverUrl = params.coverImageUri;
    if (params.coverImageUri && !params.coverImageUri.startsWith('http')) {
      const uploadedCover = await televerserImageCouverture(params.coverImageUri, params.userId, docId);
      if (uploadedCover) finalCoverUrl = uploadedCover;
    }

    // 8. Étape D : Enregistrement dans la table public.documents
    params.onProgress?.(85, 'Enregistrement dans le catalogue public cauZon…');

    const nouveauDoc = {
      id: docId,
      titre: params.titre.trim(),
      categorie: params.categorie.trim() || 'Général',
      description: params.description.trim(),
      tags: params.tags ? params.tags.trim() : null,
      prix: 200, // Tarif standard unique à l'acte
      est_certifie: false,
      est_verrouille: true,
      nombre_pages: nombrePages,
      limite_apercu_type: 'pourcentage',
      limite_apercu_valeur: 30,
      limite_apercu_pages: Math.min(nombrePages, 2),
      taille_mo: tailleMo,
      file_path: storagePath,
      cover_url: finalCoverUrl || null,
      status: 'published',
      author_id: params.userId,
      author_pseudo: params.authorPseudo || 'Créateur',
      author_avatar_url: params.authorAvatarUrl || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: dbErr } = await supabase.from('documents').insert([nouveauDoc]);

    if (dbErr) {
      console.error('[DB Insert Document Error]', dbErr);
      // Rollback du PDF téléversé en cas d'échec SQL
      await supabase.storage.from(BUCKET_DOCUMENTS).remove([storagePath]).catch(() => {});
      return {
        success: false,
        message: `Erreur lors de l'enregistrement du document : ${dbErr.message}`,
        codeErreur: 'DB_ECHOUE',
      };
    }

    // 9. Étape E : Incrément de l'espace utilisé sur le portefeuille créateur
    params.onProgress?.(95, 'Mise à jour de votre espace de stockage posteur…');
    const nouvelEspaceMo = parseFloat((params.espaceUtiliseMo + tailleMo).toFixed(2));
    try {
      await supabase
        .from('posteurs_wallets')
        .update({
          espace_utilise_mo: nouvelEspaceMo,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', params.userId);
    } catch (_) {}

    params.onProgress?.(100, 'Publication terminée avec succès !');

    return {
      success: true,
      message: `Votre cours "${params.titre}" est désormais en ligne dans le catalogue et sur votre profil créateur !`,
      documentId: docId,
      tailleMo,
    };
  } catch (err: any) {
    console.error('[publierDocumentPosteur Exception]', err);
    return {
      success: false,
      message: err?.message || 'Une erreur inattendue est survenue pendant la publication.',
      codeErreur: 'UPLOAD_ECHOUE',
    };
  }
}
