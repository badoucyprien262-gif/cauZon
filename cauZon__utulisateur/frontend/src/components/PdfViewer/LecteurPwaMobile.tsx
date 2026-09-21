import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { LecteurPdfProps } from './types';
import { chargerPdfJs, extrairePdfBytes } from './pdfjsLoader';

/**
 * LecteurPwaMobile (Bloc 3 - PWA Mobile / iOS Safari & Android Chrome)
 * - Fit-Width automatique au viewport mobile
 * - DPR plafonné à 2.5 (anti-crash mémoire Safari iOS 16MP)
 * - Support tactile fluide : Double-tap et Pinch-to-zoom (CSS transform 60 FPS)
 * - Re-rastérisation physique ciblée sur les pages visibles
 * - Rendu prioritaire Page 1 (< 800 ms) + Lazy-rendering (rootMargin: '400px')
 */
export const LecteurPwaMobile: React.FC<LecteurPdfProps> = ({
  urlFichier,
  pdfUrl,
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
  const [chargement, setChargement] = useState<boolean>(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pageCourante, setPageCourante] = useState<number>(1);
  const [nombrePagesTotal, setNombrePagesTotal] = useState<number>(0);
  const [tentativeKey, setTentativeKey] = useState<number>(0);

  // Échelle de zoom actuelle
  const [zoomActif, setZoomActif] = useState<number>(scale || 1.0);

  // Références techniques
  const pdfDocRef = useRef<any>(null);
  const pageRenderTasks = useRef<{ [pageNumber: number]: any }>({});
  const renderedScalesMap = useRef<Map<number, number>>(new Map());
  const pagesVisiblesRef = useRef<Set<number>>(new Set([1]));
  const baseScaleRef = useRef<number>(1.0);
  const targetWidthRef = useRef<number>(window.innerWidth || 360);
  const zoomActifRef = useRef<number>(scale || 1.0);
  const pageCouranteRef = useRef<number>(1);
  const zoomDebounceTimerRef = useRef<any>(null);

  // Gestion des gestes tactiles
  const lastTapTimeRef = useRef<number>(0);
  const initialPinchDistRef = useRef<number>(0);
  const initialZoomOnPinchRef = useRef<number>(1.0);
  const isPinchingRef = useRef<boolean>(false);
  const visualScaleRef = useRef<number>(1.0);

  useEffect(() => {
    if (scale && scale !== zoomActif) {
      setZoomActif(scale);
    }
  }, [scale]);

  const sourceCible = pdfUrl || (typeof urlFichier === 'string' ? urlFichier : null);

  const reessayerChargement = useCallback(() => {
    setErreur(null);
    setChargement(true);
    setTentativeKey(k => k + 1);
    onReessayer?.();
  }, [onReessayer]);

  // Rendu / Re-rastérisation physique ciblée
  const rasteriserPageMobile = useCallback(async (
    pageNumber: number,
    wrapper: HTMLElement,
    targetZoomScale: number,
    pageInstance?: any
  ) => {
    const pdfDoc = pdfDocRef.current;
    if (!pdfDoc) return;

    // 1. Annulation impérative de la tâche précédente si active
    if (pageRenderTasks.current[pageNumber]) {
      try {
        pageRenderTasks.current[pageNumber].cancel();
      } catch (_) {}
      delete pageRenderTasks.current[pageNumber];
    }

    try {
      const page = pageInstance || (await pdfDoc.getPage(pageNumber));
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      // Plafond DPR strict à 2.5 pour ménager la RAM WebKit iOS / Android
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const effectiveScale = (targetWidthRef.current / unscaledViewport.width) * targetZoomScale;

      // Viewport vectoriel PDF.js
      const viewport = page.getViewport({ scale: effectiveScale });

      // Nettoyer le placeholder
      const placeholder = wrapper.querySelector('.cauzon-page-placeholder');
      if (placeholder) placeholder.remove();

      let canvas = wrapper.querySelector('canvas') as HTMLCanvasElement;
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto';
        canvas.style.touchAction = 'pan-x pan-y pinch-zoom';
        wrapper.appendChild(canvas);
      }

      // 3. Dimensions PHYSIQUES du canvas (matrice de pixels HD)
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);

      // 4. Dimensions VISUELLES CSS (taille affichée à l'écran)
      const cssW = Math.floor(viewport.width);
      const cssH = Math.floor(viewport.height);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;

      wrapper.style.width = `${cssW}px`;
      wrapper.style.maxWidth = 'none';
      wrapper.style.transform = 'none'; // Réinitialisation du scale CSS à 1.0 après re-rastérisation HD

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const renderContext = {
        canvasContext: ctx,
        viewport: page.getViewport({ scale: effectiveScale * dpr }),
      };

      const task = page.render(renderContext);
      pageRenderTasks.current[pageNumber] = task;

      await task.promise;
      renderedScalesMap.current.set(pageNumber, targetZoomScale);
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn(`[LecteurPwaMobile] Erreur rendu page ${pageNumber} :`, err);
      }
    } finally {
      if (pageRenderTasks.current[pageNumber]) {
        delete pageRenderTasks.current[pageNumber];
      }
    }
  }, []);

  // Déclencher la re-rastérisation sur les pages visibles
  const declencherReRastérisation = useCallback((nouveauZoom: number) => {
    setZoomActif(nouveauZoom);
    zoomActifRef.current = nouveauZoom;
    const container = containerRef.current;
    if (!container || !pdfDocRef.current) return;

    const pages = pagesVisiblesRef.current.size > 0
      ? Array.from(pagesVisiblesRef.current)
      : [pageCouranteRef.current || 1];

    pages.forEach(pNum => {
      const wrapper = container.querySelector<HTMLElement>(`.cauzon-page-wrapper[data-page="${pNum}"]`);
      if (wrapper) {
        const rendu = renderedScalesMap.current.get(pNum);
        if (rendu !== nouveauZoom) {
          rasteriserPageMobile(pNum, wrapper, nouveauZoom);
        }
      }
    });
  }, [rasteriserPageMobile]);

  // Contrôles tactiles manuels (+, -, 100%)
  const zoomer = useCallback(() => {
    const next = Math.min(Number((zoomActif + 0.25).toFixed(2)), 2.5);
    declencherReRastérisation(next);
  }, [zoomActif, declencherReRastérisation]);

  const dezoomer = useCallback(() => {
    const next = Math.max(Number((zoomActif - 0.25).toFixed(2)), 0.8);
    declencherReRastérisation(next);
  }, [zoomActif, declencherReRastérisation]);

  const reinitialiserZoom = useCallback(() => {
    declencherReRastérisation(1.0);
  }, [declencherReRastérisation]);

  // Initialisation du document PDF en mode Fit-Width
  useEffect(() => {
    let actif = true;
    let lazyObserver: IntersectionObserver | null = null;
    let pageObserver: IntersectionObserver | null = null;

    async function initialiserMobile() {
      try {
        setChargement(true);
        setErreur(null);

        const pdfjsLib = await chargerPdfJs();
        if (!actif) return;

        const pdfData = await extrairePdfBytes(sourceCible, urlFichier);
        if (!actif) return;

        const loadingTask = pdfjsLib.getDocument({
          data: pdfData,
          cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/cmaps/',
          cMapPacked: true,
        });

        const pdf = await loadingTask.promise;
        if (!actif) return;

        pdfDocRef.current = pdf;
        const totalPages = pdf.numPages;
        setNombrePagesTotal(totalPages);
        onDocumentLoad?.(totalPages);

        // Fit-Width automatique : fenêtre utilisateur
        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        const screenW = container.clientWidth || window.innerWidth || 360;
        // Largeur utile pleine largeur avec marge latérale légère
        const fitWidth = Math.max(screenW - 16, 280);
        targetWidthRef.current = fitWidth;

        const page1 = await pdf.getPage(1);
        if (!actif) return;

        const unscaledViewport1 = page1.getViewport({ scale: 1.0 });
        const baseScale = fitWidth / unscaledViewport1.width;
        baseScaleRef.current = baseScale;

        const defaultDisplayWidth = Math.round(unscaledViewport1.width * baseScale);
        const defaultDisplayHeight = Math.round(unscaledViewport1.height * baseScale);
        const defaultAspectRatioStr = `${unscaledViewport1.width} / ${unscaledViewport1.height}`;

        let maxPages = totalPages;
        let targetCutoffPage = -1;
        let percentOnTargetPage = 100;
        let overlayTitle = "Aperçu terminé";

        if (estVerrouille) {
          if (limiteApercuType === 'page') {
            const limiteP = Number(limiteApercuValeur) || Number(limiteApercuPages) || 1;
            maxPages = Math.min(limiteP, totalPages);
            targetCutoffPage = maxPages;
            percentOnTargetPage = 0;
            overlayTitle = `Aperçu de ${maxPages} page${maxPages > 1 ? 's' : ''} terminé`;
          } else {
            const pct = Number(limiteApercuValeur) || 30;
            const rawAllowed = (totalPages * pct) / 100;
            maxPages = Math.min(Math.ceil(rawAllowed), totalPages);
            targetCutoffPage = maxPages;
            const frac = rawAllowed - Math.floor(rawAllowed);
            percentOnTargetPage = frac > 0 ? Math.round(frac * 100) : 0;
            overlayTitle = `Aperçu gratuit (${pct}%) terminé`;
          }
        }

        const wrappersElements: HTMLElement[] = [];

        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
          const wrapper = document.createElement('div');
          wrapper.className = 'cauzon-page-wrapper';
          wrapper.setAttribute('data-page', String(pageNum));
          wrapper.style.display = 'block';
          wrapper.style.position = 'relative';
          wrapper.style.width = `${defaultDisplayWidth}px`;
          wrapper.style.margin = '0 auto 12px auto';
          wrapper.style.backgroundColor = '#FFFFFF';
          wrapper.style.borderRadius = '4px';
          wrapper.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)';
          wrapper.style.overflow = 'hidden';
          wrapper.style.transformOrigin = 'center top';
          wrapper.style.touchAction = 'pan-x pan-y pinch-zoom';
          wrapper.style.setProperty('user-select', 'none', 'important');
          wrapper.style.setProperty('-webkit-user-select', 'none', 'important');

          const placeholder = document.createElement('div');
          placeholder.className = 'cauzon-page-placeholder';
          placeholder.style.display = 'flex';
          placeholder.style.alignItems = 'center';
          placeholder.style.justifyContent = 'center';
          placeholder.style.width = '100%';
          placeholder.style.minHeight = `${defaultDisplayHeight}px`;
          placeholder.style.aspectRatio = defaultAspectRatioStr;
          placeholder.style.color = '#94A3B8';
          placeholder.style.fontSize = '13px';
          placeholder.style.fontWeight = '600';
          placeholder.style.backgroundColor = '#FAFAFA';
          placeholder.innerHTML = `<span>Page ${pageNum}...</span>`;
          wrapper.appendChild(placeholder);

          // Paywall mobile
          if (estVerrouille && pageNum === targetCutoffPage) {
            const overlay = document.createElement('div');
            overlay.style.position = 'absolute';
            overlay.style.left = '0';
            overlay.style.right = '0';
            overlay.style.bottom = '0';
            overlay.style.top = `${percentOnTargetPage}%`;
            overlay.style.background = 'linear-gradient(to bottom, rgba(255,255,255,0.75) 0%, rgba(255,255,255,1) 100%)';
            overlay.style.backdropFilter = 'blur(8px)';
            overlay.style.display = 'flex';
            overlay.style.flexDirection = 'column';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.padding = '18px 12px';
            overlay.style.zIndex = '20';

            const card = document.createElement('div');
            card.style.backgroundColor = '#FFFFFF';
            card.style.borderRadius = '14px';
            card.style.padding = '16px 12px';
            card.style.boxShadow = '0 8px 24px rgba(107, 17, 36, 0.2)';
            card.style.textAlign = 'center';
            card.style.width = '100%';
            card.style.maxWidth = '320px';

            card.innerHTML = `
              <div style="font-size: 28px; margin-bottom: 6px;">🔒</div>
              <div style="color: #6B1124; font-size: 15px; font-weight: 800; margin-bottom: 4px;">
                ${overlayTitle}
              </div>
              <div style="color: #64748B; font-size: 12px; line-height: 1.4; margin-bottom: 14px;">
                Débloquez les <strong>${totalPages} pages</strong> pour continuer vos révisions.
              </div>
              <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
                <button id="cauzon-btn-achat-mobile" style="background-color: #6B1124; color: #FFFFFF; border: none; padding: 11px; border-radius: 10px; font-weight: 800; font-size: 13px; cursor: pointer;">
                  🛒 Débloquer (${prix} FCFA)
                </button>
                <button id="cauzon-btn-vip-mobile" style="background-color: #D97706; color: #FFFFFF; border: none; padding: 10px; border-radius: 10px; font-weight: 800; font-size: 13px; cursor: pointer;">
                  🎁 Pass VIP
                </button>
              </div>
            `;

            overlay.appendChild(card);
            wrapper.appendChild(overlay);

            setTimeout(() => {
              const bAchat = document.getElementById('cauzon-btn-achat-mobile');
              const bVip = document.getElementById('cauzon-btn-vip-mobile');
              if (bAchat && onAcheter) bAchat.onclick = onAcheter;
              if (bVip && onVip) bVip.onclick = onVip;
            }, 50);
          }

          container.appendChild(wrapper);
          wrappersElements.push(wrapper);
        }

        // 🚀 Rendu prioritaire Page 1 (< 800 ms)
        await rasteriserPageMobile(1, wrappersElements[0], zoomActif, page1);
        if (!actif) return;

        setChargement(false);

        // Lazy-rendering des pages 2 à N (rootMargin: '400px')
        lazyObserver = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                const pageAttr = entry.target.getAttribute('data-page');
                if (pageAttr) {
                  const pNum = parseInt(pageAttr, 10);
                  const rendu = renderedScalesMap.current.get(pNum);
                  if (rendu === undefined || rendu !== zoomActifRef.current) {
                    rasteriserPageMobile(pNum, entry.target as HTMLElement, zoomActifRef.current);
                  }
                }
              }
            }
          },
          { root: container, rootMargin: '400px 0px 400px 0px' }
        );

        wrappersElements.forEach(w => lazyObserver?.observe(w));

        pageObserver = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const pageAttr = entry.target.getAttribute('data-page');
              if (pageAttr) {
                const pNum = parseInt(pageAttr, 10);
                if (entry.isIntersecting) {
                  pagesVisiblesRef.current.add(pNum);
                  setPageCourante(pNum);
                  pageCouranteRef.current = pNum;
                  onPageChange?.(pNum, totalPages);
                } else {
                  pagesVisiblesRef.current.delete(pNum);
                }
              }
            }
          },
          { root: container, threshold: 0.1 }
        );

        wrappersElements.forEach(w => pageObserver?.observe(w));
      } catch (err: any) {
        console.error('[LecteurPwaMobile] Erreur chargement :', err);
        if (actif) {
          setErreur(err?.message || 'Impossible d\'afficher le document.');
          setChargement(false);
          onError?.(err);
        }
      }
    }

    initialiserMobile();

    return () => {
      actif = false;
      if (lazyObserver) lazyObserver.disconnect();
      if (pageObserver) pageObserver.disconnect();

      Object.keys(pageRenderTasks.current).forEach(key => {
        try { pageRenderTasks.current[Number(key)]?.cancel(); } catch (_) {}
      });
      pageRenderTasks.current = {};
      pagesVisiblesRef.current.clear();
      renderedScalesMap.current.clear();

      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [sourceCible, urlFichier, estVerrouille, limiteApercuPages, limiteApercuType, limiteApercuValeur, prix, tentativeKey, rasteriserPageMobile]);

  // Écouteur tactile natif pour Pinch-to-zoom & Double-tap
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const now = Date.now();
        if (now - lastTapTimeRef.current < 320) {
          // Double-tap détecté : bascule 1.0x <-> 2.0x
          e.preventDefault();
          const target = zoomActifRef.current > 1.2 ? 1.0 : 2.0;
          declencherReRastérisation(target);
          lastTapTimeRef.current = 0;
          return;
        }
        lastTapTimeRef.current = now;
      } else if (e.touches.length === 2) {
        // Début de pincement (pinch)
        isPinchingRef.current = true;
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialPinchDistRef.current = dist;
        initialZoomOnPinchRef.current = zoomActifRef.current;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isPinchingRef.current && e.touches.length === 2 && initialPinchDistRef.current > 0) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = dist / initialPinchDistRef.current;
        const liveScale = Math.min(Math.max(initialZoomOnPinchRef.current * factor, 0.8), 2.8);
        visualScaleRef.current = liveScale;

        // Rendu immédiat CSS scale transform à 60/120 FPS
        const wrappers = container.querySelectorAll<HTMLElement>('.cauzon-page-wrapper');
        wrappers.forEach(w => {
          w.style.transform = `scale(${liveScale / zoomActifRef.current})`;
        });
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (isPinchingRef.current && e.touches.length < 2) {
        isPinchingRef.current = false;
        initialPinchDistRef.current = 0;
        const finalZoom = Number(Math.min(Math.max(visualScaleRef.current, 0.8), 2.5).toFixed(2));

        if (Math.abs(finalZoom - zoomActifRef.current) > 0.05) {
          declencherReRastérisation(finalZoom);
        } else {
          // Rétablir sans re-rendu
          const wrappers = container.querySelectorAll<HTMLElement>('.cauzon-page-wrapper');
          wrappers.forEach(w => {
            w.style.transform = 'none';
          });
        }
      }
    };

    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
    };
  }, [declencherReRastérisation]);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '100vw',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: estSombre ? '#0F172A' : '#F1F5F9',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>{`
        .cauzon-mobile-scroll-container {
          display: block !important;
          width: 100% !important;
          height: 100% !important;
          overflow-y: scroll !important;
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch !important;
          touch-action: pan-x pan-y pinch-zoom !important;
          padding: 8px 8px 110px 8px !important;
          box-sizing: border-box !important;
          overscroll-behavior-y: contain !important;
        }
        .cauzon-page-wrapper {
          display: block !important;
          margin: 0 auto 12px auto !important;
          flex-shrink: 0 !important;
          box-sizing: border-box !important;
          position: relative !important;
          transition: transform 0.05s ease-out;
        }
        .cauzon-page-wrapper canvas {
          display: block !important;
          margin: 0 auto !important;
          flex-shrink: 0 !important;
        }
        @keyframes cauzon-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Conteneur défilant PWA Mobile */}
      <div
        ref={containerRef}
        className="cauzon-mobile-scroll-container"
        style={{
          display: chargement || erreur ? 'none' : 'block',
        }}
      />

      {/* Chargement réactif mobile */}
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
            gap: '12px',
            zIndex: 10,
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              border: '3.5px solid rgba(107, 17, 36, 0.15)',
              borderTopColor: '#6B1124',
              borderRadius: '50%',
              animation: 'cauzon-spin 0.8s linear infinite',
            }}
          />
          <div style={{ color: '#6B1124', fontSize: '14px', fontWeight: 700 }}>
            Chargement optimisé smartphone...
          </div>
          <div style={{ color: '#64748B', fontSize: '11px' }}>
            Rendu haute résolution Retina
          </div>
        </div>
      )}

      {/* Écran d'erreur mobile */}
      {erreur && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: estSombre ? '#0F172A' : '#F8FAFC',
            padding: '20px',
            textAlign: 'center',
            gap: '10px',
            zIndex: 10,
          }}
        >
          <div style={{ fontSize: '32px' }}>⚠️</div>
          <div style={{ color: '#0F172A', fontSize: '15px', fontWeight: 700 }}>
            Document inaccessible
          </div>
          <div style={{ color: '#64748B', fontSize: '12px', maxWidth: '280px' }}>
            {erreur}
          </div>
          <button
            onClick={reessayerChargement}
            style={{
              marginTop: '6px',
              padding: '9px 18px',
              borderRadius: '10px',
              backgroundColor: '#6B1124',
              color: '#FFFFFF',
              border: 'none',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            🔄 Réessayer
          </button>
        </div>
      )}

      {/* Barre d'outils mobile ergonomique */}
      {!chargement && !erreur && nombrePagesTotal > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            color: '#FFFFFF',
            padding: '4px 8px',
            borderRadius: '26px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.35)',
            zIndex: 30,
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
          }}
        >
          <button
            onClick={dezoomer}
            disabled={zoomActif <= 0.8}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              color: zoomActif <= 0.8 ? 'rgba(255,255,255,0.3)' : '#FFFFFF',
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              fontWeight: 800,
            }}
            title="Dézoomer"
          >
            −
          </button>

          <button
            onClick={reinitialiserZoom}
            style={{
              background: 'none',
              border: 'none',
              color: '#FFFFFF',
              padding: '3px 8px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="Toucher pour réinitialiser"
          >
            <span>{pageCourante}/{nombrePagesTotal}</span>
            {zoomActif !== 1.0 && (
              <span
                style={{
                  backgroundColor: 'rgba(56, 189, 248, 0.22)',
                  color: '#38BDF8',
                  padding: '1px 5px',
                  borderRadius: '6px',
                  fontSize: '10px',
                  fontWeight: 800,
                }}
              >
                {Math.round(zoomActif * 100)}%
              </span>
            )}
          </button>

          <button
            onClick={zoomer}
            disabled={zoomActif >= 2.5}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              color: zoomActif >= 2.5 ? 'rgba(255,255,255,0.3)' : '#FFFFFF',
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              fontWeight: 800,
            }}
            title="Zoomer"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
};

export default LecteurPwaMobile;
