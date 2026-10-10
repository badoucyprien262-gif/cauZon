/**
 * Client S3 compatible Cloudflare R2
 * Cloudflare R2 est 100% compatible avec l'API S3 AWS.
 * Zéro frais d'egress pour les téléchargements (vs AWS S3).
 *
 * @module lib/r2Client
 */

import { S3Client } from '@aws-sdk/client-s3';

// ─── Validation des variables d'environnement ────────────────────────────────
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.warn(
    '⚠️  [r2Client] Variables R2 manquantes (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY). ' +
    'Le client R2 ne sera pas fonctionnel. Vérifiez votre fichier .env.'
  );
}

/**
 * Client S3 pointant sur le bucket Cloudflare R2 cauzon-docs.
 *
 * Configuration :
 *  - region: 'auto' (obligatoire pour R2 — R2 n'utilise pas les régions AWS)
 *  - endpoint: URL du compte R2 (https://<account_id>.r2.cloudflarestorage.com)
 *  - forcePathStyle: true (requis pour la compatibilité R2 / S3 path-style)
 */
export const r2Client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT || '',
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID || '',
    secretAccessKey: R2_SECRET_ACCESS_KEY || '',
  },
  // Cloudflare R2 exige le path-style (https://endpoint/bucket/key)
  forcePathStyle: true,
});

export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'cauzon-docs';
