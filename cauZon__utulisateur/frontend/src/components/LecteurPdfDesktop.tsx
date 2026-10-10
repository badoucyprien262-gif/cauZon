import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { LecteurPdfProps } from './PdfViewer/types';
import { chargerPdfJs, extrairePdfBytes } from './PdfViewer/pdfjsLoader';

/**
 * Interface normalisée pour les annotations de surlignage
 * Coordonnées relatives (0..1) pour une invariance absolue face au zoom et à la résolution
 */
export interface AnnotationSurlignage {
  id: string;
  pageNumber: number;
  couleur: string;
  x: number; // ratio 0..1
  y: number; // ratio 0..1
  largeur: number; // ratio 0..1
  hauteur: number; // ratio 0..1
  timestamp: number;
}

const PALETTE_COULEURS = [
  { id: 'jaune', code: '#FDE047', label: 'Jaune' },
  { id: 'vert', code: '#86EFAC', label: 'Vert' },
  { id: 'bleu', code: '#93C5FD', label: 'Bleu' },
  { id: 'rose', code: '#FDA4AF', label: 'Rose' },
  { id: 'orange', code: '#FDBA74', label: 'Orange' },
];

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
            fontFamily: 'sans-serif',
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
 * LecteurPdfDesktop (Moteur Sécurisé Canvas / PDF.js avec Barre d'Outils cauZon)
 *
 * Élimine totalement la barre noire native du navigateur et les boutons de fuite (Print / Save).
 * - Rendu vectoriel pur sur Canvas HTML5 via PDF.js (aucun <embed>, <object> ou <iframe>).
 * - Outils d'annotation exclusifs pour documents débloqués (Surligneur multi-couleurs persistant en localStorage).
 * - Navigation fluide par page (Aller à la page, Précédent, Suivant, indicateur dynamique).
 * - Zoom personnalisé (+, -, 100%, Ajuster à la largeur) avec maintien parfait de la netteté.
 * - Protection anti-fuite : blocage Ctrl+P / Ctrl+S, désactivation du clic droit, user-select: none.
 * - Gestion Paywall DRM : coupure stricte des pages autorisées si le document est verrouillé.
 */
const LecteurPdfDesktopInternal: React.FC<LecteurPdfProps> = ({
  documentId,
  urlFichier,
  pdfUrl,
  titre,
  estVerrouille = false,
  limiteApercuPages = 1,
  limiteApercuType = 'pourcentage',
  limiteApercuValeur = 30,
  prix = 100,
  estSombre = false,
  scale = 1.0,
  onAcheter,
  onVip,
  onPageChange,
  onDocumentLoad,
  onError,
  onReessayer,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);
  const pageRenderTasksRef = useRef<{ [pageNumber: number]: any }>({});
  const canvasRefs = useRef<{ [pageNumber: number]: HTMLCanvasElement }>({});
  const annotCanvasRefs = useRef<{ [pageNumber: number]: HTMLCanvasElement }>({});
  const wrapperRefs = useRef<{ [pageNumber: number]: HTMLDivElement }>({});

  const [chargement, setChargement] = useState<boolean>(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nombrePagesTotal, setNombrePagesTotal] = useState<number>(0);
  const [pagesAutorisees, setPagesAutorisees] = useState<number>(1);
  const [pageCourante, setPageCourante] = useState<number>(1);
  const [pageInputVal, setPageInputVal] = useState<string>('1');

  // Zoom & Rendu
  const [zoomActuel, setZoomActuel] = useState<number>(scale || 1.0);
  const basePageDimensionsRef = useRef<{ width: number; height: number }>({ width: 792, height: 1120 });

  // Outils d'annotation
  const [modeSurligneur, setModeSurligneur] = useState<boolean>(false);
  const [couleurChoisie, setCouleurChoisie] = useState<string>(PALETTE_COULEURS[0].code);
  const [annotations, setAnnotations] = useState<AnnotationSurlignage[]>([]);
  const [messageNotification, setMessageNotification] = useState<string | null>(null);
  const timerNotificationRef = useRef<any>(null);

  // Traçage en direct du surlignage
  const enTraceRef = useRef<boolean>(false);
  const traceDepartRef = useRef<{ page: number; startX: number; startY: number } | null>(null);

  const sourceBrute = pdfUrl || (typeof urlFichier === 'string' ? urlFichier : null);
  const cleStockage = documentId ? `cauzon_annotations_${documentId}` : null;

  // Affichage d'une notification temporaire élégante dans le lecteur
  const afficherNotification = useCallback((message: string) => {
    setMessageNotification(message);
    if (timerNotificationRef.current) clearTimeout(timerNotificationRef.current);
    timerNotificationRef.current = setTimeout(() => {
      setMessageNotification(null);
    }, 2800);
  }, []);

  // 1. Chargement des annotations persistées dans localStorage
  useEffect(() => {
    if (!cleStockage || typeof localStorage === 'undefined') return;
    try {
      const brut = localStorage.getItem(cleStockage);
      if (brut) {
        const parsed = JSON.parse(brut);
        if (Array.isArray(parsed)) {
          setAnnotations(parsed);
        }
      }
    } catch (e) {
      console.warn('[LecteurPdfDesktop] Erreur lecture annotations localement :', e);
    }
  }, [cleStockage]);

  // Sauvegarde des annotations dans localStorage à chaque modification
  const sauvegarderAnnotations = useCallback((nouvellesAnnotations: AnnotationSurlignage[]) => {
    setAnnotations(nouvellesAnnotations);
    if (!cleStockage || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(cleStockage, JSON.stringify(nouvellesAnnotations));
    } catch (e) {
      console.warn('[LecteurPdfDesktop] Erreur persistance annotations :', e);
    }
  }, [cleStockage]);

  // 2. Redessin du calque d'annotations pour une page donnée
  const redessinerAnnotationsPage = useCallback((pageNum: number, annotsList: AnnotationSurlignage[]) => {
    const annotCanvas = annotCanvasRefs.current[pageNum];
    if (!annotCanvas) return;
    const ctx = annotCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, annotCanvas.width, annotCanvas.height);

    const annotsDePage = annotsList.filter(a => a.pageNumber === pageNum);
    annotsDePage.forEach(ann => {
      ctx.save();
      ctx.fillStyle = ann.couleur;
      ctx.globalAlpha = 0.38; // Effet surligneur transparent
      ctx.fillRect(
        ann.x * annotCanvas.width,
        ann.y * annotCanvas.height,
        ann.largeur * annotCanvas.width,
        ann.hauteur * annotCanvas.height
      );
      ctx.restore();
    });
  }, []);

  // Redessiner toutes les pages visibles quand la liste des annotations change
  useEffect(() => {
    Object.keys(annotCanvasRefs.current).forEach(pStr => {
      const pNum = Number(pStr);
      redessinerAnnotationsPage(pNum, annotations);
    });
  }, [annotations, redessinerAnnotationsPage]);

  // 3. Rastérisation d'une page individuelle via PDF.js Canvas HD
  const rasteriserPage = useCallback(async (pageNum: number, targetZoom: number) => {
    const pdfDoc = pdfDocRef.current;
    if (!pdfDoc) return;

    // Annuler la tâche précédente sur cette page si en cours
    if (pageRenderTasksRef.current[pageNum]) {
      try {
        pageRenderTasksRef.current[pageNum].cancel();
      } catch (_) {}
      delete pageRenderTasksRef.current[pageNum];
    }

    const canvas = canvasRefs.current[pageNum];
    const annotCanvas = annotCanvasRefs.current[pageNum];
    const wrapper = wrapperRefs.current[pageNum];
    if (!canvas || !wrapper) return;

    try {
      const page = await pdfDoc.getPage(pageNum);
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      // Stocker les dimensions de base
      if (pageNum === 1) {
        basePageDimensionsRef.current = {
          width: unscaledViewport.width,
          height: unscaledViewport.height,
        };
      }

      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2.0) : 1.5;
      const effectiveScale = targetZoom;
      const viewport = page.getViewport({ scale: effectiveScale });

      const cssWidth = Math.round(viewport.width);
      const cssHeight = Math.round(viewport.height);

      // Dimensionnement physique et CSS du canvas PDF
      canvas.width = Math.round(viewport.width * dpr);
      canvas.height = Math.round(viewport.height * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;

      // Dimensionnement du calque d'annotations superposé
      if (annotCanvas) {
        annotCanvas.width = cssWidth;
        annotCanvas.height = cssHeight;
        annotCanvas.style.width = `${cssWidth}px`;
        annotCanvas.style.height = `${cssHeight}px`;
      }

      // Mise à jour de la taille du conteneur de page
      wrapper.style.width = `${cssWidth}px`;
      wrapper.style.height = `${cssHeight}px`;

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const renderTask = page.render({
        canvasContext: ctx,
        viewport: page.getViewport({ scale: effectiveScale * dpr }),
      });
      pageRenderTasksRef.current[pageNum] = renderTask;
      await renderTask.promise;

      // Redessiner immédiatement les annotations sur cette page
      redessinerAnnotationsPage(pageNum, annotations);
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn(`[LecteurPdfDesktop] Erreur rendu page ${pageNum} :`, err);
      }
    } finally {
      if (pageRenderTasksRef.current[pageNum]) {
        delete pageRenderTasksRef.current[pageNum];
      }
    }
  }, [annotations, redessinerAnnotationsPage]);

  // 4. Initialisation du document PDF et découpage DRM
  useEffect(() => {
    let actif = true;

    async function chargerDocumentDesktop() {
      try {
        setChargement(true);
        setErreur(null);

        // Document totalement verrouillé (0 page autorisée)
        if (estVerrouille && limiteApercuValeur === 0) {
          if (actif) {
            setPagesAutorisees(0);
            setChargement(false);
          }
          return;
        }

        const pdfjsLib = await chargerPdfJs();
        if (!actif) return;

        const pdfData = await extrairePdfBytes(sourceBrute, urlFichier);
        if (!actif) return;

        const loadingTask = pdfjsLib.getDocument({
          data: pdfData,
          cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/cmaps/',
          cMapPacked: true,
        });

        const pdf = await loadingTask.promise;
        if (!actif) return;

        pdfDocRef.current = pdf;
        const total = pdf.numPages;
        setNombrePagesTotal(total);
        onDocumentLoad?.(total);

        // Calcul des pages d'aperçu autorisées
        let allowed = total;
        if (estVerrouille) {
          if (limiteApercuType === 'page') {
            const limiteP = Number(limiteApercuValeur) || Number(limiteApercuPages) || 1;
            allowed = Math.min(Math.max(1, limiteP), total);
          } else {
            const pct = Number(limiteApercuValeur) || 30;
            allowed = Math.min(Math.max(1, Math.ceil((total * pct) / 100)), total);
          }
        }
        setPagesAutorisees(allowed);

        // Calcul du zoom initial pour s'adapter à la largeur disponible
        if (containerRef.current) {
          const containerWidth = containerRef.current.clientWidth || 800;
          const page1 = await pdf.getPage(1);
          const vp1 = page1.getViewport({ scale: 1.0 });
          basePageDimensionsRef.current = { width: vp1.width, height: vp1.height };
          const scaleFit = Math.min(Math.max((containerWidth - 64) / vp1.width, 0.6), 1.6);
          setZoomActuel(Number(scaleFit.toFixed(2)));
        }

        if (actif) {
          setChargement(false);
        }
      } catch (err: any) {
        console.error('[LecteurPdfDesktop] Erreur chargement document :', err);
        if (actif) {
          setErreur(err?.message || 'Impossible d\'ouvrir le document.');
          setChargement(false);
          onError?.(err);
        }
      }
    }

    chargerDocumentDesktop();

    return () => {
      actif = false;
      Object.keys(pageRenderTasksRef.current).forEach(k => {
        try { pageRenderTasksRef.current[Number(k)]?.cancel(); } catch (_) {}
      });
      pageRenderTasksRef.current = {};
    };
  }, [sourceBrute, urlFichier, estVerrouille, limiteApercuPages, limiteApercuType, limiteApercuValeur]);

  // 5. Rastérisation des pages lorsque le zoom ou les pages changent
  useEffect(() => {
    if (chargement || erreur || pagesAutorisees <= 0 || !pdfDocRef.current) return;

    for (let p = 1; p <= pagesAutorisees; p++) {
      rasteriserPage(p, zoomActuel);
    }
  }, [chargement, erreur, pagesAutorisees, zoomActuel, rasteriserPage]);

  // 6. IntersectionObserver pour suivre la page courante visible
  useEffect(() => {
    const container = containerRef.current;
    if (!container || chargement || erreur) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pNum = Number(entry.target.getAttribute('data-page-num'));
            if (pNum && pNum >= 1) {
              setPageCourante(pNum);
              setPageInputVal(String(pNum));
              onPageChange?.(pNum, nombrePagesTotal || pagesAutorisees);
            }
          }
        });
      },
      { root: container, threshold: 0.3 }
    );

    Object.values(wrapperRefs.current).forEach((w) => {
      if (w) observer.observe(w);
    });

    return () => observer.disconnect();
  }, [chargement, erreur, pagesAutorisees, nombrePagesTotal, onPageChange]);

  // 7. Protection de sécurité : Neutralisation stricte des raccourcis Ctrl+P (Print) et Ctrl+S (Save)
  useEffect(() => {
    const intercepterRaccourcisClavier = (e: KeyboardEvent) => {
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

    window.addEventListener('keydown', intercepterRaccourcisClavier, { capture: true });
    return () => {
      window.removeEventListener('keydown', intercepterRaccourcisClavier, { capture: true });
    };
  }, [afficherNotification]);

  // 8. Navigation de page
  const allerALaPage = useCallback((pageNum: number) => {
    const cible = Math.min(Math.max(1, pageNum), pagesAutorisees);
    const elem = wrapperRefs.current[cible];
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setPageCourante(cible);
    setPageInputVal(String(cible));
  }, [pagesAutorisees]);

  const pageSuivante = () => allerALaPage(pageCourante + 1);
  const pagePrecedente = () => allerALaPage(pageCourante - 1);

  // 9. Contrôles de zoom
  const zoomer = () => {
    setZoomActuel(prev => Number(Math.min(prev + 0.2, 2.5).toFixed(2)));
  };

  const dezoomer = () => {
    setZoomActuel(prev => Number(Math.max(prev - 0.2, 0.5).toFixed(2)));
  };

  const ajusterALaLargeur = () => {
    if (!containerRef.current || !basePageDimensionsRef.current.width) return;
    const containerWidth = containerRef.current.clientWidth || 800;
    const nouveauZoom = Math.max((containerWidth - 64) / basePageDimensionsRef.current.width, 0.5);
    setZoomActuel(Number(nouveauZoom.toFixed(2)));
  };

  const reinitialiserZoom = () => {
    setZoomActuel(1.0);
  };

  // 10. Gestion du dessin de surlignage sur le calque d'annotation d'une page
  const handleAnnotationMouseDown = (pageNum: number, e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!modeSurligneur || estVerrouille) return;
    const annotCanvas = annotCanvasRefs.current[pageNum];
    if (!annotCanvas) return;

    const rect = annotCanvas.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    enTraceRef.current = true;
    traceDepartRef.current = { page: pageNum, startX, startY };
  };

  const handleAnnotationMouseMove = (pageNum: number, e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!enTraceRef.current || !traceDepartRef.current || traceDepartRef.current.page !== pageNum) return;
    const annotCanvas = annotCanvasRefs.current[pageNum];
    if (!annotCanvas) return;

    const rect = annotCanvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    const { startX, startY } = traceDepartRef.current;

    const ctx = annotCanvas.getContext('2d');
    if (!ctx) return;

    // Redessiner d'abord les annotations existantes de cette page
    redessinerAnnotationsPage(pageNum, annotations);

    // Dessiner le rectangle de prévisualisation en direct
    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const w = Math.abs(currentX - startX);
    const h = Math.abs(currentY - startY);

    ctx.save();
    ctx.fillStyle = couleurChoisie;
    ctx.globalAlpha = 0.40;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  };

  const handleAnnotationMouseUp = (pageNum: number, e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!enTraceRef.current || !traceDepartRef.current || traceDepartRef.current.page !== pageNum) return;
    const annotCanvas = annotCanvasRefs.current[pageNum];
    if (!annotCanvas) {
      enTraceRef.current = false;
      traceDepartRef.current = null;
      return;
    }

    const rect = annotCanvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    const { startX, startY } = traceDepartRef.current;

    const xPix = Math.min(startX, currentX);
    const yPix = Math.min(startY, currentY);
    const wPix = Math.abs(currentX - startX);
    const hPix = Math.abs(currentY - startY);

    enTraceRef.current = false;
    traceDepartRef.current = null;

    // Ignorer les clics accidentels trop petits (< 6px)
    if (wPix < 6 && hPix < 6) {
      redessinerAnnotationsPage(pageNum, annotations);
      return;
    }

    // Convertir en ratios relatifs 0..1 pour invariance absolue au zoom
    const nouvelleAnnotation: AnnotationSurlignage = {
      id: `annot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      pageNumber: pageNum,
      couleur: couleurChoisie,
      x: xPix / annotCanvas.width,
      y: yPix / annotCanvas.height,
      largeur: wPix / annotCanvas.width,
      hauteur: hPix / annotCanvas.height,
      timestamp: Date.now(),
    };

    const miseAJour = [...annotations, nouvelleAnnotation];
    sauvegarderAnnotations(miseAJour);
    afficherNotification('✏️ Surlignage ajouté et sauvegardé.');
  };

  const annulerDernierSurlignage = () => {
    if (annotations.length === 0) return;
    const miseAJour = annotations.slice(0, annotations.length - 1);
    sauvegarderAnnotations(miseAJour);
    afficherNotification('↩️ Dernier surlignage annulé.');
  };

  const effacerToutesAnnotations = () => {
    if (annotations.length === 0) return;
    if (window.confirm('Voulez-vous vraiment effacer tous les surlignages de ce document ?')) {
      sauvegarderAnnotations([]);
      afficherNotification('🗑️ Tous les surlignages ont été effacés.');
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

  return (
    <div
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
      {/* 1. BARRE D'OUTILS OFFICIELLE CAUZON SANS BOUTON PRINT/SAVE */}
      <div
        style={{
          height: '52px',
          backgroundColor: estSombre ? '#1E293B' : '#7F011F',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
          zIndex: 30,
          borderBottom: estSombre ? '1px solid #334155' : '1px solid rgba(0, 0, 0, 0.1)',
        }}
      >
        {/* Section Gauche : Titre du Document & Statut */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, maxWidth: '28%' }}>
          <span style={{ fontSize: '18px' }}>📄</span>
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
            <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.75)' }}>
              {estVerrouille ? `🔒 Extrait (${pagesAutorisees}/${nombrePagesTotal} pages)` : '✅ Accès complet'}
            </span>
          </div>
        </div>

        {/* Section Centre : Navigation par Page & Contrôles Zoom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Navigation Pages */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.22)',
              borderRadius: '8px',
              padding: '2px 6px',
              gap: 4,
            }}
          >
            <button
              onClick={pagePrecedente}
              disabled={pageCourante <= 1}
              style={{
                background: 'none',
                border: 'none',
                color: pageCourante <= 1 ? 'rgba(255,255,255,0.3)' : '#FFFFFF',
                cursor: pageCourante <= 1 ? 'default' : 'pointer',
                fontSize: '14px',
                padding: '4px 8px',
                borderRadius: '4px',
              }}
              title="Page précédente"
            >
              ◀
            </button>

            <span style={{ fontSize: '12px', fontWeight: 600 }}>Page</span>
            <input
              type="text"
              value={pageInputVal}
              onChange={(e) => setPageInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const num = parseInt(pageInputVal, 10);
                  if (!isNaN(num)) allerALaPage(num);
                }
              }}
              style={{
                width: '36px',
                textAlign: 'center',
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                color: '#FFFFFF',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '4px',
                padding: '2px 0',
                fontSize: '12px',
                fontWeight: 700,
              }}
            />
            <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>
              / {estVerrouille ? pagesAutorisees : nombrePagesTotal || 1}
            </span>

            <button
              onClick={pageSuivante}
              disabled={pageCourante >= pagesAutorisees}
              style={{
                background: 'none',
                border: 'none',
                color: pageCourante >= pagesAutorisees ? 'rgba(255,255,255,0.3)' : '#FFFFFF',
                cursor: pageCourante >= pagesAutorisees ? 'default' : 'pointer',
                fontSize: '14px',
                padding: '4px 8px',
                borderRadius: '4px',
              }}
              title="Page suivante"
            >
              ▶
            </button>
          </div>

          {/* Séparateur vertical */}
          <div style={{ width: '1px', height: '22px', backgroundColor: 'rgba(255, 255, 255, 0.2)' }} />

          {/* Contrôles Zoom */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.22)',
              borderRadius: '8px',
              padding: '2px 6px',
              gap: 4,
            }}
          >
            <button
              onClick={dezoomer}
              disabled={zoomActuel <= 0.5}
              style={{
                background: 'none',
                border: 'none',
                color: zoomActuel <= 0.5 ? 'rgba(255,255,255,0.3)' : '#FFFFFF',
                cursor: zoomActuel <= 0.5 ? 'default' : 'pointer',
                fontSize: '16px',
                fontWeight: 700,
                padding: '3px 7px',
                borderRadius: '4px',
              }}
              title="Dézoomer (−)"
            >
              −
            </button>

            <button
              onClick={reinitialiserZoom}
              style={{
                background: 'none',
                border: 'none',
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                padding: '3px 6px',
                minWidth: '48px',
              }}
              title="Réinitialiser à 100%"
            >
              {Math.round(zoomActuel * 100)}%
            </button>

            <button
              onClick={zoomer}
              disabled={zoomActuel >= 2.5}
              style={{
                background: 'none',
                border: 'none',
                color: zoomActuel >= 2.5 ? 'rgba(255,255,255,0.3)' : '#FFFFFF',
                cursor: zoomActuel >= 2.5 ? 'default' : 'pointer',
                fontSize: '16px',
                fontWeight: 700,
                padding: '3px 7px',
                borderRadius: '4px',
              }}
              title="Zoomer (+)"
            >
              +
            </button>

            <button
              onClick={ajusterALaLargeur}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                border: 'none',
                color: '#FFFFFF',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '5px',
                marginLeft: '4px',
              }}
              title="Ajuster à la largeur de l'écran"
            >
              ↔️ Ajuster
            </button>
          </div>
        </div>

        {/* Section Droite : Outils d'Annotation (Documents Acquis) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!estVerrouille ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Bouton Toggle Surligneur */}
              <button
                onClick={() => setModeSurligneur(!modeSurligneur)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: modeSurligneur ? '2px solid #FDE047' : '1px solid rgba(255,255,255,0.25)',
                  backgroundColor: modeSurligneur ? 'rgba(253, 224, 71, 0.25)' : 'rgba(0, 0, 0, 0.2)',
                  color: modeSurligneur ? '#FEF08A' : '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                title={modeSurligneur ? 'Désactiver le surligneur' : 'Activer le surligneur'}
              >
                <span>🖍️</span>
                <span>{modeSurligneur ? 'Surlignage Actif' : 'Surligner'}</span>
              </button>

              {/* Pastilles de couleur si mode surligneur actif */}
              {modeSurligneur && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 4px' }}>
                  {PALETTE_COULEURS.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCouleurChoisie(c.code)}
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        backgroundColor: c.code,
                        border: couleurChoisie === c.code ? '2px solid #FFFFFF' : '1px solid rgba(0,0,0,0.3)',
                        cursor: 'pointer',
                        padding: 0,
                        boxShadow: couleurChoisie === c.code ? '0 0 0 2px rgba(255,255,255,0.6)' : 'none',
                        transform: couleurChoisie === c.code ? 'scale(1.15)' : 'scale(1)',
                        transition: 'transform 0.1s ease',
                      }}
                      title={`Couleur ${c.label}`}
                    />
                  ))}
                </div>
              )}

              {/* Annuler dernier surlignage */}
              {annotations.length > 0 && (
                <button
                  onClick={annulerDernierSurlignage}
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.2)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#FFFFFF',
                    padding: '5px 9px',
                    borderRadius: '7px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="Annuler le dernier surlignage"
                >
                  ↩️ ({annotations.length})
                </button>
              )}

              {/* Effacer tout */}
              {annotations.length > 0 && (
                <button
                  onClick={effacerToutesAnnotations}
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#FCA5A5',
                    padding: '5px 8px',
                    borderRadius: '7px',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                  title="Effacer tous les surlignages"
                >
                  🗑️
                </button>
              )}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                borderRadius: '7px',
                backgroundColor: 'rgba(0, 0, 0, 0.25)',
                color: 'rgba(255, 255, 255, 0.65)',
                fontSize: '11.5px',
                fontWeight: 600,
              }}
              title="Les outils de surlignage sont accessibles une fois le document acquis"
            >
              <span>🔒</span>
              <span>Surlignage (cours débloqué)</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. TOAST / NOTIFICATION DISCRÈTE DANS LE LECTEUR */}
      {messageNotification && (
        <div
          style={{
            position: 'absolute',
            top: '64px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            color: '#FFFFFF',
            padding: '8px 18px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
            zIndex: 40,
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            pointerEvents: 'none',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {messageNotification}
        </div>
      )}

      {/* 3. ÉCRAN DE CHARGEMENT INITIAL */}
      {chargement && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: estSombre ? '#0F172A' : '#F8FAFC',
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
            Chargement sécurisé du document...
          </p>
          <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>
            Rendu haute fidélité sans barre de téléchargement
          </p>
        </div>
      )}

      {/* 4. ÉCRAN D'ERREUR */}
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

      {/* 5. CONTENEUR PRINCIPAL DE DÉFILEMENT VERTICAL DES PAGES */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          width: '100%',
          height: 'calc(100% - 52px)',
          overflowY: 'auto',
          overflowX: 'auto',
          padding: '24px 16px 80px 16px',
          boxSizing: 'border-box',
          display: chargement || erreur ? 'none' : 'block',
          cursor: modeSurligneur ? 'crosshair' : 'default',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px',
            margin: '0 auto',
            width: 'fit-content',
            minWidth: '100%',
          }}
        >
          {Array.from({ length: pagesAutorisees }, (_, idx) => {
            const pageNum = idx + 1;
            return (
              <div
                key={`page-desktop-wrapper-${pageNum}`}
                ref={(el) => {
                  if (el) wrapperRefs.current[pageNum] = el;
                }}
                data-page-num={pageNum}
                style={{
                  position: 'relative',
                  backgroundColor: '#FFFFFF',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.14)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  margin: '0 auto',
                }}
              >
                {/* Canvas de Rendu PDF */}
                <canvas
                  ref={(el) => {
                    if (el) canvasRefs.current[pageNum] = el;
                  }}
                  style={{
                    display: 'block',
                    margin: '0 auto',
                  }}
                />

                {/* Calque Canvas d'Annotation Superposé */}
                <canvas
                  ref={(el) => {
                    if (el) annotCanvasRefs.current[pageNum] = el;
                  }}
                  onMouseDown={(e) => handleAnnotationMouseDown(pageNum, e)}
                  onMouseMove={(e) => handleAnnotationMouseMove(pageNum, e)}
                  onMouseUp={(e) => handleAnnotationMouseUp(pageNum, e)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: modeSurligneur ? 'auto' : 'none',
                    cursor: modeSurligneur ? 'crosshair' : 'default',
                  }}
                />

                {/* Numéro de page discret au bas du document */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    right: '12px',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: 'rgba(0, 0, 0, 0.35)',
                    pointerEvents: 'none',
                  }}
                >
                  Page {pageNum}
                </div>
              </div>
            );
          })}

          {/* 6. CARTE PAYWALL ÉLÉGANTE À LA FIN DE L'APERÇU AUTORISÉ */}
          {estVerrouille && pagesAutorisees > 0 && !chargement && !erreur && (
            <div
              style={{
                width: '100%',
                maxWidth: '680px',
                marginTop: '16px',
                marginBottom: '32px',
                backgroundColor: estSombre ? '#1E293B' : '#FFFFFF',
                borderRadius: '18px',
                padding: '28px',
                border: estSombre ? '1px solid #334155' : '1px solid #E2E8F0',
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(127, 1, 31, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px auto',
                  fontSize: '26px',
                }}
              >
                🔒
              </div>
              <h3
                style={{
                  margin: '0 0 6px 0',
                  fontSize: '18px',
                  fontWeight: 800,
                  color: estSombre ? '#FFFFFF' : '#0F172A',
                }}
              >
                Fin de l'Aperçu Gratuit ({pagesAutorisees} sur {nombrePagesTotal} pages)
              </h3>
              <p
                style={{
                  margin: '0 0 20px 0',
                  fontSize: '13.5px',
                  lineHeight: '20px',
                  color: estSombre ? '#94A3B8' : '#64748B',
                  maxWidth: '520px',
                  marginLeft: 'auto',
                  marginRight: 'auto',
                }}
              >
                Vous avez atteint la limite de consultation gratuite de ce cours. Débloquez la totalité du document pour poursuivre vos révisions et accéder aux outils d'annotation.
              </p>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '14px',
                  flexWrap: 'wrap',
                }}
              >
                {onAcheter && (
                  <button
                    onClick={onAcheter}
                    style={{
                      padding: '12px 24px',
                      backgroundColor: '#7F011F',
                      color: '#FFFFFF',
                      borderRadius: '10px',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '14px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(127, 1, 31, 0.3)',
                    }}
                  >
                    🛒 Débloquer le cours ({prix} FCFA)
                  </button>
                )}
                {onVip && (
                  <button
                    onClick={onVip}
                    style={{
                      padding: '12px 24px',
                      backgroundColor: '#F59E0B',
                      color: '#1E1B4B',
                      borderRadius: '10px',
                      border: 'none',
                      fontWeight: 800,
                      fontSize: '14px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(245, 158, 11, 0.3)',
                    }}
                  >
                    👑 Activer le Pass VIP (500 F)
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 7. BANDEAU FLOTTANT EN BAS POUR ACCÈS RAPIDE EN CAS DE VERROUILLAGE */}
      {estVerrouille && pagesAutorisees > 0 && !chargement && !erreur && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: estSombre ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            borderTop: `1px solid ${estSombre ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.12)',
            zIndex: 25,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '20px' }}>🔒</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '13px', color: estSombre ? '#FFFFFF' : '#0F172A' }}>
                Extrait gratuit : {pagesAutorisees} / {nombrePagesTotal} pages
              </div>
              <div style={{ fontSize: '11px', color: '#64748B' }}>
                Accédez à l'intégralité du contenu sans restriction
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
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
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                🛒 Débloquer ({prix} F)
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
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                👑 VIP (500 F)
              </button>
            )}
          </div>
        </div>
      )}
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
