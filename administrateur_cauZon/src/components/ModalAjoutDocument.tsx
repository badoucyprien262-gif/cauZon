import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  UploadCloud,
  FileText,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Zap,
  Server,
  DollarSign,
  Layers,
  GraduationCap,
  BookOpen,
  Tag,
  Shield,
  RefreshCw,
} from 'lucide-react';
import { extraireNombrePagesPdf } from '../services/serviceDocuments';
import {
  uploaderDocumentViaBackend,
  testerConnexionR2Backend,
} from '../services/serviceR2Upload';
import type {
  UploadR2Response,
  R2TestResponse,
} from '../services/serviceR2Upload';

interface ModalAjoutDocumentProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  darkMode: boolean;
}

export function ModalAjoutDocument({
  isOpen,
  onClose,
  onSuccess,
  darkMode,
}: ModalAjoutDocumentProps) {
  // ── États Fichier & Aperçu ───────────────────────────────────────────────
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [detectedPages, setDetectedPages] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── États Métadonnées ───────────────────────────────────────────────────
  const [titre, setTitre] = useState('');
  const [categorie, setCategorie] = useState('');
  const [niveau, setNiveau] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [prix, setPrix] = useState('100');
  const [storageKey, setStorageKey] = useState('');
  const [limiteApercuType, setLimiteApercuType] = useState<'pourcentage' | 'page'>('pourcentage');
  const [limiteApercuValeur, setLimiteApercuValeur] = useState(30);
  const [estCertifie, setEstCertifie] = useState(true);

  // ── États Test R2 ───────────────────────────────────────────────────────
  const [r2Status, setR2Status] = useState<R2TestResponse | null>(null);
  const [testingR2, setTestingR2] = useState<boolean>(false);

  // ── États Upload & Progression ──────────────────────────────────────────
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [progressLabel, setProgressLabel] = useState<string>('');
  const [uploadResult, setUploadResult] = useState<UploadR2Response | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // ── Test initial de connectivité R2 à l'ouverture ────────────────────────
  useEffect(() => {
    if (isOpen) {
      testerConnexionR2();
    } else {
      // Réinitialisation partielle à la fermeture
      setErrorMessage('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const testerConnexionR2 = async () => {
    setTestingR2(true);
    try {
      const res = await testerConnexionR2Backend();
      setR2Status(res);
    } catch {
      setR2Status({ success: false, error: 'Impossible de joindre le backend.' });
    } finally {
      setTestingR2(false);
    }
  };

  // ── Gestion de la sélection du fichier ──────────────────────────────────
  const handleFileChange = async (file: File) => {
    if (!file || file.type !== 'application/pdf') {
      setErrorMessage('Seuls les fichiers PDF sont acceptés.');
      return;
    }
    setErrorMessage('');
    setSelectedFile(file);

    // Extraction auto du nombre de pages
    const nbPages = await extraireNombrePagesPdf(file);
    setDetectedPages(nbPages);

    // Pré-remplissage du titre et de la clé de stockage si vides
    if (!titre) {
      const nomSansExt = file.name.replace(/\.[^/.]+$/, '');
      setTitre(nomSansExt.replace(/[_-]+/g, ' '));
    }

    if (!storageKey) {
      const slug = file.name
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9._-]/g, '');
      const catFolder = categorie ? categorie.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'cours';
      setStorageKey(`${catFolder}/${slug}`);
    }
  };

  // ── Estimation de compression ──────────────────────────────────────────
  const estimerTailleCompressee = (tailleBytes: number): number => {
    if (tailleBytes > 5 * 1024 * 1024) return Math.round(tailleBytes * 0.55);
    if (tailleBytes > 2 * 1024 * 1024) return Math.round(tailleBytes * 0.65);
    return Math.round(tailleBytes * 0.78);
  };

  const formatTailleMo = (bytes: number): string => {
    return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
  };

  // ── Lancement de l'Upload ────────────────────────────────────────────────
  const handleLancerUpload = async () => {
    if (!selectedFile) {
      setErrorMessage('Veuillez sélectionner un fichier PDF.');
      return;
    }
    if (!titre.trim()) {
      setErrorMessage('Le titre du document est obligatoire.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(15);
    setProgressLabel('🗜️ Optimisation et compression du PDF via pdf-lib…');
    setErrorMessage('');
    setUploadResult(null);

    // Progression visuelle animée
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev < 45) {
          setProgressLabel('🗜️ Compression et suppression des métadonnées…');
          return prev + 8;
        } else if (prev < 75) {
          setProgressLabel('📤 Transfert chiffré vers Cloudflare R2 (0 FCFA d\'egress)…');
          return prev + 6;
        } else if (prev < 90) {
          setProgressLabel('⚡ Synchronisation de la table Supabase…');
          return prev + 3;
        }
        return prev;
      });
    }, 450);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('titre', titre.trim());
      if (categorie.trim()) formData.append('categorie', categorie.trim());
      if (niveau.trim()) formData.append('niveau', niveau.trim());
      if (description.trim()) formData.append('description', description.trim());
      if (tags.trim()) formData.append('tags', tags.trim());
      formData.append('prix', prix);
      formData.append('nombre_pages', String(detectedPages || 1));
      formData.append('est_certifie', String(estCertifie));
      formData.append('limite_apercu_type', limiteApercuType);
      formData.append('limite_apercu_valeur', String(limiteApercuValeur));
      formData.append(
        'limite_apercu_pages',
        String(
          limiteApercuType === 'page'
            ? limiteApercuValeur
            : Math.max(1, Math.round((detectedPages || 10) * (limiteApercuValeur / 100)))
        )
      );
      formData.append('status', 'published');

      if (storageKey.trim()) {
        formData.append('storageKey', storageKey.trim());
      }

      const res = await uploaderDocumentViaBackend(formData);

      clearInterval(progressInterval);
      setUploadProgress(100);
      setProgressLabel('✅ Document uploadé et synchronisé !');

      if (res.success) {
        setUploadResult(res);
        onSuccess(); // Actualisation du catalogue de cours
      } else {
        setErrorMessage(res.error || "Erreur lors de l'upload.");
      }
    } catch (err: unknown) {
      clearInterval(progressInterval);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Erreur réseau : ${msg}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleReinitialiser = () => {
    setSelectedFile(null);
    setTitre('');
    setCategorie('');
    setNiveau('');
    setDescription('');
    setTags('');
    setPrix('100');
    setStorageKey('');
    setUploadResult(null);
    setErrorMessage('');
    setUploadProgress(0);
  };

  // ── Styles Thématiques ──────────────────────────────────────────────────
  const bgCard = darkMode ? '#181822' : '#FFFFFF';
  const bgInput = darkMode ? '#111119' : '#F9FAFB';
  const border = darkMode ? '#2B2B3D' : '#E5E7EB';
  const textColor = darkMode ? '#FAF6EB' : '#1F2937';
  const textSub = darkMode ? '#9CA3AF' : '#6B7280';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        backgroundColor: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '780px',
          maxHeight: '92vh',
          backgroundColor: bgCard,
          borderRadius: '16px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          border: `1px solid ${border}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* ── En-tête de la Modale ── */}
        <div
          style={{
            padding: '18px 24px',
            backgroundColor: '#6B1124',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: 'rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FAF6EB',
              }}
            >
              <UploadCloud size={22} />
            </div>
            <div>
              <h2
                style={{
                  color: '#FAF6EB',
                  margin: 0,
                  fontSize: '18px',
                  fontWeight: 800,
                  fontFamily: 'Outfit, sans-serif',
                }}
              >
                Upload &amp; Compression R2 — cauZon
              </h2>
              <p
                style={{
                  color: 'rgba(250,246,235,0.75)',
                  margin: '2px 0 0',
                  fontSize: '12px',
                }}
              >
                Stockage Cloudflare R2 (0 FCFA d'egress) &bull; Optimisation automatique
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Statut R2 */}
            <div
              onClick={testerConnexionR2}
              title="Cliquer pour re-tester la connexion R2"
              style={{
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                backgroundColor: r2Status?.success ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                color: r2Status?.success ? '#22C55E' : '#EF4444',
                border: `1px solid ${r2Status?.success ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: r2Status?.success ? '#22C55E' : '#EF4444',
                }}
              />
              {testingR2 ? 'Test R2…' : r2Status?.success ? 'R2 Connecté' : 'R2 Hors-ligne'}
              <RefreshCw size={11} className={testingR2 ? 'spin' : ''} />
            </div>

            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#FAF6EB',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── Corps Déroulable ── */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Notification d'erreur */}
          {errorMessage && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '10px',
                backgroundColor: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#EF4444',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Résultat après upload réussi */}
          {uploadResult && uploadResult.success && (
            <div
              style={{
                padding: '20px',
                borderRadius: '12px',
                backgroundColor: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.3)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#22C55E', fontWeight: 800, fontSize: '15px' }}>
                <CheckCircle size={22} />
                <span>Document compressé, stocké sur R2 et synchronisé dans Supabase !</span>
              </div>

              {uploadResult.compression && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: '12px',
                    marginTop: '6px',
                  }}
                >
                  <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: darkMode ? '#111119' : '#FFFFFF', border: `1px solid ${border}` }}>
                    <div style={{ fontSize: '11px', color: textSub }}>Taille Originale</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: textColor }}>{uploadResult.compression.originalSizeMo}</div>
                  </div>
                  <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: darkMode ? '#111119' : '#FFFFFF', border: `1px solid ${border}` }}>
                    <div style={{ fontSize: '11px', color: textSub }}>Taille Optimisée</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#22C55E' }}>{uploadResult.compression.compressedSizeMo}</div>
                  </div>
                  <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)' }}>
                    <div style={{ fontSize: '11px', color: '#22C55E', fontWeight: 600 }}>Économie Réelle</div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#22C55E' }}>{uploadResult.compression.economiePercent}%</div>
                  </div>
                </div>
              )}

              <div style={{ fontSize: '12px', color: textSub, wordBreak: 'break-all', marginTop: '4px' }}>
                <strong>Clé R2 :</strong> <code>{uploadResult.fileKey}</code>
                {uploadResult.supabaseId && (
                  <span style={{ marginLeft: '12px' }}>
                    <strong>ID Supabase :</strong> <code>{uploadResult.supabaseId}</code>
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  onClick={handleReinitialiser}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: `1px solid ${border}`,
                    backgroundColor: 'transparent',
                    color: textColor,
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ➕ Uploader un autre cours
                </button>
                <button
                  onClick={onClose}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#6B1124',
                    color: '#FAF6EB',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Fermer &amp; Voir dans le catalogue
                </button>
              </div>
            </div>
          )}

          {/* Section 1 : Sélection & Drag and Drop du PDF */}
          {!uploadResult && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: textColor, marginBottom: '8px' }}>
                  Fichier PDF du cours <span style={{ color: '#EF4444' }}>*</span>
                </label>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    if (e.dataTransfer.files[0]) handleFileChange(e.dataTransfer.files[0]);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragActive || selectedFile ? '#6B1124' : border}`,
                    borderRadius: '12px',
                    padding: '24px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    backgroundColor: selectedFile
                      ? darkMode
                        ? 'rgba(107,17,36,0.15)'
                        : 'rgba(107,17,36,0.04)'
                      : bgInput,
                    transition: 'all 0.2s',
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    style={{ display: 'none' }}
                    onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
                  />

                  {selectedFile ? (
                    <div>
                      <span style={{ fontSize: '32px' }}>📄</span>
                      <p style={{ color: '#6B1124', fontWeight: 800, fontSize: '15px', margin: '8px 0 4px' }}>
                        {selectedFile.name}
                      </p>
                      <p style={{ color: textSub, fontSize: '13px', margin: 0 }}>
                        Taille originale : <strong>{formatTailleMo(selectedFile.size)}</strong>
                        {detectedPages > 0 && ` &bull; ${detectedPages} pages détectées ✨`}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div
                        style={{
                          width: '46px',
                          height: '46px',
                          borderRadius: '50%',
                          backgroundColor: darkMode ? '#2B2B3D' : '#E5E7EB',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#6B1124',
                          marginBottom: '8px',
                        }}
                      >
                        <UploadCloud size={24} />
                      </div>
                      <p style={{ color: textColor, fontWeight: 700, fontSize: '14px', margin: '4px 0' }}>
                        Glissez-déposez le PDF ici ou cliquez pour parcourir
                      </p>
                      <p style={{ color: textSub, fontSize: '12px', margin: 0 }}>
                        Fichier PDF accepté jusqu'à 50 Mo &bull; Optimisation automatique à l'upload
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Aperçu de compression en direct */}
              {selectedFile && (
                <div
                  style={{
                    padding: '14px 18px',
                    borderRadius: '10px',
                    backgroundColor: darkMode ? '#14141E' : '#F0FDF4',
                    border: '1px solid rgba(34,197,94,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Sparkles size={18} color="#22C55E" />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: textColor }}>
                        Aperçu d'optimisation (pdf-lib)
                      </div>
                      <div style={{ fontSize: '12px', color: textSub }}>
                        {formatTailleMo(selectedFile.size)} ➔{' '}
                        <strong style={{ color: '#22C55E' }}>
                          ~{formatTailleMo(estimerTailleCompressee(selectedFile.size))}
                        </strong>
                      </div>
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: '16px',
                      backgroundColor: 'rgba(34,197,94,0.15)',
                      color: '#22C55E',
                      fontSize: '11px',
                      fontWeight: 800,
                    }}
                  >
                    ~25-45% d'économie estimée
                  </span>
                </div>
              )}

              {/* Section 2 : Métadonnées du cours */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {/* Titre */}
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: textColor, marginBottom: '6px' }}>
                    Titre du document / cours <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={titre}
                    onChange={(e) => setTitre(e.target.value)}
                    placeholder="Ex: Algèbre Linéaire & Espaces Vectoriels"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: `1px solid ${border}`,
                      backgroundColor: bgInput,
                      color: textColor,
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Matière / Catégorie */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: textColor, marginBottom: '6px' }}>
                    Matière / Catégorie
                  </label>
                  <input
                    type="text"
                    value={categorie}
                    onChange={(e) => setCategorie(e.target.value)}
                    placeholder="Ex: Mathématiques, Droit, Économie…"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: `1px solid ${border}`,
                      backgroundColor: bgInput,
                      color: textColor,
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Niveau académique / Filière */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: textColor, marginBottom: '6px' }}>
                    Filière / Niveau académique
                  </label>
                  <input
                    type="text"
                    value={niveau}
                    onChange={(e) => setNiveau(e.target.value)}
                    placeholder="Ex: Licence 1, Master 2, MIAGE…"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: `1px solid ${border}`,
                      backgroundColor: bgInput,
                      color: textColor,
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Clé de stockage R2 */}
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 700, color: textColor }}>
                      Clé de Stockage R2 (path R2)
                    </label>
                    <span style={{ fontSize: '11px', color: textSub }}>Auto-générée depuis le fichier</span>
                  </div>
                  <input
                    type="text"
                    value={storageKey}
                    onChange={(e) => setStorageKey(e.target.value)}
                    placeholder="Ex: mathematiques/algebre_lineaire.pdf"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: `1px solid ${border}`,
                      backgroundColor: bgInput,
                      color: textColor,
                      fontSize: '13px',
                      fontFamily: 'monospace',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Prix FCFA */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: textColor, marginBottom: '6px' }}>
                    Prix d'accès (FCFA)
                  </label>
                  <input
                    type="number"
                    value={prix}
                    onChange={(e) => setPrix(e.target.value)}
                    min="0"
                    step="50"
                    placeholder="100"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: `1px solid ${border}`,
                      backgroundColor: bgInput,
                      color: textColor,
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <span style={{ fontSize: '11px', color: textSub, marginTop: '4px', display: 'block' }}>
                    {parseFloat(prix) > 0 ? '🔒 Document payant avec paywall' : '🎁 Document 100% gratuit'}
                  </span>
                </div>

                {/* Tags */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: textColor, marginBottom: '6px' }}>
                    Tags (séparés par virgule)
                  </label>
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="cours, examen, td, fiche"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: `1px solid ${border}`,
                      backgroundColor: bgInput,
                      color: textColor,
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Description */}
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: textColor, marginBottom: '6px' }}>
                    Description / Sommaire du cours
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Présentez les objectifs pédagogiques, chapitres clés ou conseils d'examen…"
                    rows={2}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: `1px solid ${border}`,
                      backgroundColor: bgInput,
                      color: textColor,
                      fontSize: '14px',
                      outline: 'none',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Configuration Paywall */}
                {parseFloat(prix) > 0 && (
                  <div
                    style={{
                      gridColumn: 'span 2',
                      padding: '14px',
                      borderRadius: '10px',
                      backgroundColor: darkMode ? '#14141E' : '#F9FAFB',
                      border: `1px solid ${border}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <label style={{ fontSize: '13px', fontWeight: 700, color: textColor }}>
                        Coupure aperçu gratuit : {limiteApercuValeur}
                        {limiteApercuType === 'pourcentage' ? '%' : ' pages'}
                      </label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => setLimiteApercuType('pourcentage')}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            border: 'none',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            backgroundColor: limiteApercuType === 'pourcentage' ? '#6B1124' : border,
                            color: limiteApercuType === 'pourcentage' ? '#FAF6EB' : textSub,
                          }}
                        >
                          % Pourcentage
                        </button>
                        <button
                          type="button"
                          onClick={() => setLimiteApercuType('page')}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            border: 'none',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            backgroundColor: limiteApercuType === 'page' ? '#6B1124' : border,
                            color: limiteApercuType === 'page' ? '#FAF6EB' : textSub,
                          }}
                        >
                          Pages fixes
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={limiteApercuType === 'pourcentage' ? 100 : (detectedPages || 50)}
                      value={limiteApercuValeur}
                      onChange={(e) => setLimiteApercuValeur(parseInt(e.target.value, 10))}
                      style={{ width: '100%', accentColor: '#6B1124' }}
                    />
                  </div>
                )}

                {/* Option certifié */}
                <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    id="certifie-modal"
                    checked={estCertifie}
                    onChange={(e) => setEstCertifie(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: '#6B1124', cursor: 'pointer' }}
                  />
                  <label
                    htmlFor="certifie-modal"
                    style={{ fontSize: '13px', fontWeight: 600, color: textColor, cursor: 'pointer' }}
                  >
                    🏅 Marquer comme document officiel certifié par cauZon
                  </label>
                </div>
              </div>
            </>
          )}

          {/* Barre de progression pendant l'upload */}
          {isUploading && (
            <div style={{ marginTop: '8px' }}>
              <div
                style={{
                  height: '8px',
                  backgroundColor: darkMode ? '#2B2B3D' : '#E5E7EB',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  marginBottom: '8px',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${uploadProgress}%`,
                    backgroundColor: '#6B1124',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#6B1124',
                  textAlign: 'center',
                }}
              >
                {progressLabel} ({uploadProgress}%)
              </div>
            </div>
          )}
        </div>

        {/* ── Pied de la Modale ── */}
        {!uploadResult && (
          <div
            style={{
              padding: '16px 24px',
              borderTop: `1px solid ${border}`,
              backgroundColor: darkMode ? '#14141E' : '#F9FAFB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <button
              onClick={onClose}
              disabled={isUploading}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                border: `1px solid ${border}`,
                backgroundColor: 'transparent',
                color: textColor,
                fontSize: '14px',
                fontWeight: 600,
                cursor: isUploading ? 'not-allowed' : 'pointer',
              }}
            >
              Annuler
            </button>

            <button
              onClick={handleLancerUpload}
              disabled={isUploading || !selectedFile}
              style={{
                padding: '11px 24px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: isUploading || !selectedFile ? '#9CA3AF' : '#6B1124',
                color: '#FAF6EB',
                fontSize: '14px',
                fontWeight: 700,
                cursor: isUploading || !selectedFile ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: isUploading || !selectedFile ? 'none' : '0 4px 14px rgba(107,17,36,0.35)',
              }}
            >
              {isUploading ? (
                <>⏳ Upload &amp; Compression…</>
              ) : (
                <>
                  <Zap size={16} /> Compresser &amp; Uploader vers R2
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
