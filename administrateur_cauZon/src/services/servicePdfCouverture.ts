import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { supabase } from '../lib/supabase';
import { BUCKET_DOCS } from './serviceDocuments';

// Configuration du worker PDF.js
try {
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
  }
} catch {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
}

/**
 * Extrait automatiquement la 1ère page d'un fichier PDF sous forme de Blob image JPEG/WebP optimisé.
 */
export async function extraireCouverturePdfPage1(pdfFile: File): Promise<Blob> {
  const arrayBuffer = await pdfFile.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    disableRange: true,
    disableStream: true,
  });

  const pdfDoc = await loadingTask.promise;
  if (pdfDoc.numPages < 1) {
    throw new Error('Le document PDF ne contient aucune page.');
  }

  const page = await pdfDoc.getPage(1);
  const unscaledViewport = page.getViewport({ scale: 1.0 });

  // Échelle de rendu optimisée (largeur cible entre 600px et 900px pour qualité retina sans surpoids)
  const targetWidth = Math.min(900, Math.max(600, unscaledViewport.width));
  const scale = targetWidth / unscaledViewport.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Contexte Canvas 2D non disponible pour le rendu de la miniature.');
  }

  // Fond blanc pour éviter la transparence sur les PDF vectoriels
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: ctx,
    viewport: viewport,
    canvas: canvas,
  } as any).promise;

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Échec de la conversion du Canvas en Blob image.'));
        }
      },
      'image/jpeg',
      0.88
    );
  });
}

/**
 * Téléverse l'image de couverture (manuelle ou extraite automatiquement)
 * vers le stockage Supabase (bucket cours-documents / dossier covers/)
 * et renvoie l'URL publique absolue.
 */
export async function uploaderImageCouverture(
  imageSource: File | Blob,
  nomDocument: string
): Promise<string> {
  const isPng = imageSource.type === 'image/png';
  const isWebp = imageSource.type === 'image/webp';
  const ext = isPng ? 'png' : isWebp ? 'webp' : 'jpg';

  const cleanNom = nomDocument
    .toLowerCase()
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 45);

  const cleanCoverPath = `covers/${Date.now()}_${cleanNom || 'couverture'}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET_DOCS)
    .upload(cleanCoverPath, imageSource, {
      contentType: imageSource.type || 'image/jpeg',
      upsert: false,
    });

  if (error) {
    throw new Error(`Erreur lors du téléversement de la couverture : ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET_DOCS).getPublicUrl(cleanCoverPath);
  return data.publicUrl;
}
