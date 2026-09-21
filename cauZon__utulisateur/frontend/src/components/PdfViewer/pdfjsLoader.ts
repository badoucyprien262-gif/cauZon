export const URL_DOCUMENT_SECOURS =
  'https://wdipnxewpmhdksrlisix.supabase.co/storage/v1/object/public/cours-documents/SUJET_BEPC_2024_PHYSIQUE_CHIMIE_Zone_1.pdf';

export const PDFJS_SCRIPT_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
export const PDFJS_WORKER_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

let pdfjsPromise: Promise<any> | null = null;

/**
 * Charge dynamiquement PDF.js sur la plateforme Web si non encore présent
 */
export function chargerPdfJs(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Environnement non navigateur'));

  const win = window as any;
  if (win.pdfjsLib) {
    win.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
    return Promise.resolve(win.pdfjsLib);
  }

  if (pdfjsPromise) return pdfjsPromise;

  pdfjsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PDFJS_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => {
        if (win.pdfjsLib) {
          win.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
          resolve(win.pdfjsLib);
        } else {
          reject(new Error('PDF.js non initialisé'));
        }
      });
      existing.addEventListener('error', () => reject(new Error('Erreur chargement PDF.js')));
      return;
    }

    const script = document.createElement('script');
    script.src = PDFJS_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (win.pdfjsLib) {
        win.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
        resolve(win.pdfjsLib);
      } else {
        reject(new Error('PDF.js non disponible après injection'));
      }
    };
    script.onerror = () => reject(new Error('Échec du chargement du CDN PDF.js'));
    document.head.appendChild(script);
  });

  return pdfjsPromise;
}

/**
 * Extrait et normalise les octets PDF depuis une source url, dataURI ou buffer
 */
export async function extrairePdfBytes(
  sourceCible: string | null,
  urlFichier: string | Uint8Array | null | undefined
): Promise<Uint8Array> {
  if (urlFichier instanceof Uint8Array) {
    return urlFichier;
  }

  const source = sourceCible || (typeof urlFichier === 'string' ? urlFichier : null) || URL_DOCUMENT_SECOURS;

  if (
    source.startsWith('data:application/pdf') ||
    (!source.startsWith('http') && !source.startsWith('blob:') && source.length > 500)
  ) {
    const clean = source.replace(/^data:application\/pdf;base64,/i, '').trim();
    const binary = atob(clean);
    const pdfData = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      pdfData[i] = binary.charCodeAt(i);
    }
    return pdfData;
  }

  try {
    const res = await fetch(source);
    if (!res.ok) {
      if (source !== URL_DOCUMENT_SECOURS) {
        console.warn(`[PDF Loader] HTTP ${res.status} sur ${source} -> Repli sur document de secours.`);
        const resSecours = await fetch(URL_DOCUMENT_SECOURS);
        if (resSecours.ok) {
          const buf = await resSecours.arrayBuffer();
          return new Uint8Array(buf);
        }
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch (err) {
    console.warn('[PDF Loader] Fetch direct échoué, repli document modèle :', err);
    const resSecours = await fetch(URL_DOCUMENT_SECOURS);
    if (resSecours.ok) {
      const buf = await resSecours.arrayBuffer();
      return new Uint8Array(buf);
    }
    throw err;
  }
}
