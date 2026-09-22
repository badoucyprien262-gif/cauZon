import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { LecteurPdfProps } from './types';
import { chargerPdfJs, extrairePdfBytes } from './pdfjsLoader';

/**
 * LecteurPwaDesktop (Bloc 2 - PWA PC / Bureau)
 * - Rendu vectoriel haute netteté au zoom (re-rastérisation physique immédiate avec DPR réel)
 * - Détection du zoom : Boutons flottants, raccourcis clavier (Ctrl+, Ctrl-, Ctrl0) et Ctrl+Molette
 * - Debounce 180ms pour fluidité absolue
 * - Couche vectorielle TextLayer superposée anti-copie (user-select: none, pointer-events: none)
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
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [chargement, setChargement] = useState<boolean>(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pageCourante, setPageCourante] = useState<number>(1);
  const [nombrePagesTotal, setNombrePagesTotal] = useState<number>(0);
  const [tentativeKey, setTentativeKey] = useState<number>(0);

  // État de zoom explicite Desktop & affichage temps réel
  const [desktopZoom, setDesktopZoom] = useState<number>(scale || 1.0);
  const [visualZoomPercent, setVisualZoomPercent] = useState<number>(Math.round((scale || 1.0) * 100));
  const committedZoomRef = useRef<number>(scale || 1.0);
  const currentVisualZoomRef = useRef<number>(scale || 1.0);
  const prevPropScaleRef = useRef<number | undefined>(scale);

  // Références techniques
  const pdfDocRef = useRef<any>(null);
  const renderTasks = useRef<{ [pageNumber: number]: any }>({});
  const canvasRefs = useRef<{ [pageNumber: number]: HTMLCanvasElement }>({});
  const wrapperRefs = useRef<{ [pageNumber: number]: HTMLElement }>({});
  const renderedScalesMap = useRef<Map<number, number>>(new Map());
  const pagesVisiblesRef = useRef<Set<number>>(new Set([1]));
  const targetWidthRef = useRef<number>(860);
  const baseWidthRef = useRef<number>(860);
  const baseHeightRef = useRef<number>(1216);
  const desktopZoomRef = useRef<number>(scale || 1.0);
  const pagesLayerRef = useRef<HTMLDivElement | null>(null);
  const focalPointRef = useRef<{ clientX: number; clientY: number; cursorX: number; cursorY: number; focalX: number; focalY: number } | null>(null);
  const targetWrapperRef = useRef<HTMLElement | null>(null);
  const isGestureActiveRef = useRef<boolean>(false);
  const pageCouranteRef = useRef<number>(1);
  const zoomDebounceTimerRef = useRef<any>(null);

  const sourceCible = pdfUrl || (typeof urlFichier === 'string' ? urlFichier : null);

  const reessayerChargement = useCallback(() => {
    setErreur(null);
    setChargement(true);
    setTentativeKey(k => k + 1);
    onReessayer?.();
  }, [onReessayer]);

  // 🎯 Rendu vectoriel haute netteté Canvas + TextLayer via Double-Buffering (zéro clignotement / flicker-free)
  const rasteriserPage = useCallback(async (
    pageNumber: number,
    targetZoom: number,
    pageInstance?: any
  ) => {
    const pdfDoc = pdfDocRef.current;
    if (!pdfDoc) return;

    // 1. Annuler impérativement la tâche précédente si elle tourne
    if (renderTasks.current[pageNumber]) {
      try {
        renderTasks.current[pageNumber].cancel();
      } catch (e) {}
      delete renderTasks.current[pageNumber];
    }

    const wrapper = wrapperRefs.current[pageNumber];
    let canvas = canvasRefs.current[pageNumber];
    if (!canvas && wrapper) {
      canvas = wrapper.querySelector('canvas') as HTMLCanvasElement;
      if (canvas) canvasRefs.current[pageNumber] = canvas;
    }
    if (!canvas && wrapper) {
      canvas = document.createElement('canvas');
      canvas.style.display = 'block';
      canvas.style.margin = '0 auto';
      wrapper.appendChild(canvas);
      canvasRefs.current[pageNumber] = canvas;
    }
    if (!canvas) return;

    const rawDpr = window.devicePixelRatio || 1;
    // Réserve de netteté initiale (sur-échantillonnage léger pour absorber sans flou les petits zooms)
    const dpr = Math.min(Math.max(rawDpr, 1.25), 2.25);

    try {
      const page = pageInstance || (await pdfDoc.getPage(pageNumber));
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      const targetWidth = targetWidthRef.current || 860;
      const baseScale = targetWidth / unscaledViewport.width;

      const pageBaseWidth = Math.round(unscaledViewport.width * baseScale);
      const pageBaseHeight = Math.round(unscaledViewport.height * baseScale);
      if (wrapper) {
        wrapper.setAttribute('data-base-width', String(pageBaseWidth));
        wrapper.setAttribute('data-base-height', String(pageBaseHeight));
      }

      // Échelle globale = échelle de base (ajustée à la largeur conteneur PC) * zoom utilisateur
      const effectiveScale = baseScale * targetZoom;

      // 2. Viewport vectoriel PDF.js incluant le DPR
      const viewport = page.getViewport({ scale: effectiveScale * dpr });
      const cssViewport = page.getViewport({ scale: effectiveScale });

      const targetCanvasWidth = Math.floor(viewport.width);
      const targetCanvasHeight = Math.floor(viewport.height);
      const currentZoom = desktopZoomRef.current;
      const cssWidth = Math.floor(pageBaseWidth * currentZoom);
      const cssHeight = Math.floor(pageBaseHeight * currentZoom);

      // Retirer le placeholder si encore présent
      if (wrapper) {
        const placeholder = wrapper.querySelector('.cauzon-page-placeholder');
        if (placeholder) placeholder.remove();
      }

      // =========================================================================
      // 🛡️ 1. DOUBLE-BUFFERING (Rendu hors-champ) : Tracé sur tempCanvas
      // =========================================================================
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = targetCanvasWidth;
      tempCanvas.height = targetCanvasHeight;

      const tempCtx = tempCanvas.getContext('2d', { alpha: false });
      if (!tempCtx) return;

      tempCtx.imageSmoothingEnabled = true;
      tempCtx.imageSmoothingQuality = 'high';

      // Tracé PDF.js en arrière-plan sur le canvas temporaire
      const renderTask = page.render({
        canvasContext: tempCtx,
        viewport: viewport,
      });
      renderTasks.current[pageNumber] = renderTask;
      await renderTask.promise;

      // =========================================================================
      // ⚡ 2. TRANSITION CROSS-FADE OPTIQUE (Fondu 120ms sans effet de snap)
      // =========================================================================
      const isPremierRendu = !renderedScalesMap.current.has(pageNumber);

      if (isPremierRendu || !wrapper) {
        // Premier affichage immédiat
        canvas.width = targetCanvasWidth;
        canvas.height = targetCanvasHeight;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;

        const mainCtx = canvas.getContext('2d', { alpha: false });
        if (mainCtx) {
          mainCtx.imageSmoothingEnabled = true;
          mainCtx.imageSmoothingQuality = 'high';
          mainCtx.drawImage(tempCanvas, 0, 0);
        }

        if (wrapper) {
          wrapper.style.width = `${cssWidth}px`;
          wrapper.style.minWidth = `${cssWidth}px`;
          wrapper.style.height = `${cssHeight}px`;
          wrapper.style.minHeight = `${cssHeight}px`;
          wrapper.style.maxWidth = 'none';
        }
      } else {
        // Nettoyer tout ancien canvas de transition résiduel
        wrapper.querySelectorAll('.cauzon-crossfade-canvas').forEach(el => el.remove());

        // Configurer le canvas HD pour la superposition en fondu optique
        tempCanvas.className = 'cauzon-crossfade-canvas';
        tempCanvas.style.position = 'absolute';
        tempCanvas.style.left = '0';
        tempCanvas.style.top = '0';
        tempCanvas.style.width = `${cssWidth}px`;
        tempCanvas.style.height = `${cssHeight}px`;
        tempCanvas.style.opacity = '0';
        tempCanvas.style.pointerEvents = 'none';
        tempCanvas.style.transition = 'opacity 120ms cubic-bezier(0.4, 0, 0.2, 1)';
        tempCanvas.style.zIndex = '4';
        tempCanvas.style.setProperty('image-rendering', '-webkit-optimize-contrast');

        wrapper.appendChild(tempCanvas);
        wrapper.style.width = `${cssWidth}px`;
        wrapper.style.minWidth = `${cssWidth}px`;
        wrapper.style.height = `${cssHeight}px`;
        wrapper.style.minHeight = `${cssHeight}px`;
        wrapper.style.maxWidth = 'none';

        // Déclencher le fondu progressif de 120ms
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            tempCanvas.style.opacity = '1';
          });
        });

        // Après la transition optique (130ms) : permutation finale et retrait propre du buffer
        setTimeout(() => {
          if (wrapper.contains(tempCanvas)) {
            const latestZoom = desktopZoomRef.current;
            const latestW = Math.floor(pageBaseWidth * latestZoom);
            const latestH = Math.floor(pageBaseHeight * latestZoom);

            canvas.width = targetCanvasWidth;
            canvas.height = targetCanvasHeight;
            canvas.style.width = `${latestW}px`;
            canvas.style.height = `${latestH}px`;

            const mainCtx = canvas.getContext('2d', { alpha: false });
            if (mainCtx) {
              mainCtx.imageSmoothingEnabled = true;
              mainCtx.imageSmoothingQuality = 'high';
              mainCtx.drawImage(tempCanvas, 0, 0);
            }
            tempCanvas.remove();
          }
        }, 130);
      }

      renderedScalesMap.current.set(pageNumber, targetZoom);

      // 6. Couche vectorielle TextLayer superposée (sécurisée sans copie)
      try {
        const textContent = await page.getTextContent();
        if (wrapper) {
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
        }
      } catch (_) {}
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn(`[LecteurPwaDesktop] Échec rendu vectoriel page ${pageNumber} :`, err);
      }
    } finally {
      if (renderTasks.current[pageNumber]) {
        delete renderTasks.current[pageNumber];
      }
    }
  }, []);

  // 🎯 Stabilisation et re-rastérisation vectorielle HD (handoff synchrone atomique zéro layout shift)
  const commettreZoomStabilisation = useCallback((targetZoom: number) => {
    const container = containerRef.current;
    const pagesLayer = pagesLayerRef.current;
    if (!container || !pagesLayer || !pdfDocRef.current) return;

    const newZoom = Number(Math.min(Math.max(targetZoom, 0.5), 3.0).toFixed(2));

    // Cible de référence géométrique pour annuler tout décalage au handoff (pixel-parfait)
    const targetWrapper =
      targetWrapperRef.current ||
      wrapperRefs.current[pageCouranteRef.current] ||
      pagesLayer.querySelector<HTMLElement>('.cauzon-page-wrapper');
    const rectBefore = targetWrapper ? targetWrapper.getBoundingClientRect() : null;

    console.log('HANDOFF CHECK:', {
      prevTransform: pagesLayer.style.transform,
      origin: pagesLayer.style.transformOrigin,
      scrollTopBefore: container.scrollTop,
      rectBefore: rectBefore ? { top: rectBefore.top, left: rectBefore.left } : null,
    });

    // 1. Mise à jour de la taille géométrique physique des wrappers et canvas
    const wrappers = pagesLayer.querySelectorAll<HTMLElement>('.cauzon-page-wrapper');
    wrappers.forEach(w => {
      const baseW = Number(w.getAttribute('data-base-width')) || baseWidthRef.current || targetWidthRef.current || 860;
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
      const tl = w.querySelector<HTMLElement>('.cauzon-text-layer');
      if (tl) {
        tl.style.width = `${immediateWidth}px`;
        tl.style.height = `${immediateHeight}px`;
      }
    });

    // 2. Réinitialisation synchrone du transform GPU à l'état neutre
    pagesLayer.style.transition = 'none';
    pagesLayer.style.transform = 'none';
    pagesLayer.style.transformOrigin = 'top left';
    pagesLayer.style.willChange = 'auto';

    // 3. Compensation instantanée du défilement dans le même bloc synchrone pour garantir diff < 0.5px
    if (targetWrapper && rectBefore) {
      const rectNow = targetWrapper.getBoundingClientRect();
      const deltaY = rectNow.top - rectBefore.top;
      const deltaX = rectNow.left - rectBefore.left;

      container.scrollTop = Math.max(0, Math.round(container.scrollTop + deltaY));
      container.scrollLeft = Math.max(0, Math.round(container.scrollLeft + deltaX));

      const rectAfter = targetWrapper.getBoundingClientRect();
      console.log('HANDOFF RESULT:', {
        topBefore: rectBefore.top,
        topAfter: rectAfter.top,
        diffY: rectAfter.top - rectBefore.top,
        diffX: rectAfter.left - rectBefore.left,
      });
    }

    // Mettre à jour les références et l'état
    committedZoomRef.current = newZoom;
    currentVisualZoomRef.current = newZoom;
    desktopZoomRef.current = newZoom;
    setDesktopZoom(newZoom);
    setVisualZoomPercent(Math.round(newZoom * 100));
    targetWrapperRef.current = null;
    focalPointRef.current = null;
    isGestureActiveRef.current = false;

    // 4. Re-rastérisation vectorielle HD des pages visibles
    const pages = pagesVisiblesRef.current.size > 0
      ? Array.from(pagesVisiblesRef.current)
      : [pageCouranteRef.current || 1];

    pages.forEach(pNum => {
      rasteriserPage(pNum, newZoom);
    });
  }, [rasteriserPage]);

  // 🚀 Animation fluide des boutons [+] et [-] via transition CSS 150ms cubic-bezier(0.2, 0, 0, 1)
  const animerZoomBouton = useCallback((targetZoomCalcul: (prev: number) => number) => {
    const container = containerRef.current;
    const pagesLayer = pagesLayerRef.current;
    if (!container || !pagesLayer) return;

    if (zoomDebounceTimerRef.current) {
      clearTimeout(zoomDebounceTimerRef.current);
    }

    const currentZoom = currentVisualZoomRef.current || desktopZoomRef.current || 1.0;
    const nextZoom = Math.min(Math.max(Number(targetZoomCalcul(currentZoom).toFixed(2)), 0.5), 3.0);
    if (nextZoom === currentZoom) return;

    currentVisualZoomRef.current = nextZoom;

    // Point focal au centre de la zone visible
    const focalX = container.clientWidth / 2;
    const focalY = container.clientHeight / 2;
    const cursorX = focalX + container.scrollLeft;
    const cursorY = focalY + container.scrollTop;
    focalPointRef.current = { clientX: 0, clientY: 0, cursorX, cursorY, focalX, focalY };
    targetWrapperRef.current =
      wrapperRefs.current[pageCouranteRef.current] ||
      pagesLayer.querySelector<HTMLElement>('.cauzon-page-wrapper');
    isGestureActiveRef.current = true;

    const committedZoom = committedZoomRef.current || 1.0;
    const currentVisualScale = nextZoom / committedZoom;

    // Animation via transition CSS douce sur 150ms
    pagesLayer.style.transformOrigin = `${cursorX}px ${cursorY}px`;
    pagesLayer.style.willChange = 'transform';
    pagesLayer.style.transition = 'transform 150ms cubic-bezier(0.2, 0, 0, 1)';
    pagesLayer.style.transform = `scale3d(${currentVisualScale.toFixed(4)}, ${currentVisualScale.toFixed(4)}, 1)`;
    setVisualZoomPercent(Math.round(nextZoom * 100));

    // Déclenchement de la re-rastérisation à l'issue de l'animation (150ms)
    zoomDebounceTimerRef.current = setTimeout(() => {
      commettreZoomStabilisation(nextZoom);
    }, 150);
  }, [commettreZoomStabilisation]);

  const zoomer = useCallback(() => {
    animerZoomBouton(prev => prev + 0.2);
  }, [animerZoomBouton]);

  const dezoomer = useCallback(() => {
    animerZoomBouton(prev => prev - 0.2);
  }, [animerZoomBouton]);

  const reinitialiserZoom = useCallback(() => {
    animerZoomBouton(() => 1.0);
  }, [animerZoomBouton]);

  // Synchronisation avec la prop `scale` parente si fournie
  useEffect(() => {
    if (scale !== undefined && scale !== null && scale !== prevPropScaleRef.current) {
      prevPropScaleRef.current = scale;
      commettreZoomStabilisation(scale);
    }
  }, [scale, commettreZoomStabilisation]);

  // Support du zoom Trackpad (pincement), Ctrl+Molette et des raccourcis clavier (Découplage GPU pur)
  useEffect(() => {
    const root = rootRef.current;
    const container = containerRef.current;

    const handleWheel = (e: WheelEvent) => {
      // Si Ctrl ou Meta est enfoncé (comportement natif sous Windows/macOS pour le pincement trackpad à 2 doigts et Ctrl + Molette)
      if (e.ctrlKey || e.metaKey) {
        const currentRoot = rootRef.current;
        const currentContainer = containerRef.current;
        const pagesLayer = pagesLayerRef.current;
        const targetNode = e.target as Node;

        const isInsideReader =
          (currentRoot && (currentRoot.contains(targetNode) || (e.composedPath && e.composedPath().includes(currentRoot)))) ||
          (currentContainer && (currentContainer.contains(targetNode) || (e.composedPath && e.composedPath().includes(currentContainer))));

        if (!isInsideReader || !currentContainer || !pagesLayer) return;

        e.preventDefault();

        const rect = currentContainer.getBoundingClientRect();
        const focalX = e.clientX - rect.left;
        const focalY = e.clientY - rect.top;

        // Calcul ou mémorisation du point focal au début du geste
        if (!isGestureActiveRef.current || !focalPointRef.current) {
          isGestureActiveRef.current = true;
          const cursorX = focalX + currentContainer.scrollLeft;
          const cursorY = focalY + currentContainer.scrollTop;
          focalPointRef.current = { clientX: e.clientX, clientY: e.clientY, cursorX, cursorY, focalX, focalY };
          const elUnderCursor = typeof document !== 'undefined' && document.elementFromPoint
            ? document.elementFromPoint(e.clientX, e.clientY)
            : null;
          targetWrapperRef.current = (elUnderCursor?.closest('.cauzon-page-wrapper') as HTMLElement) ||
                                     wrapperRefs.current[pageCouranteRef.current] || null;

          // Configuration matérielle GPU immédiate sans transition pour réactivité 1:1
          pagesLayer.style.transition = 'none';
          pagesLayer.style.willChange = 'transform';
          pagesLayer.style.transformOrigin = `${cursorX}px ${cursorY}px`;
        }

        // Calcul continu du zoom
        const delta = e.deltaY;
        const zoomFactor = Math.abs(delta) < 40
          ? Math.exp(-delta * 0.008)
          : (delta < 0 ? 1.08 : 0.92);

        const nextZoom = Math.min(Math.max(currentVisualZoomRef.current * zoomFactor, 0.5), 3.0);
        currentVisualZoomRef.current = nextZoom;

        const committedZoom = committedZoomRef.current || 1.0;
        const currentVisualScale = nextZoom / committedZoom;

        // 🚀 Transformation GPU matérielle pure 60/120 FPS
        pagesLayer.style.transform = `scale3d(${currentVisualScale.toFixed(4)}, ${currentVisualScale.toFixed(4)}, 1)`;
        setVisualZoomPercent(Math.round(nextZoom * 100));

        // ⏱️ Debounce court de 140ms pour la stabilisation et le rendu vectoriel HD
        if (zoomDebounceTimerRef.current) {
          clearTimeout(zoomDebounceTimerRef.current);
        }
        zoomDebounceTimerRef.current = setTimeout(() => {
          commettreZoomStabilisation(currentVisualZoomRef.current);
        }, 140);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          zoomer();
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          dezoomer();
        } else if (e.key === '0') {
          e.preventDefault();
          reinitialiserZoom();
        }
      }
    };

    if (root) {
      root.addEventListener('wheel', handleWheel, { passive: false });
    }
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (root) {
        root.removeEventListener('wheel', handleWheel);
      }
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [commettreZoomStabilisation, zoomer, dezoomer, reinitialiserZoom]);

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

        const pagesLayer = document.createElement('div');
        pagesLayer.className = 'cauzon-pages-layer';
        pagesLayer.style.display = 'block';
        pagesLayer.style.position = 'relative';
        pagesLayer.style.margin = '0 auto';
        pagesLayer.style.width = '100%';
        pagesLayer.style.transformOrigin = 'center top';
        pagesLayer.style.transform = 'scale3d(1, 1, 1)';
        pagesLayerRef.current = pagesLayer;
        container.appendChild(pagesLayer);

        const availableWidth = container.clientWidth || window.innerWidth;
        const targetContainerWidth = Math.min(availableWidth - 64, 880);
        targetWidthRef.current = targetContainerWidth;

        const page1 = await pdf.getPage(1);
        if (!actif) return;

        const unscaledViewport1 = page1.getViewport({ scale: 1.0 });
        const baseScale = targetContainerWidth / unscaledViewport1.width;
        const defaultDisplayWidth = Math.round(unscaledViewport1.width * baseScale);
        const defaultDisplayHeight = Math.round(unscaledViewport1.height * baseScale);
        baseWidthRef.current = defaultDisplayWidth;
        baseHeightRef.current = defaultDisplayHeight;
        const defaultAspectRatioStr = `${unscaledViewport1.width} / ${unscaledViewport1.height}`;

        const wrappersElements: HTMLElement[] = [];

        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
          const wrapper = document.createElement('div');
          wrapper.className = 'cauzon-page-wrapper';
          wrapper.setAttribute('data-page', String(pageNum));
          wrapper.setAttribute('data-base-width', String(defaultDisplayWidth));
          wrapper.setAttribute('data-base-height', String(defaultDisplayHeight));
          wrapper.style.display = 'block';
          wrapper.style.position = 'relative';
          wrapper.style.width = `${Math.floor(defaultDisplayWidth * desktopZoom)}px`;
          wrapper.style.minWidth = `${Math.floor(defaultDisplayWidth * desktopZoom)}px`;
          wrapper.style.height = `${Math.floor(defaultDisplayHeight * desktopZoom)}px`;
          wrapper.style.minHeight = `${Math.floor(defaultDisplayHeight * desktopZoom)}px`;
          wrapper.style.margin = '0 auto 20px auto';
          wrapper.style.backgroundColor = '#FFFFFF';
          wrapper.style.borderRadius = '8px';
          wrapper.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)';
          wrapper.style.overflow = 'hidden';
          wrapper.style.setProperty('user-select', 'none', 'important');
          wrapper.style.setProperty('-webkit-user-select', 'none', 'important');

          wrapperRefs.current[pageNum] = wrapper;

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

          pagesLayer.appendChild(wrapper);
          wrappersElements.push(wrapper);
        }

        // Rendu prioritaire Page 1
        await rasteriserPage(1, desktopZoom, page1);
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
                  if (renderedScale === undefined || renderedScale !== desktopZoomRef.current) {
                    rasteriserPage(pNum, desktopZoomRef.current);
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
                  pageCouranteRef.current = pNum;
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

      Object.keys(renderTasks.current).forEach(key => {
        try { renderTasks.current[Number(key)]?.cancel(); } catch (_) {}
      });
      renderTasks.current = {};
      canvasRefs.current = {};
      wrapperRefs.current = {};
      pagesVisiblesRef.current.clear();
      renderedScalesMap.current.clear();

      if (zoomDebounceTimerRef.current) {
        clearTimeout(zoomDebounceTimerRef.current);
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      pagesLayerRef.current = null;
    };
  }, [sourceCible, urlFichier, estVerrouille, limiteApercuPages, limiteApercuType, limiteApercuValeur, prix, tentativeKey, rasteriserPage]);

  return (
    <div
      ref={rootRef}
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
          overflow-anchor: none !important;
          padding: 24px 24px 100px 24px !important;
          box-sizing: border-box !important;
        }
        .cauzon-pages-layer {
          display: block !important;
          position: relative !important;
          margin: 0 auto !important;
          width: 100% !important;
          box-sizing: border-box !important;
        }
        .cauzon-page-wrapper {
          display: block !important;
          margin: 0 auto 20px auto !important;
          position: relative !important;
          box-sizing: border-box !important;
          image-rendering: -webkit-optimize-contrast !important;
        }
        .cauzon-page-wrapper canvas {
          display: block !important;
          margin: 0 auto !important;
          image-rendering: -webkit-optimize-contrast !important;
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
          overflowAnchor: 'none',
        } as any}
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

      {/* Barre d'outils flottante Desktop avec indicateur de raccourcis */}
      {!chargement && !erreur && nombrePagesTotal > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(15, 23, 42, 0.94)',
            color: '#FFFFFF',
            padding: '6px 14px',
            borderRadius: '30px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.40)',
            zIndex: 30,
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
          }}
        >
          {/* Dézoomer */}
          <button
            onClick={dezoomer}
            disabled={visualZoomPercent <= 50}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              color: visualZoomPercent <= 50 ? 'rgba(255,255,255,0.35)' : '#FFFFFF',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: visualZoomPercent <= 50 ? 'default' : 'pointer',
              fontSize: '18px',
              fontWeight: 800,
            }}
            title="Dézoomer (Ctrl -)"
          >
            −
          </button>

          {/* Pastille page et reset zoom */}
          <button
            onClick={reinitialiserZoom}
            style={{
              background: 'none',
              border: 'none',
              color: '#FFFFFF',
              padding: '4px 10px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Cliquer pour réinitialiser à 100% (Ctrl 0)"
          >
            <span>Page {pageCourante} / {nombrePagesTotal}</span>
            {visualZoomPercent !== 100 && (
              <span
                style={{
                  backgroundColor: 'rgba(56, 189, 248, 0.25)',
                  color: '#38BDF8',
                  padding: '2px 8px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 800,
                }}
              >
                {visualZoomPercent}%
              </span>
            )}
          </button>

          {/* Zoomer */}
          <button
            onClick={zoomer}
            disabled={visualZoomPercent >= 300}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              color: visualZoomPercent >= 300 ? 'rgba(255,255,255,0.35)' : '#FFFFFF',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: desktopZoom >= 3.0 ? 'default' : 'pointer',
              fontSize: '18px',
              fontWeight: 800,
            }}
            title="Zoomer (Ctrl + ou Ctrl+Molette)"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
};

export default LecteurPwaDesktop;
