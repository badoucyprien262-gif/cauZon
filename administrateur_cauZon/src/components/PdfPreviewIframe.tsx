import React, { useRef, useEffect, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface PdfPreviewIframeProps {
  pdfUrl: string;
  cutoffType: string;
  cutoffValue: number;
  onCutoffChange?: (newType: string, newValue: number, targetPage?: number, offsetPct?: number) => void;
}

function generateSrcDoc(pdfUrl: string, initialType: string, initialValeur: number): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"><\/script>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #E2E8F0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #viewer-container {
      width: 100%;
      height: 100%;
      overflow: auto;
      padding: 24px 16px 100px;
      display: flex;
      flex-direction: column;
      align-items: center;
      -webkit-overflow-scrolling: touch;
    }
    #canvas-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      transition: transform 0.1s ease-out;
      transform-origin: top center;
      max-width: 100%;
      position: relative;
    }
    .page-wrapper {
      position: relative;
      margin-bottom: 24px;
      box-shadow: 0 6px 20px rgba(0,0,0,0.18);
      background: #FFFFFF;
      border-radius: 4px;
      overflow: hidden;
      transition: opacity 0.2s ease;
      max-width: 100%;
    }
    canvas {
      display: block;
      max-width: 100%;
      height: auto !important;
    }
    .page-number-tag {
      position: absolute;
      top: 8px;
      left: 8px;
      background: rgba(0,0,0,0.75);
      color: #FFF;
      font-size: 10px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      z-index: 10;
      pointer-events: none;
    }

    /* Grab Area on FULL width of line */
    .cutoff-line-pourcentage {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      border-top: 4px solid #E74C3C;
      z-index: 60;
      background: linear-gradient(to bottom, rgba(231, 76, 60, 0.35) 0%, rgba(231, 76, 60, 0.7) 100%);
      backdrop-filter: blur(4px);
      cursor: ns-resize;
      user-select: none;
      touch-action: none;
      pointer-events: auto;
      transition: border-color 0.15s;
    }
    .cutoff-line-pourcentage:hover {
      border-top-color: #6B1124;
      border-top-width: 5px;
    }

    .cutoff-grab-bar {
      position: absolute;
      top: -14px;
      left: 0;
      right: 0;
      height: 28px;
      cursor: ns-resize;
      z-index: 70;
      display: flex;
      align-items: center;
      justify-content: center;
      user-select: none;
      touch-action: none;
      pointer-events: auto;
    }
    .cutoff-grab-bar:hover {
      background: rgba(231, 76, 60, 0.12);
    }
    .cutoff-grab-bar:hover .cutoff-drag-handle {
      background: #E74C3C;
      transform: scale(1.06);
    }

    .cutoff-drag-handle {
      background: #6B1124;
      color: #FAF6EB;
      font-size: 11px;
      font-weight: 800;
      padding: 6px 16px;
      border-radius: 24px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.4);
      border: 2px solid #FAF6EB;
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: ns-resize;
      white-space: nowrap;
      pointer-events: none;
      transition: background-color 0.15s, transform 0.15s;
    }

    .cutoff-banner-page {
      width: 100%;
      border-top: 4px solid #E74C3C;
      margin: 12px 0 24px;
      position: relative;
      cursor: ns-resize;
      user-select: none;
      touch-action: none;
      pointer-events: auto;
    }
    .cutoff-banner-page:hover {
      border-top-color: #6B1124;
      border-top-width: 5px;
    }

    .page-locked-mask {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(231, 76, 60, 0.38);
      backdrop-filter: blur(6px);
      z-index: 40;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #FFFFFF;
      font-weight: 800;
      font-size: 15px;
      text-shadow: 0 2px 4px rgba(0,0,0,0.6);
      pointer-events: none;
    }
    #loader {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px 20px;
      color: #6B1124;
      font-weight: 700;
      font-size: 14px;
      gap: 12px;
    }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid rgba(107, 17, 36, 0.2);
      border-top-color: #6B1124;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="viewer-container">
    <div id="loader"><div class="spinner"></div><span>Chargement du document PDF…</span></div>
    <div id="canvas-wrapper"></div>
  </div>

  <script>
    const url = '${pdfUrl}';
    let currentCutoffType = '${initialType}';
    let currentCutoffValue = ${initialValeur};
    let currentZoom = 1.0;
    let loadedPages = [];
    let isPdfLoaded = false;
    let isDraggingCutoff = false;

    const viewerContainer = document.getElementById('viewer-container');
    const canvasWrapper = document.getElementById('canvas-wrapper');

    try {
      if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
      }
    } catch (e) {
      console.warn('Worker fallback', e);
    }

    function applyZoom(scale) {
      currentZoom = Math.max(0.5, Math.min(2.0, Math.round(scale * 100) / 100));
      if (canvasWrapper) {
        canvasWrapper.style.transform = 'scale(' + currentZoom + ')';
      }
    }

    // Drag-and-Drop Cutoff Line handlers
    function handleDragStart(e) {
      isDraggingCutoff = true;
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      if (e.stopPropagation) e.stopPropagation();
    }

    function handleDragMove(e) {
      if (!isDraggingCutoff || !canvasWrapper || !loadedPages.length) return;
      const rect = canvasWrapper.getBoundingClientRect();
      const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
      if (!clientY) return;

      const relativeY = clientY - rect.top;
      const totalHeight = rect.height;

      if (totalHeight <= 0) return;

      if (currentCutoffType === 'page') {
        const rawPage = Math.round((relativeY / totalHeight) * loadedPages.length);
        const newPage = Math.max(0, Math.min(loadedPages.length, rawPage));
        if (newPage !== currentCutoffValue) {
          currentCutoffValue = newPage;
          applyCutoff();
          try {
            window.parent.postMessage({
              type: 'CUTOFF_DRAGGED',
              cutoffType: 'page',
              cutoffValue: currentCutoffValue,
              targetPage: newPage,
              offsetPct: 0
            }, '*');
          } catch(err) {}
        }
      } else if (currentCutoffType === 'pourcentage') {
        const pct = Math.max(0, Math.min(100, Math.round((relativeY / totalHeight) * 100)));
        if (pct !== currentCutoffValue) {
          currentCutoffValue = pct;
          applyCutoff();
          try {
            window.parent.postMessage({
              type: 'CUTOFF_DRAGGED',
              cutoffType: 'pourcentage',
              cutoffValue: currentCutoffValue,
              offsetPct: pct
            }, '*');
          } catch(err) {}
        }
      } else {
        // MODE FLUIDE / NEUTRE : Localisation absolue (Page cible exacte + Hauteur relative sur cette page)
        let cumHeight = 0;
        let targetPage = 1;
        let offsetPctOnPage = 0;

        for (let i = 0; i < loadedPages.length; i++) {
          const p = loadedPages[i];
          const pageTop = cumHeight;
          const pageBottom = cumHeight + p.height;

          if (relativeY >= pageTop && relativeY <= pageBottom) {
            targetPage = p.pageNum;
            offsetPctOnPage = Math.max(0, Math.min(100, Math.round(((relativeY - pageTop) / p.height) * 1000) / 10));
            break;
          } else if (relativeY > pageBottom && i === loadedPages.length - 1) {
            targetPage = p.pageNum;
            offsetPctOnPage = 100;
          }
          cumHeight += p.height;
        }

        currentCutoffType = 'fluide:' + targetPage + ':' + offsetPctOnPage;
        currentCutoffValue = offsetPctOnPage;
        applyCutoff();

        try {
          window.parent.postMessage({
            type: 'CUTOFF_DRAGGED',
            cutoffType: currentCutoffType,
            cutoffValue: offsetPctOnPage,
            targetPage: targetPage,
            offsetPct: offsetPctOnPage
          }, '*');
        } catch(err) {}
      }
    }

    function handleDragEnd() {
      if (isDraggingCutoff) {
        isDraggingCutoff = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
      }
    }

    window.addEventListener('pointermove', handleDragMove, { passive: false });
    window.addEventListener('pointerup', handleDragEnd);
    window.addEventListener('touchmove', handleDragMove, { passive: false });
    window.addEventListener('touchend', handleDragEnd);
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);

    function applyCutoff() {
      document.querySelectorAll('.cutoff-line-pourcentage, .cutoff-banner-page, .page-locked-mask').forEach(el => el.remove());
      loadedPages.forEach(p => { if (p.wrapper) p.wrapper.style.opacity = '1'; });

      if (loadedPages.length === 0) return;

      const typeStr = String(currentCutoffType || 'pourcentage').toLowerCase();

      if (typeStr === 'page') {
        // RÉCEPTEUR 1 : MODE PAGES FIXES
        const val = Number(currentCutoffValue);
        if (val <= 0) {
          loadedPages.forEach(p => {
            const mask = document.createElement('div');
            mask.className = 'page-locked-mask';
            mask.innerHTML = '🔒 Document Verrouillé (0 page accessible)';
            p.wrapper.appendChild(mask);
            p.wrapper.style.opacity = '0.4';
          });
        } else {
          const limit = Math.max(1, Math.min(loadedPages.length, val));
          loadedPages.forEach(p => {
            if (p.pageNum === limit) {
              const banner = document.createElement('div');
              banner.className = 'cutoff-banner-page';
              banner.innerHTML = '<div class="cutoff-grab-bar"><div class="cutoff-drag-handle">↕ Mode Pages : Fin de la Page ' + limit + ' / ' + loadedPages.length + '</div></div>';
              banner.addEventListener('pointerdown', handleDragStart);
              banner.addEventListener('touchstart', handleDragStart, { passive: false });
              banner.addEventListener('mousedown', handleDragStart);
              p.wrapper.parentNode.insertBefore(banner, p.wrapper.nextSibling);
            } else if (p.pageNum > limit) {
              const mask = document.createElement('div');
              mask.className = 'page-locked-mask';
              mask.innerHTML = '🔒 Page ' + p.pageNum + ' Verrouillée';
              p.wrapper.appendChild(mask);
              p.wrapper.style.opacity = '0.5';
            }
          });
        }
      } else if (typeStr.startsWith('fluide') || typeStr.startsWith('neutre')) {
        // RÉCEPTEUR 2 : MODE FLUIDE / NEUTRE ABSOLU (Position exacte Page + Offset %)
        let targetP = 1;
        let offsetP = Number(currentCutoffValue) || 0;

        const parts = typeStr.split(':');
        if (parts.length >= 3) {
          targetP = parseInt(parts[1]) || 1;
          offsetP = parseFloat(parts[2]) || 0;
        } else if (parts.length === 2) {
          offsetP = parseFloat(parts[1]) || Number(currentCutoffValue) || 30;
        }

        loadedPages.forEach(p => {
          if (p.pageNum < targetP) {
            // Entièrement débloquée
            p.wrapper.style.opacity = '1';
          } else if (p.pageNum === targetP) {
            if (offsetP <= 0) {
              const mask = document.createElement('div');
              mask.className = 'page-locked-mask';
              mask.innerHTML = '🔒 Page ' + p.pageNum + ' Verrouillée dès le début';
              p.wrapper.appendChild(mask);
              p.wrapper.style.opacity = '0.4';
            } else if (offsetP < 100) {
              const cutoffEl = document.createElement('div');
              cutoffEl.className = 'cutoff-line-pourcentage';
              cutoffEl.style.top = offsetP + '%';
              cutoffEl.innerHTML = '<div class="cutoff-grab-bar"><div class="cutoff-drag-handle">↕ Mode Fluide : Page ' + targetP + ' à ' + offsetP + '%</div></div>';
              cutoffEl.addEventListener('pointerdown', handleDragStart);
              cutoffEl.addEventListener('touchstart', handleDragStart, { passive: false });
              cutoffEl.addEventListener('mousedown', handleDragStart);
              p.wrapper.appendChild(cutoffEl);
            }
          } else {
            // Pages suivantes totalement verrouillées
            const mask = document.createElement('div');
            mask.className = 'page-locked-mask';
            mask.innerHTML = '🔒 Page ' + p.pageNum + ' Verrouillée';
            p.wrapper.appendChild(mask);
            p.wrapper.style.opacity = '0.4';
          }
        });
      } else {
        // RÉCEPTEUR 3 : MODE POURCENTAGE GLOBAL DU COURS
        const val = Number(currentCutoffValue);
        if (val <= 0) {
          loadedPages.forEach(p => {
            const mask = document.createElement('div');
            mask.className = 'page-locked-mask';
            mask.innerHTML = '🔒 Aperçu Verrouillé à 100% (Achat requis)';
            p.wrapper.appendChild(mask);
            p.wrapper.style.opacity = '0.4';
          });
          if (loadedPages[0] && loadedPages[0].wrapper) {
            const cutoffEl = document.createElement('div');
            cutoffEl.className = 'cutoff-line-pourcentage';
            cutoffEl.style.top = '0%';
            cutoffEl.innerHTML = '<div class="cutoff-grab-bar"><div class="cutoff-drag-handle">↕ Glisser la ligne : 0% (Verrouillage total)</div></div>';
            cutoffEl.addEventListener('pointerdown', handleDragStart);
            cutoffEl.addEventListener('touchstart', handleDragStart, { passive: false });
            cutoffEl.addEventListener('mousedown', handleDragStart);
            loadedPages[0].wrapper.appendChild(cutoffEl);
          }
        } else if (val >= 100) {
          // Libre
        } else {
          const totalHeight = loadedPages.reduce((sum, p) => sum + p.height, 0);
          const targetVisibleHeight = totalHeight * (val / 100);
          let cumulativeHeight = 0;
          let cutoffApplied = false;

          loadedPages.forEach(p => {
            const pageTop = cumulativeHeight;
            const pageBottom = cumulativeHeight + p.height;

            if (!cutoffApplied && targetVisibleHeight >= pageTop && targetVisibleHeight < pageBottom) {
              const heightOnPage = targetVisibleHeight - pageTop;
              const percentOnThisPage = (heightOnPage / p.height) * 100;

              const cutoffEl = document.createElement('div');
              cutoffEl.className = 'cutoff-line-pourcentage';
              cutoffEl.style.top = percentOnThisPage + '%';
              cutoffEl.innerHTML = '<div class="cutoff-grab-bar"><div class="cutoff-drag-handle">↕ Paywall : ' + val + '% (Page ' + p.pageNum + '/' + loadedPages.length + ')</div></div>';
              cutoffEl.addEventListener('pointerdown', handleDragStart);
              cutoffEl.addEventListener('touchstart', handleDragStart, { passive: false });
              cutoffEl.addEventListener('mousedown', handleDragStart);
              p.wrapper.appendChild(cutoffEl);
              cutoffApplied = true;
            } else if (cutoffApplied || targetVisibleHeight < pageTop) {
              const mask = document.createElement('div');
              mask.className = 'page-locked-mask';
              mask.innerHTML = '🔒 Page ' + p.pageNum + ' Verrouillée';
              p.wrapper.appendChild(mask);
              p.wrapper.style.opacity = '0.4';
            }
            cumulativeHeight += p.height;
          });
        }
      }
    }

    window.addEventListener('message', (event) => {
      if (event.data) {
        if (event.data.type === 'UPDATE_CUTOFF' && !isDraggingCutoff) {
          currentCutoffType = event.data.cutoffType;
          currentCutoffValue = Number(event.data.cutoffValue);
          applyCutoff();
        } else if (event.data.type === 'SET_ZOOM') {
          applyZoom(Number(event.data.zoom) || 1.0);
        }
      }
    });

    if (typeof pdfjsLib !== 'undefined') {
      const loadingTask = pdfjsLib.getDocument({
        url: url,
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/cmaps/',
        cMapPacked: true,
      });

      loadingTask.promise.then(pdf => {
        isPdfLoaded = true;
        const loader = document.getElementById('loader');
        if (loader) loader.style.display = 'none';

        const maxPages = Math.min(pdf.numPages, 30);

        const renderPage = (pageNum) => {
          if (pageNum > maxPages) {
            applyCutoff();
            return;
          }

          pdf.getPage(pageNum).then(page => {
            const viewport = page.getViewport({ scale: 1.15 });

            const pageWrap = document.createElement('div');
            pageWrap.className = 'page-wrapper';
            pageWrap.id = 'page-wrapper-' + pageNum;

            const numTag = document.createElement('div');
            numTag.className = 'page-number-tag';
            numTag.innerText = 'Page ' + pageNum + ' / ' + pdf.numPages;
            pageWrap.appendChild(numTag);

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            pageWrap.appendChild(canvas);
            canvasWrapper.appendChild(pageWrap);

            loadedPages.push({
              pageNum: pageNum,
              height: viewport.height,
              wrapper: pageWrap
            });

            applyCutoff();

            page.render({
              canvasContext: context,
              viewport: viewport
            }).promise.then(() => {
              renderPage(pageNum + 1);
            }).catch(() => {
              renderPage(pageNum + 1);
            });
          }).catch(() => {
            renderPage(pageNum + 1);
          });
        };

        renderPage(1);
      }).catch(err => {
        const loader = document.getElementById('loader');
        if (loader) {
          loader.innerHTML = '<div style="text-align:center;color:#DC2626;padding:20px;">' +
            '<p style="font-size:15px;font-weight:bold;margin:0 0 6px;">⚠️ Prévisualisation indisponible pour ce fichier</p>' +
            '<a href="' + url + '" target="_blank" style="display:inline-block;margin-top:10px;padding:8px 16px;background:#6B1124;color:#FAF6EB;border-radius:6px;text-decoration:none;font-size:12px;font-weight:bold;">Ouvrir le PDF dans un nouvel onglet ↗</a>' +
            '</div>';
        }
      });
    }
  <\/script>
</body>
</html>`;
}

export function PdfPreviewIframe({ pdfUrl, cutoffType, cutoffValue, onCutoffChange }: PdfPreviewIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [zoom, setZoom] = useState(1.0);
  const srcDoc = React.useMemo(() => generateSrcDoc(pdfUrl, cutoffType, cutoffValue), [pdfUrl]);
  const rafRef = useRef<number | null>(null);

  // Send cutoff changes to iframe
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow) return;
      iframe.contentWindow.postMessage({ type: 'UPDATE_CUTOFF', cutoffType, cutoffValue }, '*');
    });
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [cutoffType, cutoffValue]);

  // Listen for cutoff drag events directly from the iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'CUTOFF_DRAGGED') {
        const val = Number(e.data.cutoffValue);
        const type = String(e.data.cutoffType || '');
        if (onCutoffChange) {
          onCutoffChange(type, val, e.data.targetPage, e.data.offsetPct);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onCutoffChange]);

  // Send isolated zoom changes from React buttons
  const handleZoomChange = (newZoom: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, Math.round(newZoom * 100) / 100));
    setZoom(clamped);
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'SET_ZOOM', zoom: clamped }, '*');
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Zoom Control Bar (Strictly inside the PDF Viewer) */}
      <div style={{ height: '40px', padding: '0 16px', backgroundColor: '#27272A', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #3F3F46', flexShrink: 0 }}>
        <span style={{ color: '#D4D4D8', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
          💡 Ligne Paywall glissable sur toute sa longueur (Positionnement absolu page/hauteur)
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => handleZoomChange(zoom - 0.15)}
            title="Réduire le zoom du document"
            style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #52525B', backgroundColor: '#3F3F46', color: '#FAF6EB', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={() => handleZoomChange(1.0)}
            title="Réinitialiser à 100%"
            style={{ padding: '0 10px', height: '28px', borderRadius: '6px', border: '1px solid #52525B', backgroundColor: '#3F3F46', color: '#FAF6EB', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => handleZoomChange(zoom + 0.15)}
            title="Agrandir le zoom du document"
            style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #52525B', backgroundColor: '#3F3F46', color: '#FAF6EB', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={() => handleZoomChange(1.0)}
            title="Ajuster à la taille standard (100%)"
            style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #52525B', backgroundColor: '#3F3F46', color: '#FAF6EB', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: '4px' }}
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      {/* Embedded Iframe Viewer */}
      <div style={{ flex: 1, width: '100%', height: 'calc(100% - 40px)', position: 'relative' }}>
        <iframe
          ref={iframeRef}
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-same-origin allow-popups"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          title="Simulateur Paywall"
        />
      </div>
    </div>
  );
}
