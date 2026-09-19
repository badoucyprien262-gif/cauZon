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
    // Vérifier si un script existe déjà
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

  const sourceCible = pdfUrl || (typeof urlFichier === 'string' ? urlFichier : null);

  const reessayerChargement = useCallback(() => {
    setErreur(null);
    setChargement(true);
    setTentativeKey(k => k + 1);
    onReessayer?.();
  }, [onReessayer]);

  useEffect(() => {
    let actif = true;
    let observer: IntersectionObserver | null = null;

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
            // Décodage Base64
            const clean = source.replace(/^data:application\/pdf;base64,/i, '').trim();
            const binary = atob(clean);
            pdfData = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              pdfData[i] = binary.charCodeAt(i);
            }
          } else {
            // Téléchargement sécurisé en ArrayBuffer (évite les restrictions CORS des workers)
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

        // 5. Calcul responsive de la largeur d'affichage & détection WebKit iOS
        const isWebKitIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        const availableWidth = container.clientWidth || window.innerWidth;
        const isMobileScreen = availableWidth < 640;
        const margeLaterale = isMobileScreen ? 12 : 32;
        const targetContainerWidth = Math.min(availableWidth - margeLaterale, 860);

        // Facteur de netteté haute résolution optimisé (évite le dépassement mémoire WebKit sur iOS tout en restant ultra-net)
        const rawDpr = window.devicePixelRatio || 1;
        const dpr = isWebKitIOS ? Math.min(rawDpr, 1.75) : Math.min(rawDpr, 2.0);

        // 6. Rendu de chaque page dans un canvas HTML5 dédié
        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
          if (!actif) return;

          const page = await pdf.getPage(pageNum);
          const unscaledViewport = page.getViewport({ scale: 1.0 });

          const baseScale = targetContainerWidth / unscaledViewport.width;
          const displayWidth = Math.round(unscaledViewport.width * baseScale * scale);
          const displayHeight = Math.round(unscaledViewport.height * baseScale * scale);

          // Résolution physique haute définition
          const renderScale = baseScale * scale * dpr;
          const renderViewport = page.getViewport({ scale: renderScale });

          // Conteneur de la page
          const wrapper = document.createElement('div');
          wrapper.className = 'cauzon-page-wrapper';
          wrapper.setAttribute('data-page', String(pageNum));
          wrapper.style.position = 'relative';
          wrapper.style.width = `${displayWidth}px`;
          wrapper.style.maxWidth = '100%';
          wrapper.style.height = `${displayHeight}px`;
          wrapper.style.marginBottom = isMobileScreen ? '10px' : '20px';
          wrapper.style.backgroundColor = '#FFFFFF';
          wrapper.style.borderRadius = isMobileScreen ? '4px' : '8px';
          wrapper.style.boxShadow = isMobileScreen ? '0 2px 8px rgba(0,0,0,0.1)' : '0 4px 16px rgba(0,0,0,0.12)';
          wrapper.style.overflow = 'hidden';
          wrapper.style.setProperty('-webkit-touch-callout', 'none');
          wrapper.style.setProperty('-webkit-user-select', 'none');

          // Canvas pour le dessin vectoriel
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(renderViewport.width);
          canvas.height = Math.round(renderViewport.height);
          canvas.style.width = '100%';
          canvas.style.height = '100%';
          canvas.style.display = 'block';

          const ctx = canvas.getContext('2d', { alpha: false });
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
          }

          wrapper.appendChild(canvas);
          container.appendChild(wrapper);

          // Rendu asynchrone de la page
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
          }

          // 7. Calque Paywall sur la dernière page autorisée si le document est verrouillé
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

            // Connecter les boutons d'achat
            setTimeout(() => {
              const btnAchat = document.getElementById('cauzon-btn-achat-web');
              const btnVip = document.getElementById('cauzon-btn-vip-web');
              if (btnAchat && onAcheter) btnAchat.onclick = onAcheter;
              if (btnVip && onVip) btnVip.onclick = onVip;
            }, 50);
          }
        }

        // 8. Observer pour détection automatique du numéro de page au scroll
        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                const pageAttr = entry.target.getAttribute('data-page');
                if (pageAttr) {
                  const pNum = parseInt(pageAttr, 10);
                  setPageCourante(pNum);
                  onPageChange?.(pNum, totalPages);
                }
              }
            }
          },
          { root: container, threshold: 0.4 }
        );

        const wrappers = container.querySelectorAll('.cauzon-page-wrapper');
        wrappers.forEach(w => observer?.observe(w));

        setChargement(false);
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
      if (observer) {
        observer.disconnect();
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [sourceCible, urlFichier, estVerrouille, limiteApercuPages, limiteApercuType, limiteApercuValeur, prix, scale, tentativeKey]);

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
      {/* Conteneur de défilement des pages Canvas optimisé WebKit iOS & Android */}
      <div
        ref={containerRef}
        className="cauzon-pdf-scroll-container"
        style={{
          flex: 1,
          width: '100%',
          maxWidth: '100vw',
          height: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
          overscrollBehaviorX: 'none',
          touchAction: 'pan-y pinch-zoom',
          display: chargement || erreur ? 'none' : 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '12px 0 80px 0',
          boxSizing: 'border-box',
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
          <style>{`
            @keyframes cauzon-spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
          <div style={{ color: '#6B1124', fontSize: '14px', fontWeight: 700 }}>
            Chargement direct du document...
          </div>
          <div style={{ color: '#64748B', fontSize: '12px' }}>
            Rendu haute définition en cours
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

      {/* Pillule Flottante de Page sur Web Mobile / Desktop */}
      {!chargement && !erreur && nombrePagesTotal > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(15, 23, 42, 0.88)',
            color: '#FFFFFF',
            padding: '7px 18px',
            borderRadius: '24px',
            fontSize: '12px',
            fontWeight: 800,
            letterSpacing: '0.5px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
            pointerEvents: 'none',
            zIndex: 30,
            backdropFilter: 'blur(6px)',
          }}
        >
          Page {pageCourante} / {nombrePagesTotal}
        </div>
      )}
    </div>
  );
};

export default LecteurPdfWeb;
