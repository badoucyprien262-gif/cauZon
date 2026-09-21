import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { LecteurPdfProps } from './types';
import { chargerPdfJs, extrairePdfBytes } from './pdfjsLoader';

/**
 * LecteurPwaDesktop (Bloc 2 - PWA PC / Bureau)
 * - Rendu Canvas haute définition
 * - Couche vectorielle TextLayer superposée
 * - Protection anti-copie stricte (user-select: none, pointer-events: none)
 * - Navigation clavier et zoom fluide
 */
export const LecteurPwaDesktop: React.FC<LecteurPdfProps> = ({
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
  const [zoomActif, setZoomActif] = useState<number>(scale || 1.0);

  const pdfDocRef = useRef<any>(null);
  const pageRenderTasks = useRef<{ [pageNumber: number]: any }>({});
  const renderedScalesMap = useRef<Map<number, number>>(new Map());
  const pagesVisiblesRef = useRef<Set<number>>(new Set([1]));
  const targetWidthRef = useRef<number>(860);
  const zoomActifRef = useRef<number>(scale || 1.0);
  const zoomDebounceTimerRef = useRef<any>(null);

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

  const zoomer = useCallback(() => {
    setZoomActif(prev => Math.min(Number((prev + 0.2).toFixed(2)), 2.5));
  }, []);

  const dezoomer = useCallback(() => {
    setZoomActif(prev => Math.max(Number((prev - 0.2).toFixed(2)), 0.75));
  }, []);

  const reinitialiserZoom = useCallback(() => {
    setZoomActif(1.0);
  }, []);

  // Rendu d'une page : Canvas graphique HD + Couche TextLayer vectorielle
  const rasteriserPage = useCallback(async (
    pageNumber: number,
    wrapper: HTMLElement,
    currentZoomScale: number,
    pageInstance?: any
  ) => {
    const pdfDoc = pdfDocRef.current;
    if (!pdfDoc) return;

    // 1. Annuler impérativement la tâche précédente sur ce canvas
    if (pageRenderTasks.current[pageNumber]) {
      try {
        pageRenderTasks.current[pageNumber].cancel();
      } catch (_) {}
      delete pageRenderTasks.current[pageNumber];
    }

    try {
      const page = pageInstance || (await pdfDoc.getPage(pageNumber));
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
      const targetWidth = targetWidthRef.current || 860;
      const baseScale = targetWidth / unscaledViewport.width;
      const effectiveScale = baseScale * currentZoomScale;

      // Viewport pour le rendu graphique (en pixels physiques)
      const renderViewport = page.getViewport({ scale: effectiveScale * dpr });
      // Viewport pour le texte CSS (en pixels CSS)
      const cssViewport = page.getViewport({ scale: effectiveScale });

      // Retirer le placeholder
      const placeholder = wrapper.querySelector('.cauzon-page-placeholder');
      if (placeholder) placeholder.remove();

      // Préparer ou réutiliser le canvas
      let canvas = wrapper.querySelector('canvas') as HTMLCanvasElement;
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto';
        wrapper.appendChild(canvas);
      }

      const cssWidth = Math.floor(cssViewport.width);
      const cssHeight = Math.floor(cssViewport.height);

      canvas.width = Math.floor(renderViewport.width);
      canvas.height = Math.floor(renderViewport.height);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;

      wrapper.style.width = `${cssWidth}px`;
      wrapper.style.maxWidth = 'none';

      // Rendu Canvas
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const renderTask = page.render({
        canvasContext: ctx,
        viewport: renderViewport,
      });
      pageRenderTasks.current[pageNumber] = renderTask;

      await renderTask.promise;
      renderedScalesMap.current.set(pageNumber, currentZoomScale);

      // 2. Injection de la couche TextLayer vectorielle (sécurisée sans copie)
      try {
        const textContent = await page.getTextContent();
        let textLayerDiv = wrapper.querySelector('.cauzon-text-layer') as HTMLDivElement;
        if (!textLayerDiv) {
          textLayerDiv = document.createElement('div');
          textLayerDiv.className = 'textLayer cauzon-text-layer';
          wrapper.appendChild(textLayerDiv);
        }
        textLayerDiv.innerHTML = '';
        textLayerDiv.style.position = 'absolute';
        textLayerDiv.style.left = '0';
        textLayerDiv.style.top = '0';
        textLayerDiv.style.width = `${cssWidth}px`;
        textLayerDiv.style.height = `${cssHeight}px`;
        textLayerDiv.style.overflow = 'hidden';
        textLayerDiv.style.pointerEvents = 'none';
        textLayerDiv.style.setProperty('user-select', 'none', 'important');
        textLayerDiv.style.setProperty('-webkit-user-select', 'none', 'important');

        const pdfjs = (window as any).pdfjsLib;
        if (pdfjs && typeof pdfjs.renderTextLayer === 'function') {
          const textTask = pdfjs.renderTextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: cssViewport,
            textDivs: [],
          });
          if (textTask && textTask.promise) {
            await textTask.promise;
          }
        }
      } catch (textErr) {
        // Le canvas assure l'affichage visuel en cas d'erreur de la textLayer
      }
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn(`[LecteurPwaDesktop] Échec rendu page ${pageNumber} :`, err);
      }
    } finally {
      if (pageRenderTasks.current[pageNumber]) {
        delete pageRenderTasks.current[pageNumber];
      }
    }
  }, []);

  // Zoom réactif : mise à jour instantanée CSS + re-rastérisation vectorielle HD (Debounce 250ms)
  useEffect(() => {
    zoomActifRef.current = zoomActif;
    const container = containerRef.current;
    if (!container) return;

    const targetWidth = targetWidthRef.current || 860;
    const immediateWidth = Math.floor(targetWidth * zoomActif);

    const wrappers = container.querySelectorAll<HTMLElement>('.cauzon-page-wrapper');
    wrappers.forEach(w => {
      w.style.width = `${immediateWidth}px`;
      w.style.maxWidth = 'none';
      const c = w.querySelector('canvas');
      if (c) {
        c.style.width = `${immediateWidth}px`;
        c.style.height = 'auto';
      }
      const tl = w.querySelector<HTMLElement>('.cauzon-text-layer');
      if (tl) {
        tl.style.width = `${immediateWidth}px`;
        tl.style.height = 'auto';
      }
    });

    if (zoomDebounceTimerRef.current) {
      clearTimeout(zoomDebounceTimerRef.current);
    }

    zoomDebounceTimerRef.current = setTimeout(() => {
      if (!pdfDocRef.current) return;
      const pages = pagesVisiblesRef.current.size > 0
        ? Array.from(pagesVisiblesRef.current)
        : [pageCourante];

      pages.forEach(pNum => {
        const wrapper = container.querySelector<HTMLElement>(`.cauzon-page-wrapper[data-page="${pNum}"]`);
        if (wrapper) {
          const renderedScale = renderedScalesMap.current.get(pNum);
          if (renderedScale !== zoomActif) {
            rasteriserPage(pNum, wrapper, zoomActif);
          }
        }
      });
    }, 250);

    return () => {
      if (zoomDebounceTimerRef.current) clearTimeout(zoomDebounceTimerRef.current);
    };
  }, [zoomActif, rasteriserPage, pageCourante]);

  // Chargement et initialisation du document
  useEffect(() => {
    let actif = true;
    let lazyObserver: IntersectionObserver | null = null;
    let pageObserver: IntersectionObserver | null = null;

    async function initialiserDesktop() {
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

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        const availableWidth = container.clientWidth || window.innerWidth;
        const targetContainerWidth = Math.min(availableWidth - 64, 880);
        targetWidthRef.current = targetContainerWidth;

        const page1 = await pdf.getPage(1);
        if (!actif) return;

        const unscaledViewport1 = page1.getViewport({ scale: 1.0 });
        const baseScale = targetContainerWidth / unscaledViewport1.width;
        const defaultDisplayWidth = Math.round(unscaledViewport1.width * baseScale);
        const defaultDisplayHeight = Math.round(unscaledViewport1.height * baseScale);
        const defaultAspectRatioStr = `${unscaledViewport1.width} / ${unscaledViewport1.height}`;

        const wrappersElements: HTMLElement[] = [];

        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
          const wrapper = document.createElement('div');
          wrapper.className = 'cauzon-page-wrapper';
          wrapper.setAttribute('data-page', String(pageNum));
          wrapper.style.display = 'block';
          wrapper.style.position = 'relative';
          wrapper.style.width = `${Math.round(defaultDisplayWidth * zoomActif)}px`;
          wrapper.style.margin = '0 auto 20px auto';
          wrapper.style.backgroundColor = '#FFFFFF';
          wrapper.style.borderRadius = '8px';
          wrapper.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)';
          wrapper.style.overflow = 'hidden';
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
          placeholder.style.fontSize = '14px';
          placeholder.style.fontWeight = '600';
          placeholder.style.backgroundColor = '#FAFAFA';
          placeholder.innerHTML = `<span>Chargement page ${pageNum}...</span>`;
          wrapper.appendChild(placeholder);

          if (estVerrouille && pageNum === targetCutoffPage) {
            const overlay = document.createElement('div');
            overlay.style.position = 'absolute';
            overlay.style.left = '0';
            overlay.style.right = '0';
            overlay.style.bottom = '0';
            overlay.style.top = `${percentOnTargetPage}%`;
            overlay.style.background = 'linear-gradient(to bottom, rgba(255,255,255,0.7) 0%, rgba(255,255,255,1) 100%)';
            overlay.style.backdropFilter = 'blur(8px)';
            overlay.style.display = 'flex';
            overlay.style.flexDirection = 'column';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.padding = '32px';
            overlay.style.zIndex = '20';

            const card = document.createElement('div');
            card.style.backgroundColor = '#FFFFFF';
            card.style.borderRadius = '16px';
            card.style.padding = '24px';
            card.style.boxShadow = '0 10px 30px rgba(107, 17, 36, 0.2)';
            card.style.textAlign = 'center';
            card.style.maxWidth = '420px';
            card.style.width = '100%';

            card.innerHTML = `
              <div style="font-size: 36px; margin-bottom: 8px;">🔒</div>
              <div style="color: #6B1124; font-size: 18px; font-weight: 800; margin-bottom: 6px;">
                ${overlayTitle}
              </div>
              <div style="color: #64748B; font-size: 13px; line-height: 1.5; margin-bottom: 18px;">
                Débloquez l'intégralité du cours (${totalPages} pages) pour poursuivre vos révisions sur grand écran.
              </div>
              <div style="display: flex; gap: 10px; width: 100%;">
                <button id="cauzon-btn-achat-desktop" style="flex: 1; background-color: #6B1124; color: #FFFFFF; border: none; padding: 12px; border-radius: 12px; font-weight: 800; font-size: 13px; cursor: pointer;">
                  🛒 Débloquer (${prix} FCFA)
                </button>
                <button id="cauzon-btn-vip-desktop" style="flex: 1; background-color: #D97706; color: #FFFFFF; border: none; padding: 12px; border-radius: 12px; font-weight: 800; font-size: 13px; cursor: pointer;">
                  🎁 Pass VIP
                </button>
              </div>
            `;

            overlay.appendChild(card);
            wrapper.appendChild(overlay);

            setTimeout(() => {
              const bAchat = document.getElementById('cauzon-btn-achat-desktop');
              const bVip = document.getElementById('cauzon-btn-vip-desktop');
              if (bAchat && onAcheter) bAchat.onclick = onAcheter;
              if (bVip && onVip) bVip.onclick = onVip;
            }, 50);
          }

          container.appendChild(wrapper);
          wrappersElements.push(wrapper);
        }

        // Rendu prioritaire Page 1
        await rasteriserPage(1, wrappersElements[0], zoomActif, page1);
        if (!actif) return;

        setChargement(false);

        // Lazy-rendering des pages suivantes
        lazyObserver = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                const pageAttr = entry.target.getAttribute('data-page');
                if (pageAttr) {
                  const pNum = parseInt(pageAttr, 10);
                  const renderedScale = renderedScalesMap.current.get(pNum);
                  if (renderedScale === undefined || renderedScale !== zoomActifRef.current) {
                    rasteriserPage(pNum, entry.target as HTMLElement, zoomActifRef.current);
                  }
                }
              }
            }
          },
          { root: container, rootMargin: '600px 0px 600px 0px' }
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
                  onPageChange?.(pNum, totalPages);
                } else {
                  pagesVisiblesRef.current.delete(pNum);
                }
              }
            }
          },
          { root: container, threshold: 0.15 }
        );

        wrappersElements.forEach(w => pageObserver?.observe(w));
      } catch (err: any) {
        console.error('[LecteurPwaDesktop] Erreur chargement :', err);
        if (actif) {
          setErreur(err?.message || 'Impossible d\'afficher le document.');
          setChargement(false);
          onError?.(err);
        }
      }
    }

    initialiserDesktop();

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
  }, [sourceCible, urlFichier, estVerrouille, limiteApercuPages, limiteApercuType, limiteApercuValeur, prix, tentativeKey, rasteriserPage]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: estSombre ? '#0F172A' : '#F1F5F9',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <style>{`
        .cauzon-desktop-scroll-container {
          display: block !important;
          width: 100% !important;
          height: 100% !important;
          overflow-y: auto !important;
          overflow-x: auto !important;
          padding: 24px 24px 100px 24px !important;
          box-sizing: border-box !important;
        }
        .cauzon-page-wrapper {
          display: block !important;
          margin: 0 auto 20px auto !important;
          position: relative !important;
          box-sizing: border-box !important;
        }
        .cauzon-page-wrapper canvas {
          display: block !important;
          margin: 0 auto !important;
        }
        .cauzon-text-layer {
          position: absolute;
          left: 0;
          top: 0;
          overflow: hidden;
          line-height: 1.0;
          user-select: none !important;
          -webkit-user-select: none !important;
          pointer-events: none !important;
          opacity: 1;
        }
        .cauzon-text-layer span,
        .cauzon-text-layer br {
          color: transparent !important;
          position: absolute;
          white-space: pre;
          cursor: default;
          transform-origin: 0% 0%;
          user-select: none !important;
          -webkit-user-select: none !important;
          pointer-events: none !important;
        }
        @keyframes cauzon-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Conteneur principal de défilement Desktop */}
      <div
        ref={containerRef}
        className="cauzon-desktop-scroll-container"
        style={{
          display: chargement || erreur ? 'none' : 'block',
        }}
      />

      {/* Spinner de chargement */}
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
            gap: '14px',
            zIndex: 10,
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              border: '4px solid rgba(107, 17, 36, 0.15)',
              borderTopColor: '#6B1124',
              borderRadius: '50%',
              animation: 'cauzon-spin 0.8s linear infinite',
            }}
          />
          <div style={{ color: '#6B1124', fontSize: '15px', fontWeight: 700 }}>
            Ouverture du cours sur grand écran...
          </div>
          <div style={{ color: '#64748B', fontSize: '13px' }}>
            Rendu vectoriel haute fidélité
          </div>
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
            backgroundColor: estSombre ? '#0F172A' : '#F8FAFC',
            padding: '24px',
            textAlign: 'center',
            gap: '12px',
            zIndex: 10,
          }}
        >
          <div style={{ fontSize: '40px' }}>⚠️</div>
          <div style={{ color: '#0F172A', fontSize: '17px', fontWeight: 700 }}>
            Impossible d'ouvrir le document
          </div>
          <div style={{ color: '#64748B', fontSize: '13px', maxWidth: '360px' }}>
            {erreur}
          </div>
          <button
            onClick={reessayerChargement}
            style={{
              marginTop: '10px',
              padding: '10px 22px',
              borderRadius: '10px',
              backgroundColor: '#6B1124',
              color: '#FFFFFF',
              border: 'none',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            🔄 Réessayer
          </button>
        </div>
      )}

      {/* Barre d'outils flottante Desktop */}
      {!chargement && !erreur && nombrePagesTotal > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            color: '#FFFFFF',
            padding: '6px 12px',
            borderRadius: '30px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.35)',
            zIndex: 30,
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
          }}
        >
          <button
            onClick={dezoomer}
            disabled={zoomActif <= 0.75}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              color: zoomActif <= 0.75 ? 'rgba(255,255,255,0.35)' : '#FFFFFF',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: zoomActif <= 0.75 ? 'default' : 'pointer',
              fontSize: '18px',
              fontWeight: 800,
            }}
            title="Dézoomer (-)"
          >
            −
          </button>

          <button
            onClick={reinitialiserZoom}
            style={{
              background: 'none',
              border: 'none',
              color: '#FFFFFF',
              padding: '4px 12px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Cliquer pour réinitialiser le zoom"
          >
            <span>Page {pageCourante} / {nombrePagesTotal}</span>
            {zoomActif !== 1.0 && (
              <span
                style={{
                  backgroundColor: 'rgba(56, 189, 248, 0.22)',
                  color: '#38BDF8',
                  padding: '2px 7px',
                  borderRadius: '8px',
                  fontSize: '11px',
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
              color: zoomActif >= 2.5 ? 'rgba(255,255,255,0.35)' : '#FFFFFF',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: zoomActif >= 2.5 ? 'default' : 'pointer',
              fontSize: '18px',
              fontWeight: 800,
            }}
            title="Zoomer (+)"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
};

export default LecteurPwaDesktop;
