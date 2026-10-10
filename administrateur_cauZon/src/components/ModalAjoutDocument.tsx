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
  Image as ImageIcon,
  Trash2,
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
import {
  extraireCouverturePdfPage1,
  uploaderImageCouverture,
} from '../services/servicePdfCouverture';

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

  // ── États Image de Couverture / Miniature ───────────────────────────────
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [autoCoverBlob, setAutoCoverBlob] = useState<Blob | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [isAutoCover, setIsAutoCover] = useState<boolean>(false);
  const [isExtractingCover, setIsExtractingCover] = useState<boolean>(false);
  const [coverDragActive, setCoverDragActive] = useState<boolean>(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

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

  // Nettoyage de l'URL objet d'aperçu
  useEffect(() => {
    return () => {
      if (coverPreviewUrl) {
        URL.revokeObjectURL(coverPreviewUrl);
      }
    };
  }, [coverPreviewUrl]);

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

  // ── Extraction automatique de la Page 1 (Fallback) ──────────────────────
  const lancerExtractionPage1 = async (file: File) => {
    setIsExtractingCover(true);
    try {
      const blob = await extraireCouverturePdfPage1(file);
      setAutoCoverBlob(blob);
      setCoverPreviewUrl((prev) => {
        if (prev && isAutoCover) {
          URL.revokeObjectURL(prev);
        }
        return URL.createObjectURL(blob);
      });
      setIsAutoCover(true);
    } catch (err) {
      console.warn('Note : Extraction automatique de la page 1 ignorée ou impossible :', err);
    } finally {
      setIsExtractingCover(false);
    }
  };

  // ── Gestion de la sélection manuelle de couverture ──────────────────────
  const handleCoverChange = (file: File) => {
    if (!file) return;
    if (!file.type.match(/^image\/(png|jpeg|jpg|webp)$/i)) {
      setErrorMessage('Seuls les formats PNG, JPEG ou WebP sont acceptés pour la couverture.');
      return;
    }
    setErrorMessage('');
    setCoverFile(file);
    setIsAutoCover(false);
    if (coverPreviewUrl && isAutoCover) {
      URL.revokeObjectURL(coverPreviewUrl);
    }
    const preview = URL.createObjectURL(file);
    setCoverPreviewUrl(preview);
  };

  const handleSupprimerCouverture = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (coverPreviewUrl) {
      URL.revokeObjectURL(coverPreviewUrl);
    }
    setCoverFile(null);
    if (!isAutoCover && autoCoverBlob) {
      // Rétablir la miniature extraite de la Page 1
      const preview = URL.createObjectURL(autoCoverBlob);
      setCoverPreviewUrl(preview);
      setIsAutoCover(true);
    } else {
      setAutoCoverBlob(null);
      setCoverPreviewUrl(null);
      setIsAutoCover(false);
    }
    if (coverInputRef.current) {
      coverInputRef.current.value = '';
    }
  };

  // ── Gestion de la sélection du fichier PDF ──────────────────────────────
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

    // Extraction automatique de la page 1 si aucune image manuelle n'a été spécifiée
    if (!coverFile) {
      lancerExtractionPage1(file);
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
    setUploadProgress(12);
    setProgressLabel('🗜️ Optimisation et compression du PDF via pdf-lib…');
    setErrorMessage('');
    setUploadResult(null);

    // Progression visuelle animée
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev < 40) {
          setProgressLabel('🗜️ Compression et suppression des métadonnées…');
          return prev + 7;
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
      // 1. Téléversement de l'image de couverture si présente (manuelle ou extraite Page 1)
      let finalCoverUrl: string | null = null;
      const coverToUpload = coverFile || autoCoverBlob;

      if (coverToUpload) {
        setProgressLabel('🖼️ Téléversement de la miniature / couverture…');
        try {
          finalCoverUrl = await uploaderImageCouverture(
            coverToUpload,
            titre.trim() || selectedFile.name
          );
        } catch (coverErr) {
          console.warn('Avertissement téléversement couverture :', coverErr);
        }
      }

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

      // Persistance de l'URL finale de la couverture dans Supabase
      if (finalCoverUrl) {
        formData.append('cover_url', finalCoverUrl);
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
    if (coverPreviewUrl) {
      URL.revokeObjectURL(coverPreviewUrl);
    }
    setSelectedFile(null);
    setCoverFile(null);
    setAutoCoverBlob(null);
    setCoverPreviewUrl(null);
    setIsAutoCover(false);
    setIsExtractingCover(false);
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
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (coverInputRef.current) coverInputRef.current.value = '';
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

              {coverPreviewUrl && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: darkMode ? '#111119' : '#FFFFFF',
                    border: `1px solid ${border}`,
                    marginTop: '2px',
                  }}
                >
                  <img
                    src={coverPreviewUrl}
                    alt="Miniature"
                    style={{
                      width: '42px',
                      height: '56px',
                      objectFit: 'cover',
                      borderRadius: '6px',
                      border: '1px solid rgba(0,0,0,0.1)',
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: textColor }}>
                      Couverture &amp; Miniature associées
                    </div>
                    <div style={{ fontSize: '11px', color: textSub }}>
                      {isAutoCover
                        ? 'Miniature extraite de la Page 1 (sauvegardée et synchronisée)'
                        : 'Image de couverture personnalisée sauvegardée'}
                    </div>
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

          {/* Section 1 : Sélection & Drag and Drop du PDF & Couverture */}
          {!uploadResult && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
                  gap: '16px',
                }}
              >
                {/* Colonne Gauche : Dépôt PDF (Obligatoire) */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 700,
                      color: textColor,
                      marginBottom: '8px',
                    }}
                  >
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
                      padding: '16px',
                      minHeight: '150px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      cursor: 'pointer',
                      backgroundColor: selectedFile
                        ? darkMode
                          ? 'rgba(107,17,36,0.15)'
                          : 'rgba(107,17,36,0.04)'
                        : bgInput,
                      transition: 'all 0.2s',
                      boxSizing: 'border-box',
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
                      <div style={{ maxWidth: '100%', overflow: 'hidden' }}>
                        <span style={{ fontSize: '30px' }}>📄</span>
                        <p
                          style={{
                            color: '#6B1124',
                            fontWeight: 800,
                            fontSize: '14px',
                            margin: '6px 0 2px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={selectedFile.name}
                        >
                          {selectedFile.name}
                        </p>
                        <p style={{ color: textSub, fontSize: '12px', margin: 0 }}>
                          Taille : <strong>{formatTailleMo(selectedFile.size)}</strong>
                          {detectedPages > 0 && ` &bull; ${detectedPages} pages ✨`}
                        </p>
                        <span
                          style={{
                            display: 'inline-block',
                            marginTop: '6px',
                            fontSize: '11px',
                            color: '#6B1124',
                            fontWeight: 600,
                          }}
                        >
                          Cliquer pour changer de fichier
                        </span>
                      </div>
                    ) : (
                      <div>
                        <div
                          style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '50%',
                            backgroundColor: darkMode ? '#2B2B3D' : '#E5E7EB',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#6B1124',
                            marginBottom: '6px',
                          }}
                        >
                          <UploadCloud size={22} />
                        </div>
                        <p style={{ color: textColor, fontWeight: 700, fontSize: '13px', margin: '2px 0' }}>
                          Glissez le PDF ici ou cliquez
                        </p>
                        <p style={{ color: textSub, fontSize: '11px', margin: 0 }}>
                          PDF jusqu'à 50 Mo &bull; Optimisation auto
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Colonne Droite : Image de Couverture / Miniature (Recommandée) */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '8px',
                    }}
                  >
                    <label style={{ fontSize: '13px', fontWeight: 700, color: textColor }}>
                      Image de couverture / Miniature{' '}
                      <span style={{ color: textSub, fontWeight: 500 }}>(Recommandée)</span>
                    </label>

                    {isExtractingCover && (
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#6B1124',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <RefreshCw size={11} className="spin" /> Extraction Page 1…
                      </span>
                    )}

                    {!isExtractingCover && coverPreviewUrl && (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '12px',
                          backgroundColor: isAutoCover
                            ? 'rgba(59,130,246,0.14)'
                            : 'rgba(34,197,94,0.14)',
                          color: isAutoCover ? '#3B82F6' : '#22C55E',
                          border: `1px solid ${
                            isAutoCover ? 'rgba(59,130,246,0.3)' : 'rgba(34,197,94,0.3)'
                          }`,
                        }}
                      >
                        {isAutoCover ? '✨ Auto (Page 1)' : '📸 Personnalisée'}
                      </span>
                    )}
                  </div>

                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    style={{ display: 'none' }}
                    onChange={(e) => e.target.files?.[0] && handleCoverChange(e.target.files[0])}
                  />

                  {coverPreviewUrl ? (
                    <div
                      style={{
                        position: 'relative',
                        borderRadius: '12px',
                        border: `2px solid ${border}`,
                        backgroundColor: darkMode ? '#0B0B10' : '#F3F4F6',
                        overflow: 'hidden',
                        height: '150px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxSizing: 'border-box',
                      }}
                    >
                      <img
                        src={coverPreviewUrl}
                        alt="Aperçu couverture"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                        }}
                      />

                      {/* Boutons d'actions overlay */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          display: 'flex',
                          gap: '6px',
                          zIndex: 3,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => coverInputRef.current?.click()}
                          title="Remplacer par une image personnalisée"
                          style={{
                            padding: '5px 10px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(0,0,0,0.75)',
                            color: '#FAF6EB',
                            border: '1px solid rgba(255,255,255,0.2)',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            backdropFilter: 'blur(4px)',
                          }}
                        >
                          <ImageIcon size={12} /> Remplacer
                        </button>
                        <button
                          type="button"
                          onClick={handleSupprimerCouverture}
                          title="Supprimer la couverture"
                          style={{
                            padding: '5px 8px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(239,68,68,0.85)',
                            color: '#FFFFFF',
                            border: 'none',
                            fontSize: '11px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>

                      {/* Bandeau d'information bas */}
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          padding: '4px 10px',
                          backgroundColor: 'rgba(0,0,0,0.7)',
                          backdropFilter: 'blur(3px)',
                          color: '#FAF6EB',
                          fontSize: '11px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          zIndex: 2,
                        }}
                      >
                        <span
                          style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '75%',
                          }}
                        >
                          {isAutoCover
                            ? 'Page 1 extraite automatiquement (Défaut)'
                            : coverFile?.name || 'Image personnalisée'}
                        </span>
                        <span style={{ fontSize: '10px', opacity: 0.85 }}>Ratio carte</span>
                      </div>
                    </div>
                  ) : (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setCoverDragActive(true);
                      }}
                      onDragLeave={() => setCoverDragActive(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setCoverDragActive(false);
                        if (e.dataTransfer.files[0]) handleCoverChange(e.dataTransfer.files[0]);
                      }}
                      onClick={() => coverInputRef.current?.click()}
                      style={{
                        border: `2px dashed ${coverDragActive ? '#6B1124' : border}`,
                        borderRadius: '12px',
                        minHeight: '150px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        cursor: 'pointer',
                        backgroundColor: coverDragActive
                          ? darkMode
                            ? 'rgba(107,17,36,0.15)'
                            : 'rgba(107,17,36,0.04)'
                          : bgInput,
                        transition: 'all 0.2s',
                        padding: '16px',
                        boxSizing: 'border-box',
                      }}
                    >
                      {isExtractingCover ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                          <RefreshCw size={26} color="#6B1124" className="spin" />
                          <p style={{ color: textColor, fontWeight: 700, fontSize: '13px', margin: '4px 0 0' }}>
                            Extraction de la Page 1…
                          </p>
                          <p style={{ color: textSub, fontSize: '11px', margin: 0 }}>
                            Génération d'une miniature haute fidélité
                          </p>
                        </div>
                      ) : (
                        <div>
                          <div
                            style={{
                              width: '42px',
                              height: '42px',
                              borderRadius: '50%',
                              backgroundColor: darkMode ? '#2B2B3D' : '#E5E7EB',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#6B1124',
                              marginBottom: '6px',
                            }}
                          >
                            <ImageIcon size={22} />
                          </div>
                          <p style={{ color: textColor, fontWeight: 700, fontSize: '13px', margin: '2px 0' }}>
                            Glisser une image ou parcourir
                          </p>
                          <p style={{ color: textSub, fontSize: '11px', margin: 0 }}>
                            PNG, JPEG, WebP &bull; Fallback auto sur Page 1 ✨
                          </p>
                        </div>
                      )}
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
