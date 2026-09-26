import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { LecteurPdfProps } from './PdfViewer/types';
import { chargerPdfJs, extrairePdfBytes } from './PdfViewer/pdfjsLoader';
import { LecteurPdfErrorBoundary } from './LecteurPdfDesktop';

/**
 * LecteurPdfAndroid (PWA Mobile Android — Architecture Tactile & Moteur de Zoom Unique)
 * 
 * 1. UN SEUL PROPRIÉTAIRE DU DÉFILEMENT (Single Scroll Owner) :
 *    - Viewport racine : overflow-y auto, overflow-x hidden (au zoom 1.0x), overscroll-behavior contain.
 *    - Verrouillage strict du scroll parasite sur body/html.
 * 2. MIGRATION VERS LES POINTER EVENTS (Pointer API) :
 *    - Suivi précis multi-touch via Map<number, { x: number, y: number }>.
 *    - 1 doigt : défilement vertical natif fluide (touch-action: pan-y).
 *    - 2 doigts : pincement (pinch) immédiat, touch-action: none, setPointerCapture.
 * 3. MOTEUR GÉOMÉTRIQUE DE ZOOM UNIQUE (applyZoom) :
 *    - Centralise Pinch, Double-Tap, Boutons +, -, Reset dans applyZoom(nextZoom, focalX, focalY).
 *    - Préservation géométrique exacte du point focal sans aucun saut de page.
 *    - Plafonnement strict entre 1.0x (Fit-Width) et 3.0x max.
 * 4. TRANSFORMATION GPU PENDANT LE GESTE & RENDU HD STABILISÉ :
 *    - Transform CSS GPU (requestAnimationFrame) à 60 FPS constants pendant le pinch.
 *    - Re-rendu haute netteté à la stabilisation avec debounce 120ms (DPR plafonné à 1.5).
 * 5. INTERFACE & PLEIN ÉCRAN :
 *    - Barre d'outils flottante au-dessus avec compensation padding-bottom (100px).
 *    - Boutons [+] et [-] incrémentent/décrémentent de 0.25x.
 */
const LecteurPdfAndroidInternal: React.FC<LecteurPdfProps> = ({
  urlFichier,
  pdfUrl,
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
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pagesLayerRef = useRef<HTMLDivElement | null>(null);

  const [chargement, setChargement] = useState<boolean>(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pageCourante, setPageCourante] = useState<number>(1);
  const [nombrePagesTotal, setNombrePagesTotal] = useState<number>(0);
  const [pagesAutorisees, setPagesAutorisees] = useState<number>(1);
  const [tentativeKey, setTentativeKey] = useState<number>(0);
  const [zoomNiveau, setZoomNiveau] = useState<number>(1.0);
  const [estPleinEcran, setEstPleinEcran] = useState<boolean>(false);

  const pdfDocRef = useRef<any>(null);
  const canvasRefs = useRef<{ [pageNumber: number]: HTMLCanvasElement }>({});
  const wrapperRefs = useRef<{ [pageNumber: number]: HTMLElement }>({});
  const renderedPagesZoomRef = useRef<{ [pageNumber: number]: number }>({});
  const activeRenderTasksRef = useRef<{ [pageNumber: number]: any }>({});
  const baseWidthRef = useRef<number>(360);
  const baseHeightRef = useRef<number>(508);
  const pageCouranteRef = useRef<number>(1);
  const pagesAutoriseesRef = useRef<number>(1);
  const zoomNiveauRef = useRef<number>(1.0);

  // Gestion des Pointer Events & Zoom
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const isPinchingRef = useRef<boolean>(false);
  const initialPinchDistRef = useRef<number>(0);
  const initialPinchZoomRef = useRef<number>(1.0);
  const pinchFocalRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const currentLiveZoomRef = useRef<number>(1.0);
  const pinchRafIdRef = useRef<number | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const lastTapPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pointerDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rerenderDebounceTimerRef = useRef<any>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const sourceCible = pdfUrl || (typeof urlFichier === 'string' ? urlFichier : null);

  const reessayerChargement = useCallback(() => {
    setErreur(null);
    setChargement(true);
    setTentativeKey((k) => k + 1);
    onReessayer?.();
  }, [onReessayer]);

  // Surveillance du plein écran
  useEffect(() => {
    const onFullscreenChange = () => {
      setEstPleinEcran(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const basculerPleinEcran = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        if (rootRef.current?.requestFullscreen) {
          await rootRef.current.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (e) {
      console.warn('[LecteurPdfAndroid] Plein écran non disponible :', e);
    }
  }, []);

  // 1. UN SEUL PROPRIÉTAIRE DU DÉFILEMENT : Verrouillage strict du scroll body/html
  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyOverscroll = document.body.style.overscrollBehavior;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.overscrollBehavior = originalBodyOverscroll;
    };
  }, []);

  // 🎯 Rendu Canvas optimisé d'une page (DPR plafonné à 1.5)
  const rasteriserPage = useCallback(async (pageNumber: number, forceZoom?: number) => {
    const pdfDoc = pdfDocRef.current;
    if (!pdfDoc) return;

    const currentZoom = forceZoom !== undefined ? forceZoom : zoomNiveauRef.current;
    const previousRenderedZoom = renderedPagesZoomRef.current[pageNumber];

    // Éviter de recalculer si déjà rendue à ce zoom
    if (previousRenderedZoom && Math.abs(previousRenderedZoom - currentZoom) < 0.05) {
      return;
    }

    const wrapper = wrapperRefs.current[pageNumber];
    if (!wrapper) return;

    // Annuler toute tâche de rendu active sur cette page
    if (activeRenderTasksRef.current[pageNumber]) {
      try {
        activeRenderTasksRef.current[pageNumber].cancel();
      } catch {}
      delete activeRenderTasksRef.current[pageNumber];
    }

    let canvas = canvasRefs.current[pageNumber];
    if (!canvas) {
      canvas = wrapper.querySelector('canvas') as HTMLCanvasElement;
      if (canvas) canvasRefs.current[pageNumber] = canvas;
    }

    try {
      const page = await pdfDoc.getPage(pageNumber);
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      // Plafond DPR strict à 1.5 sur Android : fluidité optimale et RAM préservée
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1.25;
      const baseW = Number(wrapper.getAttribute('data-base-width')) || baseWidthRef.current || 360;
      const baseScale = baseW / unscaledViewport.width;

      const renderScale = baseScale * currentZoom;
      const viewport = page.getViewport({ scale: renderScale });
      const cssW = Math.floor(viewport.width);
      const cssH = Math.floor(viewport.height);

      const placeholder = wrapper.querySelector('.cauzon-page-placeholder');
      if (placeholder) placeholder.remove();

      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto';
        wrapper.appendChild(canvas);
        canvasRefs.current[pageNumber] = canvas;
      }

      // Mise à l'échelle logique CSS immédiate (sans clignotement)
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;

      // Définition de la résolution interne HD
      const pixelW = Math.floor(cssW * dpr);
      const pixelH = Math.floor(cssH * dpr);

      if (canvas.width !== pixelW || canvas.height !== pixelH) {
        canvas.width = pixelW;
        canvas.height = pixelH;
      }

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';

      const renderTask = page.render({
        canvasContext: ctx,
        viewport: page.getViewport({ scale: renderScale * dpr }),
      });

      activeRenderTasksRef.current[pageNumber] = renderTask;
      await renderTask.promise;
      delete activeRenderTasksRef.current[pageNumber];
      renderedPagesZoomRef.current[pageNumber] = currentZoom;
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn(`[LecteurPdfAndroid] Erreur rendu page ${pageNumber} :`, err);
      }
    }
  }, []);

  // Déclenchement du re-rendu haute netteté avec debounce de 120ms
  const declencherRerenduHD = useCallback((nouveauZoom: number) => {
    if (rerenderDebounceTimerRef.current) {
      clearTimeout(rerenderDebounceTimerRef.current);
    }
    rerenderDebounceTimerRef.current = setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();

      const allowed = pagesAutoriseesRef.current;
      for (let num = 1; num <= allowed; num++) {
        const wrapper = wrapperRefs.current[num];
        if (!wrapper) continue;
        const rect = wrapper.getBoundingClientRect();
        // Rendre en priorité les pages visibles ou dans la marge de 350px
        if (rect.bottom >= containerRect.top - 350 && rect.top <= containerRect.bottom + 350) {
          rasteriserPage(num, nouveauZoom);
        }
      }
    }, 120);
  }, [rasteriserPage]);

  // 3. MOTEUR GÉOMÉTRIQUE DE ZOOM UNIQUE (applyZoom)
  const applyZoom = useCallback((nextZoomTarget: number, focalX?: number, focalY?: number) => {
    const container = containerRef.current;
    if (!container) return;

    // Plafonner le zoom entre 1.0x (Fit-Width) et 3.0x max
    const nextZoom = Number(Math.min(3.0, Math.max(1.0, nextZoomTarget)).toFixed(2));
    const currentZoom = zoomNiveauRef.current;

    // Si focalX/focalY ne sont pas fournis (boutons +/-), utiliser le centre du viewport
    const viewportWidth = container.clientWidth;
    const viewportHeight = container.clientHeight;
    const fx = focalX !== undefined ? focalX : viewportWidth / 2;
    const fy = focalY !== undefined ? focalY : viewportHeight / 2;

    // Calcul des coordonnées dans l'espace PDF
    const pdfX = (container.scrollLeft + fx) / currentZoom;
    const pdfY = (container.scrollTop + fy) / currentZoom;

    // Calcul des nouvelles positions de scroll après changement d'échelle
    const targetScrollLeft = Math.max(0, pdfX * nextZoom - fx);
    const targetScrollTop = Math.max(0, pdfY * nextZoom - fy);

    // Mise à jour de la référence et de l'état de zoom
    zoomNiveauRef.current = nextZoom;
    setZoomNiveau(nextZoom);

    // Mise à jour des dimensions logiques de chaque wrapper de page
    const allowed = pagesAutoriseesRef.current;
    for (let num = 1; num <= allowed; num++) {
      const wrapper = wrapperRefs.current[num];
      if (!wrapper) continue;
      const baseW = Number(wrapper.getAttribute('data-base-width')) || baseWidthRef.current;
      const baseH = Number(wrapper.getAttribute('data-base-height')) || baseHeightRef.current;
      const newW = Math.round(baseW * nextZoom);
      const newH = Math.round(baseH * nextZoom);

      wrapper.style.width = `${newW}px`;
      wrapper.style.height = `${newH}px`;

      const canvas = canvasRefs.current[num] || (wrapper.querySelector('canvas') as HTMLCanvasElement | null);
      if (canvas) {
        canvas.style.width = `${newW}px`;
        canvas.style.height = `${newH}px`;
      }
    }

    // Gestion du défilement horizontal (actif uniquement si zoomé > 1.0x)
    if (nextZoom > 1.01) {
      container.style.overflowX = 'auto';
      container.style.touchAction = 'pan-x pan-y';
    } else {
      container.style.overflowX = 'hidden';
      container.style.touchAction = 'pan-y';
    }

    // Mise à jour synchronisée du scroll (préservation absolue du point focal)
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({
        left: targetScrollLeft,
        top: targetScrollTop,
        behavior: 'instant' as ScrollBehavior,
      });
    } else {
      container.scrollLeft = targetScrollLeft;
      container.scrollTop = targetScrollTop;
    }

    // Déclencher le re-rendu HD avec debounce de 120ms
    declencherRerenduHD(nextZoom);
  }, [declencherRerenduHD]);

  // Boutons de la barre d'outils
  const zoomerCran = () => {
    const next = Math.min(3.0, Number((zoomNiveauRef.current + 0.25).toFixed(2)));
    applyZoom(next);
  };

  const dezoomerCran = () => {
    const next = Math.max(1.0, Number((zoomNiveauRef.current - 0.25).toFixed(2)));
    applyZoom(next);
  };

  const resetZoom = () => {
    applyZoom(1.0);
  };

  // 🚀 Initialisation du document PDF
  useEffect(() => {
    let estActif = true;

    async function initialiserDocument() {
      try {
        setChargement(true);
        setErreur(null);

        if (estVerrouille && limiteApercuValeur === 0) {
          if (estActif) setChargement(false);
          return;
        }

        const pdfjsLib = await chargerPdfJs();
        const pdfBytes = await extrairePdfBytes(sourceCible, urlFichier);

        if (!estActif) return;

        const loadingTask = pdfjsLib.getDocument({
          data: pdfBytes,
          cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/cmaps/',
          cMapPacked: true,
        });

        const pdfDoc = await loadingTask.promise;
        if (!estActif) return;

        pdfDocRef.current = pdfDoc;
        const total = pdfDoc.numPages;
        setNombrePagesTotal(total);

        // Calcul des pages d'aperçu autorisées
        let allowed = 1;
        if (estVerrouille) {
          if (limiteApercuType === 'page') {
            allowed = Math.min(Number(limiteApercuValeur) || 1, total);
          } else {
            const pct = Number(limiteApercuValeur) || 30;
            allowed = Math.min(Math.ceil((total * pct) / 100), total);
          }
          allowed = Math.max(1, allowed);
        } else {
          allowed = total;
        }
        setPagesAutorisees(allowed);
        pagesAutoriseesRef.current = allowed;

        onDocumentLoad?.(allowed);
        onPageChange?.(1, allowed);

        // Mesure de la largeur utile Android
        const clientW = containerRef.current?.clientWidth || window.innerWidth || 360;
        const utileW = Math.max(280, Math.min(clientW - 16, 768));
        baseWidthRef.current = utileW;

        // Étalonnage de hauteur d'après la page 1
        const premierePage = await pdfDoc.getPage(1);
        const vp1 = premierePage.getViewport({ scale: 1.0 });
        baseHeightRef.current = Math.floor((utileW * vp1.height) / vp1.width);

        const container = containerRef.current;
        if (!container) return;

        container.innerHTML = '';
        const pagesLayer = document.createElement('div');
        pagesLayer.className = 'cauzon-android-pages-layer';
        pagesLayerRef.current = pagesLayer;
        container.appendChild(pagesLayer);

        // Génération des wrappers de pages
        for (let num = 1; num <= allowed; num++) {
          const wrapper = document.createElement('div');
          wrapper.className = 'cauzon-page-wrapper';
          wrapper.setAttribute('data-page-number', String(num));
          wrapper.setAttribute('data-base-width', String(baseWidthRef.current));
          wrapper.setAttribute('data-base-height', String(baseHeightRef.current));
          wrapper.style.width = `${baseWidthRef.current}px`;
          wrapper.style.height = `${baseHeightRef.current}px`;
          wrapper.style.backgroundColor = estSombre ? '#1E293B' : '#FFFFFF';

          const placeholder = document.createElement('div');
          placeholder.className = 'cauzon-page-placeholder';
          placeholder.style.position = 'absolute';
          placeholder.style.inset = '0';
          placeholder.style.display = 'flex';
          placeholder.style.alignItems = 'center';
          placeholder.style.justifyContent = 'center';
          placeholder.innerHTML = `
            <div style="font-size: 13px; font-weight: 600; color: ${estSombre ? '#64748B' : '#94A3B8'};">Page ${num}</div>
          `;
          wrapper.appendChild(placeholder);

          pagesLayer.appendChild(wrapper);
          wrapperRefs.current[num] = wrapper;
        }

        // Rendu prioritaire immédiat de la page 1
        await rasteriserPage(1, 1.0);
        if (estActif) setChargement(false);

        // IntersectionObserver économe pour lazy-loading
        if (observerRef.current) {
          observerRef.current.disconnect();
        }

        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              const num = Number(entry.target.getAttribute('data-page-number'));
              if (!num) return;

              if (entry.isIntersecting) {
                rasteriserPage(num, zoomNiveauRef.current);
                if (entry.intersectionRatio > 0.45 && pageCouranteRef.current !== num) {
                  pageCouranteRef.current = num;
                  setPageCourante(num);
                  onPageChange?.(num, pagesAutoriseesRef.current);
                }
              }
            });
          },
          {
            root: container,
            rootMargin: '350px 0px 350px 0px',
            threshold: [0.1, 0.5],
          }
        );

        observerRef.current = observer;
        for (let num = 1; num <= allowed; num++) {
          const w = wrapperRefs.current[num];
          if (w) observer.observe(w);
        }
      } catch (err: any) {
        console.error('[LecteurPdfAndroid] Erreur chargement initial :', err);
        if (estActif) {
          setErreur(err?.message || 'Impossible d\'ouvrir le document.');
          setChargement(false);
          onError?.(err);
        }
      }
    }

    initialiserDocument();

    return () => {
      estActif = false;
      if (observerRef.current) observerRef.current.disconnect();
      if (rerenderDebounceTimerRef.current) clearTimeout(rerenderDebounceTimerRef.current);
      if (pinchRafIdRef.current) cancelAnimationFrame(pinchRafIdRef.current);
      Object.values(activeRenderTasksRef.current).forEach((t: any) => {
        try { t.cancel(); } catch {}
      });
      activeRenderTasksRef.current = {};
      renderedPagesZoomRef.current = {};
      canvasRefs.current = {};
      wrapperRefs.current = {};
    };
  }, [tentativeKey, sourceCible, urlFichier, estVerrouille, limiteApercuValeur, limiteApercuType, rasteriserPage]);

  // 2. MIGRATION VERS LES POINTER EVENTS & 4. TRANSFORMATION GPU PINCH
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onPointerDown = (e: PointerEvent) => {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointersRef.current.size === 1) {
        pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
      } else if (activePointersRef.current.size === 2) {
        // Détection immédiate du pincement (pinch)
        isPinchingRef.current = true;
        const pointers = Array.from(activePointersRef.current.values());
        const p1 = pointers[0];
        const p2 = pointers[1];

        initialPinchDistRef.current = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        initialPinchZoomRef.current = zoomNiveauRef.current;
        currentLiveZoomRef.current = zoomNiveauRef.current;

        const rect = container.getBoundingClientRect();
        const centerX = (p1.x + p2.x) / 2 - rect.left;
        const centerY = (p1.y + p2.y) / 2 - rect.top;
        pinchFocalRef.current = { x: centerX, y: centerY };

        // Passage dynamique à touch-action: none avec setPointerCapture()
        container.style.touchAction = 'none';
        try {
          container.setPointerCapture(e.pointerId);
        } catch {}
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!activePointersRef.current.has(e.pointerId)) return;
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (isPinchingRef.current && activePointersRef.current.size >= 2) {
        e.preventDefault();

        const pointers = Array.from(activePointersRef.current.values());
        const p1 = pointers[0];
        const p2 = pointers[1];
        const currentDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const initialDist = initialPinchDistRef.current || currentDist;
        const scaleRatio = currentDist / initialDist;

        // Plafonner la prévisualisation entre 1.0x et 3.0x
        const liveZoom = Math.min(3.0, Math.max(1.0, initialPinchZoomRef.current * scaleRatio));
        currentLiveZoomRef.current = liveZoom;

        const rect = container.getBoundingClientRect();
        const centerX = (p1.x + p2.x) / 2 - rect.left;
        const centerY = (p1.y + p2.y) / 2 - rect.top;
        pinchFocalRef.current = { x: centerX, y: centerY };

        const pagesLayer = pagesLayerRef.current;
        if (pagesLayer) {
          if (pinchRafIdRef.current) cancelAnimationFrame(pinchRafIdRef.current);
          pinchRafIdRef.current = requestAnimationFrame(() => {
            const visualScale = liveZoom / initialPinchZoomRef.current;
            pagesLayer.style.transformOrigin = `${centerX}px ${centerY}px`;
            pagesLayer.style.transform = `scale(${visualScale})`;
            pagesLayer.style.willChange = 'transform';
            pagesLayer.style.transition = 'none';
          });
        }
      }
    };

    const onPointerUpOrCancel = (e: PointerEvent) => {
      try {
        container.releasePointerCapture(e.pointerId);
      } catch {}

      const wasPinching = isPinchingRef.current;
      const hadCount = activePointersRef.current.size;

      activePointersRef.current.delete(e.pointerId);

      // Si plus aucun pointeur pressé (sécurité anti-blocage)
      if (e.buttons === 0 && activePointersRef.current.size > 0) {
        activePointersRef.current.clear();
      }

      if (wasPinching) {
        if (activePointersRef.current.size < 2) {
          isPinchingRef.current = false;
          if (pinchRafIdRef.current) {
            cancelAnimationFrame(pinchRafIdRef.current);
            pinchRafIdRef.current = null;
          }

          const pagesLayer = pagesLayerRef.current;
          if (pagesLayer) {
            pagesLayer.style.transform = 'none';
            pagesLayer.style.transformOrigin = 'center top';
            pagesLayer.style.willChange = 'auto';
          }

          // Application définitive du zoom via applyZoom()
          const finalZoom = currentLiveZoomRef.current;
          const focal = pinchFocalRef.current;
          applyZoom(finalZoom, focal.x, focal.y);
        }
      } else if (hadCount === 1) {
        // Détection du double-tap (< 280ms) à 1 doigt
        const downPos = pointerDownPosRef.current;
        const moveDist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);

        if (moveDist < 14) {
          const now = Date.now();
          const timeSinceLast = now - lastTapTimeRef.current;
          const tapDist = Math.hypot(e.clientX - lastTapPosRef.current.x, e.clientY - lastTapPosRef.current.y);

          if (timeSinceLast < 280 && tapDist < 35) {
            lastTapTimeRef.current = 0;
            const rect = container.getBoundingClientRect();
            const tapX = e.clientX - rect.left;
            const tapY = e.clientY - rect.top;
            const targetZoom = zoomNiveauRef.current > 1.1 ? 1.0 : 2.0;
            applyZoom(targetZoom, tapX, tapY);
          } else {
            lastTapTimeRef.current = now;
            lastTapPosRef.current = { x: e.clientX, y: e.clientY };
          }
        }
      }
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUpOrCancel);
    container.addEventListener('pointercancel', onPointerUpOrCancel);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUpOrCancel);
      container.removeEventListener('pointercancel', onPointerUpOrCancel);
    };
  }, [applyZoom]);

  // Adaptation au redimensionnement / changement d'orientation de l'écran
  useEffect(() => {
    const onResize = () => {
      const container = containerRef.current;
      if (!container || !pdfDocRef.current) return;
      const clientW = container.clientWidth || window.innerWidth || 360;
      const utileW = Math.max(280, Math.min(clientW - 16, 768));
      baseWidthRef.current = utileW;
      applyZoom(zoomNiveauRef.current);
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [applyZoom]);

  // Document totalement verrouillé (0 page autorisée)
  if (estVerrouille && limiteApercuValeur === 0) {
    return (
      <div
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          backgroundColor: estSombre ? '#0F172A' : '#F8FAFC',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: '380px',
            width: '100%',
            backgroundColor: estSombre ? '#1E293B' : '#FFFFFF',
            borderRadius: '18px',
            padding: '28px 20px',
            textAlign: 'center',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            border: estSombre ? '1px solid #334155' : '1px solid #E2E8F0',
          }}
        >
          <div style={{ fontSize: '38px', marginBottom: '12px' }}>🔒</div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800, color: estSombre ? '#FFFFFF' : '#0F172A' }}>
            Document Verrouillé
          </h3>
          <p style={{ margin: '0 0 20px 0', fontSize: '13px', lineHeight: '19px', color: estSombre ? '#94A3B8' : '#64748B' }}>
            Ce cours complet nécessite une acquisition pour être consulté. Débloquez-le à l'unité ou profitez du Pass VIP.
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onAcheter}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#7F011F',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              🛒 Débloquer ({prix} F)
            </button>
            <button
              onClick={onVip}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#F59E0B',
                color: '#1E1B4B',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              👑 Pass VIP (500 F)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: estSombre ? '#0F172A' : '#F1F5F9',
        overflow: 'hidden',
        fontFamily: 'sans-serif',
      }}
    >
      <style>{`
        .cauzon-android-scroll-container {
          position: relative !important;
          width: 100% !important;
          height: 100% !important;
          flex: 1 !important;
          overflow-y: auto !important;
          overscroll-behavior: contain !important;
          overscroll-behavior-y: contain !important;
          -webkit-overflow-scrolling: touch !important;
          touch-action: pan-y;
          scrollbar-width: none;
        }
        .cauzon-android-scroll-container::-webkit-scrollbar {
          display: none;
        }
        .cauzon-android-pages-layer {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          min-width: 100% !important;
          width: max-content !important;
          padding-top: 12px !important;
          padding-bottom: 100px !important;
          transform-origin: center top;
        }
        .cauzon-page-wrapper {
          position: relative !important;
          margin: 0 auto 14px auto !important;
          border-radius: 6px !important;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12) !important;
          overflow: hidden !important;
          user-select: none !important;
          -webkit-user-select: none !important;
        }
        .cauzon-page-wrapper canvas {
          display: block !important;
          margin: 0 auto !important;
          user-select: none !important;
          -webkit-user-select: none !important;
        }
        @keyframes cauzon-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* 1. Viewport racine défilant unique */}
      <div
        ref={containerRef}
        className="cauzon-android-scroll-container"
        style={{
          display: chargement || erreur ? 'none' : 'block',
        }}
      />

      {/* Chargement initial sobre */}
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
            zIndex: 40,
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              border: '3.5px solid rgba(127, 1, 31, 0.15)',
              borderTopColor: '#7F011F',
              borderRadius: '50%',
              animation: 'cauzon-spin 0.8s linear infinite',
            }}
          />
          <div style={{ color: '#7F011F', fontSize: '14px', fontWeight: 700 }}>
            Chargement du cours...
          </div>
          <div style={{ color: '#64748B', fontSize: '11px' }}>
            Rendu optimisé PWA Android
          </div>
        </div>
      )}

      {/* Erreur avec bouton de réessai */}
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
            textAlign: 'center',
            zIndex: 40,
          }}
        >
          <div style={{ fontSize: '38px', marginBottom: '8px' }}>⚠️</div>
          <div style={{ color: '#EF4444', fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>
            Erreur d'ouverture
          </div>
          <div style={{ color: '#64748B', fontSize: '12.5px', maxWidth: '300px', marginBottom: '16px' }}>
            {erreur}
          </div>
          <button
            onClick={reessayerChargement}
            style={{
              padding: '10px 20px',
              backgroundColor: '#7F011F',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '10px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            🔄 Réessayer
          </button>
        </div>
      )}

      {/* Paywall Banner si le document est restreint */}
      {!chargement && !erreur && estVerrouille && pagesAutorisees < nombrePagesTotal && (
        <div
          style={{
            position: 'absolute',
            bottom: '72px',
            left: '12px',
            right: '12px',
            backgroundColor: estSombre ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            borderRadius: '14px',
            padding: '12px 16px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(127, 1, 31, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            zIndex: 25,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: estSombre ? '#FFFFFF' : '#0F172A' }}>
              Fin de l'aperçu ({pagesAutorisees}/{nombrePagesTotal} pages)
            </div>
            <div style={{ fontSize: '10.5px', color: '#64748B' }}>
              Débloquez la suite du document
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onAcheter}
              style={{
                padding: '8px 12px',
                backgroundColor: '#7F011F',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '11.5px',
                cursor: 'pointer',
              }}
            >
              Acheter ({prix} F)
            </button>
            <button
              onClick={onVip}
              style={{
                padding: '8px 12px',
                backgroundColor: '#F59E0B',
                color: '#1E1B4B',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '11.5px',
                cursor: 'pointer',
              }}
            >
              VIP (500 F)
            </button>
          </div>
        </div>
      )}

      {/* 5. Barre d'outils mobile flottante simplifiée & infaillible */}
      {!chargement && !erreur && nombrePagesTotal > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            color: '#FFFFFF',
            padding: '5px 12px',
            borderRadius: '28px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.35)',
            zIndex: 30,
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
          }}
        >
          {/* Dézoom cran par cran [-] (-0.25x) */}
          <button
            onClick={dezoomerCran}
            disabled={zoomNiveau <= 1.0}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              color: zoomNiveau <= 1.0 ? 'rgba(255,255,255,0.3)' : '#FFFFFF',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              fontWeight: 800,
              cursor: zoomNiveau <= 1.0 ? 'default' : 'pointer',
            }}
            title="Dézoomer (-0.25x)"
          >
            −
          </button>

          {/* Indicateur de page & réinitialisation zoom */}
          <button
            onClick={resetZoom}
            style={{
              background: 'none',
              border: 'none',
              color: '#FFFFFF',
              padding: '4px 6px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
            }}
            title="Toucher pour réinitialiser le zoom à 1.0x"
          >
            <span>{pageCourante}/{pagesAutorisees}</span>
            {zoomNiveau > 1.05 && (
              <span
                style={{
                  backgroundColor: 'rgba(56, 189, 248, 0.25)',
                  color: '#38BDF8',
                  padding: '1px 6px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 800,
                }}
              >
                {parseFloat(zoomNiveau.toFixed(2))}x
              </span>
            )}
          </button>

          {/* Zoom cran par cran [+] (+0.25x) */}
          <button
            onClick={zoomerCran}
            disabled={zoomNiveau >= 3.0}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              color: zoomNiveau >= 3.0 ? 'rgba(255,255,255,0.3)' : '#FFFFFF',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              fontWeight: 800,
              cursor: zoomNiveau >= 3.0 ? 'default' : 'pointer',
            }}
            title="Zoomer (+0.25x)"
          >
            +
          </button>

          {/* Séparateur */}
          <div style={{ width: '1px', height: '18px', backgroundColor: 'rgba(255,255,255,0.2)' }} />

          {/* Plein écran [⛶] */}
          <button
            onClick={basculerPleinEcran}
            style={{
              background: estPleinEcran ? 'rgba(127, 1, 31, 0.6)' : 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              color: '#FFFFFF',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              cursor: 'pointer',
            }}
            title={estPleinEcran ? 'Quitter le plein écran' : 'Plein écran'}
          >
            {estPleinEcran ? '✕' : '⛶'}
          </button>
        </div>
      )}
    </div>
  );
};

export const LecteurPdfAndroid: React.FC<LecteurPdfProps> = (props) => {
  return (
    <LecteurPdfErrorBoundary estSombre={props.estSombre} onReessayer={props.onReessayer}>
      <LecteurPdfAndroidInternal {...props} />
    </LecteurPdfErrorBoundary>
  );
};

export default LecteurPdfAndroid;
