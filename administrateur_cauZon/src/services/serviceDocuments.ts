import { supabase } from '../lib/supabase';
import type { DocumentRow } from '../types';
import { PDFDocument } from 'pdf-lib';

export const BUCKET_DOCS = 'cours-documents';

export const extraireNombrePagesPdf = async (file: File): Promise<number> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    return pdfDoc.getPageCount();
  } catch {
    return 1;
  }
};

export const fetchDocuments = async (): Promise<DocumentRow[]> => {
  const { data, error } = await supabase.from('documents').select('*');
  if (error) {
    console.error('Erreur chargement documents Supabase :', error);
    throw error;
  }
  return (data ?? []) as DocumentRow[];
};

export const publishDocument = async (
  wizardData: {
    titre: string; description: string; categorie: string; tags: string;
    prix: string; estCertifie: boolean; nombre_pages: string; taille_mo: string;
    limiteApercuType: string; limiteApercuValeur: string;
    status: string; scheduled_at: string; importance_level: string;
  },
  pdfFile: File | null,
  coverFile: File | null
): Promise<void> => {
  if (!pdfFile) throw new Error('Fichier PDF manquant.');

  const cleanPdfName = `${Date.now()}_${pdfFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error: pdfErr } = await supabase.storage.from(BUCKET_DOCS).upload(cleanPdfName, pdfFile, { upsert: false });
  if (pdfErr) throw new Error(`Erreur upload PDF : ${pdfErr.message}`);

  let finalCoverUrl: string | null = null;
  if (coverFile) {
    const cleanCoverName = `covers/${Date.now()}_${coverFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error: coverErr } = await supabase.storage.from(BUCKET_DOCS).upload(cleanCoverName, coverFile, { upsert: false });
    if (!coverErr) {
      const { data: urlData } = supabase.storage.from(BUCKET_DOCS).getPublicUrl(cleanCoverName);
      finalCoverUrl = urlData?.publicUrl ?? null;
    }
  }

  let pagesCount = parseInt(wizardData.nombre_pages);
  if (!pagesCount || isNaN(pagesCount) || pagesCount <= 0) {
    pagesCount = await extraireNombrePagesPdf(pdfFile);
  }

  const payload = {
    titre: wizardData.titre,
    description: wizardData.description,
    categorie: wizardData.categorie,
    tags: wizardData.tags?.trim() || null,
    prix: parseInt(wizardData.prix) || 100,
    est_certifie: wizardData.estCertifie,
    est_verrouille: true,
    nombre_pages: pagesCount,
    limite_apercu_pages: wizardData.limiteApercuType === 'page' ? (parseInt(wizardData.limiteApercuValeur) || 1) : 3,
    limite_apercu_type: wizardData.limiteApercuType,
    limite_apercu_valeur: parseInt(wizardData.limiteApercuValeur) || 30,
    taille_mo: parseFloat(wizardData.taille_mo) || 1.5,
    file_path: cleanPdfName,
    cover_url: finalCoverUrl,
    scheduled_at: wizardData.status === 'scheduled' && wizardData.scheduled_at
      ? new Date(wizardData.scheduled_at).toISOString() : null,
    importance_level: wizardData.importance_level,
    status: wizardData.status
  };

  const { error: insertErr } = await supabase.from('documents').insert([payload]);
  if (insertErr) throw insertErr;
};

export const updateDocumentPaywall = async (
  docId: string,
  type: 'page' | 'pourcentage' | 'fluide',
  valeur: number
): Promise<void> => {
  const roundedVal = Math.round(valeur);
  const { error } = await supabase.from('documents').update({
    limite_apercu_type: type,
    limite_apercu_valeur: roundedVal,
    limite_apercu_pages: type === 'page' ? roundedVal : 1
  }).eq('id', docId);
  if (error) throw error;
};

export const toggleDocumentStatus = async (docId: string, currentStatus: string | null): Promise<void> => {
  const newStatus = currentStatus === 'published' ? 'inactif' : 'published';
  const { error } = await supabase.from('documents').update({ status: newStatus }).eq('id', docId);
  if (error) throw error;
};

export const toggleDocumentCertified = async (docId: string, current: boolean | null): Promise<void> => {
  const { error } = await supabase.from('documents').update({ est_certifie: !current }).eq('id', docId);
  if (error) throw error;
};

export const deleteDocument = async (doc: DocumentRow): Promise<void> => {
  if (doc.file_path) {
    await supabase.storage.from(BUCKET_DOCS).remove([doc.file_path]).catch(() => {});
  }
  if (doc.cover_url) {
    const coverPath = doc.cover_url.split('/').pop();
    if (coverPath) await supabase.storage.from(BUCKET_DOCS).remove([`covers/${coverPath}`]).catch(() => {});
  }
  const { error } = await supabase.from('documents').delete().eq('id', doc.id);
  if (error) throw error;
};

export const getDocumentPublicUrl = (filePath: string): string => {
  const cleanPath = filePath.trim().replace(/[\r\n]+/g, '');
  const { data } = supabase.storage.from(BUCKET_DOCS).getPublicUrl(cleanPath);
  return data.publicUrl;
};

export const fetchAcquisitionsCount = async (docId: string): Promise<number> => {
  const { count } = await supabase.from('acquisitions')
    .select('*', { count: 'exact', head: true })
    .eq('document_id', docId)
    .eq('is_welcome_offer', false);
  return count ?? 0;
};
