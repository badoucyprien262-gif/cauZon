import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { LecteurPdfProps } from './types';
import { chargerPdfJs, extrairePdfBytes } from './pdfjsLoader';

/**
 * LecteurPwaMobile (Bloc 3 - PWA Mobile / iOS Safari & Android Chrome)
 * - Fit-Width automatique au viewport mobile (window.innerWidth - 16px)
 * - Plafond DPR strict à 2.2 (anti-crash mémoire Safari iOS 16MP)
 * - Support tactile hybride natif 60/120 FPS :
 *   * Pinch-to-zoom 2 doigts avec transform GPU direct scale3d
 *   * Double-tap (< 280ms) avec bascule animée douce 1.0x <-> 2.0x
 * - Handoff vectoriel HD avec Double-Buffering et fondu optique 100ms
 * - Continuité géométrique absolue du point focal (invariance projective affine)
 * - Lazy-rendering des pages (rootMargin: '300px') + Rendu prioritaire Page 1 (< 800ms)
 * - Protection anti-copie (user-select: none, blocage onContextMenu)
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
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pagesLayerRef = useRef<HTMLDivElement | null>(null);

  const [chargement, setChargement] = useState<boolean>(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pageCourante, setPageCourante] = useState<number>(1);
  const [nombrePagesTotal, setNombrePagesTotal] = useState<number>(0);
  const [tentativeKey, setTentativeKey] = useState<number>(0);
  const [visualZoomPercent, setVisualZoomPercent] = useState<number>(Math.round((scale || 1.0) * 100));

  // Références techniques PDF & Rendu
  const pdfDocRef = useRef<any>(null);
  const pageRenderTasks = useRef<{ [pageNumber: number]: any }>({});
  const canvasRefs = useRef<{ [pageNumber: number]: HTMLCanvasElement }>({});
  const wrapperRefs = useRef<{ [pageNumber: number]: HTMLElement }>({});
  const renderedScalesMap = useRef<Map<number, number>>(new Map());
  const pagesVisiblesRef = useRef<Set<number>>(new Set([1]));
  const targetWidthRef = useRef<number>(360);
  const baseWidthRef = useRef<number>(360);
  const baseHeightRef = useRef<number>(508);
  const committedZoomRef = useRef<number>(scale || 1.0);
  const currentVisualZoomRef = useRef<number>(scale || 1.0);
  const prevPropScaleRef = useRef<number>(scale || 1.0);
  const pageCouranteRef = useRef<number>(1);
  const zoomDebounceTimerRef = useRef<any>(null);

  // Gestion des gestes tactiles
  const lastTapTimeRef = useRef<number>(0);
  const initialPinchDistRef = useRef<number>(0);
  const initialZoomOnPinchRef = useRef<number>(1.0);
  const isGestureActiveRef = useRef<boolean>(false);
  const focalPointRef = useRef<{ clientX: number; clientY: number; focalX: number; focalY: number } | null>(null);
  const refElementRef = useRef<HTMLElement | null>(null);

  const sourceCible = pdfUrl || (typeof urlFichier === 'string' ? urlFichier : null);

  const reessayerChargement = useCallback(() => {
    setErreur(null);
    setChargement(true);
    setTentativeKey(k => k + 1);
    onReessayer?.();
  }, [onReessayer]);

  // 🎯 Rendu vectoriel haute netteté Canvas via Double-Buffering et Cross-Fade 100ms
  const rasteriserPageMobile = useCallback(async (
    pageNumber: number,
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

    const wrapper = wrapperRefs.current[pageNumber];
    let canvas = canvasRefs.current[pageNumber];
    if (!canvas && wrapper) {
      canvas = wrapper.querySelector('canvas:not(.cauzon-crossfade-canvas)') as HTMLCanvasElement;
      if (canvas) canvasRefs.current[pageNumber] = canvas;
    }
    if (!wrapper) return;

    try {
      const page = pageInstance || (await pdfDoc.getPage(pageNumber));
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      // Plafond DPR strict à 2.2 (anti-saturation mémoire Safari iOS)
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2.2) : 1.5;
      const baseW = Number(wrapper.getAttribute('data-base-width')) || baseWidthRef.current || 360;
      const baseScale = baseW / unscaledViewport.width;
      const effectiveScale = baseScale * targetZoomScale;

      const viewport = page.getViewport({ scale: effectiveScale });
      const cssW = Math.floor(viewport.width);
      const cssH = Math.floor(viewport.height);

      // Mettre à jour le placeholder si présent
      const placeholder = wrapper.querySelector('.cauzon-page-placeholder');
      if (placeholder) placeholder.remove();

      // Rendu initial direct si le canvas n'existe pas encore
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto';
        canvas.style.touchAction = 'pan-x pan-y pinch-zoom';
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        wrapper.appendChild(canvas);
        canvasRefs.current[pageNumber] = canvas;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const renderTask = page.render({
          canvasContext: ctx,
          viewport: page.getViewport({ scale: effectiveScale * dpr }),
        });
        pageRenderTasks.current[pageNumber] = renderTask;
        await renderTask.promise;
        renderedScalesMap.current.set(pageNumber, targetZoomScale);
        return;
      }

      // Re-rastérisation via Double-Buffering et fondu enchaîné 100ms
      const tempCanvas = document.createElement('canvas');
      tempCanvas.className = 'cauzon-crossfade-canvas';
      tempCanvas.width = Math.floor(viewport.width * dpr);
      tempCanvas.height = Math.floor(viewport.height * dpr);
      tempCanvas.style.width = `${cssW}px`;
      tempCanvas.style.height = `${cssH}px`;
      tempCanvas.style.position = 'absolute';
      tempCanvas.style.left = '0';
      tempCanvas.style.top = '0';
      tempCanvas.style.opacity = '0';
      tempCanvas.style.pointerEvents = 'none';
      tempCanvas.style.transition = 'opacity 100ms cubic-bezier(0.4, 0, 0.2, 1)';
      tempCanvas.style.touchAction = 'pan-x pan-y pinch-zoom';
      wrapper.appendChild(tempCanvas);

      const tempCtx = tempCanvas.getContext('2d', { alpha: false });
      if (!tempCtx) {
        tempCanvas.remove();
        return;
      }
      tempCtx.imageSmoothingEnabled = true;
      tempCtx.imageSmoothingQuality = 'high';

      const renderTask = page.render({
        canvasContext: tempCtx,
        viewport: page.getViewport({ scale: effectiveScale * dpr }),
      });
      pageRenderTasks.current[pageNumber] = renderTask;
      await renderTask.promise;

      // Déclencher le fondu optique 100ms
      void tempCanvas.offsetHeight;
      tempCanvas.style.opacity = '1';

      setTimeout(() => {
        if (!canvas.isConnected || !wrapper.isConnected) {
          tempCanvas.remove();
          return;
        }
        canvas.width = tempCanvas.width;
        canvas.height = tempCanvas.height;
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        const mainCtx = canvas.getContext('2d', { alpha: false });
        if (mainCtx) {
          mainCtx.drawImage(tempCanvas, 0, 0);
        }
        tempCanvas.remove();
        renderedScalesMap.current.set(pageNumber, targetZoomScale);
      }, 100);
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

  // 🎯 Handoff synchrone atomique à zéro layout shift (Continuité spatiale absolue du point focal)
  const commettreZoomStabilisation = useCallback((targetZoom: number) => {
    const container = containerRef.current;
    const pagesLayer = pagesLayerRef.current;
    if (!container || !pagesLayer || !pdfDocRef.current) return;

    const newZoom = Number(Math.min(Math.max(targetZoom, 0.8), 2.5).toFixed(2));

    const cRect = container.getBoundingClientRect();
    const focalInfo = focalPointRef.current || {
      clientX: cRect.left + container.clientWidth / 2,
      clientY: cRect.top + container.clientHeight / 2,
      focalX: container.clientWidth / 2,
      focalY: container.clientHeight / 2,
    };

    let refElement = refElementRef.current;
    if (!refElement || !refElement.isConnected) {
      refElement = (canvasRefs.current[pageCouranteRef.current] as HTMLElement) ||
                   (wrapperRefs.current[pageCouranteRef.current] as HTMLElement) ||
                   pagesLayer.querySelector<HTMLElement>('.cauzon-page-wrapper');
    }

    const rectBefore = refElement ? refElement.getBoundingClientRect() : null;

    // Coordonnées affines (u, v) normalisées du point focal dans refElement à la dernière frame GPU
    let u = 0.5;
    let v = 0.5;
    if (rectBefore && rectBefore.width > 0 && rectBefore.height > 0) {
      u = (focalInfo.clientX - rectBefore.left) / rectBefore.width;
      v = (focalInfo.clientY - rectBefore.top) / rectBefore.height;
    }

    // 1. Mise à jour de la taille géométrique physique des wrappers et canvas
    const wrappers = pagesLayer.querySelectorAll<HTMLElement>('.cauzon-page-wrapper');
    wrappers.forEach(w => {
      const baseW = Number(w.getAttribute('data-base-width')) || baseWidthRef.current || targetWidthRef.current || 360;
      const baseH = Number(w.getAttribute('data-base-height')) || baseHeightRef.current || Math.floor(baseW * 1.414);
      const immediateWidth = Math.floor(baseW * newZoom);
      const immediateHeight = Math.floor(baseH * newZoom);

      w.style.width = `${immediateWidth}px`;
      w.style.minWidth = `${immediateWidth}px`;
      w.style.maxWidth = 'none';
      w.style.height = `${immediateHeight}px`;
      w.style.minHeight = `${immediateHeight}px`;

      const c = w.querySelector('canvas:not(.cauzon-crossfade-canvas)') as HTMLCanvasElement;
      if (c) {
        c.style.width = `${immediateWidth}px`;
        c.style.height = `${immediateHeight}px`;
      }
      const crossfade = w.querySelector('.cauzon-crossfade-canvas') as HTMLCanvasElement;
      if (crossfade) {
        crossfade.style.width = `${immediateWidth}px`;
        crossfade.style.height = `${immediateHeight}px`;
      }
    });

    // 2. Réinitialisation synchrone du transform GPU à l'état neutre
    pagesLayer.style.transition = 'none';
    pagesLayer.style.transform = 'none';
    pagesLayer.style.transformOrigin = 'top left';
    pagesLayer.style.willChange = 'auto';

    // 3. Compensation par invariance spatiale projective absolue (< 0.5px garanti, 0 saut de repère)
    if (refElement && rectBefore) {
      const rectNow = refElement.getBoundingClientRect();
      const pointNowX = rectNow.left + u * rectNow.width;
      const pointNowY = rectNow.top + v * rectNow.height;

      const shiftX = pointNowX - focalInfo.clientX;
      const shiftY = pointNowY - focalInfo.clientY;

      container.scrollLeft = Math.max(0, Math.round(container.scrollLeft + shiftX));
      container.scrollTop = Math.max(0, Math.round(container.scrollTop + shiftY));
    }

    // Mettre à jour les références et l'état
    committedZoomRef.current = newZoom;
    currentVisualZoomRef.current = newZoom;
    setVisualZoomPercent(Math.round(newZoom * 100));
    refElementRef.current = null;
    focalPointRef.current = null;
    isGestureActiveRef.current = false;

    // 4. Re-rastérisation vectorielle HD des pages visibles
    const pages = pagesVisiblesRef.current.size > 0
      ? Array.from(pagesVisiblesRef.current)
      : [pageCouranteRef.current || 1];

    pages.forEach(pNum => {
      rasteriserPageMobile(pNum, newZoom);
    });
  }, [rasteriserPageMobile]);

  // 🚀 Animation fluide du double-tap ou des boutons via transition CSS 150ms
  const animerZoomMobile = useCallback((targetZoomCalcul: (prev: number) => number, focalCoords?: { clientX: number; clientY: number }) => {
    const container = containerRef.current;
    const pagesLayer = pagesLayerRef.current;
    if (!container || !pagesLayer) return;

    if (zoomDebounceTimerRef.current) {
      clearTimeout(zoomDebounceTimerRef.current);
    }

    const currentZoom = currentVisualZoomRef.current || committedZoomRef.current || 1.0;
    const nextZoom = Math.min(Math.max(Number(targetZoomCalcul(currentZoom).toFixed(2)), 0.8), 2.5);
    if (nextZoom === currentZoom) return;

    currentVisualZoomRef.current = nextZoom;

    const cRect = container.getBoundingClientRect();
    const clientX = focalCoords ? focalCoords.clientX : (cRect.left + container.clientWidth / 2);
    const clientY = focalCoords ? focalCoords.clientY : (cRect.top + container.clientHeight / 2);
    const focalX = clientX - cRect.left;
    const focalY = clientY - cRect.top;
    focalPointRef.current = { clientX, clientY, focalX, focalY };

    const elUnderPoint = typeof document !== 'undefined' && document.elementFromPoint
      ? document.elementFromPoint(clientX, clientY)
      : null;
    const targetCanvas = (elUnderPoint?.closest('canvas') as HTMLElement) || null;
    const targetWrap = (elUnderPoint?.closest('.cauzon-page-wrapper') as HTMLElement) ||
                       wrapperRefs.current[pageCouranteRef.current] || null;
    refElementRef.current = targetCanvas || targetWrap;
    isGestureActiveRef.current = true;

    const committedZoom = committedZoomRef.current || 1.0;
    const currentVisualScale = nextZoom / committedZoom;

    // Animation via transition CSS douce sur 150ms centrée sur le point focal
    const layerRect = pagesLayer.getBoundingClientRect();
    const originX = clientX - layerRect.left;
    const originY = clientY - layerRect.top;

    pagesLayer.style.transformOrigin = `${originX.toFixed(2)}px ${originY.toFixed(2)}px`;
    pagesLayer.style.willChange = 'transform';
    pagesLayer.style.transition = 'transform 150ms cubic-bezier(0.2, 0, 0, 1)';
    pagesLayer.style.transform = `scale3d(${currentVisualScale.toFixed(4)}, ${currentVisualScale.toFixed(4)}, 1)`;
    setVisualZoomPercent(Math.round(nextZoom * 100));

    // Déclenchement de la re-rastérisation à l'issue de l'animation
    zoomDebounceTimerRef.current = setTimeout(() => {
      commettreZoomStabilisation(nextZoom);
    }, 150);
  }, [commettreZoomStabilisation]);

  // Contrôles manuels (+, -, 100%)
  const zoomer = useCallback(() => {
    animerZoomMobile(prev => prev + 0.25);
  }, [animerZoomMobile]);

  const dezoomer = useCallback(() => {
    animerZoomMobile(prev => prev - 0.25);
  }, [animerZoomMobile]);

  const reinitialiserZoom = useCallback(() => {
    animerZoomMobile(() => 1.0);
  }, [animerZoomMobile]);

  // Synchronisation avec la prop `scale` parente si fournie
  useEffect(() => {
    if (scale !== undefined && scale !== null && scale !== prevPropScaleRef.current) {
      prevPropScaleRef.current = scale;
      commettreZoomStabilisation(scale);
    }
  }, [scale, commettreZoomStabilisation]);

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

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        // Conteneur intermédiaire pagesLayer pour zoom GPU unifié
        const pagesLayer = document.createElement('div');
        pagesLayer.className = 'cauzon-mobile-pages-layer';
        pagesLayer.style.display = 'block';
        pagesLayer.style.position = 'relative';
        pagesLayer.style.margin = '0 auto';
        pagesLayer.style.width = '100%';
        pagesLayer.style.transformOrigin = 'top left';
        pagesLayer.style.transform = 'none';
        pagesLayerRef.current = pagesLayer;
        container.appendChild(pagesLayer);

        // Fit-Width automatique au viewport mobile (window.innerWidth - 16px de marges)
        const screenW = typeof window !== 'undefined' ? (window.innerWidth || 360) : 360;
        const fitWidth = Math.max(screenW - 16, 280);
        targetWidthRef.current = fitWidth;

        const page1 = await pdf.getPage(1);
        if (!actif) return;

        const unscaledViewport1 = page1.getViewport({ scale: 1.0 });
        const baseScale = fitWidth / unscaledViewport1.width;
        const defaultDisplayWidth = Math.round(unscaledViewport1.width * baseScale);
        const defaultDisplayHeight = Math.round(unscaledViewport1.height * baseScale);
        baseWidthRef.current = defaultDisplayWidth;
        baseHeightRef.current = defaultDisplayHeight;
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
          wrapper.setAttribute('data-base-width', String(defaultDisplayWidth));
          wrapper.setAttribute('data-base-height', String(defaultDisplayHeight));
          wrapper.style.display = 'block';
          wrapper.style.position = 'relative';
          wrapper.style.width = `${defaultDisplayWidth}px`;
          wrapper.style.minWidth = `${defaultDisplayWidth}px`;
          wrapper.style.height = `${defaultDisplayHeight}px`;
          wrapper.style.minHeight = `${defaultDisplayHeight}px`;
          wrapper.style.margin = '0 auto 12px auto';
          wrapper.style.backgroundColor = '#FFFFFF';
          wrapper.style.borderRadius = '4px';
          wrapper.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)';
          wrapper.style.overflow = 'hidden';
          wrapper.style.touchAction = 'pan-x pan-y pinch-zoom';
          wrapper.style.setProperty('user-select', 'none', 'important');
          wrapper.style.setProperty('-webkit-user-select', 'none', 'important');

          const placeholder = document.createElement('div');
          placeholder.className = 'cauzon-page-placeholder';
          placeholder.style.display = 'flex';
          placeholder.style.alignItems = 'center';
          placeholder.style.justifyContent = 'center';
          placeholder.style.width = '100%';
          placeholder.style.height = '100%';
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

          pagesLayer.appendChild(wrapper);
          wrappersElements.push(wrapper);
          wrapperRefs.current[pageNum] = wrapper;
        }

        // 🚀 Rendu prioritaire Page 1 (< 800 ms)
        await rasteriserPageMobile(1, committedZoomRef.current, page1);
        if (!actif) return;

        setChargement(false);

        // Lazy-rendering des pages 2 à N via IntersectionObserver (rootMargin: '300px')
        lazyObserver = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                const pageAttr = entry.target.getAttribute('data-page');
                if (pageAttr) {
                  const pNum = parseInt(pageAttr, 10);
                  const rendu = renderedScalesMap.current.get(pNum);
                  if (rendu === undefined || rendu !== committedZoomRef.current) {
                    rasteriserPageMobile(pNum, committedZoomRef.current);
                  }
                }
              }
            }
          },
          { root: container, rootMargin: '300px 0px 300px 0px' }
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
      canvasRefs.current = {};
      wrapperRefs.current = {};
      pagesVisiblesRef.current.clear();
      renderedScalesMap.current.clear();

      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      pagesLayerRef.current = null;
    };
  }, [sourceCible, urlFichier, estVerrouille, limiteApercuPages, limiteApercuType, limiteApercuValeur, prix, tentativeKey, rasteriserPageMobile]);

  // Écouteur tactile natif haute précision pour Pinch-to-zoom (2 doigts) & Double-tap
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onTouchStart = (e: TouchEvent) => {
      const pagesLayer = pagesLayerRef.current;
      if (!pagesLayer) return;

      if (e.touches.length === 1) {
        const now = Date.now();
        const touch = e.touches[0];
        // Double-tap : délai strict < 280ms
        if (now - lastTapTimeRef.current < 280) {
          e.preventDefault();
          const targetZoom = committedZoomRef.current > 1.2 ? 1.0 : 2.0;
          animerZoomMobile(() => targetZoom, { clientX: touch.clientX, clientY: touch.clientY });
          lastTapTimeRef.current = 0;
          return;
        }
        lastTapTimeRef.current = now;
      } else if (e.touches.length === 2) {
        // Début de pincement tactile (Pinch-to-zoom 2 doigts)
        isGestureActiveRef.current = true;
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        initialPinchDistRef.current = dist;
        initialZoomOnPinchRef.current = committedZoomRef.current || 1.0;

        const midX = (t0.clientX + t1.clientX) / 2;
        const midY = (t0.clientY + t1.clientY) / 2;
        const cRect = container.getBoundingClientRect();
        const focalX = midX - cRect.left;
        const focalY = midY - cRect.top;
        focalPointRef.current = { clientX: midX, clientY: midY, focalX, focalY };

        const elUnderPoint = typeof document !== 'undefined' && document.elementFromPoint
          ? document.elementFromPoint(midX, midY)
          : null;
        const targetCanvas = (elUnderPoint?.closest('canvas') as HTMLElement) || null;
        const targetWrap = (elUnderPoint?.closest('.cauzon-page-wrapper') as HTMLElement) ||
                           wrapperRefs.current[pageCouranteRef.current] || null;
        refElementRef.current = targetCanvas || targetWrap;

        // Origine exacte dans le repère local de pagesLayer
        const layerRect = pagesLayer.getBoundingClientRect();
        const originX = midX - layerRect.left;
        const originY = midY - layerRect.top;

        pagesLayer.style.transition = 'none';
        pagesLayer.style.willChange = 'transform';
        pagesLayer.style.transformOrigin = `${originX.toFixed(2)}px ${originY.toFixed(2)}px`;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const pagesLayer = pagesLayerRef.current;
      if (!pagesLayer) return;

      if (isGestureActiveRef.current && e.touches.length === 2 && initialPinchDistRef.current > 0) {
        e.preventDefault();
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        const factor = dist / initialPinchDistRef.current;
        const liveZoom = Math.min(Math.max(initialZoomOnPinchRef.current * factor, 0.8), 2.8);
        currentVisualZoomRef.current = liveZoom;

        const committedZoom = committedZoomRef.current || 1.0;
        const liveScale = liveZoom / committedZoom;

        // Transformation GPU directe à 60/120 FPS sans re-rendu PDF.js
        pagesLayer.style.transform = `scale3d(${liveScale.toFixed(4)}, ${liveScale.toFixed(4)}, 1)`;
        setVisualZoomPercent(Math.round(liveZoom * 100));

        // Debounce de stabilisation de 140ms
        if (zoomDebounceTimerRef.current) {
          clearTimeout(zoomDebounceTimerRef.current);
        }
        zoomDebounceTimerRef.current = setTimeout(() => {
          commettreZoomStabilisation(currentVisualZoomRef.current);
        }, 140);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (isGestureActiveRef.current && e.touches.length < 2) {
        initialPinchDistRef.current = 0;
        // Laisser le debounce de 140ms stabiliser ou forcer le handoff immédiat
        if (zoomDebounceTimerRef.current) {
          clearTimeout(zoomDebounceTimerRef.current);
        }
        zoomDebounceTimerRef.current = setTimeout(() => {
          commettreZoomStabilisation(currentVisualZoomRef.current);
        }, 80);
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
  }, [commettreZoomStabilisation, animerZoomMobile]);

  return (
    <div
      ref={rootRef}
      style={{
        width: '100%',
        maxWidth: '100vw',
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
        .cauzon-mobile-scroll-container {
          display: block !important;
          width: 100% !important;
          height: 100% !important;
          overflow-y: scroll !important;
          overflow-x: auto !important;
          overflow-anchor: none !important;
          -webkit-overflow-scrolling: touch !important;
          touch-action: pan-x pan-y pinch-zoom !important;
          padding: 8px 8px 110px 8px !important;
          box-sizing: border-box !important;
          overscroll-behavior-y: contain !important;
        }
        .cauzon-mobile-pages-layer {
          display: block !important;
          position: relative !important;
          margin: 0 auto !important;
          width: 100% !important;
          box-sizing: border-box !important;
        }
        .cauzon-page-wrapper {
          display: block !important;
          margin: 0 auto 12px auto !important;
          flex-shrink: 0 !important;
          box-sizing: border-box !important;
          position: relative !important;
          user-select: none !important;
          -webkit-user-select: none !important;
        }
        .cauzon-page-wrapper canvas {
          display: block !important;
          margin: 0 auto !important;
          flex-shrink: 0 !important;
          user-select: none !important;
          -webkit-user-select: none !important;
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
          overflowAnchor: 'none',
        } as any}
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
            disabled={visualZoomPercent <= 80}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              color: visualZoomPercent <= 80 ? 'rgba(255,255,255,0.3)' : '#FFFFFF',
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
            title="Toucher pour réinitialiser à 100%"
          >
            <span>{pageCourante}/{nombrePagesTotal}</span>
            {visualZoomPercent !== 100 && (
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
                {visualZoomPercent}%
              </span>
            )}
          </button>

          <button
            onClick={zoomer}
            disabled={visualZoomPercent >= 250}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              color: visualZoomPercent >= 250 ? 'rgba(255,255,255,0.3)' : '#FFFFFF',
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
