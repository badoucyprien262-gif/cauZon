import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { LecteurPdfProps } from './PdfViewer/types';
import { chargerPdfJs, extrairePdfBytes } from './PdfViewer/pdfjsLoader';
import { LecteurPdfErrorBoundary } from './LecteurPdfDesktop';

/**
 * LecteurPdfAndroid (PWA Mobile Android — Chrome / Samsung Internet)
 * 
 * Spécialement conçu pour surmonter le blocage d'affichage d'<object>/<embed> sur Android Chrome.
 * - Moteur contrôlé PDF.js vectoriel avec rendu Canvas haute performance
 * - Plafond DPR à 2.0 pour préserver la mémoire vive (RAM) et le GPU des smartphones Android
 * - Défilement vertical fluide (-webkit-overflow-scrolling: touch, overscroll-behavior-y: contain)
 * - Virtualisation par IntersectionObserver (lazy-rendering des pages avec marge anticipée de 350px)
 * - Rendu prioritaire instantané de la Page 1
 * - Gestes tactiles : Double-Tap (bascule douce 1.0x <-> 1.8x) & Pinch-to-zoom
 * - Barre d'action ergonomique : Zoom -, Indicateur Page/Total réinitialisable, Zoom +, Mode Plein Écran
 * - Paywall sécurisé avec limitation stricte du nombre de pages visibles
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

  // Gestes tactiles
  const lastTapTimeRef = useRef<number>(0);
  const initialPinchDistRef = useRef<number>(0);
  const initialZoomOnPinchRef = useRef<number>(1.0);
  const isGestureActiveRef = useRef<boolean>(false);

  const sourceCible = pdfUrl || (typeof urlFichier === 'string' ? urlFichier : null);

  const reessayerChargement = useCallback(() => {
    setErreur(null);
    setChargement(true);
    setTentativeKey((k) => k + 1);
    onReessayer?.();
  }, [onReessayer]);

  // Surveillance du mode plein écran
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
      console.warn('[LecteurPdfAndroid] Bascule plein écran non supportée :', e);
    }
  }, []);

  // 🎯 Rendu d'une page Canvas optimisé Android avec plafond DPR strict à 2.0
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

      // Plafond DPR strict à 2.0 sur Android pour éviter la saturation RAM
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

  // Application d'un niveau de zoom (0.8x à 2.5x)
  const appliquerZoom = useCallback((nouveauZoom: number) => {
    const zoomBorne = Number(Math.min(Math.max(nouveauZoom, 0.8), 2.5).toFixed(2));
    setZoomActif(zoomBorne);

    const pagesLayer = pagesLayerRef.current;
    if (!pagesLayer) return;

    // Mise à jour visuelle immédiate des dimensions
    const wrappers = pagesLayer.querySelectorAll<HTMLElement>('.cauzon-page-wrapper');
    wrappers.forEach((w) => {
      const baseW = Number(w.getAttribute('data-base-width')) || baseWidthRef.current || 360;
      const baseH = Number(w.getAttribute('data-base-height')) || baseHeightRef.current || Math.floor(baseW * 1.414);
      w.style.width = `${Math.floor(baseW * zoomBorne)}px`;
      w.style.height = `${Math.floor(baseH * zoomBorne)}px`;
    });

    // Re-rastérisation des pages visibles
    pagesVisiblesRef.current.forEach((num) => {
      rasteriserPageAndroid(num, zoomBorne);
    });
  }, [rasteriserPageAndroid]);

  const zoomer = () => appliquerZoom(zoomActif + 0.25);
  const dezoomer = () => appliquerZoom(zoomActif - 0.25);
  const reinitialiserZoom = () => appliquerZoom(zoomActif !== 1.0 ? 1.0 : 1.5);

  // 🚀 Chargement initial du document PDF via PDF.js
  useEffect(() => {
    let estActif = true;

    async function initialiserDocumentAndroid() {
      try {
        setChargement(true);
        setErreur(null);

        // Si document totalement verrouillé (0 page autorisée)
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

        // Mesure de la largeur utile Android
        const clientW = containerRef.current?.clientWidth || window.innerWidth || 360;
        const utileW = Math.max(280, Math.min(clientW - 16, 768));
        targetWidthRef.current = utileW;

        // Récupération des dimensions de la page 1 pour étalonner
        const premierePage = await pdfDoc.getPage(1);
        const vp1 = premierePage.getViewport({ scale: 1.0 });
        baseWidthRef.current = utileW;
        baseHeightRef.current = Math.floor((utileW * vp1.height) / vp1.width);

        // Construction du conteneur de pages DOM
        const container = containerRef.current;
        if (!container) return;

        container.innerHTML = '';
        const pagesLayer = document.createElement('div');
        pagesLayer.className = 'cauzon-android-pages-layer';
        pagesLayer.style.display = 'flex';
        pagesLayer.style.flexDirection = 'column';
        pagesLayer.style.alignItems = 'center';
        pagesLayer.style.paddingTop = '12px';
        pagesLayer.style.paddingBottom = '80px';
        pagesLayerRef.current = pagesLayer;
        container.appendChild(pagesLayer);

        // Génération des wrappers de pages
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

          // Placeholder de chargement léger
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

        // Rendu prioritaire immédiat de la Page 1 (< 600ms)
        await rasteriserPageAndroid(1, zoomActif);
        if (estActif) setChargement(false);

        // IntersectionObserver pour lazy-rendering optimisé Android
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              const num = Number(entry.target.getAttribute('data-page-number'));
              if (!num) return;

              if (entry.isIntersecting) {
                pagesVisiblesRef.current.add(num);
                const renduScale = renderedScalesMap.current.get(num);
                if (renduScale !== zoomActif) {
                  rasteriserPageAndroid(num, zoomActif);
                }
                // Mise à jour de la page courante au scroll
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

  // Gestion des gestes tactiles Android (Double-Tap et Pinch-to-zoom)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        isGestureActiveRef.current = true;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialPinchDistRef.current = Math.hypot(dx, dy);
        initialZoomOnPinchRef.current = zoomActif;
      } else if (e.touches.length === 1) {
        const now = Date.now();
        if (now - lastTapTimeRef.current < 280) {
          // Double tap : bascule 1.0x <-> 1.8x
          e.preventDefault();
          appliquerZoom(zoomActif < 1.4 ? 1.8 : 1.0);
          lastTapTimeRef.current = 0;
          return;
        }
        lastTapTimeRef.current = now;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && isGestureActiveRef.current) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentDist = Math.hypot(dx, dy);
        if (initialPinchDistRef.current > 0) {
          const ratio = currentDist / initialPinchDistRef.current;
          const tentativeZoom = Math.min(Math.max(initialZoomOnPinchRef.current * ratio, 0.8), 2.5);
          // Prévisualisation fluide en transform direct
          if (pagesLayerRef.current) {
            pagesLayerRef.current.style.transform = `scale(${tentativeZoom / initialZoomOnPinchRef.current})`;
            pagesLayerRef.current.style.transformOrigin = 'center top';
          }
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (isGestureActiveRef.current && e.touches.length < 2) {
        isGestureActiveRef.current = false;
        if (pagesLayerRef.current) {
          const transform = pagesLayerRef.current.style.transform;
          const match = transform.match(/scale\(([^)]+)\)/);
          pagesLayerRef.current.style.transform = '';
          pagesLayerRef.current.style.transformOrigin = '';
          if (match && match[1]) {
            const factor = parseFloat(match[1]);
            if (!isNaN(factor) && factor !== 1.0) {
              appliquerZoom(initialZoomOnPinchRef.current * factor);
            }
          }
        }
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [zoomActif, appliquerZoom]);

  // Si document totalement verrouillé (0 page autorisée)
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
          touch-action: pan-x pan-y pinch-zoom !important;
          overscroll-behavior-y: contain !important;
        }
        @keyframes cauzon-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Conteneur défilant natif tactile Android */}
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
            Rendu fluide Canvas & mémoire maîtrisée
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
            {Math.round(zoomActif * 100) !== 100 && (
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
                {Math.round(zoomActif * 100)}%
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
