import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { LecteurPdfProps } from './PdfViewer/types';
import { chargerPdfJs, extrairePdfBytes } from './PdfViewer/pdfjsLoader';
import { LecteurPdfErrorBoundary } from './LecteurPdfDesktop';

/**
 * LecteurPdfAndroid (PWA Mobile Android — Expérience Liseuse Native Style WPS / Drive)
 * 
 * Optimisations Majeures :
 * 1. Zéro conflit tactile :
 *    - overscroll-behavior: contain (bloque le pull-to-refresh parasite et les rebonds de Chrome)
 *    - touch-action: pan-y pinch-zoom en mode normal, touch-action: none durant les phases de zoom/pan
 * 2. Accélération Matérielle GPU (60 FPS constants) :
 *    - Les gestes de pincement (pinch) et double-tap manipulent directement `transform: translate3d(...) scale(...)`
 *    - `will-change: transform` appliqué sur le calque des pages
 *    - Aucune ré-échantillonnage Canvas pendant les mouvements
 * 3. Handoff HD Intelligent et Débouncé :
 *    - Re-rastérisation Canvas haute netteté déclenchée uniquement après la stabilisation des doigts
 *    - Plafond DPR strict à 2.0 pour préserver la mémoire vive Android
 * 4. Double-Tap Fluide :
 *    - Transition CSS douce (transition: transform 0.2s cubic-bezier(0.25, 1, 0.5, 1))
 * 5. Barre d'outils ergonomique compacte :
 *    - Dézoom (−), Indicateur de Page / Réinitialisation, Zoom (+), Bascule Plein Écran (⛶)
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
  const [pagesAutorisees, setPagesAutorisees] = useState<number>(1);
  const [tentativeKey, setTentativeKey] = useState<number>(0);
  const [zoomActif, setZoomActif] = useState<number>(scale || 1.0);
  const [zoomVisuelPourcent, setZoomVisuelPourcent] = useState<number>(Math.round((scale || 1.0) * 100));
  const [estPleinEcran, setEstPleinEcran] = useState<boolean>(false);

  const pdfDocRef = useRef<any>(null);
  const pageRenderTasks = useRef<{ [pageNumber: number]: any }>({});
  const canvasRefs = useRef<{ [pageNumber: number]: HTMLCanvasElement }>({});
  const wrapperRefs = useRef<{ [pageNumber: number]: HTMLElement }>({});
  const renderedScalesMap = useRef<Map<number, number>>(new Map());
  const pagesVisiblesRef = useRef<Set<number>>(new Set([1]));
  const targetWidthRef = useRef<number>(360);
  const baseWidthRef = useRef<number>(360);
  const baseHeightRef = useRef<number>(508);
  const pageCouranteRef = useRef<number>(1);
  const zoomActifRef = useRef<number>(scale || 1.0);

  // Synchronisation de ref
  useEffect(() => {
    zoomActifRef.current = zoomActif;
  }, [zoomActif]);

  // Timers et animations
  const renderDebounceTimerRef = useRef<any>(null);
  const rafIdRef = useRef<number | null>(null);

  // Gestes tactiles
  const lastTapTimeRef = useRef<number>(0);
  const isPinchingRef = useRef<boolean>(false);
  const isPanningRef = useRef<boolean>(false);
  const initialPinchDistRef = useRef<number>(0);
  const initialZoomOnPinchRef = useRef<number>(1.0);
  const currentScaleFactorRef = useRef<number>(1.0);
  const panOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const focalPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

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

  // 🎯 Re-rastérisation HD d'une page Canvas (exécutée uniquement à vitesse stabilisée)
  const rasteriserPageAndroid = useCallback(async (pageNumber: number, targetZoom: number) => {
    const pdfDoc = pdfDocRef.current;
    if (!pdfDoc) return;

    if (pageRenderTasks.current[pageNumber]) {
      try {
        pageRenderTasks.current[pageNumber].cancel();
      } catch (_) {}
      delete pageRenderTasks.current[pageNumber];
    }

    const wrapper = wrapperRefs.current[pageNumber];
    if (!wrapper) return;

    let canvas = canvasRefs.current[pageNumber];
    if (!canvas) {
      canvas = wrapper.querySelector('canvas') as HTMLCanvasElement;
      if (canvas) canvasRefs.current[pageNumber] = canvas;
    }

    try {
      const page = await pdfDoc.getPage(pageNumber);
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      // Plafond DPR strict à 2.0 sur Android pour soulager le GPU et éviter les fuites RAM
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2.0) : 1.5;
      const baseW = Number(wrapper.getAttribute('data-base-width')) || baseWidthRef.current || 360;
      const baseScale = baseW / unscaledViewport.width;
      const effectiveScale = baseScale * targetZoom;

      const viewport = page.getViewport({ scale: effectiveScale });
      const cssW = Math.floor(viewport.width);
      const cssH = Math.floor(viewport.height);

      const placeholder = wrapper.querySelector('.cauzon-page-placeholder');
      if (placeholder) placeholder.remove();

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
      } else {
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
      }

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
      renderedScalesMap.current.set(pageNumber, targetZoom);
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn(`[LecteurPdfAndroid] Erreur rendu page ${pageNumber} :`, err);
      }
    } finally {
      if (pageRenderTasks.current[pageNumber]) {
        delete pageRenderTasks.current[pageNumber];
      }
    }
  }, []);

  // 🎯 Validation définitive du zoom & ré-échantillonnage HD avec debounce
  const commettreZoomFinal = useCallback((nouveauZoom: number) => {
    const zoomBorne = Number(Math.min(Math.max(nouveauZoom, 0.8), 2.5).toFixed(2));
    setZoomActif(zoomBorne);
    setZoomVisuelPourcent(Math.round(zoomBorne * 100));

    const pagesLayer = pagesLayerRef.current;
    if (!pagesLayer) return;

    // Réinitialisation propre de la transformation temporaire GPU
    pagesLayer.style.transition = 'none';
    pagesLayer.style.transform = '';
    pagesLayer.style.transformOrigin = '';
    panOffsetRef.current = { x: 0, y: 0 };

    // Mise à jour physique de la géométrie des conteneurs
    const wrappers = pagesLayer.querySelectorAll<HTMLElement>('.cauzon-page-wrapper');
    wrappers.forEach((w) => {
      const baseW = Number(w.getAttribute('data-base-width')) || baseWidthRef.current || 360;
      const baseH = Number(w.getAttribute('data-base-height')) || baseHeightRef.current || Math.floor(baseW * 1.414);
      w.style.width = `${Math.floor(baseW * zoomBorne)}px`;
      w.style.height = `${Math.floor(baseH * zoomBorne)}px`;
    });

    // Re-rastérisation HD débouncée pour éviter les saccades
    if (renderDebounceTimerRef.current) {
      clearTimeout(renderDebounceTimerRef.current);
    }
    renderDebounceTimerRef.current = setTimeout(() => {
      pagesVisiblesRef.current.forEach((num) => {
        rasteriserPageAndroid(num, zoomBorne);
      });
    }, 120);
  }, [rasteriserPageAndroid]);

  // 🎯 Transition animée fluide (double-tap ou boutons)
  const animerVersZoom = useCallback((cibleZoom: number, focalPoint?: { x: number; y: number }) => {
    const pagesLayer = pagesLayerRef.current;
    if (!pagesLayer) return;

    const zoomBorne = Number(Math.min(Math.max(cibleZoom, 0.8), 2.5).toFixed(2));
    const facteurEchelle = zoomBorne / zoomActifRef.current;

    pagesLayer.style.transition = 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)';
    if (focalPoint) {
      pagesLayer.style.transformOrigin = `${focalPoint.x}px ${focalPoint.y}px`;
    } else {
      pagesLayer.style.transformOrigin = 'center top';
    }
    pagesLayer.style.transform = `scale3d(${facteurEchelle}, ${facteurEchelle}, 1)`;
    setZoomVisuelPourcent(Math.round(zoomBorne * 100));

    setTimeout(() => {
      commettreZoomFinal(zoomBorne);
    }, 220);
  }, [commettreZoomFinal]);

  const zoomer = () => animerVersZoom(zoomActif + 0.25);
  const dezoomer = () => animerVersZoom(zoomActif - 0.25);
  const reinitialiserZoom = () => animerVersZoom(zoomActif !== 1.0 ? 1.0 : 1.6);

  // 🚀 Chargement initial du document PDF via PDF.js
  useEffect(() => {
    let estActif = true;

    async function initialiserDocumentAndroid() {
      try {
        setChargement(true);
        setErreur(null);

        // Document totalement verrouillé (0 page autorisée)
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

        onDocumentLoad?.(allowed);
        onPageChange?.(1, allowed);

        // Largeur utile mobile Android
        const clientW = containerRef.current?.clientWidth || window.innerWidth || 360;
        const utileW = Math.max(280, Math.min(clientW - 16, 768));
        targetWidthRef.current = utileW;

        // Étalonnage des dimensions d'après la Page 1
        const premierePage = await pdfDoc.getPage(1);
        const vp1 = premierePage.getViewport({ scale: 1.0 });
        baseWidthRef.current = utileW;
        baseHeightRef.current = Math.floor((utileW * vp1.height) / vp1.width);

        // Construction du conteneur de pages
        const container = containerRef.current;
        if (!container) return;

        container.innerHTML = '';
        const pagesLayer = document.createElement('div');
        pagesLayer.className = 'cauzon-android-pages-layer';
        pagesLayer.style.display = 'flex';
        pagesLayer.style.flexDirection = 'column';
        pagesLayer.style.alignItems = 'center';
        pagesLayer.style.paddingTop = '12px';
        pagesLayer.style.paddingBottom = '88px';
        pagesLayer.style.willChange = 'transform';
        pagesLayer.style.transformOrigin = 'center top';
        pagesLayerRef.current = pagesLayer;
        container.appendChild(pagesLayer);

        // Création des wrappers de page
        for (let num = 1; num <= allowed; num++) {
          const wrapper = document.createElement('div');
          wrapper.className = 'cauzon-page-wrapper';
          wrapper.setAttribute('data-page-number', String(num));
          wrapper.setAttribute('data-base-width', String(baseWidthRef.current));
          wrapper.setAttribute('data-base-height', String(baseHeightRef.current));
          wrapper.style.width = `${Math.floor(baseWidthRef.current * zoomActif)}px`;
          wrapper.style.height = `${Math.floor(baseHeightRef.current * zoomActif)}px`;
          wrapper.style.position = 'relative';
          wrapper.style.margin = '0 auto 14px auto';
          wrapper.style.borderRadius = '6px';
          wrapper.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.12)';
          wrapper.style.backgroundColor = estSombre ? '#1E293B' : '#FFFFFF';
          wrapper.style.overflow = 'hidden';
          wrapper.style.transform = 'translateZ(0)';
          wrapper.style.willChange = 'transform';

          const placeholder = document.createElement('div');
          placeholder.className = 'cauzon-page-placeholder';
          placeholder.style.position = 'absolute';
          placeholder.style.inset = '0';
          placeholder.style.display = 'flex';
          placeholder.style.flexDirection = 'column';
          placeholder.style.alignItems = 'center';
          placeholder.style.justifyContent = 'center';
          placeholder.style.gap = '8px';
          placeholder.innerHTML = `
            <div style="font-size: 13px; font-weight: 600; color: ${estSombre ? '#64748B' : '#94A3B8'};">Page ${num}</div>
          `;
          wrapper.appendChild(placeholder);

          pagesLayer.appendChild(wrapper);
          wrapperRefs.current[num] = wrapper;
        }

        // Rendu prioritaire de la Page 1 (< 600ms)
        await rasteriserPageAndroid(1, zoomActif);
        if (estActif) setChargement(false);

        // IntersectionObserver pour lazy-rendering économe en RAM
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              const num = Number(entry.target.getAttribute('data-page-number'));
              if (!num) return;

              if (entry.isIntersecting) {
                pagesVisiblesRef.current.add(num);
                const renduScale = renderedScalesMap.current.get(num);
                if (renduScale !== zoomActifRef.current) {
                  rasteriserPageAndroid(num, zoomActifRef.current);
                }
                if (entry.intersectionRatio > 0.45 && pageCouranteRef.current !== num) {
                  pageCouranteRef.current = num;
                  setPageCourante(num);
                  onPageChange?.(num, allowed);
                }
              } else {
                pagesVisiblesRef.current.delete(num);
              }
            });
          },
          {
            root: container,
            rootMargin: '350px 0px 350px 0px',
            threshold: [0.1, 0.5],
          }
        );

        for (let num = 1; num <= allowed; num++) {
          const w = wrapperRefs.current[num];
          if (w) observer.observe(w);
        }
      } catch (err: any) {
        console.error('[LecteurPdfAndroid] Erreur chargement document :', err);
        if (estActif) {
          setErreur(err?.message || 'Impossible de charger le document PDF.');
          setChargement(false);
          onError?.(err);
        }
      }
    }

    initialiserDocumentAndroid();

    return () => {
      estActif = false;
      if (renderDebounceTimerRef.current) clearTimeout(renderDebounceTimerRef.current);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      Object.values(pageRenderTasks.current).forEach((task) => {
        try {
          task.cancel();
        } catch (_) {}
      });
      pageRenderTasks.current = {};
      canvasRefs.current = {};
      wrapperRefs.current = {};
      renderedScalesMap.current.clear();
      pagesVisiblesRef.current.clear();
    };
  }, [tentativeKey, sourceCible, urlFichier, estVerrouille, limiteApercuValeur, limiteApercuType]);

  // 🎯 Gestionnaire de Gestes Tactiles Accélérés par GPU (Pinch-to-zoom & Pan direct à 60 FPS)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onTouchStart = (e: TouchEvent) => {
      const pagesLayer = pagesLayerRef.current;

      // 1. Détection du Pinch-to-zoom (2 doigts)
      if (e.touches.length === 2) {
        isPinchingRef.current = true;
        isPanningRef.current = false;
        container.style.touchAction = 'none';

        if (pagesLayer) {
          pagesLayer.style.transition = 'none';
        }

        const x1 = e.touches[0].clientX;
        const y1 = e.touches[0].clientY;
        const x2 = e.touches[1].clientX;
        const y2 = e.touches[1].clientY;

        initialPinchDistRef.current = Math.hypot(x1 - x2, y1 - y2);
        initialZoomOnPinchRef.current = zoomActifRef.current;
        currentScaleFactorRef.current = 1.0;

        const cRect = container.getBoundingClientRect();
        focalPointRef.current = {
          x: (x1 + x2) / 2 - cRect.left,
          y: (y1 + y2) / 2 - cRect.top,
        };
        return;
      }

      // 2. Détection du Pan ou Double-Tap (1 doigt)
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

        const now = Date.now();
        if (now - lastTapTimeRef.current < 280) {
          // Double-Tap : bascule fluide vers 1.8x ou retour à 1.0x
          e.preventDefault();
          const cRect = container.getBoundingClientRect();
          const focalPoint = {
            x: touch.clientX - cRect.left,
            y: touch.clientY - cRect.top,
          };
          animerVersZoom(zoomActifRef.current < 1.3 ? 1.8 : 1.0, focalPoint);
          lastTapTimeRef.current = 0;
          return;
        }
        lastTapTimeRef.current = now;

        // Si déjà zoomé (> 1.1x), autoriser le pan tactile fluide
        if (zoomActifRef.current > 1.1) {
          isPanningRef.current = true;
          container.style.touchAction = 'none';
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const pagesLayer = pagesLayerRef.current;
      if (!pagesLayer) return;

      // Mode 1 : Pincement 2 doigts
      if (e.touches.length === 2 && isPinchingRef.current) {
        e.preventDefault();
        const x1 = e.touches[0].clientX;
        const y1 = e.touches[0].clientY;
        const x2 = e.touches[1].clientX;
        const y2 = e.touches[1].clientY;

        const currentDist = Math.hypot(x1 - x2, y1 - y2);
        if (initialPinchDistRef.current > 0) {
          const factor = currentDist / initialPinchDistRef.current;
          currentScaleFactorRef.current = factor;

          const tentativeZoom = Math.min(Math.max(initialZoomOnPinchRef.current * factor, 0.75), 3.0);
          setZoomVisuelPourcent(Math.round(tentativeZoom * 100));

          if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = requestAnimationFrame(() => {
            const focal = focalPointRef.current;
            pagesLayer.style.transformOrigin = `${focal.x}px ${focal.y}px`;
            pagesLayer.style.transform = `translate3d(0, 0, 0) scale3d(${factor}, ${factor}, 1)`;
          });
        }
        return;
      }

      // Mode 2 : Déplacement panoramique (Pan) 1 doigt lorsque zoomé
      if (e.touches.length === 1 && isPanningRef.current && zoomActifRef.current > 1.1) {
        const touch = e.touches[0];
        const dx = touch.clientX - touchStartPosRef.current.x;
        const dy = touch.clientY - touchStartPosRef.current.y;

        // Déplacement par défilement direct du container pour fluidité maximale
        container.scrollLeft -= dx;
        container.scrollTop -= dy;
        touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      const pagesLayer = pagesLayerRef.current;

      // Fin de pincement 2 doigts
      if (isPinchingRef.current && e.touches.length < 2) {
        isPinchingRef.current = false;
        container.style.touchAction = 'pan-y pinch-zoom';

        const finalZoom = Number(
          Math.min(Math.max(initialZoomOnPinchRef.current * currentScaleFactorRef.current, 0.8), 2.5).toFixed(2)
        );

        if (pagesLayer) {
          pagesLayer.style.transition = 'transform 0.15s ease-out';
          const normalizedFactor = finalZoom / initialZoomOnPinchRef.current;
          pagesLayer.style.transform = `translate3d(0, 0, 0) scale3d(${normalizedFactor}, ${normalizedFactor}, 1)`;
        }

        setTimeout(() => {
          commettreZoomFinal(finalZoom);
        }, 150);
        return;
      }

      // Fin de pan 1 doigt
      if (isPanningRef.current && e.touches.length === 0) {
        isPanningRef.current = false;
        if (zoomActifRef.current <= 1.05) {
          container.style.touchAction = 'pan-y pinch-zoom';
        }
      }
    };

    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
    container.addEventListener('touchcancel', onTouchEnd);

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [animerVersZoom, commettreZoomFinal]);

  // Document totalement verrouillé
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
        minHeight: 'calc(100vh - 64px)',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: estSombre ? '#0F172A' : '#F1F5F9',
        overflow: 'hidden',
        fontFamily: 'sans-serif',
        overscrollBehavior: 'contain',
      }}
    >
      <style>{`
        .cauzon-android-scroll-container {
          width: 100% !important;
          height: 100% !important;
          flex: 1 !important;
          overflow-y: auto !important;
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch !important;
          touch-action: pan-y pinch-zoom;
          overscroll-behavior: contain !important;
          overscroll-behavior-y: contain !important;
          overscroll-behavior-x: contain !important;
        }
        .cauzon-page-wrapper {
          transform: translateZ(0);
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .cauzon-page-wrapper canvas {
          display: block !important;
          margin: 0 auto !important;
          flex-shrink: 0 !important;
          user-select: none !important;
          -webkit-user-select: none !important;
          transform: translateZ(0);
        }
        @keyframes cauzon-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Conteneur défilant natif avec overscroll bloqué */}
      <div
        ref={containerRef}
        className="cauzon-android-scroll-container"
        style={{
          display: chargement || erreur ? 'none' : 'block',
        }}
      />

      {/* Indicateur de chargement Android */}
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
              border: '3.5px solid rgba(127, 1, 31, 0.15)',
              borderTopColor: '#7F011F',
              borderRadius: '50%',
              animation: 'cauzon-spin 0.8s linear infinite',
            }}
          />
          <div style={{ color: '#7F011F', fontSize: '14px', fontWeight: 700 }}>
            Chargement optimisé Android...
          </div>
          <div style={{ color: '#64748B', fontSize: '11px' }}>
            Rendu fluide Canvas & accélération matérielle GPU
          </div>
        </div>
      )}

      {/* Écran d'erreur avec bouton de recharge */}
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
            zIndex: 10,
          }}
        >
          <div style={{ fontSize: '38px', marginBottom: '8px' }}>⚠️</div>
          <div style={{ color: '#EF4444', fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>
            Échec d'ouverture du document
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
            position: 'sticky',
            bottom: '68px',
            left: '0',
            right: '0',
            margin: '0 12px 12px 12px',
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
              Débloquez la suite complète
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

      {/* Barre d'action mobile Android ergonomique (Zoom -, Page/Total, Zoom +, Plein écran) */}
      {!chargement && !erreur && nombrePagesTotal > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            color: '#FFFFFF',
            padding: '5px 10px',
            borderRadius: '28px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.35)',
            zIndex: 30,
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
          }}
        >
          {/* Zoom - */}
          <button
            onClick={dezoomer}
            disabled={zoomActif <= 0.8}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              color: zoomActif <= 0.8 ? 'rgba(255,255,255,0.3)' : '#FFFFFF',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
            title="Dézoomer"
          >
            −
          </button>

          {/* Indicateur Page & Réinitialisation Zoom */}
          <button
            onClick={reinitialiserZoom}
            style={{
              background: 'none',
              border: 'none',
              color: '#FFFFFF',
              padding: '4px 8px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
            }}
            title="Toucher pour réinitialiser le zoom"
          >
            <span>{pageCourante}/{pagesAutorisees}</span>
            {zoomVisuelPourcent !== 100 && (
              <span
                style={{
                  backgroundColor: 'rgba(56, 189, 248, 0.25)',
                  color: '#38BDF8',
                  padding: '1px 5px',
                  borderRadius: '6px',
                  fontSize: '10px',
                  fontWeight: 800,
                }}
              >
                {zoomVisuelPourcent}%
              </span>
            )}
          </button>

          {/* Zoom + */}
          <button
            onClick={zoomer}
            disabled={zoomActif >= 2.5}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              color: zoomActif >= 2.5 ? 'rgba(255,255,255,0.3)' : '#FFFFFF',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
            title="Zoomer"
          >
            +
          </button>

          {/* Séparateur discret */}
          <div style={{ width: '1px', height: '18px', backgroundColor: 'rgba(255,255,255,0.2)' }} />

          {/* Plein Écran */}
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
            title={estPleinEcran ? 'Quitter plein écran' : 'Plein écran'}
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
