import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { LecteurPdfProps } from './PdfViewer/types';

/**
 * Charge dynamiquement PDFLib sans inclusion statique dans le bundle Metro
 * Utilisé pour le calcul du nombre réel de pages et le découpage DRM sécurisé
 */
async function getPDFDocumentClass(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if ((window as any).PDFLib?.PDFDocument) {
    return (window as any).PDFLib.PDFDocument;
  }
  if (typeof document === 'undefined') return null;

  return new Promise((resolve, reject) => {
    const scriptId = 'pdf-lib-bundle-loader';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (script) {
      if ((window as any).PDFLib?.PDFDocument) {
        return resolve((window as any).PDFLib.PDFDocument);
      }
      script.addEventListener('load', () => {
        if ((window as any).PDFLib?.PDFDocument) resolve((window as any).PDFLib.PDFDocument);
        else reject(new Error('PDFLib introuvable après chargement'));
      });
      script.addEventListener('error', () => reject(new Error('Échec chargement pdf-lib')));
      return;
    }

    const injectCdnFallback = () => {
      if (typeof document === 'undefined') return reject(new Error('Document introuvable'));
      const cdnScript = document.createElement('script');
      cdnScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.9/pdf-lib.min.js';
      cdnScript.onload = () => {
        if ((window as any).PDFLib?.PDFDocument) {
          resolve((window as any).PDFLib.PDFDocument);
        } else {
          reject(new Error('PDFLib introuvable via CDN'));
        }
      };
      cdnScript.onerror = () => reject(new Error('Échec de chargement CDN de pdf-lib'));
      document.head.appendChild(cdnScript);
    };

    script = document.createElement('script');
    script.id = scriptId;
    script.src = '/pdf-lib.min.js';
    script.onload = () => {
      if ((window as any).PDFLib?.PDFDocument) {
        resolve((window as any).PDFLib.PDFDocument);
      } else {
        injectCdnFallback();
      }
    };
    script.onerror = () => {
      injectCdnFallback();
    };
    document.head.appendChild(script);
  });
}

interface ErrorBoundaryProps {
  estSombre?: boolean;
  onReessayer?: () => void;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class LecteurPdfErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[LecteurPdf] Erreur interceptée par ErrorBoundary :', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            flex: 1,
            width: '100%',
            height: '100%',
            minHeight: '300px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            backgroundColor: this.props.estSombre ? '#0F172A' : '#F8FAFC',
            color: this.props.estSombre ? '#F1F5F9' : '#0F172A',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 700 }}>
            Erreur d'affichage du document
          </h3>
          <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#64748B', textAlign: 'center', maxWidth: 400 }}>
            {this.state.error?.message || 'Une anomalie est survenue lors de l’affichage du visualiseur PDF.'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onReessayer?.();
            }}
            style={{
              padding: '10px 20px',
              backgroundColor: '#7F011F',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 8,
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            🔄 Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * LecteurPdfDesktop (Moteur Vectoriel Haute Fidélité avec Synchronisation Pagination Réelle)
 */
const LecteurPdfDesktopInternal: React.FC<LecteurPdfProps> = ({
  urlFichier,
  pdfUrl,
  titre,
  nombrePages,
  document: docProp,
  estVerrouille = false,
  limiteApercuPages = 1,
  limiteApercuType = 'pourcentage',
  limiteApercuValeur = 30,
  prix = 100,
  estSombre = false,
  onAcheter,
  onVip,
  onPageChange,
  onDocumentLoad,
  onError,
  onReessayer,
}) => {
  // 1. Extraction prioritaire du total de pages réel depuis les métadonnées
  const totalMeta = Number(
    nombrePages ||
    docProp?.nombre_pages ||
    docProp?.nombrePages ||
    (docProp as any)?.pageCount ||
    0
  );

  const [chargement, setChargement] = useState<boolean>(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [urlAffichee, setUrlAffichee] = useState<string | null>(null);
  const [pagesApercuAutorisees, setPagesApercuAutorisees] = useState<number>(1);
  const [nombrePagesTotal, setNombrePagesTotal] = useState<number>(totalMeta > 1 ? totalMeta : 1);
  const [pageCourante, setPageCourante] = useState<number>(1);
  const [estPleinEcran, setEstPleinEcran] = useState<boolean>(false);
  const [messageNotification, setMessageNotification] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const blobUrlCreeRef = useRef<string | null>(null);
  const timerNotificationRef = useRef<any>(null);

  // Synchronisation dynamique si la prop métadonnée change
  useEffect(() => {
    if (totalMeta > 1 && totalMeta !== nombrePagesTotal) {
      setNombrePagesTotal(totalMeta);
    }
  }, [totalMeta]);

  // Nettoyage systématique des URL Blob mémoire lors du démontage
  useEffect(() => {
    return () => {
      if (blobUrlCreeRef.current) {
        URL.revokeObjectURL(blobUrlCreeRef.current);
        blobUrlCreeRef.current = null;
      }
      if (timerNotificationRef.current) {
        clearTimeout(timerNotificationRef.current);
      }
    };
  }, []);

  const afficherNotification = useCallback((message: string) => {
    setMessageNotification(message);
    if (timerNotificationRef.current) clearTimeout(timerNotificationRef.current);
    timerNotificationRef.current = setTimeout(() => {
      setMessageNotification(null);
    }, 2800);
  }, []);

  // Protection Anti-Fuite & Anti-Impression : Interception stricte des raccourcis Ctrl+P / Ctrl+S
  useEffect(() => {
    const intercepterRaccourcis = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        e.stopPropagation();
        afficherNotification('🔒 L\'impression directe est désactivée pour protéger ce document cauZon.');
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        e.stopPropagation();
        afficherNotification('🔒 Le téléchargement direct du fichier brut est restreint sur cauZon.');
      }
    };

    window.addEventListener('keydown', intercepterRaccourcis, { capture: true });
    return () => {
      window.removeEventListener('keydown', intercepterRaccourcis, { capture: true });
    };
  }, [afficherNotification]);

  const sourceBrute = pdfUrl || (typeof urlFichier === 'string' ? urlFichier : null);

  // Préparation du document, lecture dynamique du total de pages & Sécurisation Paywall DRM
  useEffect(() => {
    let estActif = true;

    async function preparerDocumentDesktop() {
      try {
        setChargement(true);
        setErreur(null);

        // Document totalement verrouillé (0 page autorisée)
        if (estVerrouille && limiteApercuValeur === 0) {
          if (estActif) {
            setUrlAffichee(null);
            setChargement(false);
          }
          return;
        }

        if (!sourceBrute && !urlFichier) {
          throw new Error('Aucune source PDF disponible pour le document.');
        }

        let arrayBuffer: ArrayBuffer | null = null;
        let urlDirecte: string | null = null;

        // Résolution de la source : String HTTP/Blob, Base64 ou Uint8Array
        if (typeof sourceBrute === 'string') {
          if (sourceBrute.startsWith('http://') || sourceBrute.startsWith('https://') || sourceBrute.startsWith('blob:')) {
            urlDirecte = sourceBrute;
          } else if (sourceBrute.startsWith('data:application/pdf;base64,')) {
            const b64 = sourceBrute.replace('data:application/pdf;base64,', '');
            const binStr = atob(b64);
            const len = binStr.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binStr.charCodeAt(i);
            }
            arrayBuffer = bytes.buffer;
          } else {
            try {
              const binStr = atob(sourceBrute);
              const len = binStr.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                bytes[i] = binStr.charCodeAt(i);
              }
              arrayBuffer = bytes.buffer as ArrayBuffer;
            } catch (_) {
              urlDirecte = sourceBrute;
            }
          }
        } else if (urlFichier instanceof Uint8Array) {
          arrayBuffer = urlFichier.buffer as ArrayBuffer;
        }

        // Si le total de pages n'est pas encore connu avec certitude (> 1) ou si le document est verrouillé :
        // Téléchargement du buffer pour inspection du nombre de pages et/ou découpage DRM
        if ((totalMeta <= 1 || estVerrouille) && !arrayBuffer && urlDirecte) {
          try {
            const resp = await fetch(urlDirecte);
            if (resp.ok) {
              arrayBuffer = await resp.arrayBuffer();
            }
          } catch (fetchErr) {
            console.warn('[LecteurPdfDesktop] Note récupération buffer pour comptage pages :', fetchErr);
          }
        }

        let totalCalcule = totalMeta > 1 ? totalMeta : 1;

        // Lecture dynamique du nombre réel de pages via pdf-lib si arrayBuffer disponible
        if (arrayBuffer) {
          try {
            const PDFDocument = await getPDFDocumentClass();
            if (PDFDocument) {
              const probeDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
              const pageCount = probeDoc.getPageCount();
              if (pageCount && pageCount > 0) {
                totalCalcule = pageCount;
                if (estActif) {
                  setNombrePagesTotal(pageCount);
                  onDocumentLoad?.(pageCount);
                }
              }
            }
          } catch (countErr) {
            console.warn('[LecteurPdfDesktop] Erreur lecture pageCount via pdf-lib :', countErr);
          }
        }

        // 1. CAS DÉBLOQUÉ (Document acquis ou Pass VIP actif)
        // -> Rendu direct du flux haute netteté avec total de pages réel synchronisé
        if (!estVerrouille) {
          if (urlDirecte) {
            if (estActif) {
              setUrlAffichee(urlDirecte);
              setChargement(false);
              onDocumentLoad?.(totalCalcule);
            }
            return;
          }

          if (arrayBuffer) {
            const blob = new Blob([arrayBuffer as BlobPart], { type: 'application/pdf' });
            const blobUrl = URL.createObjectURL(blob);
            if (blobUrlCreeRef.current) URL.revokeObjectURL(blobUrlCreeRef.current);
            blobUrlCreeRef.current = blobUrl;

            if (estActif) {
              setUrlAffichee(blobUrl);
              setChargement(false);
              onDocumentLoad?.(totalCalcule);
            }
            return;
          }
        }

        // 2. CAS VERROUILLÉ (Aperçu limité / DRM sécurisé)
        // -> Découpage strict des seules pages autorisées avec pdf-lib
        if (!arrayBuffer) {
          throw new Error('Données du document introuvables.');
        }

        const PDFDocument = await getPDFDocumentClass();
        if (!PDFDocument) {
          throw new Error('Moteur de sécurisation PDF indisponible.');
        }

        const sourceDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const total = sourceDoc.getPageCount();
        setNombrePagesTotal(total);

        let allowedCount = 1;
        if (limiteApercuType === 'page') {
          allowedCount = Math.min(Number(limiteApercuValeur) || 1, total);
        } else {
          const pct = Number(limiteApercuValeur) || 30;
          allowedCount = Math.min(Math.ceil((total * pct) / 100), total);
        }
        allowedCount = Math.max(1, allowedCount);
        setPagesApercuAutorisees(allowedCount);

        // Si la limite autorise tout le document
        if (allowedCount >= total) {
          const blob = new Blob([arrayBuffer as BlobPart], { type: 'application/pdf' });
          const blobUrl = URL.createObjectURL(blob);
          if (blobUrlCreeRef.current) URL.revokeObjectURL(blobUrlCreeRef.current);
          blobUrlCreeRef.current = blobUrl;

          if (estActif) {
            setUrlAffichee(blobUrl);
            setChargement(false);
            onDocumentLoad?.(total);
          }
          return;
        }

        // Création de l'extrait sécurisé contenant EXCLUSIVEMENT les pages autorisées
        const subDoc = await PDFDocument.create();
        const pageIndices = Array.from({ length: allowedCount }, (_, i) => i);
        const copiedPages = await subDoc.copyPages(sourceDoc, pageIndices);
        copiedPages.forEach((page: any) => subDoc.addPage(page));

        const subPdfBytes = await subDoc.save();
        const subBlob = new Blob([subPdfBytes as any], { type: 'application/pdf' });
        const subBlobUrl = URL.createObjectURL(subBlob);

        if (blobUrlCreeRef.current) URL.revokeObjectURL(blobUrlCreeRef.current);
        blobUrlCreeRef.current = subBlobUrl;

        if (estActif) {
          setUrlAffichee(subBlobUrl);
          setChargement(false);
          onDocumentLoad?.(allowedCount);
          onPageChange?.(1, allowedCount);
        }
      } catch (err: any) {
        console.error('[LecteurPdfDesktop] Erreur préparation du lecteur natif :', err);
        if (estActif) {
          setErreur(err?.message || 'Impossible de préparer le visualiseur natif.');
          setChargement(false);
          onError?.(err);
        }
      }
    }

    preparerDocumentDesktop();

    return () => {
      estActif = false;
    };
  }, [sourceBrute, urlFichier, estVerrouille, limiteApercuPages, limiteApercuType, limiteApercuValeur, totalMeta]);

  // Total effectif de navigation selon le verrouillage DRM
  const totalEffectifPages = estVerrouille ? pagesApercuAutorisees : (nombrePagesTotal || 1);

  // Navigation dynamique vers une page cible
  const allerPage = (p: number) => {
    const nouvelle = Math.min(Math.max(1, p), totalEffectifPages);
    setPageCourante(nouvelle);
    onPageChange?.(nouvelle, totalEffectifPages);
  };

  // Bascule mode plein écran
  const basculerPleinEcran = () => {
    if (!rootRef.current) return;
    if (!document.fullscreenElement) {
      rootRef.current.requestFullscreen?.().catch(() => {});
      setEstPleinEcran(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setEstPleinEcran(false);
    }
  };

  // Document totalement verrouillé (0 page autorisée)
  if (estVerrouille && limiteApercuValeur === 0) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          minHeight: '400px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          backgroundColor: estSombre ? '#0F172A' : '#F8FAFC',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: '440px',
            width: '100%',
            backgroundColor: estSombre ? '#1E293B' : '#FFFFFF',
            borderRadius: '20px',
            padding: '36px 28px',
            textAlign: 'center',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.12)',
            border: estSombre ? '1px solid #334155' : '1px solid #E2E8F0',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: 'rgba(127, 1, 31, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
              fontSize: '32px',
            }}
          >
            🔒
          </div>
          <h2 style={{ margin: '0 0 10px 0', fontSize: '20px', fontWeight: 800, color: estSombre ? '#FFFFFF' : '#0F172A' }}>
            Document Verrouillé
          </h2>
          <p style={{ margin: '0 0 24px 0', fontSize: '14px', lineHeight: '21px', color: estSombre ? '#94A3B8' : '#64748B' }}>
            Ce cours complet nécessite une acquisition pour être consulté. Débloquez-le à l'unité ou profitez d'un accès illimité avec le Pass VIP.
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            {onAcheter && (
              <button
                onClick={onAcheter}
                style={{
                  flex: 1,
                  padding: '13px',
                  backgroundColor: '#7F011F',
                  color: '#FFFFFF',
                  borderRadius: '12px',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(127, 1, 31, 0.25)',
                }}
              >
                🛒 Acheter ({prix} F)
              </button>
            )}
            {onVip && (
              <button
                onClick={onVip}
                style={{
                  flex: 1,
                  padding: '13px',
                  backgroundColor: '#F59E0B',
                  color: '#1E1B4B',
                  borderRadius: '12px',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '14px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.25)',
                }}
              >
                👑 Pass VIP (500 F)
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // URL enrichie avec les paramètres standards pour synchroniser la page et masquer la toolbar native
  // #page=${pageCourante}&toolbar=0&navpanes=0&view=FitH
  const urlSecurisee = urlAffichee
    ? `${urlAffichee}#page=${pageCourante}&toolbar=0&navpanes=0&view=FitH`
    : null;

  return (
    <div
      ref={rootRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 'calc(100vh - 64px)',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        backgroundColor: estSombre ? '#0F172A' : '#F1F5F9',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* ─────────────────────────────────────────────────────────────────────────── */}
      {/* 1. BARRE D'OUTILS CAUZON FIXE (TOTALEMENT ISOLÉE DU CONTENEUR DE ZOOM)       */}
      {/* ─────────────────────────────────────────────────────────────────────────── */}
      <div
        style={{
          width: '100%',
          height: '52px',
          minHeight: '52px',
          maxHeight: '52px',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          backgroundColor: estSombre ? '#1E293B' : '#7F011F',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
          borderBottom: estSombre ? '1px solid #334155' : '1px solid rgba(0, 0, 0, 0.12)',
          boxSizing: 'border-box',
        }}
      >
        {/* Section Gauche : Titre et Statut du Document */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, maxWidth: '35%' }}>
          <span style={{ fontSize: '18px', flexShrink: 0 }}>📄</span>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: '#FFFFFF',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={titre || 'Document cauZon'}
            >
              {titre || 'Document cauZon'}
            </span>
            <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.8)' }}>
              {estVerrouille
                ? `🔒 Aperçu limité (${pagesApercuAutorisees}/${nombrePagesTotal} page${pagesApercuAutorisees > 1 ? 's' : ''})`
                : `✅ Document complet (${nombrePagesTotal} page${nombrePagesTotal > 1 ? 's' : ''})`}
            </span>
          </div>
        </div>

        {/* Section Centre : Navigation par Page & Compteur dynamique */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.24)',
              borderRadius: '8px',
              padding: '3px 8px',
              gap: 6,
            }}
          >
            <button
              onClick={() => allerPage(pageCourante - 1)}
              disabled={pageCourante <= 1}
              style={{
                background: 'none',
                border: 'none',
                color: pageCourante <= 1 ? 'rgba(255,255,255,0.3)' : '#FFFFFF',
                cursor: pageCourante <= 1 ? 'default' : 'pointer',
                fontSize: '13px',
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: '4px',
              }}
              title="Page précédente"
            >
              ◀
            </button>

            <span style={{ fontSize: '12px', fontWeight: 600 }}>
              Page {pageCourante} / {totalEffectifPages}
            </span>

            <button
              onClick={() => allerPage(pageCourante + 1)}
              disabled={pageCourante >= totalEffectifPages}
              style={{
                background: 'none',
                border: 'none',
                color: pageCourante >= totalEffectifPages
                  ? 'rgba(255,255,255,0.3)'
                  : '#FFFFFF',
                cursor: pageCourante >= totalEffectifPages
                  ? 'default'
                  : 'pointer',
                fontSize: '13px',
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: '4px',
              }}
              title="Page suivante"
            >
              ▶
            </button>
          </div>

          {/* Bouton Mode Plein Écran */}
          <button
            onClick={basculerPleinEcran}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.14)',
              border: 'none',
              color: '#FFFFFF',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
            title={estPleinEcran ? 'Quitter le plein écran' : 'Passer en plein écran'}
          >
            <span>{estPleinEcran ? '🗗' : '⛶'}</span>
            <span>{estPleinEcran ? 'Fenêtré' : 'Plein écran'}</span>
          </button>
        </div>

        {/* Section Droite : Statut de Sécurité & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '11px',
              color: 'rgba(255, 255, 255, 0.75)',
              backgroundColor: 'rgba(0, 0, 0, 0.2)',
              padding: '4px 10px',
              borderRadius: '6px',
            }}
          >
            <span>🛡️</span>
            <span>Document Protégé cauZon</span>
          </div>

          {estVerrouille && onAcheter && (
            <button
              onClick={onAcheter}
              style={{
                backgroundColor: '#F59E0B',
                color: '#1E1B4B',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              🛒 Débloquer ({prix} F)
            </button>
          )}
        </div>
      </div>

      {/* Notification Toast discrète */}
      {messageNotification && (
        <div
          style={{
            position: 'absolute',
            top: '64px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(15, 23, 42, 0.94)',
            color: '#FFFFFF',
            padding: '8px 18px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
            zIndex: 60,
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            pointerEvents: 'none',
          }}
        >
          {messageNotification}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────── */}
      {/* 2. CONTENEUR SCROLLABLE DU DOCUMENT AVEC MOTEUR VECTORIEL NATIF               */}
      {/* ─────────────────────────────────────────────────────────────────────────── */}
      <div
        style={{
          width: '100%',
          height: 'calc(100% - 52px)',
          flex: 1,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          backgroundColor: estSombre ? '#0F172A' : '#525659',
        }}
      >
        {/* Écran de chargement */}
        {chargement && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: estSombre ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
              zIndex: 20,
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                border: '3.5px solid rgba(127, 1, 31, 0.15)',
                borderTopColor: '#7F011F',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <style>{`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}</style>
            <p
              style={{
                marginTop: 14,
                fontSize: '14px',
                fontWeight: 700,
                color: estSombre ? '#E2E8F0' : '#334155',
              }}
            >
              Rendu vectoriel haute netteté en cours...
            </p>
          </div>
        )}

        {/* Écran d'erreur */}
        {erreur && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              backgroundColor: estSombre ? '#0F172A' : '#F8FAFC',
              zIndex: 20,
            }}
          >
            <div style={{ fontSize: '42px', marginBottom: '10px' }}>⚠️</div>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '17px', fontWeight: 800, color: '#EF4444' }}>
              Échec d'ouverture du document
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#64748B', textAlign: 'center', maxWidth: '420px' }}>
              {erreur}
            </p>
            <button
              onClick={() => onReessayer?.()}
              style={{
                padding: '10px 20px',
                backgroundColor: '#7F011F',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              🔄 Réessayer
            </button>
          </div>
        )}

        {/* Moteur de Rendu Vectoriel Natif (Haute Netteté 60/120 FPS sans pixelisation) */}
        {/* Navigation dynamique par page via #page=${pageCourante}&toolbar=0&navpanes=0&view=FitH */}
        {urlSecurisee && !erreur && (
          <object
            key={`${urlAffichee}_page_${pageCourante}`}
            data={urlSecurisee}
            type="application/pdf"
            width="100%"
            height="100%"
            style={{
              width: '100%',
              height: '100%',
              flex: 1,
              border: 'none',
              display: 'block',
            }}
          >
            <iframe
              src={urlSecurisee}
              title="Lecteur PDF cauZon"
              width="100%"
              height="100%"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                display: 'block',
              }}
            />
          </object>
        )}

        {/* Bannière Paywall Flottante pour Extrait Gratuit */}
        {estVerrouille && pagesApercuAutorisees > 0 && !chargement && !erreur && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: estSombre ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.96)',
              borderTop: `1px solid ${estSombre ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
              padding: '12px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.15)',
              zIndex: 40,
              backdropFilter: 'blur(8px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: '22px' }}>🔒</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: '13.5px', color: estSombre ? '#FFFFFF' : '#0F172A' }}>
                  Aperçu limité à {pagesApercuAutorisees} page{pagesApercuAutorisees > 1 ? 's' : ''} sur {nombrePagesTotal}
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: 2 }}>
                  Débloquez le cours complet pour accéder à l'intégralité du document.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {onAcheter && (
                <button
                  onClick={onAcheter}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#7F011F',
                    color: '#FFFFFF',
                    borderRadius: '8px',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(127, 1, 31, 0.25)',
                  }}
                >
                  🛒 Débloquer ({prix} FCFA)
                </button>
              )}

              {onVip && (
                <button
                  onClick={onVip}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#F59E0B',
                    color: '#1E1B4B',
                    borderRadius: '8px',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(245, 158, 11, 0.25)',
                  }}
                >
                  👑 Pass VIP (500 F)
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const LecteurPdfDesktop: React.FC<LecteurPdfProps> = (props) => {
  return (
    <LecteurPdfErrorBoundary estSombre={props.estSombre} onReessayer={props.onReessayer}>
      <LecteurPdfDesktopInternal {...props} />
    </LecteurPdfErrorBoundary>
  );
};

export default LecteurPdfDesktop;
