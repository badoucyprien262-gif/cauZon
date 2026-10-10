/**
 * Serveur Backend cauZon — API Node.js / Express
 *
 * Intégration Cloudflare R2, synchronisation Supabase et services backend.
 *
 * @module index
 */

import dotenv from 'dotenv';
// Charger les variables d'environnement en premier
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import path from 'path';

import adminDocumentsRouter from './routes/adminDocuments';

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Sécurité & Middlewares globaux ──────────────────────────────────────────
// Désactiver CSP pour permettre le fonctionnement des scripts & styles inline du dashboard admin
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
  })
);

const allowedOrigins = [
  'https://app.cauzon.ci',
  'https://admin.cauzon.ci',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:8081',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}
if (process.env.ADMIN_URL) {
  allowedOrigins.push(process.env.ADMIN_URL);
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Autoriser requêtes sans en-tête origin (ex: curl/applications natives mobiles) ou domaines de confiance
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origine CORS non autorisée : ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
  })
);

app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Fichiers Statiques (Fallback de secours) ────────────────────────────────
// Servir le dossier public comme fallback de secours
app.use(express.static('public'));
app.use(express.static(path.join(__dirname, '../public')));

// Point d'entrée /admin : Service REST avec lien de fallback
app.get('/admin', (_req: Request, res: Response) => {
  res.json({
    service: 'cauZon Admin API',
    status: 'online',
    dashboardPWA: 'http://localhost:5173',
    fallbackUploadHtml: '/admin/upload.html',
    endpoints: {
      upload: 'POST /admin/documents/upload',
      signedUrl: 'GET /admin/documents/signed-url',
      testR2: 'GET /admin/documents/test-r2',
    },
  });
});

// ─── Santé & Racine ─────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'cauzon-backend',
    env: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'cauZon API',
    version: '1.0.0',
    description: 'API backend & passerelle de stockage R2 cauZon',
    endpoints: {
      health: '/health',
      adminDashboard: '/admin/upload.html',
      adminDocuments: '/admin/documents',
    },
  });
});

// ─── Montage des Routes API ──────────────────────────────────────────────────
// Routes d'administration des documents (Upload R2, URLs pré-signées, Test)
app.use('/admin/documents', adminDocumentsRouter);

// ─── Gestion des erreurs 404 ────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Route non trouvée.',
  });
});

// ─── Gestionnaire d'erreurs global ──────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Erreur Serveur] :', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Erreur interne du serveur.',
  });
});

// ─── Démarrage du Serveur ───────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 Serveur cauZon démarré sur http://localhost:${PORT}`);
    console.log(`📑 Dashboard Admin Upload : http://localhost:${PORT}/admin/upload.html`);
    console.log(`🔌 Routeur Admin Documents : http://localhost:${PORT}/admin/documents`);
    console.log(`🪣 Bucket Cloudflare R2   : ${process.env.R2_BUCKET_NAME || 'non configuré'}`);
  });
}

export default app;
