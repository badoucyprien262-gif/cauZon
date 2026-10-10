/**
 * Service de communication avec le Backend Node.js cauZon (Pipeline R2 & Compression)
 *
 * Gère les appels vers l'API backend (port 3001 par défaut) :
 *  - POST /admin/documents/upload   : Upload PDF + Compression + Sync Supabase
 *  - GET  /admin/documents/test-r2  : Vérification de connectivité au bucket R2
 *
 * @module services/serviceR2Upload
 */

export interface CompressionStats {
  originalSizeMo: string;
  compressedSizeMo: string;
  economiePercent: number;
}

export interface UploadR2Response {
  success: boolean;
  fileKey?: string;
  tailleMo?: number;
  publicUrl?: string;
  compression?: CompressionStats;
  supabaseId?: string | null;
  message?: string;
  error?: string;
}

export interface R2TestResponse {
  success: boolean;
  bucket?: string;
  endpoint?: string;
  nombreFichiers?: number;
  message?: string;
  error?: string;
}

const getBackendUrl = (): string => {
  const envUrl = (import.meta as any).env?.VITE_BACKEND_URL;
  return envUrl || 'http://localhost:3001';
};

const getAdminApiKey = (): string => {
  return (
    (import.meta as any).env?.VITE_ADMIN_API_KEY ||
    (import.meta as any).env?.VITE_ADMIN_SECRET_KEY ||
    ''
  );
};

/**
 * Teste la connectivité avec le bucket Cloudflare R2 via le backend.
 */
export async function testerConnexionR2Backend(): Promise<R2TestResponse> {
  const backendUrl = getBackendUrl();
  const apiKey = getAdminApiKey();

  try {
    const res = await fetch(`${backendUrl}/admin/documents/test-r2`, {
      method: 'GET',
      headers: {
        'X-Admin-Key': apiKey,
      },
    });

    return await res.json();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Impossible de contacter le serveur backend sur ${backendUrl} (${msg}). Assurez-vous que le serveur Node.js est bien démarré.`,
    };
  }
}

/**
 * Envoie un fichier PDF et ses métadonnées au backend Node.js pour
 * compression automatique, upload sur Cloudflare R2 et synchronisation Supabase.
 */
export async function uploaderDocumentViaBackend(
  formData: FormData
): Promise<UploadR2Response> {
  const backendUrl = getBackendUrl();
  const apiKey = getAdminApiKey();

  try {
    const res = await fetch(`${backendUrl}/admin/documents/upload`, {
      method: 'POST',
      headers: {
        'X-Admin-Key': apiKey,
      },
      body: formData,
    });

    const data: UploadR2Response = await res.json();
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Erreur réseau avec le backend (${msg}). Vérifiez que le serveur Node.js écoute sur ${backendUrl}.`,
    };
  }
}
