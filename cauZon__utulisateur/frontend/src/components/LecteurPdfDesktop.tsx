import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { LecteurPdfProps } from './PdfViewer/types';
import { chargerPdfJs, extrairePdfBytes } from './PdfViewer/pdfjsLoader';

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
 * LecteurPdfDesktop (Moteur Paginé Dynamique PDF.js avec Synchronisation Scroll Temps Réel)
 *
 * 1. Rendu paginé dynamique & haute fidélité Retina (PDF.js Canvas avec viewport ajusté au devicePixelRatio).
 * 2. Synchronisation en direct du compteur de page au scroll (IntersectionObserver).
 * 3. Navigation bidirectionnelle fluide (◀, ▶, scrollIntoView).
 * 4. Barre bordeaux cauZon fixe en haut (sticky, indépendante du scroll).
 * 5. Bouclier de sécurité anti-fuite : interception Ctrl+P / Ctrl+S, clic droit désactivé, paywall DRM.
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
  // Total initial d'après les métadonnées si disponible
  const totalMeta = Number(
    nombrePages ||
    docProp?.nombre_pages ||
    docProp?.nombrePages ||
    (docProp as any)?.pageCount ||
    0
  );

  const [chargement, setChargement] = useState<boolean>(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nombrePagesTotal, setNombrePagesTotal] = useState<number>(totalMeta > 1 ? totalMeta : 1);
  const [pagesApercuAutorisees, setPagesApercuAutorisees] = useState<number>(1);
  const [pageCourante, setPageCourante] = useState<number>(1);
  const [estPleinEcran, setEstPleinEcran] = useState<boolean>(false);
  const [messageNotification, setMessageNotification] = useState<string | null>(null);

  // Dimensions de base de la première page pour réserver l'espace vertical (zéro layout shift)
  const [aspectRatioPage1, setAspectRatioPage1] = useState<number>(1.414);
  const [largeurAffichagePage, setLargeurAffichagePage] = useState<number>(820);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);
  const pageContainerRefs = useRef<{ [pageNumber: number]: HTMLDivElement | null }>({});
  const canvasRefs = useRef<{ [pageNumber: number]: HTMLCanvasElement | null }>({});
  const pagesRenduesRef = useRef<Set<number>>(new Set());
  const tachesRenduRef = useRef<{ [pageNumber: number]: any }>({});
  const timerNotificationRef = useRef<any>(null);
  const isProgrammaticScrollRef = useRef<boolean>(false);

  const sourceBrute = pdfUrl || (typeof urlFichier === 'string' ? urlFichier : null);

  const afficherNotification = useCallback((message: string) => {
    setMessageNotification(message);
    if (timerNotificationRef.current) clearTimeout(timerNotificationRef.current);
    timerNotificationRef.current = setTimeout(() => {
      setMessageNotification(null);
    }, 2800);
  }, []);

  // 1. Protection Anti-Fuite & Anti-Impression : Interception stricte des raccourcis Ctrl+P / Ctrl+S
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

  // Total effectif de pages accessibles
  const totalEffectifPages = estVerrouille ? pagesApercuAutorisees : (nombrePagesTotal || 1);

  // 2. Rastérisation Haute Fidélité Retina d'une page individuelle sur Canvas
  const rasteriserPage = useCallback(async (pageNum: number) => {
    const pdfDoc = pdfDocRef.current;
    if (!pdfDoc || pagesRenduesRef.current.has(pageNum)) return;

    // Annuler une tâche précédente si déjà active sur cette page
    if (tachesRenduRef.current[pageNum]) {
      try {
        tachesRenduRef.current[pageNum].cancel();
      } catch (_) {}
      delete tachesRenduRef.current[pageNum];
    }

    const canvas = canvasRefs.current[pageNum];
    const wrapper = pageContainerRefs.current[pageNum];
    if (!canvas || !wrapper) return;

    try {
      const page = await pdfDoc.getPage(pageNum);
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      // Plafond DPR optimal pour netteté vectorielle cristalline sans saturation mémoire
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2.2) : 1.5;

      // Calcul de l'échelle d'affichage pour une lecture confortable
      const containerWidth = scrollContainerRef.current?.clientWidth || 900;
      const targetWidth = Math.min(Math.max(containerWidth - 64, 480), 920);
      const scaleBase = targetWidth / unscaledViewport.width;
      const viewport = page.getViewport({ scale: scaleBase });

      const cssWidth = Math.floor(viewport.width);
      const cssHeight = Math.floor(viewport.height);

      // Résolution physique haute définition Retina
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      canvas.style.display = 'block';

      // Ajuster le conteneur parent
      wrapper.style.width = `${cssWidth}px`;
      wrapper.style.height = `${cssHeight}px`;

      const placeholder = wrapper.querySelector('.cauzon-page-placeholder');
      if (placeholder) {
        (placeholder as HTMLElement).style.display = 'none';
      }

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const renderTask = page.render({
        canvasContext: ctx,
        viewport: page.getViewport({ scale: scaleBase * dpr }),
      });
      tachesRenduRef.current[pageNum] = renderTask;
      await renderTask.promise;

      pagesRenduesRef.current.add(pageNum);
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn(`[LecteurPdfDesktop] Note rendu page ${pageNum} :`, err);
      }
    } finally {
      delete tachesRenduRef.current[pageNum];
    }
  }, []);

  // 3. Chargement initial du document via PDF.js
  useEffect(() => {
    let estActif = true;

    async function initialiserPdfJs() {
      try {
        setChargement(true);
        setErreur(null);
        pagesRenduesRef.current.clear();

        // Document totalement verrouillé
        if (estVerrouille && limiteApercuValeur === 0) {
          if (estActif) {
            setPagesApercuAutorisees(0);
            setChargement(false);
          }
          return;
        }

        if (!sourceBrute && !urlFichier) {
          throw new Error('Aucune source PDF disponible pour le document.');
        }

        const pdfjsLib = await chargerPdfJs();
        if (!estActif) return;

        const bytes = await extrairePdfBytes(sourceBrute, urlFichier);
        if (!estActif) return;

        const loadingTask = pdfjsLib.getDocument({
          data: bytes,
          cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/cmaps/',
          cMapPacked: true,
        });

        const pdfDoc = await loadingTask.promise;
        if (!estActif) return;

        pdfDocRef.current = pdfDoc;
        const total = pdfDoc.numPages;
        setNombrePagesTotal(total);
        onDocumentLoad?.(total);

        // Calcul des pages autorisées en cas de verrouillage
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
        setPagesApercuAutorisees(allowed);

        // Calibrer la taille de la page 1
        const page1 = await pdfDoc.getPage(1);
        const vp1 = page1.getViewport({ scale: 1.0 });
        const ratio = vp1.height / vp1.width;
        setAspectRatioPage1(ratio);

        const containerWidth = scrollContainerRef.current?.clientWidth || 900;
        const targetW = Math.min(Math.max(containerWidth - 64, 480), 920);
        setLargeurAffichagePage(targetW);

        if (estActif) {
          setChargement(false);
        }
      } catch (err: any) {
        console.error('[LecteurPdfDesktop] Erreur chargement document PDF.js :', err);
        if (estActif) {
          setErreur(err?.message || 'Impossible d\'afficher le document.');
          setChargement(false);
          onError?.(err);
        }
      }
    }

    initialiserPdfJs();

    return () => {
      estActif = false;
      Object.keys(tachesRenduRef.current).forEach(k => {
        try { tachesRenduRef.current[Number(k)]?.cancel(); } catch (_) {}
      });
      tachesRenduRef.current = {};
      pagesRenduesRef.current.clear();
    };
  }, [sourceBrute, urlFichier, estVerrouille, limiteApercuPages, limiteApercuType, limiteApercuValeur]);

  // 4. Rendu prioritaire de la Page 1 dès que le conteneur DOM est prêt
  useEffect(() => {
    if (!chargement && !erreur && pdfDocRef.current) {
      rasteriserPage(1);
    }
  }, [chargement, erreur, rasteriserPage]);

  // 5. Lazy-Rendering des pages à l'approche du viewport (rootMargin: '600px')
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || chargement || erreur || !pdfDocRef.current) return;

    const lazyObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNum = Number(entry.target.getAttribute('data-page'));
            if (pageNum && !pagesRenduesRef.current.has(pageNum)) {
              rasteriserPage(pageNum);
            }
          }
        });
      },
      {
        root: scrollContainer,
        rootMargin: '600px 0px 600px 0px',
      }
    );

    for (let p = 1; p <= totalEffectifPages; p++) {
      const el = pageContainerRefs.current[p];
      if (el) lazyObserver.observe(el);
    }

    return () => lazyObserver.disconnect();
  }, [chargement, erreur, totalEffectifPages, rasteriserPage]);

  // 6. SYNCHRONISATION EN DIRECT DU COMPTEUR DE PAGES AU SCROLL (IntersectionObserver)
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || chargement || erreur || !pdfDocRef.current) return;

    const ratiosMap = new Map<number, number>();

    const scrollSyncObserver = new IntersectionObserver(
      (entries) => {
        // Ignorer temporairement la synchronisation si un scroll programmatique est en cours
        if (isProgrammaticScrollRef.current) return;

        entries.forEach((entry) => {
          const pageNum = Number(entry.target.getAttribute('data-page'));
          if (pageNum) {
            if (entry.isIntersecting) {
              ratiosMap.set(pageNum, entry.intersectionRatio);
            } else {
              ratiosMap.delete(pageNum);
            }
          }
        });

        // Identifier la page ayant la plus grande surface visible à l'écran
        let pageLaPlusVisible = pageCourante;
        let maxRatio = -1;

        ratiosMap.forEach((ratio, pageNum) => {
          if (ratio > maxRatio) {
            maxRatio = ratio;
            pageLaPlusVisible = pageNum;
          }
        });

        if (pageLaPlusVisible && pageLaPlusVisible !== pageCourante && maxRatio > 0.15) {
          setPageCourante(pageLaPlusVisible);
          onPageChange?.(pageLaPlusVisible, totalEffectifPages);
        }
      },
      {
        root: scrollContainer,
        threshold: [0.15, 0.35, 0.55, 0.75, 0.95],
      }
    );

    for (let p = 1; p <= totalEffectifPages; p++) {
      const el = pageContainerRefs.current[p];
      if (el) scrollSyncObserver.observe(el);
    }

    return () => scrollSyncObserver.disconnect();
  }, [chargement, erreur, totalEffectifPages, pageCourante, onPageChange]);

  // 7. Navigation bidirectionnelle programmatique (◀, ▶ ou sélection directe)
  const allerPage = useCallback((p: number) => {
    const cible = Math.min(Math.max(1, p), totalEffectifPages);
    setPageCourante(cible);
    onPageChange?.(cible, totalEffectifPages);

    const el = pageContainerRefs.current[cible];
    if (el) {
      isProgrammaticScrollRef.current = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // Rendre immédiatement la page cible si pas encore rendue
      rasteriserPage(cible);

      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 700);
    }
  }, [totalEffectifPages, onPageChange, rasteriserPage]);

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

  const hauteurEstimeePage = Math.floor(largeurAffichagePage * aspectRatioPage1);

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
        backgroundColor: estSombre ? '#0F172A' : '#525659',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* ─────────────────────────────────────────────────────────────────────────── */}
      {/* 1. BARRE D'OUTILS CAUZON FIXE (STICKY / TOTALE INDÉPENDANCE DU SCROLL)       */}
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

        {/* Section Centre : Navigation & Synchronisation en Direct au Scroll */}
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
      {/* 2. CONTENEUR SCROLLABLE VERTICAL DES PAGES AVEC RENDU CANVA HAUTE NETTETÉ    */}
      {/* ─────────────────────────────────────────────────────────────────────────── */}
      <div
        ref={scrollContainerRef}
        style={{
          width: '100%',
          height: 'calc(100% - 52px)',
          flex: 1,
          position: 'relative',
          overflowY: 'auto',
          overflowX: 'hidden',
          backgroundColor: estSombre ? '#0F172A' : '#525659',
          padding: '24px 16px 80px 16px',
          boxSizing: 'border-box',
          scrollBehavior: 'smooth',
        }}
      >
        {/* Écran de chargement initial */}
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
              Préparation de la liseuse haute netteté...
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

        {/* Flux vertical des pages haute netteté */}
        {!chargement && !erreur && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '24px',
              margin: '0 auto',
              width: '100%',
            }}
          >
            {Array.from({ length: totalEffectifPages }, (_, idx) => {
              const pageNum = idx + 1;
              return (
                <div
                  key={`cauzon-page-${pageNum}`}
                  ref={(el) => {
                    pageContainerRefs.current[pageNum] = el;
                  }}
                  className="pdf-page-container"
                  data-page={pageNum}
                  id={`cauzon-desktop-page-${pageNum}`}
                  style={{
                    width: `${largeurAffichagePage}px`,
                    minHeight: `${hauteurEstimeePage}px`,
                    position: 'relative',
                    backgroundColor: '#FFFFFF',
                    borderRadius: '4px',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.28)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {/* Placeholder élégant pendant le lazy-rendering */}
                  <div
                    className="cauzon-page-placeholder"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#FFFFFF',
                      color: '#94A3B8',
                      fontSize: '13px',
                      fontWeight: 600,
                    }}
                  >
                    <span>Chargement de la page {pageNum}...</span>
                  </div>

                  {/* Canvas de rendu vectoriel Retina HD */}
                  <canvas
                    ref={(el) => {
                      canvasRefs.current[pageNum] = el;
                    }}
                    style={{
                      display: 'none',
                      margin: '0 auto',
                    }}
                  />

                  {/* Numéro de page discret */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '8px',
                      right: '12px',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: 'rgba(0, 0, 0, 0.25)',
                      pointerEvents: 'none',
                    }}
                  >
                    Page {pageNum}
                  </div>
                </div>
              );
            })}

            {/* Bannière Paywall à la fin de l'extrait gratuit */}
            {estVerrouille && pagesApercuAutorisees > 0 && (
              <div
                style={{
                  width: '100%',
                  maxWidth: `${largeurAffichagePage}px`,
                  backgroundColor: estSombre ? '#1E293B' : '#FFFFFF',
                  borderRadius: '16px',
                  padding: '32px 24px',
                  textAlign: 'center',
                  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.15)',
                  border: estSombre ? '1px solid #334155' : '1px solid #E2E8F0',
                  marginTop: '12px',
                  marginBottom: '40px',
                }}
              >
                <div
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(127, 1, 31, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 14px auto',
                    fontSize: '28px',
                  }}
                >
                  🔒
                </div>
                <h3
                  style={{
                    margin: '0 0 8px 0',
                    fontSize: '18px',
                    fontWeight: 800,
                    color: estSombre ? '#FFFFFF' : '#0F172A',
                  }}
                >
                  Fin de l'Aperçu Gratuit ({pagesApercuAutorisees} sur {nombrePagesTotal} pages)
                </h3>
                <p
                  style={{
                    margin: '0 0 22px 0',
                    fontSize: '13.5px',
                    lineHeight: '21px',
                    color: estSombre ? '#94A3B8' : '#64748B',
                    maxWidth: '520px',
                    marginLeft: 'auto',
                    marginRight: 'auto',
                  }}
                >
                  Vous avez atteint la limite de consultation gratuite de ce cours. Débloquez la totalité du document pour poursuivre vos révisions sans interruption.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
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
