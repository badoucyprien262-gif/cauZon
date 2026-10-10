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
 * LecteurPdfDesktop (Moteur Vectoriel Ultra-Net PDF.js avec Barre d'Outils Fixe Isolée)
 *
 * 1. Verrouillage absolu de la barre supérieure cauZon (position: fixed, z-index: 1000, 52px invariable).
 * 2. Neutralisation du zoom global navigateur sur la page : touch-action: pan-x pan-y et e.preventDefault() sur Ctrl+Wheel.
 * 3. Captage direct du zoom pavé tactile (trackpad pinch) et tactile (pinch 2 doigts) branché sur le zoom vectoriel.
 * 4. Fluidité 60 FPS immédiate pendant le geste + re-rendu vectoriel Retina HD à l'arrêt du geste (zéro flou d'étirement).
 * 5. Synchronisation en direct de l'indicateur de page au scroll (IntersectionObserver).
 * 6. Bouclier de sécurité anti-fuite : interception Ctrl+P / Ctrl+S, clic droit bloqué, paywall DRM.
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
  scale = 1.0,
  onAcheter,
  onVip,
  onFermer,
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

  // Échelle de zoom dynamique du document (1.0 = 100%)
  const [zoomScale, setZoomScale] = useState<number>(scale || 1.15);
  const [aspectRatioPage1, setAspectRatioPage1] = useState<number>(1.414);
  const [baseWidthPage1, setBaseWidthPage1] = useState<number>(595);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);
  const pageContainerRefs = useRef<{ [pageNumber: number]: HTMLDivElement | null }>({});
  const canvasRefs = useRef<{ [pageNumber: number]: HTMLCanvasElement | null }>({});
  const pagesRenduesRef = useRef<Map<number, number>>(new Map()); // pageNum -> scale rendu
  const tachesRenduRef = useRef<{ [pageNumber: number]: any }>({});
  const timerNotificationRef = useRef<any>(null);
  const isProgrammaticScrollRef = useRef<boolean>(false);

  // Références techniques pour le zoom tactile & trackpad fluide
  const zoomScaleRef = useRef<number>(zoomScale);
  const zoomDebounceTimerRef = useRef<any>(null);
  const isPinchingRef = useRef<boolean>(false);
  const initialPinchDistRef = useRef<number>(0);
  const initialZoomOnPinchRef = useRef<number>(1.0);

  useEffect(() => {
    zoomScaleRef.current = zoomScale;
  }, [zoomScale]);

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

  // 2. RASTÉRISATION HAUTE DÉFINITION VECTORIELLE AU NIVEAU DE ZOOM EXACT
  const rasteriserPage = useCallback(async (pageNum: number, currentScale: number) => {
    const pdfDoc = pdfDocRef.current;
    if (!pdfDoc) return;

    // Si déjà rendu exactement à cette échelle de zoom, ignorer
    const scaleRendu = pagesRenduesRef.current.get(pageNum);
    if (scaleRendu !== undefined && Math.abs(scaleRendu - currentScale) < 0.01) {
      return;
    }

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

      // 🎯 Formule vectorielle Retina HD exacte :
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const viewport = page.getViewport({ scale: currentScale * dpr });

      // Dimensions physiques haute résolution (pixels du buffer)
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      // Dimensions CSS d'affichage net (taille logique à l'écran)
      const cssW = Math.floor(viewport.width / dpr);
      const cssH = Math.floor(viewport.height / dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.style.display = 'block';

      // Dimensions du conteneur parent pour un défilement géométriquement parfait
      wrapper.style.width = `${cssW}px`;
      wrapper.style.height = `${cssH}px`;

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
        viewport: viewport,
      });
      tachesRenduRef.current[pageNum] = renderTask;
      await renderTask.promise;

      pagesRenduesRef.current.set(pageNum, currentScale);
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn(`[LecteurPdfDesktop] Note rendu page ${pageNum} :`, err);
      }
    } finally {
      delete tachesRenduRef.current[pageNum];
    }
  }, []);

  // 3. Initialisation du document PDF via PDF.js
  useEffect(() => {
    let estActif = true;

    async function initialiserDocument() {
      try {
        setChargement(true);
        setErreur(null);
        pagesRenduesRef.current.clear();

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

        // Calcul des pages autorisées en cas de verrouillage DRM
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

        // Dimensions de référence de la Page 1
        const page1 = await pdfDoc.getPage(1);
        const vp1 = page1.getViewport({ scale: 1.0 });
        setBaseWidthPage1(vp1.width);
        setAspectRatioPage1(vp1.height / vp1.width);

        // Ajuster l'échelle de départ optimale par rapport à la largeur de l'écran
        const containerWidth = scrollContainerRef.current?.clientWidth || window.innerWidth || 900;
        const initialFitScale = Math.min(Math.max((containerWidth - 80) / vp1.width, 0.8), 1.6);
        setZoomScale(Number(initialFitScale.toFixed(2)));

        if (estActif) {
          setChargement(false);
        }
      } catch (err: any) {
        console.error('[LecteurPdfDesktop] Erreur initialisation PDF.js :', err);
        if (estActif) {
          setErreur(err?.message || 'Impossible d\'afficher le document.');
          setChargement(false);
          onError?.(err);
        }
      }
    }

    initialiserDocument();

    return () => {
      estActif = false;
      Object.keys(tachesRenduRef.current).forEach(k => {
        try { tachesRenduRef.current[Number(k)]?.cancel(); } catch (_) {}
      });
      tachesRenduRef.current = {};
      pagesRenduesRef.current.clear();
      if (zoomDebounceTimerRef.current) clearTimeout(zoomDebounceTimerRef.current);
    };
  }, [sourceBrute, urlFichier, estVerrouille, limiteApercuPages, limiteApercuType, limiteApercuValeur]);

  // 4. Re-rastérisation vectorielle HD des pages visibles à chaque changement de zoom stabilisé
  useEffect(() => {
    if (chargement || erreur || !pdfDocRef.current) return;

    // Vider le cache de rendu pour forcer la regénération HD au nouveau zoom
    pagesRenduesRef.current.clear();

    // Rendre immédiatement la page courante en cours de lecture
    rasteriserPage(pageCourante, zoomScale);

    // Mettre à jour immédiatement la géométrie réservée de toutes les pages pour un scroll impeccable
    for (let p = 1; p <= totalEffectifPages; p++) {
      const wrapper = pageContainerRefs.current[p];
      if (wrapper) {
        const approxW = Math.floor(baseWidthPage1 * zoomScale);
        const approxH = Math.floor(approxW * aspectRatioPage1);
        wrapper.style.width = `${approxW}px`;
        wrapper.style.height = `${approxH}px`;
      }
    }
  }, [zoomScale, chargement, erreur, pageCourante, totalEffectifPages, baseWidthPage1, aspectRatioPage1, rasteriserPage]);

  // 5. Moteur de zoom interactif fluide (Touchscreen & Trackpad) avec debounce vectoriel HD
  const appliquerZoomInteractif = useCallback((targetZoom: number) => {
    const clamped = Math.min(Math.max(Number(targetZoom.toFixed(2)), 0.6), 2.8);
    zoomScaleRef.current = clamped;

    // Fluidité visuelle immédiate 60 FPS sur les dimensions CSS pendant le mouvement
    for (let p = 1; p <= totalEffectifPages; p++) {
      const wrapper = pageContainerRefs.current[p];
      const canvas = canvasRefs.current[p];
      if (wrapper) {
        const w = Math.floor(baseWidthPage1 * clamped);
        const h = Math.floor(w * aspectRatioPage1);
        wrapper.style.width = `${w}px`;
        wrapper.style.height = `${h}px`;
        if (canvas && canvas.style.display !== 'none') {
          canvas.style.width = `${w}px`;
          canvas.style.height = `${h}px`;
        }
      }
    }

    // Debounce de 160ms à l'arrêt du geste pour déclencher le re-calcul vectoriel HD complet
    if (zoomDebounceTimerRef.current) {
      clearTimeout(zoomDebounceTimerRef.current);
    }
    zoomDebounceTimerRef.current = setTimeout(() => {
      setZoomScale(clamped);
    }, 160);
  }, [totalEffectifPages, baseWidthPage1, aspectRatioPage1]);

  // 6. Neutralisation du zoom global navigateur & Captage du geste pavé tactile / écran tactile
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Interception de Ctrl + Molette ou Pincement de pavé tactile (Wheel avec ctrlKey)
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        // 🛡️ EMPÊCHE STRICTEMENT LE NAVIGATEUR DE ZOONER LA PAGE ENTIÈRE OU LA BARRE D'OUTILS
        e.preventDefault();
        e.stopPropagation();

        const current = zoomScaleRef.current;
        const delta = -e.deltaY * 0.005;
        const next = current + delta;
        appliquerZoomInteractif(next);
      }
    };

    // Interception de l'écran tactile (Pinch-to-zoom 2 doigts)
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        isPinchingRef.current = true;
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        initialPinchDistRef.current = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        initialZoomOnPinchRef.current = zoomScaleRef.current;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && isPinchingRef.current && initialPinchDistRef.current > 0) {
        // 🛡️ EMPÊCHE LE ZOOM GLOBAL DE LA FENÊTRE SUR SMARTPHONE / TABLETTE
        e.preventDefault();
        e.stopPropagation();

        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        const factor = dist / initialPinchDistRef.current;
        const next = initialZoomOnPinchRef.current * factor;
        appliquerZoomInteractif(next);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (isPinchingRef.current && e.touches.length < 2) {
        isPinchingRef.current = false;
        initialPinchDistRef.current = 0;
      }
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);

    return () => {
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
    };
  }, [appliquerZoomInteractif]);

  // 7. Lazy-Rendering haute fidélité des pages visibles via IntersectionObserver
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || chargement || erreur || !pdfDocRef.current) return;

    const lazyObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNum = Number(entry.target.getAttribute('data-page'));
            if (pageNum) {
              rasteriserPage(pageNum, zoomScale);
            }
          }
        });
      },
      {
        root: scrollContainer,
        rootMargin: '500px 0px 500px 0px',
      }
    );

    for (let p = 1; p <= totalEffectifPages; p++) {
      const el = pageContainerRefs.current[p];
      if (el) lazyObserver.observe(el);
    }

    return () => lazyObserver.disconnect();
  }, [chargement, erreur, totalEffectifPages, zoomScale, rasteriserPage]);

  // 8. SYNCHRONISATION EN DIRECT DU COMPTEUR DE PAGES AU SCROLL (IntersectionObserver)
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || chargement || erreur || !pdfDocRef.current) return;

    const ratiosMap = new Map<number, number>();

    const scrollSyncObserver = new IntersectionObserver(
      (entries) => {
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

  // 9. Navigation bidirectionnelle fluide
  const allerPage = useCallback((p: number) => {
    const cible = Math.min(Math.max(1, p), totalEffectifPages);
    setPageCourante(cible);
    onPageChange?.(cible, totalEffectifPages);

    const el = pageContainerRefs.current[cible];
    if (el) {
      isProgrammaticScrollRef.current = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // Rastérisation immédiate de la page ciblée
      rasteriserPage(cible, zoomScale);

      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 700);
    }
  }, [totalEffectifPages, onPageChange, zoomScale, rasteriserPage]);

  // 10. Contrôles de zoom vectoriel manuels
  const zoomer = () => {
    setZoomScale(prev => Number(Math.min(prev + 0.2, 2.8).toFixed(2)));
  };

  const dezoomer = () => {
    setZoomScale(prev => Number(Math.max(prev - 0.2, 0.6).toFixed(2)));
  };

  const reinitialiserZoom = () => {
    setZoomScale(1.0);
  };

  const ajusterALaLargeur = () => {
    if (!scrollContainerRef.current || !baseWidthPage1) return;
    const containerW = scrollContainerRef.current.clientWidth || 900;
    const fitScale = Math.max((containerW - 80) / baseWidthPage1, 0.6);
    setZoomScale(Number(fitScale.toFixed(2)));
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

  const largeurInitialePx = Math.floor(baseWidthPage1 * zoomScale);
  const hauteurInitialePx = Math.floor(largeurInitialePx * aspectRatioPage1);

  return (
    <div
      ref={rootRef}
      style={{
        width: '100%',
        height: '100vh',
        maxHeight: '100vh',
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
      {/* 1. BARRE D'OUTILS CAUZON FIXE (TOTALEMENT ISOLÉE DU FLUX DE ZOOM & SCROLL)    */}
      {/* ─────────────────────────────────────────────────────────────────────────── */}
      <div
        id="cauzon-desktop-fixed-toolbar"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '52px',
          minHeight: '52px',
          maxHeight: '52px',
          width: '100%',
          zIndex: 1000,
          backgroundColor: '#7F011F',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.3)',
          borderBottom: '1px solid rgba(0, 0, 0, 0.15)',
          boxSizing: 'border-box',
          transform: 'none',
          touchAction: 'none',
        }}
      >
        {/* Section Gauche : Retour, Titre & Statut */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, maxWidth: '32%' }}>
          {onFermer && (
            <button
              onClick={onFermer}
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                border: 'none',
                color: '#FFFFFF',
                borderRadius: '8px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '16px',
                flexShrink: 0,
              }}
              title="Fermer le lecteur"
            >
              ←
            </button>
          )}
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
                ? `🔒 Extrait (${pagesApercuAutorisees}/${nombrePagesTotal} page${pagesApercuAutorisees > 1 ? 's' : ''})`
                : `✅ Document complet (${nombrePagesTotal} page${nombrePagesTotal > 1 ? 's' : ''})`}
            </span>
          </div>
        </div>

        {/* Section Centre : Pagination en Direct & Contrôles Zoom Vectoriels */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Indicateur de Page & Navigation */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.28)',
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

            <span style={{ fontSize: '12px', fontWeight: 700, minWidth: '70px', textAlign: 'center' }}>
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

          {/* Contrôles de Zoom Vectoriel Ultra-Net */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.28)',
              borderRadius: '8px',
              padding: '3px 6px',
              gap: 4,
            }}
          >
            <button
              onClick={dezoomer}
              disabled={zoomScale <= 0.6}
              style={{
                background: 'none',
                border: 'none',
                color: zoomScale <= 0.6 ? 'rgba(255,255,255,0.3)' : '#FFFFFF',
                cursor: zoomScale <= 0.6 ? 'default' : 'pointer',
                fontSize: '15px',
                fontWeight: 800,
                padding: '2px 7px',
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
                padding: '2px 5px',
                minWidth: '44px',
                textAlign: 'center',
              }}
              title="Réinitialiser à 100%"
            >
              {Math.round(zoomScale * 100)}%
            </button>

            <button
              onClick={zoomer}
              disabled={zoomScale >= 2.8}
              style={{
                background: 'none',
                border: 'none',
                color: zoomScale >= 2.8 ? 'rgba(255,255,255,0.3)' : '#FFFFFF',
                cursor: zoomScale >= 2.8 ? 'default' : 'pointer',
                fontSize: '15px',
                fontWeight: 800,
                padding: '2px 7px',
                borderRadius: '4px',
              }}
              title="Zoomer (+)"
            >
              +
            </button>

            <button
              onClick={ajusterALaLargeur}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                border: 'none',
                color: '#FFFFFF',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '3px 7px',
                borderRadius: '5px',
                marginLeft: '2px',
              }}
              title="Ajuster à la largeur de l'écran"
            >
              ↔️ Ajuster
            </button>
          </div>

          {/* Bouton Plein Écran */}
          <button
            onClick={basculerPleinEcran}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              border: 'none',
              color: '#FFFFFF',
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
            title={estPleinEcran ? 'Quitter le plein écran' : 'Passer en plein écran'}
          >
            <span>{estPleinEcran ? '🗗' : '⛶'}</span>
            <span>{estPleinEcran ? 'Fenêtre' : 'Plein écran'}</span>
          </button>
        </div>

        {/* Section Droite : Protection & Achat */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: '11px',
              color: 'rgba(255, 255, 255, 0.85)',
              backgroundColor: 'rgba(0, 0, 0, 0.22)',
              padding: '4px 10px',
              borderRadius: '6px',
            }}
          >
            <span>🛡️</span>
            <span>Protégé cauZon</span>
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

      {/* Notification Toast */}
      {messageNotification && (
        <div
          style={{
            position: 'fixed',
            top: '64px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            color: '#FFFFFF',
            padding: '8px 18px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
            zIndex: 1100,
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            pointerEvents: 'none',
          }}
        >
          {messageNotification}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────── */}
      {/* 2. CONTENEUR DU DOCUMENT (AVEC TOUCH-ACTION DÉDIÉE ET CAPTAGE DU PINCH)       */}
      {/* ─────────────────────────────────────────────────────────────────────────── */}
      <div
        ref={scrollContainerRef}
        id="cauzon-desktop-scroll-viewport"
        style={{
          position: 'absolute',
          top: '52px',
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: 'calc(100vh - 52px)',
          overflowY: 'auto',
          overflowX: 'auto',
          backgroundColor: estSombre ? '#0F172A' : '#525659',
          padding: '28px 16px 80px 16px',
          boxSizing: 'border-box',
          scrollBehavior: 'smooth',
          touchAction: 'pan-x pan-y', // 🛡️ BLOQUE LE PINCH-ZOOM GLOBAL DU NAVIGATEUR
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
              Rendu vectoriel haute netteté Retina...
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

        {/* Flux paginé des Canvas haute fidélité */}
        {!chargement && !erreur && (
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
            {Array.from({ length: totalEffectifPages }, (_, idx) => {
              const pageNum = idx + 1;
              return (
                <div
                  key={`cauzon-desktop-page-${pageNum}`}
                  ref={(el) => {
                    pageContainerRefs.current[pageNum] = el;
                  }}
                  className="pdf-page-container"
                  data-page={pageNum}
                  id={`cauzon-desktop-page-${pageNum}`}
                  style={{
                    width: `${largeurInitialePx}px`,
                    height: `${hauteurInitialePx}px`,
                    position: 'relative',
                    backgroundColor: '#FFFFFF',
                    borderRadius: '4px',
                    boxShadow: '0 6px 24px rgba(0, 0, 0, 0.35)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto',
                    flexShrink: 0,
                  }}
                >
                  {/* Placeholder pendant le rendu vectoriel */}
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
                  maxWidth: `${largeurInitialePx}px`,
                  backgroundColor: estSombre ? '#1E293B' : '#FFFFFF',
                  borderRadius: '16px',
                  padding: '32px 24px',
                  textAlign: 'center',
                  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.15)',
                  border: estSombre ? '1px solid #334155' : '1px solid #E2E8F0',
                  marginTop: '12px',
                  marginBottom: '40px',
                  boxSizing: 'border-box',
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
