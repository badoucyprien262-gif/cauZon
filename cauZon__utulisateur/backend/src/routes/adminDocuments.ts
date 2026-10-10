/**
 * Routes Admin — Upload de Documents vers R2 & Synchronisation Supabase
 *
 * Endpoints protégés par ADMIN_SECRET_KEY (header X-Admin-Key).
 * Utilisés exclusivement depuis le dashboard d'administration cauZon.
 *
 * POST /admin/documents/upload   — Upload + compression + sync Supabase
 * GET  /admin/documents/signed-url  — Génération d'URL pré-signée de lecture
 * GET  /admin/documents/test-r2     — Test de connectivité R2
 *
 * @module routes/adminDocuments
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import {
  uploaderDocumentR2,
  genererUrlPresigneeR2,
  fichierExisteDansR2,
  genererCleStockage,
} from '../services/storageR2';
import { r2Client, R2_BUCKET_NAME } from '../lib/r2Client';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';

const router = Router();

// ─── Client Supabase (Service Role — contourne le RLS) ───────────────────────
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[Admin Documents] Configuration Supabase critique manquante : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définis.');
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

// ─── Multer : réception du PDF en mémoire (max 50 Mo) ────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 Mo max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers PDF sont acceptés.'));
    }
  },
});

// ─── Middleware d'authentification Admin ─────────────────────────────────────
function authAdmin(req: Request, res: Response, next: NextFunction): void {
  const adminKey = req.headers['x-admin-key'] as string | undefined;
  const expectedKey = process.env.ADMIN_SECRET_KEY;

  if (!expectedKey) {
    res.status(500).json({
      success: false,
      error: 'Erreur de configuration serveur : ADMIN_SECRET_KEY non configurée dans l\'environnement.',
    });
    return;
  }

  const isAuthorized = Boolean(adminKey) && adminKey === expectedKey;

  if (!isAuthorized) {
    res.status(401).json({
      success: false,
      error: 'Accès non autorisé. Clé Admin invalide ou manquante.',
    });
    return;
  }
  next();
}

// ─── POST /admin/documents/upload ─────────────────────────────────────────────
/**
 * Upload d'un PDF avec compression automatique + synchronisation Supabase.
 *
 * Body (multipart/form-data) :
 *   - file         : fichier PDF (obligatoire)
 *   - storageKey   : chemin cible ex: "miage_l1/algebre_lineaire.pdf" (obligatoire)
 *   - titre        : titre du document (optionnel)
 *   - categorie    : catégorie (optionnel)
 *   - niveau       : niveau académique (optionnel)
 *   - prix         : prix en FCFA (optionnel, défaut 0)
 *   - documentId   : UUID Supabase existant à mettre à jour (optionnel)
 *
 * Réponse :
 *   {
 *     success: true,
 *     fileKey: "documents/miage_l1/algebre.pdf",
 *     tailleMo: 1.82,
 *     compression: {
 *       originalSizeMo: "4.2 Mo",
 *       compressedSizeMo: "1.82 Mo",
 *       economiePercent: 57
 *     },
 *     supabaseId: "uuid-du-document"
 *   }
 */
router.post(
  '/upload',
  authAdmin,
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, error: 'Aucun fichier PDF fourni.' });
        return;
      }

      const {
        storageKey: explicitKey,
        titre,
        categorie,
        niveau,
        prix,
        documentId,
        description,
        tags,
        nombre_pages,
        est_certifie,
        limite_apercu_type,
        limite_apercu_valeur,
        limite_apercu_pages,
        status,
        cover_url,
        scheduled_at,
        importance_level,
      } = req.body as Record<string, string>;

      // Auto-génération de la clé si non spécifiée
      const storageKey =
        explicitKey?.trim() ||
        genererCleStockage(`${categorie || 'documents'}/${file.originalname}`);

      // 1. Pipeline : compression + upload R2
      const result = await uploaderDocumentR2({
        pdfBuffer: file.buffer,
        storageKey,
        meta: { supabaseDocumentId: documentId, titre, categorie, niveau },
      });

      // 2. Synchronisation Supabase — upsert dans la table documents
      let supabaseId: string | null = documentId || null;

      const nbPagesParsed = parseInt(nombre_pages, 10);
      const valApercuParsed = parseInt(limite_apercu_valeur, 10);
      const pagesApercuParsed = parseInt(limite_apercu_pages, 10);
      const isCertifieParsed = est_certifie === 'true' || est_certifie === '1';

      const documentData: Record<string, unknown> = {
        file_key: result.fileKey,
        file_path: result.fileKey,
        taille_mo: result.tailleMo,
        status: status || 'published',
        ...(titre && { titre }),
        ...(categorie && { categorie }),
        ...(niveau && { niveau }),
        ...(description !== undefined && { description }),
        ...(tags !== undefined && { tags }),
        ...(cover_url && { cover_url }),
        ...(scheduled_at && { scheduled_at }),
        ...(importance_level && { importance_level }),
        ...(est_certifie !== undefined && { est_certifie: isCertifieParsed }),
        ...(!isNaN(nbPagesParsed) && nbPagesParsed > 0 && { nombre_pages: nbPagesParsed }),
        ...(limite_apercu_type && { limite_apercu_type }),
        ...(!isNaN(valApercuParsed) && { limite_apercu_valeur: valApercuParsed }),
        ...(!isNaN(pagesApercuParsed) && { limite_apercu_pages: pagesApercuParsed }),
        ...(prix !== undefined && { prix: parseFloat(prix) || 0 }),
      };

      if (documentId) {
        // Mise à jour d'un document existant
        const { error: updateErr } = await supabase
          .from('documents')
          .update(documentData)
          .eq('id', documentId);

        if (updateErr) {
          console.warn('[Admin Upload] Avertissement sync Supabase (update) :', updateErr.message);
        }
      } else if (titre) {
        // Création d'un nouveau document si titre fourni
        const { data: inserted, error: insertErr } = await supabase
          .from('documents')
          .insert({
            titre: titre || 'Document cauZon',
            categorie: categorie || 'Général',
            prix: parseFloat(prix) || 0,
            est_verrouille: (parseFloat(prix) || 0) > 0,
            est_certifie: isCertifieParsed,
            nombre_pages: !isNaN(nbPagesParsed) ? nbPagesParsed : 0,
            limite_apercu_pages: !isNaN(pagesApercuParsed) ? pagesApercuParsed : 2,
            limite_apercu_type: limite_apercu_type || 'pourcentage',
            limite_apercu_valeur: !isNaN(valApercuParsed) ? valApercuParsed : 30,
            ...documentData,
          })
          .select('id')
          .single();

        if (!insertErr && inserted) {
          supabaseId = inserted.id;
        } else if (insertErr) {
          console.warn('[Admin Upload] Avertissement sync Supabase (insert) :', insertErr.message);
        }
      }

      res.json({
        success: true,
        fileKey: result.fileKey,
        tailleMo: result.tailleMo,
        publicUrl: result.publicUrl,
        compression: result.compression,
        supabaseId,
        message: `✅ Document uploadé avec succès. Économie : ${result.compression.economiePercent}%`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Admin Upload] Erreur :', message);
      res.status(500).json({ success: false, error: message });
    }
  }
);

// ─── GET /admin/documents/signed-url ─────────────────────────────────────────
/**
 * Génère une URL pré-signée GetObject valide 20 minutes.
 * Query params :
 *   - fileKey : clé du fichier dans R2 (ex: "documents/miage_l1/algebre.pdf")
 *   - ttl     : durée en secondes (défaut: 1200 = 20 min, max: 3600 = 1h)
 */
router.get('/signed-url', authAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const fileKey = req.query['fileKey'] as string | undefined;
    const ttlRaw = parseInt(req.query['ttl'] as string || '1200', 10);
    const ttl = Math.min(Math.max(ttlRaw, 60), 3600); // clamp [60s, 1h]

    if (!fileKey) {
      res.status(400).json({ success: false, error: 'Le paramètre fileKey est obligatoire.' });
      return;
    }

    const exists = await fichierExisteDansR2(fileKey);
    if (!exists) {
      res.status(404).json({ success: false, error: `Fichier non trouvé dans R2 : ${fileKey}` });
      return;
    }

    const signedUrl = await genererUrlPresigneeR2(fileKey, ttl);
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

    res.json({
      success: true,
      signedUrl,
      fileKey,
      expiresAt,
      ttlSeconds: ttl,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

// ─── GET /admin/documents/test-r2 ────────────────────────────────────────────
/**
 * Test de connectivité R2 : liste les 10 premiers objets du bucket.
 * Permet de valider la configuration R2 depuis le dashboard admin.
 */
router.get('/test-r2', authAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const command = new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      MaxKeys: 10,
      Prefix: 'documents/',
    });

    const response = await r2Client.send(command);

    const fichiers = (response.Contents || []).map((obj) => ({
      key: obj.Key,
      tailleMo: obj.Size ? parseFloat((obj.Size / (1024 * 1024)).toFixed(2)) : 0,
      modifie: obj.LastModified?.toISOString(),
    }));

    res.json({
      success: true,
      bucket: R2_BUCKET_NAME,
      endpoint: process.env.R2_ENDPOINT,
      nombreFichiers: response.KeyCount || 0,
      fichiers,
      message: '✅ Connexion R2 opérationnelle.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Test R2] Erreur de connectivité :', message);
    res.status(500).json({
      success: false,
      error: `❌ Connexion R2 échouée : ${message}`,
      endpoint: process.env.R2_ENDPOINT,
      bucket: R2_BUCKET_NAME,
    });
  }
});

export default router;
