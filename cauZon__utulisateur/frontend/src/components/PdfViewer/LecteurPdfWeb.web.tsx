import React, { useEffect, useState, useRef, useCallback } from 'react';

export interface LecteurPdfWebProps {
  documentId?: string;
  urlFichier?: string | Uint8Array | null;
  pdfUrl?: string | null;
  titre?: string;
  estVerrouille?: boolean;
  limiteApercuPages?: number;
  limiteApercuType?: string;
  limiteApercuValeur?: number;
  prix?: number;
  estSombre?: boolean;
  scale?: number;
  onAcheter?: () => void;
  onVip?: () => void;
  onPageChange?: (currentPage: number, totalPages: number) => void;
  onDocumentLoad?: (totalPages: number) => void;
  onError?: (error: any) => void;
  onReessayer?: () => void;
}

export const URL_DOCUMENT_SECOURS =
  'https://wdipnxewpmhdksrlisix.supabase.co/storage/v1/object/public/cours-documents/SUJET_BEPC_2024_PHYSIQUE_CHIMIE_Zone_1.pdf';

const PDFJS_SCRIPT_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
const PDFJS_WORKER_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

/**
 * Charge dynamiquement PDF.js sur la plateforme Web si non encore présent
 */
function chargerPdfJs(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Environnement non navigateur'));

  const win = window as any;
  if (win.pdfjsLib) {
    win.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
    return Promise.resolve(win.pdfjsLib);
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PDFJS_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => {
        if (win.pdfjsLib) {
          win.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
          resolve(win.pdfjsLib);
        } else {
          reject(new Error('PDF.js non initialisé'));
        }
      });
      existing.addEventListener('error', () => reject(new Error('Erreur chargement PDF.js')));
      return;
    }

    const script = document.createElement('script');
    script.src = PDFJS_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (win.pdfjsLib) {
        win.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
        resolve(win.pdfjsLib);
      } else {
        reject(new Error('PDF.js non disponible après injection'));
      }
    };
    script.onerror = () => reject(new Error('Échec du chargement du CDN PDF.js'));
    document.head.appendChild(script);
  });
}

export const LecteurPdfWeb: React.FC<LecteurPdfWebProps> = ({
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

  // État local du Zoom interactif
  const [zoomActif, setZoomActif] = useState<number>(scale || 1.0);

  // Références techniques pour la gestion de la re-rastérisation vectorielle dynamique
  const pdfDocRef = useRef<any>(null);
  const renderTasksRef = useRef<Map<number, any>>(new Map());
  const pagesVisiblesRef = useRef<Set<number>>(new Set([1]));
  const zoomRenduMapRef = useRef<Map<number, number>>(new Map());
  const targetWidthRef = useRef<number>(800);

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

  // Contrôles de zoom fluides
  const zoomer = useCallback(() => {
    setZoomActif(prev => Math.min(Number((prev + 0.25).toFixed(2)), 2.5));
  }, []);

  const dezoomer = useCallback(() => {
    setZoomActif(prev => Math.max(Number((prev - 0.25).toFixed(2)), 0.75));
  }, []);

  const reinitialiserZoom = useCallback(() => {
    setZoomActif(1.0);
  }, []);

  // Fonction centrale pour effectuer la re-rastérisation haute définition d'une page à un zoom donné
  const rasteriserPage = useCallback(async (
    pageNum: number,
    wrapper: HTMLElement,
    zoomScale: number,
    pageInstance?: any
  ) => {
    const pdfDoc = pdfDocRef.current;
    if (!pdfDoc) return;

    // 1. Annuler toute tâche de rendu en cours sur cette page pour éviter les conflits
    if (renderTasksRef.current.has(pageNum)) {
      try {
        renderTasksRef.current.get(pageNum)?.cancel();
      } catch (_) {}
      renderTasksRef.current.delete(pageNum);
    }

    try {
      const page = pageInstance || (await pdfDoc.getPage(pageNum));
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      const isWebKitIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      const rawDpr = window.devicePixelRatio || 1;
      const dpr = isWebKitIOS ? Math.min(rawDpr, 1.75) : Math.min(rawDpr, 2.0);

      const targetWidth = targetWidthRef.current || 800;
      const baseScale = targetWidth / unscaledViewport.width;
      
      // Résolution réelle augmentée du facteur de zoom pour éliminer tout flou
      const resolutionScale = baseScale * zoomScale * dpr;
      const renderViewport = page.getViewport({ scale: resolutionScale });

      // Retirer le placeholder
      const placeholder = wrapper.querySelector('.cauzon-page-placeholder');
      if (placeholder) {
        placeholder.remove();
      }

      // Créer ou récupérer l'élément canvas
      let canvas = wrapper.querySelector('canvas') as HTMLCanvasElement;
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.style.display = 'block';
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.style.aspectRatio = `${renderViewport.width} / ${renderViewport.height}`;
        canvas.style.flexShrink = '0';
        canvas.style.touchAction = 'pan-x pan-y pinch-zoom';
        wrapper.appendChild(canvas);
      }

      // Dimensions physiques en pixels du canvas (buffer bitmap haute définition)
      canvas.width = Math.floor(renderViewport.width);
      canvas.height = Math.floor(renderViewport.height);

      const ctx = canvas.getContext('2d', { alpha: false });
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const renderTask = page.render({
          canvasContext: ctx,
          viewport: renderViewport,
        });

        renderTasksRef.current.set(pageNum, renderTask);

        try {
          await renderTask.promise;
          zoomRenduMapRef.current.set(pageNum, zoomScale);
        } catch (renderErr: any) {
          if (renderErr?.name === 'RenderingCancelledException') {
            // Annulation normale déclenchée par un zoom ou défilement plus récent
            return;
          }
          throw renderErr;
        } finally {
          if (renderTasksRef.current.get(pageNum) === renderTask) {
            renderTasksRef.current.delete(pageNum);
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn(`[LecteurPdfWeb] Échec re-rastérisation page ${pageNum} :`, err);
      }
    }
  }, []);

  // 🚀 Réponse immédiate CSS (60/120 FPS) + Re-rastérisation vectorielle temporisée (Debounce 250ms)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Réponse visuelle instantanée : redimensionnement CSS des wrappers
    const wrappers = container.querySelectorAll<HTMLElement>('.cauzon-page-wrapper');
    wrappers.forEach(w => {
      if (zoomActif > 1.0) {
        w.style.width = `${Math.round(zoomActif * 100)}%`;
        w.style.maxWidth = 'none';
      } else if (zoomActif === 1.0) {
        w.style.width = '100%';
        w.style.maxWidth = '800px';
      } else {
        w.style.width = `${Math.round(zoomActif * 100)}%`;
        w.style.maxWidth = `${Math.round(800 * zoomActif)}px`;
      }
    });

    // 2. Debounce de 250ms : re-rastérisation vectorielle HD des pages visibles
    const timer = setTimeout(() => {
      if (!pdfDocRef.current) return;

      pagesVisiblesRef.current.forEach(pNum => {
        const wrapper = container.querySelector<HTMLElement>(`.cauzon-page-wrapper[data-page="${pNum}"]`);
        if (wrapper) {
          const dernierZoomRendu = zoomRenduMapRef.current.get(pNum) || 1.0;
          if (dernierZoomRendu !== zoomActif) {
            rasteriserPage(pNum, wrapper, zoomActif);
          }
        }
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [zoomActif, rasteriserPage]);

  // Chargement initial du PDF & Rendu Prioritaire Page 1
  useEffect(() => {
    let actif = true;
    let lazyObserver: IntersectionObserver | null = null;
    let pageObserver: IntersectionObserver | null = null;

    async function rendrePdf() {
      try {
        setChargement(true);
        setErreur(null);

        // 1. Charger la bibliothèque PDF.js
        const pdfjsLib = await chargerPdfJs();
        if (!actif) return;

        // 2. Préparer les données binaires du PDF
        let pdfData: Uint8Array;

        if (urlFichier instanceof Uint8Array) {
          pdfData = urlFichier;
        } else {
          const source = sourceCible || URL_DOCUMENT_SECOURS;

          if (source.startsWith('data:application/pdf') || (!source.startsWith('http') && !source.startsWith('blob:') && source.length > 500)) {
            const clean = source.replace(/^data:application\/pdf;base64,/i, '').trim();
            const binary = atob(clean);
            pdfData = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              pdfData[i] = binary.charCodeAt(i);
            }
          } else {
            try {
              const res = await fetch(source);
              if (!res.ok) {
                if (source !== URL_DOCUMENT_SECOURS) {
                  console.warn(`[LecteurPdfWeb] HTTP ${res.status} sur ${source} -> Repli sur le document modèle.`);
                  const resSecours = await fetch(URL_DOCUMENT_SECOURS);
                  if (resSecours.ok) {
                    const buf = await resSecours.arrayBuffer();
                    pdfData = new Uint8Array(buf);
                  } else {
                    throw new Error(`HTTP ${res.status}`);
                  }
                } else {
                  throw new Error(`HTTP ${res.status}`);
                }
              } else {
                const buf = await res.arrayBuffer();
                pdfData = new Uint8Array(buf);
              }
            } catch (fetchErr) {
              console.warn('[LecteurPdfWeb] Fetch direct échoué, tentative fallback secours :', fetchErr);
              const resSecours = await fetch(URL_DOCUMENT_SECOURS);
              if (resSecours.ok) {
                const buf = await resSecours.arrayBuffer();
                pdfData = new Uint8Array(buf);
              } else {
                throw fetchErr;
              }
            }
          }
        }

        if (!actif) return;

        // 3. Charger le document PDF avec PDF.js
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

        // 4. Calcul de la limitation d'aperçu gratuit
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
            if (rawAllowed < 1) {
              maxPages = 1;
              targetCutoffPage = 1;
              percentOnTargetPage = Math.max(20, Math.round(rawAllowed * 100));
            } else {
              maxPages = Math.min(Math.ceil(rawAllowed), totalPages);
              targetCutoffPage = maxPages;
              const frac = rawAllowed - Math.floor(rawAllowed);
              percentOnTargetPage = frac > 0 ? Math.round(frac * 100) : 0;
            }
            overlayTitle = `Aperçu gratuit (${pct}%) terminé`;
          }
        }

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        // 5. Calcul responsive de référence avec la Page 1
        const availableWidth = container.clientWidth || window.innerWidth;
        const isMobileScreen = availableWidth < 640;
        const margeLaterale = isMobileScreen ? 12 : 32;
        const targetContainerWidth = Math.min(availableWidth - margeLaterale, 860);
        targetWidthRef.current = targetContainerWidth;

        // Récupérer la Page 1 immédiatement pour extraire le ratio universel
        const page1 = await pdf.getPage(1);
        if (!actif) return;

        const unscaledViewport1 = page1.getViewport({ scale: 1.0 });
        const baseScale = targetContainerWidth / unscaledViewport1.width;
        const defaultDisplayWidth = Math.round(unscaledViewport1.width * baseScale);
        const defaultDisplayHeight = Math.round(unscaledViewport1.height * baseScale);
        const defaultAspectRatioStr = `${unscaledViewport1.width} / ${unscaledViewport1.height}`;

        // 6. Création immédiate de la structure de tous les wrappers (Placeholders légers)
        const wrappersElements: HTMLElement[] = [];

        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
          const wrapper = document.createElement('div');
          wrapper.className = 'cauzon-page-wrapper';
          wrapper.setAttribute('data-page', String(pageNum));
          wrapper.style.display = 'block';
          wrapper.style.position = 'relative';
          wrapper.style.width = zoomActif > 1.0 ? `${Math.round(zoomActif * 100)}%` : '100%';
          wrapper.style.maxWidth = zoomActif > 1.0 ? 'none' : `${Math.min(defaultDisplayWidth, 800)}px`;
          wrapper.style.margin = isMobileScreen ? '0 auto 12px auto' : '0 auto 16px auto';
          wrapper.style.flexShrink = '0';
          wrapper.style.boxSizing = 'border-box';
          wrapper.style.backgroundColor = '#FFFFFF';
          wrapper.style.borderRadius = isMobileScreen ? '4px' : '8px';
          wrapper.style.boxShadow = isMobileScreen ? '0 2px 8px rgba(0,0,0,0.1)' : '0 4px 16px rgba(0,0,0,0.12)';
          wrapper.style.overflow = 'hidden';
          wrapper.style.setProperty('-webkit-touch-callout', 'none');
          wrapper.style.setProperty('-webkit-user-select', 'none');
          wrapper.style.touchAction = 'pan-x pan-y pinch-zoom';

          // Placeholder initial pour conserver la hauteur exacte avant rendu
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

          // 7. Calque Paywall si applicable sur la page cutoff
          if (estVerrouille && pageNum === targetCutoffPage) {
            const overlay = document.createElement('div');
            overlay.style.position = 'absolute';
            overlay.style.left = '0';
            overlay.style.right = '0';
            overlay.style.bottom = '0';
            overlay.style.top = `${percentOnTargetPage}%`;
            overlay.style.background = 'linear-gradient(to bottom, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.98) 35%, rgba(255,255,255,1) 100%)';
            overlay.style.backdropFilter = 'blur(8px)';
            overlay.style.setProperty('-webkit-backdrop-filter', 'blur(8px)');
            overlay.style.display = 'flex';
            overlay.style.flexDirection = 'column';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.padding = isMobileScreen ? '16px' : '28px';
            overlay.style.zIndex = '20';

            const card = document.createElement('div');
            card.style.backgroundColor = '#FFFFFF';
            card.style.borderRadius = '16px';
            card.style.padding = isMobileScreen ? '18px 14px' : '24px';
            card.style.boxShadow = '0 10px 30px rgba(107, 17, 36, 0.18)';
            card.style.border = '1px solid rgba(107, 17, 36, 0.12)';
            card.style.textAlign = 'center';
            card.style.maxWidth = '380px';
            card.style.width = '100%';

            card.innerHTML = `
              <div style="font-size: 32px; margin-bottom: 8px;">🔒</div>
              <div style="color: #6B1124; font-size: ${isMobileScreen ? '15px' : '17px'}; font-weight: 800; margin-bottom: 6px;">
                ${overlayTitle}
              </div>
              <div style="color: #64748B; font-size: ${isMobileScreen ? '12px' : '13px'}; line-height: 1.45; margin-bottom: 16px;">
                Débloquez l'intégralité du cours de <strong>${totalPages} pages</strong> pour poursuivre vos révisions sans interruption.
              </div>
              <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
                <button id="cauzon-btn-achat-web" style="background-color: #6B1124; color: #FFFFFF; border: none; padding: 12px 16px; border-radius: 12px; font-weight: 800; font-size: 13px; cursor: pointer; box-shadow: 0 4px 12px rgba(107, 17, 36, 0.25);">
                  🛒 Débloquer (${prix} FCFA)
                </button>
                <button id="cauzon-btn-vip-web" style="background-color: #D97706; color: #FFFFFF; border: none; padding: 11px 16px; border-radius: 12px; font-weight: 800; font-size: 13px; cursor: pointer;">
                  🎁 Pass VIP (500 FCFA)
                </button>
              </div>
            `;

            overlay.appendChild(card);
            wrapper.appendChild(overlay);

            setTimeout(() => {
              const btnAchat = document.getElementById('cauzon-btn-achat-web');
              const btnVip = document.getElementById('cauzon-btn-vip-web');
              if (btnAchat && onAcheter) btnAchat.onclick = onAcheter;
              if (btnVip && onVip) btnVip.onclick = onVip;
            }, 50);
          }

          container.appendChild(wrapper);
          wrappersElements.push(wrapper);
        }

        // 🚀 8. RENDU PRIORITAIRE INSTANTANÉ DE LA PAGE 1 (< 800 ms)
        await rasteriserPage(1, wrappersElements[0], zoomActif, page1);
        if (!actif) return;

        // Déverrouillage immédiat de l'affichage
        setChargement(false);

        // 9. LAZY-RENDERING DES PAGES SUIVANTES VIA INTERSECTION OBSERVER
        lazyObserver = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                const pageAttr = entry.target.getAttribute('data-page');
                if (pageAttr) {
                  const pNum = parseInt(pageAttr, 10);
                  const dernierZoomRendu = zoomRenduMapRef.current.get(pNum);
                  if (dernierZoomRendu === undefined || dernierZoomRendu !== zoomActif) {
                    rasteriserPage(pNum, entry.target as HTMLElement, zoomActif);
                  }
                }
              }
            }
          },
          { root: container, rootMargin: '600px 0px 600px 0px' }
        );

        wrappersElements.forEach(w => lazyObserver?.observe(w));

        // 10. OBSERVER DE SUIVI DES PAGES VISIBLES (POUR LE RE-ZOOM CIBLÉ & LA PASTILLE)
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
          { root: container, threshold: 0.1 }
        );

        wrappersElements.forEach(w => pageObserver?.observe(w));
      } catch (err: any) {
        console.error('[LecteurPdfWeb] Erreur lors du rendu Canvas PDF.js :', err);
        if (actif) {
          setErreur(err?.message || 'Impossible d\'afficher le document.');
          setChargement(false);
          onError?.(err);
        }
      }
    }

    rendrePdf();

    return () => {
      actif = false;
      if (lazyObserver) lazyObserver.disconnect();
      if (pageObserver) pageObserver.disconnect();

      // Annuler toutes les tâches de rendu en cours
      renderTasksRef.current.forEach(task => {
        try { task?.cancel(); } catch (_) {}
      });
      renderTasksRef.current.clear();
      pagesVisiblesRef.current.clear();
      zoomRenduMapRef.current.clear();

      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [sourceCible, urlFichier, estVerrouille, limiteApercuPages, limiteApercuType, limiteApercuValeur, prix, tentativeKey, rasteriserPage]);

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
        overscrollBehavior: 'none',
      }}
    >
      {/* Règles CSS strictes garantissant le respect du ratio A4, lazy rendering et touch-action pour le zoom */}
      <style>{`
        .cauzon-pdf-scroll-container {
          display: block !important;
          width: 100% !important;
          height: 100% !important;
          overflow-y: scroll !important;
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch !important;
          touch-action: pan-x pan-y pinch-zoom !important;
          padding-bottom: 120px !important;
          box-sizing: border-box !important;
          overscroll-behavior-y: contain !important;
        }
        .cauzon-page-wrapper {
          display: block !important;
          width: 100% !important;
          max-width: 800px;
          margin: 0 auto 16px auto !important;
          flex-shrink: 0 !important;
          box-sizing: border-box !important;
          position: relative !important;
          touch-action: pan-x pan-y pinch-zoom !important;
        }
        .cauzon-page-wrapper canvas {
          display: block !important;
          width: 100% !important;
          height: auto !important;
          flex-shrink: 0 !important;
          touch-action: pan-x pan-y pinch-zoom !important;
        }
        @keyframes cauzon-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Conteneur de défilement des pages Canvas optimisé WebKit iOS & Android */}
      <div
        ref={containerRef}
        className="cauzon-pdf-scroll-container"
        style={{
          display: chargement || erreur ? 'none' : 'block',
          width: '100%',
          height: '100%',
          overflowY: 'scroll',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-x pan-y pinch-zoom',
          padding: '12px 12px 120px 12px',
          boxSizing: 'border-box',
          overscrollBehaviorY: 'contain',
        }}
      />

      {/* Indicateur de Chargement Réactif */}
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
              width: '38px',
              height: '38px',
              border: '3.5px solid rgba(107, 17, 36, 0.15)',
              borderTopColor: '#6B1124',
              borderRadius: '50%',
              animation: 'cauzon-spin 0.8s linear infinite',
            }}
          />
          <div style={{ color: '#6B1124', fontSize: '14px', fontWeight: 700 }}>
            Ouverture immédiate du cours...
          </div>
          <div style={{ color: '#64748B', fontSize: '12px' }}>
            Rendu haute fidélité vectoriel
          </div>
        </div>
      )}

      {/* Écran d'Erreur avec bouton Réessayer */}
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
          <div style={{ fontSize: '36px' }}>⚠️</div>
          <div style={{ color: '#0F172A', fontSize: '16px', fontWeight: 700 }}>
            Impossible d'ouvrir le document
          </div>
          <div style={{ color: '#64748B', fontSize: '13px', maxWidth: '320px', lineHeight: 1.4 }}>
            {erreur}
          </div>
          <button
            onClick={reessayerChargement}
            style={{
              marginTop: '8px',
              padding: '10px 20px',
              borderRadius: '10px',
              backgroundColor: '#6B1124',
              color: '#FFFFFF',
              border: 'none',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(107, 17, 36, 0.25)',
            }}
          >
            🔄 Réessayer
          </button>
        </div>
      )}

      {/* Barre d'Outils Flottante Unifiée : Pagination & Contrôles de Zoom */}
      {!chargement && !erreur && nombrePagesTotal > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(15, 23, 42, 0.90)',
            color: '#FFFFFF',
            padding: '4px 8px',
            borderRadius: '28px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
            zIndex: 30,
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
          }}
        >
          {/* Bouton Dézoomer */}
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
              fontSize: '17px',
              fontWeight: 800,
              lineHeight: 1,
            }}
            title="Dézoomer (-)"
          >
            −
          </button>

          {/* Pastille Page & Indicateur de Zoom Réinitialisable */}
          <button
            onClick={reinitialiserZoom}
            style={{
              background: 'none',
              border: 'none',
              color: '#FFFFFF',
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              letterSpacing: '0.3px',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Cliquer pour réinitialiser à 100%"
          >
            <span>Page {pageCourante} / {nombrePagesTotal}</span>
            {zoomActif !== 1.0 && (
              <span
                style={{
                  backgroundColor: 'rgba(56, 189, 248, 0.20)',
                  color: '#38BDF8',
                  padding: '1px 6px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 800,
                }}
              >
                {Math.round(zoomActif * 100)}%
              </span>
            )}
          </button>

          {/* Bouton Zoomer */}
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
              fontSize: '17px',
              fontWeight: 800,
              lineHeight: 1,
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

export default LecteurPdfWeb;
