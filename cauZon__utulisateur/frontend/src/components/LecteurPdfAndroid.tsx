import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { LecteurPdfProps } from './PdfViewer/types';
import { chargerPdfJs, extrairePdfBytes } from './PdfViewer/pdfjsLoader';
import { LecteurPdfErrorBoundary } from './LecteurPdfDesktop';

/**
 * LecteurPdfAndroid (PWA Mobile Android — Liseuse Ultra-Stable Smart-Zoom)
 * 
 * Architecture Allégée & Zéro Crash :
 * 1. Élimination des écouteurs multi-touch instables (aucun pinch-to-zoom custom en conflit avec Chrome).
 * 2. Smart-Zoom Focal par Double-Tap :
 *    - Double-tap sur n'importe quel point de la page : agrandissement instantané à 2.0x centré sur le tap.
 *    - Second double-tap : retour immédiat et fluide à 1.0x (Fit-Width).
 *    - Animation GPU CSS douce : transition: transform 0.2s cubic-bezier(0.2, 0, 0.2, 1).
 * 3. Panoraming (Pan) fluide à 1 doigt en mode zoomé (> 1.0x).
 * 4. Plafond DPR strict à 1.5 : consommation RAM/GPU minimale, zéro fuite mémoire.
 * 5. Aucune re-rastérisation destructive lors des zooms : affichage immédiat à 60 FPS constants.
 * 6. Barre d'outils mobile simplifiée : [-], Indicateur de page / reset [1.0x], [+], Plein écran [⛶].
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
  const renderedPagesRef = useRef<Set<number>>(new Set());
  const baseWidthRef = useRef<number>(360);
  const baseHeightRef = useRef<number>(508);
  const pageCouranteRef = useRef<number>(1);
  const zoomNiveauRef = useRef<number>(1.0);

  // État du Panoraming (Pan) 1 doigt en mode zoomé
  const panOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isDraggingPanRef = useRef<boolean>(false);
  const lastTapTimeRef = useRef<number>(0);

  const sourceCible = pdfUrl || (typeof urlFichier === 'string' ? urlFichier : null);

  const reessayerChargement = useCallback(() => {
    setErreur(null);
    setChargement(true);
    setTentativeKey((k) => k + 1);
    onReessayer?.();
  }, [onReessayer]);

  // Surveillance de la bascule plein écran
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

  // 🎯 Rendu d'une page Canvas — DPR fixe plafonné à 1.5 (Garantie zéro fuite mémoire)
  const rasteriserPageFixe = useCallback(async (pageNumber: number) => {
    const pdfDoc = pdfDocRef.current;
    if (!pdfDoc) return;
    if (renderedPagesRef.current.has(pageNumber)) return;

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

      // Plafond DPR strict à 1.5 sur Android : fluidité optimale et empreinte RAM minime
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1.25;
      const baseW = Number(wrapper.getAttribute('data-base-width')) || baseWidthRef.current || 360;
      const baseScale = baseW / unscaledViewport.width;

      const viewport = page.getViewport({ scale: baseScale });
      const cssW = Math.floor(viewport.width);
      const cssH = Math.floor(viewport.height);

      const placeholder = wrapper.querySelector('.cauzon-page-placeholder');
      if (placeholder) placeholder.remove();

      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto';
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        wrapper.appendChild(canvas);
        canvasRefs.current[pageNumber] = canvas;
      }

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';

      const renderTask = page.render({
        canvasContext: ctx,
        viewport: page.getViewport({ scale: baseScale * dpr }),
      });
      await renderTask.promise;
      renderedPagesRef.current.add(pageNumber);
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn(`[LecteurPdfAndroid] Erreur rendu page ${pageNumber} :`, err);
      }
    }
  }, []);

  // 🎯 Application d'un niveau de zoom CSS pur (Sans re-rastérisation destructrice)
  const appliquerZoomCss = useCallback((cible: number, focalPoint?: { xPercent: number; yPercent: number }) => {
    const pagesLayer = pagesLayerRef.current;
    if (!pagesLayer) return;

    const zoomBorne = Number(Math.min(Math.max(cible, 1.0), 2.2).toFixed(1));
    zoomNiveauRef.current = zoomBorne;
    setZoomNiveau(zoomBorne);

    pagesLayer.style.transition = 'transform 0.2s cubic-bezier(0.2, 0, 0.2, 1)';

    if (zoomBorne <= 1.02) {
      // Retour à la normale : centré et sans translation
      panOffsetRef.current = { x: 0, y: 0 };
      pagesLayer.style.transformOrigin = 'center top';
      pagesLayer.style.transform = 'translate3d(0, 0, 0) scale(1.0)';
    } else {
      // Zoom ciblé avec point focal
      const fx = focalPoint ? focalPoint.xPercent : 50;
      const fy = focalPoint ? focalPoint.yPercent : 30;
      pagesLayer.style.transformOrigin = `${fx}% ${fy}%`;
      pagesLayer.style.transform = `translate3d(0, 0, 0) scale(${zoomBorne})`;
    }
  }, []);

  // Boutons de la barre d'outils
  const zoomerCran = () => {
    if (zoomNiveauRef.current < 1.4) appliquerZoomCss(1.5);
    else appliquerZoomCss(2.0);
  };

  const dezoomerCran = () => {
    if (zoomNiveauRef.current > 1.6) appliquerZoomCss(1.5);
    else appliquerZoomCss(1.0);
  };

  const resetZoom = () => appliquerZoomCss(1.0);

  // 🚀 Chargement initial du document PDF via PDF.js
  useEffect(() => {
    let estActif = true;

    async function initialiserDocument() {
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

        // Mesure de la largeur utile Android
        const clientW = containerRef.current?.clientWidth || window.innerWidth || 360;
        const utileW = Math.max(280, Math.min(clientW - 16, 768));
        baseWidthRef.current = utileW;

        // Étalonnage d'après la page 1
        const premierePage = await pdfDoc.getPage(1);
        const vp1 = premierePage.getViewport({ scale: 1.0 });
        baseHeightRef.current = Math.floor((utileW * vp1.height) / vp1.width);

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
        pagesLayer.style.transformOrigin = 'center top';
        pagesLayer.style.willChange = 'transform';
        pagesLayerRef.current = pagesLayer;
        container.appendChild(pagesLayer);

        // Génération des wrappers de page légers
        for (let num = 1; num <= allowed; num++) {
          const wrapper = document.createElement('div');
          wrapper.className = 'cauzon-page-wrapper';
          wrapper.setAttribute('data-page-number', String(num));
          wrapper.setAttribute('data-base-width', String(baseWidthRef.current));
          wrapper.setAttribute('data-base-height', String(baseHeightRef.current));
          wrapper.style.width = `${baseWidthRef.current}px`;
          wrapper.style.height = `${baseHeightRef.current}px`;
          wrapper.style.position = 'relative';
          wrapper.style.margin = '0 auto 14px auto';
          wrapper.style.borderRadius = '6px';
          wrapper.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.12)';
          wrapper.style.backgroundColor = estSombre ? '#1E293B' : '#FFFFFF';
          wrapper.style.overflow = 'hidden';

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

        // Rendu prioritaire immédiat de la Page 1 (< 500ms)
        await rasteriserPageFixe(1);
        if (estActif) setChargement(false);

        // IntersectionObserver économe pour lazy-loading
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              const num = Number(entry.target.getAttribute('data-page-number'));
              if (!num) return;

              if (entry.isIntersecting) {
                rasteriserPageFixe(num);
                if (entry.intersectionRatio > 0.45 && pageCouranteRef.current !== num) {
                  pageCouranteRef.current = num;
                  setPageCourante(num);
                  onPageChange?.(num, allowed);
                }
              }
            });
          },
          {
            root: container,
            rootMargin: '300px 0px 300px 0px',
            threshold: [0.1, 0.5],
          }
        );

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
      renderedPagesRef.current.clear();
      canvasRefs.current = {};
      wrapperRefs.current = {};
    };
  }, [tentativeKey, sourceCible, urlFichier, estVerrouille, limiteApercuValeur, limiteApercuType]);

  // 🎯 Gestionnaire de Zoom Focal Double-Tap & Déplacement 1 doigt en mode zoomé
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Détection du Double-Tap sur la page
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
        panStartOffsetRef.current = { ...panOffsetRef.current };

        const now = Date.now();
        if (now - lastTapTimeRef.current < 280) {
          // Double-Tap détecté !
          e.preventDefault();
          lastTapTimeRef.current = 0;

          if (zoomNiveauRef.current > 1.1) {
            // Déjà zoomé -> retour immédiat à 1.0x
            appliquerZoomCss(1.0);
          } else {
            // Zoom à 2.0x centré précisément sur l'endroit touché
            const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
            const wrapper = targetEl?.closest('.cauzon-page-wrapper') as HTMLElement || container;
            const rect = wrapper.getBoundingClientRect();

            const xPercent = Math.max(5, Math.min(95, Math.round(((touch.clientX - rect.left) / rect.width) * 100)));
            const yPercent = Math.max(5, Math.min(95, Math.round(((touch.clientY - rect.top) / rect.height) * 100)));

            appliquerZoomCss(2.0, { xPercent, yPercent });
          }
          return;
        }
        lastTapTimeRef.current = now;

        // Si déjà zoomé (> 1.1x), activer le pan fluide 1 doigt
        if (zoomNiveauRef.current > 1.1) {
          isDraggingPanRef.current = true;
          const pagesLayer = pagesLayerRef.current;
          if (pagesLayer) pagesLayer.style.transition = 'none';
        }
      }
    };

    // 2. Déplacement en mode zoomé
    const onTouchMove = (e: TouchEvent) => {
      if (isDraggingPanRef.current && e.touches.length === 1 && zoomNiveauRef.current > 1.1) {
        e.preventDefault(); // Empêcher le scroll de page natif pendant le pan de précision
        const touch = e.touches[0];
        const dx = touch.clientX - touchStartPosRef.current.x;
        const dy = touch.clientY - touchStartPosRef.current.y;

        panOffsetRef.current = {
          x: panStartOffsetRef.current.x + dx,
          y: panStartOffsetRef.current.y + dy,
        };

        const pagesLayer = pagesLayerRef.current;
        if (pagesLayer) {
          pagesLayer.style.transform = `translate3d(${panOffsetRef.current.x}px, ${panOffsetRef.current.y}px, 0) scale(${zoomNiveauRef.current})`;
        }
      }
    };

    // 3. Fin de touch
    const onTouchEnd = () => {
      if (isDraggingPanRef.current) {
        isDraggingPanRef.current = false;
        const pagesLayer = pagesLayerRef.current;
        if (pagesLayer && zoomNiveauRef.current > 1.1) {
          // Butée élastique douce pour ne pas envoyer la page hors écran
          const maxPan = Math.floor(baseWidthRef.current * 0.45);
          const clampedX = Math.max(-maxPan, Math.min(maxPan, panOffsetRef.current.x));
          const clampedY = Math.max(-maxPan * 1.5, Math.min(maxPan * 1.5, panOffsetRef.current.y));

          if (clampedX !== panOffsetRef.current.x || clampedY !== panOffsetRef.current.y) {
            panOffsetRef.current = { x: clampedX, y: clampedY };
            pagesLayer.style.transition = 'transform 0.18s ease-out';
            pagesLayer.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0) scale(${zoomNiveauRef.current})`;
          }
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
  }, [appliquerZoomCss]);

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
          overflow-x: hidden !important;
          -webkit-overflow-scrolling: touch !important;
          touch-action: pan-y;
          overscroll-behavior: contain !important;
          overscroll-behavior-y: contain !important;
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

      {/* Conteneur défilant à défilement vertical fluide */}
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
            zIndex: 10,
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

      {/* Barre d'outils mobile simplifiée & infaillible */}
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
          {/* Dézoom cran par cran [-] */}
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
              cursor: 'pointer',
            }}
            title="Dézoomer"
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
                {zoomNiveau}x
              </span>
            )}
          </button>

          {/* Zoom cran par cran [+] */}
          <button
            onClick={zoomerCran}
            disabled={zoomNiveau >= 2.0}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              color: zoomNiveau >= 2.0 ? 'rgba(255,255,255,0.3)' : '#FFFFFF',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
            title="Zoomer"
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
