import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, StatusBar, ActivityIndicator, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '../components/AppIcon';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as FileSystem from 'expo-file-system/legacy';
import { Accelerometer } from 'expo-sensors';
import { getDocumentPdfUrl, verifierFichierLocalExiste, telechargerFichierVersDossierPersistant, DOSSIER_DOCS_PERSISTANTS, normaliserCheminFichier, retrouverFichierDansSandbox, resoudreSourcePdf } from '../services/serviceDocument';

import { useApp } from '../store/ContexteApp';

interface PdfViewerProps {
  route?: {
    params: {
      titre: string;
      filePath: string;
      estDebloque: boolean;
      limiteApercuPages?: number;
      limiteApercuType?: 'page' | 'pourcentage';
      limiteApercuValeur?: number;
    };
  };
  navigation?: any;
}

export default function PdfViewerScreen({ route, navigation }: PdfViewerProps) {
  const { couleurs } = useApp();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const styles = getStyles(couleurs);
  const [hasError, setHasError] = useState(false);
  const [fichierIntrouvable, setFichierIntrouvable] = useState(false);
  const [messageErreurPersonnalise, setMessageErreurPersonnalise] = useState<string>('');
  const [chargementLocal, setChargementLocal] = useState(true);
  const [sourcePdfData, setSourcePdfData] = useState<string>('');
  const [pageState, setPageState] = useState({ current: 1, total: 1 });
  const [modePaysageActif, setModePaysageActif] = useState(false);

  // Détection dynamique et fluide du mode Paysage (asservie au bouton)
  const estPaysage = Platform.OS === 'web' ? (modePaysageActif || screenWidth > screenHeight) : modePaysageActif;


  const params = (route?.params as any) || {};
  const { 
    titre = 'Document', 
    estDebloque = false, 
    limiteApercuPages = 3,
    limiteApercuType = 'pourcentage',
    limiteApercuValeur = 30
  } = params;

  const estWeb = Platform.OS === 'web';
  const docObj = (route?.params as any)?.document || route?.params || {};

  // Extraction prioritaire des références Cloud (sans chemins locaux physiques mobiles)
  const listeCandidatsCloud = [
    docObj.cloud_path,
    params.cloud_path,
    docObj.file_path,
    params.file_path,
    params.filePath,
    docObj.filePath,
    docObj.pdf_url,
    params.pdf_url,
    docObj.url,
    params.url,
  ];

  const cloudPathNettoye = listeCandidatsCloud.find(c =>
    Boolean(c && typeof c === 'string' && !c.startsWith('file:') && !c.startsWith('content:') && !c.startsWith('/data/') && !c.startsWith('/storage/'))
  ) || '';

  const cheminLocalPhysique = estWeb ? '' : (
    params.cheminLocal ||
    docObj.cheminLocal ||
    params.filePath ||
    docObj.local_uri ||
    params.local_uri ||
    ''
  );

  const filePath = estWeb ? (cloudPathNettoye || docObj.file_path || params.filePath || '') : (cheminLocalPhysique || cloudPathNettoye || docObj.file_path || params.filePath || '');

  const [cleRechargement, setCleRechargement] = useState(0);

  const estLocalOuImporte = Boolean(
    params.estImporte ||
    params.est_importe ||
    docObj.estImporte ||
    docObj.est_importe ||
    docObj.id?.startsWith('imported_') ||
    filePath.startsWith('file:') ||
    filePath.startsWith('blob:') ||
    filePath.startsWith('data:') ||
    filePath.startsWith('content:') ||
    filePath.startsWith('/data/') ||
    filePath.startsWith('/storage/') ||
    docObj.cloud_path ||
    docObj.bucket === 'documents_utilisateurs'
  );

  // Préparation de la source PDF (Conversion Base64 sécurisée sur Mobile)
  useEffect(() => {
    let estMonte = true;
    async function preparerSource() {
      try {
        setChargementLocal(true);
        setHasError(false);
        setFichierIntrouvable(false);
        setMessageErreurPersonnalise('');
        console.log('[Lecteur] Source brute :', filePath, '| Mode Web :', estWeb);

        // 🎯 Résolution unifiée résiliente (Local Vault / Docs Persistants vs URLs signées Supabase)
        const resolution = await resoudreSourcePdf({
          id: docObj.id || docObj.documentId,
          titre: titre,
          file_path: cloudPathNettoye || docObj.file_path || params.filePath,
          cheminLocal: cheminLocalPhysique,
          local_uri: estWeb ? '' : (docObj.local_uri || params.local_uri),
          cloud_path: cloudPathNettoye || docObj.cloud_path || params.cloud_path,
          bucket: docObj.bucket || params.bucket || 'documents_utilisateurs',
          pdf_url: docObj.pdf_url || params.pdf_url,
          url: docObj.url || params.url,
        });

        console.log('[Lecteur] Résolution obtenue :', resolution);

        if (!resolution.uri) {
          console.warn('❌ [Lecteur] Statut : Aucun chemin PDF disponible');
          if (estMonte) {
            setMessageErreurPersonnalise(resolution.messageErreur || '');
            setFichierIntrouvable(true);
            setChargementLocal(false);
          }
          return;
        }

        if (resolution.isLocal && Platform.OS !== 'web') {
          console.log('[Lecteur] Source résolue (Local Natif) :', resolution.uri);
          console.log('[Lecteur] Statut : Prêt pour conversion Base64');

          const base64Brut = await FileSystem.readAsStringAsync(resolution.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const cleanBase64 = base64Brut.replace(/^data:application\/pdf;base64,/i, '');
          if (estMonte) {
            setSourcePdfData(cleanBase64);
          }
        } else {
          // Streaming direct HTTP/HTTPS ou blob Web
          console.log('[Lecteur] Source résolue (Streaming Cloud / Web) :', resolution.uri);
          if (estMonte) {
            setSourcePdfData(resolution.uri);
          }
        }
      } catch (err) {
        console.error('Erreur chargement source PDF :', err);
        if (estMonte) {
          setHasError(true);
        }
      } finally {
        if (estMonte) {
          setChargementLocal(false);
        }
      }
    }

    preparerSource();
    return () => { estMonte = false; };
  }, [filePath, estLocalOuImporte, cleRechargement]);

  // Synchronisation des pages sur Web
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleWebMessage = (event: MessageEvent) => {
        if (event.data) {
          try {
            const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            if (data.type === 'pageChange') {
              setPageState({
                current: data.currentPage || 1,
                total: data.totalCount || data.totalPages || 1
              });
            }
          } catch (e) {
            // Ignorer
          }
        }
      };
      window.addEventListener('message', handleWebMessage);
      return () => window.removeEventListener('message', handleWebMessage);
    }
  }, []);




  // Gestion de la Rotation : Verrouillage strict en Portrait par défaut,
  // et capteurs dynamiques actifs UNIQUEMENT si le mode paysage est activé par le bouton
  useEffect(() => {
    if (Platform.OS === 'web') return;

    if (!modePaysageActif) {
      // 1. État par défaut : strictement verrouillé en Portrait vertical
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      return;
    }

    // 2. Si le mode paysage est activé : débloquer la bascule bidirectionnelle (Gauche / Droite)
    let subscriptionSensor: any = null;
    let timerDebounce: any = null;
    let sensActuel: 'left' | 'right' | null = null;

    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    Accelerometer.setUpdateInterval(150);

    subscriptionSensor = Accelerometer.addListener(({ x, y, z }) => {
      // Dans le mode paysage actif, adapter l'orientation selon l'axe horizontal (gauche ou droite)
      if (x > 0.40 && sensActuel !== 'right') {
        if (timerDebounce) clearTimeout(timerDebounce);
        timerDebounce = setTimeout(() => {
          sensActuel = 'right';
          ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT).catch(() => {});
        }, 150);
      } else if (x < -0.40 && sensActuel !== 'left') {
        if (timerDebounce) clearTimeout(timerDebounce);
        timerDebounce = setTimeout(() => {
          sensActuel = 'left';
          ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT).catch(() => {});
        }, 150);
      }
    });

    return () => {
      if (timerDebounce) clearTimeout(timerDebounce);
      if (subscriptionSensor) subscriptionSensor.remove();
    };
  }, [modePaysageActif]);

  // Réinitialisation au démontage de l'écran
  useEffect(() => {
    return () => {
      if (Platform.OS !== 'web') {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      }
    };
  }, []);

  // Écouteur de messages postés pour la version Web (PC)
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleWebMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'pageChange') {
            setPageState({
              current: data.currentPage,
              total: data.totalPages
            });
          }
        } catch (err) {
          if (event.data === 'error') {
            setHasError(true);
          }
        }
      };
      window.addEventListener('message', handleWebMessage);
      return () => window.removeEventListener('message', handleWebMessage);
    }
  }, []);

  const basculerOrientationManuelle = async () => {
    if (Platform.OS === 'web') {
      setModePaysageActif(!modePaysageActif);
      return;
    }

    try {
      if (modePaysageActif) {
        // Retour direct et verrouillé en Portrait vertical
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        setModePaysageActif(false);
      } else {
        // Activation intentionnelle du mode Paysage
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        setModePaysageActif(true);
      }
    } catch (err) {
      console.log('Erreur bascule orientation manuelle :', err);
    }
  };

  // Visualiseur PDF.js optimisé cross-platform standard & ultra-robuste (flux multi-pages complet)
  const webViewSource = {

    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover">
  <title>Lecteur PDF - cauZon</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"></script>
  <style>
    * {
      box-sizing: border-box;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      background-color: ${couleurs.estSombre ? '#121212' : '#FFFFFF'};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: ${couleurs.estSombre ? '#FFFFFF' : '#0F172A'};
    }
    body {
      display: flex;
      flex-direction: column;
      align-items: center;
      overflow-x: auto;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding: 16px 0 80px 0;
      background-color: ${couleurs.estSombre ? '#121212' : '#FFFFFF'};
    }
    #canvas-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
      gap: 20px;
      transform-origin: top center;
      will-change: transform;
    }
    .page-wrapper {
      position: relative;
      background-color: #FFFFFF;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
      border-radius: 4px;
      overflow: hidden;
      margin: 0 auto;
    }
    canvas {
      display: block;
      width: 100% !important;
      height: 100% !important;
      image-rendering: -webkit-optimize-contrast;
      image-rendering: crisp-edges;
      -webkit-font-smoothing: subpixel-antialiased;
      -webkit-backface-visibility: hidden;
      backface-visibility: hidden;
      transform: translateZ(0);
      -webkit-transform: translateZ(0);
    }
    #zoom-badge {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: rgba(15, 23, 42, 0.88);
      color: #FFFFFF;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.25s ease;
      z-index: 9999;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    }


    #loading {
      text-align: center;
      padding: 80px 20px;
      font-size: 15px;
      font-weight: 600;
      color: ${couleurs.estSombre ? '#9CA3AF' : '#64748B'};
    }
    #limit-banner {
      width: 90%;
      max-width: 650px;
      padding: 16px;
      margin: 20px 0 40px 0;
      background-color: #FFF3CD;
      border: 1px solid #FFEBAA;
      color: #856404;
      border-radius: 12px;
      font-size: 14px;
      text-align: center;
      font-weight: bold;
      box-shadow: 0 4px 12px rgba(133, 100, 4, 0.08);
    }
    .blur-overlay {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(to bottom, 
        rgba(${couleurs.estSombre ? '18,18,18' : '241,245,249'}, 0) 0%, 
        rgba(${couleurs.estSombre ? '18,18,18' : '241,245,249'}, 0.95) 20%, 
        rgba(${couleurs.estSombre ? '18,18,18' : '241,245,249'}, 1) 100%
      );
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      z-index: 20;
    }
    .overlay-card {
      text-align: center;
      max-width: 360px;
      background: ${couleurs.estSombre ? '#1E1E1E' : '#FFFFFF'};
      border: 1px solid ${couleurs.estSombre ? '#27272A' : '#E2E8F0'};
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 15px 35px rgba(0,0,0,0.2);
    }
    .overlay-lock-icon { font-size: 36px; margin-bottom: 12px; }
    .overlay-title { font-size: 16px; font-weight: 800; margin-bottom: 6px; color: ${couleurs.estSombre ? '#FFFFFF' : '#0F172A'}; }
    .overlay-subtitle { font-size: 12.5px; color: ${couleurs.estSombre ? '#9CA3AF' : '#64748B'}; margin-bottom: 20px; line-height: 1.5; }
  </style>
</head>
<body>
  <div id="loading">📄 Chargement haute fidélité du document...</div>
  <div id="canvas-container"></div>
  ${!estDebloque ? `<div id="limit-banner">⚠️ Limite de l'aperçu gratuit atteinte (${limiteApercuPages} pages). Veuillez débloquer le cours complet.</div>` : ''}

  <script>
    function initialiserLecteur() {
      if (typeof pdfjsLib === 'undefined') {
        setTimeout(initialiserLecteur, 50);
        return;
      }

      try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
      } catch (wErr) {
        console.warn('[PDF.js] Worker non instanciable :', wErr);
      }

      // Données PDF encodées en JSON — évite tout problème de guillemets dans le template literal
      const rawPdfData = ${JSON.stringify(sourcePdfData)};

      // Détection automatique : base64 brut ou URL HTTP/file
      function construirePdfSource(data) {
        if (!data) return null;
        if (typeof data !== 'string') return data;
        if (data.startsWith('http://') || data.startsWith('https://') || data.startsWith('file://') || data.startsWith('blob:')) {
          return data;
        }
        let base64Str = data;
        const idx = base64Str.indexOf('base64,');
        if (idx !== -1) {
          base64Str = base64Str.substring(idx + 7);
        }
        try {
          const binaryStr = atob(base64Str);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          return { data: bytes };
        } catch (e) {
          console.error('[PDF.js] Échec décodage base64:', e.message);
          return null;
        }
      }

      const pdfSource = construirePdfSource(rawPdfData);

      const notifyPageChange = (current, previewLimit, realTotalPages) => {
        const payload = JSON.stringify({
          type: 'pageChange',
          currentPage: current,
          totalPages: realTotalPages,
          totalCount: realTotalPages,
          previewLimitPages: previewLimit
        });
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(payload);
        } else if (window.parent) {
          window.parent.postMessage(payload, '*');
        }
      };

      if (!pdfSource) {
        const loadingEl = document.getElementById('loading');
        if (loadingEl) loadingEl.innerHTML = '<div style="text-align:center;padding:40px;"><p style="color:#DC2626;font-weight:bold;">⚠️ Source PDF vide ou invalide</p></div>';
        return;
      }

      const docParams = typeof pdfSource === 'string'
        ? { url: pdfSource, withCredentials: false, stopAtErrors: false }
        : { data: pdfSource.data, stopAtErrors: false };

      pdfjsLib.getDocument(docParams).promise.then(async (pdf) => {
        // Masquage proactif du loader
        const initialLoader = document.getElementById('loading');
        if (initialLoader) initialLoader.style.display = 'none';

        const container = document.getElementById('canvas-container');
        if (container) container.style.display = 'flex';
        
        const realTotalPages = pdf.numPages;

        // ── Calcul Proportionnel de Coupure Multi-Pages ──────────────────
        let maxPages = pdf.numPages;
        let targetCutoffPage = 1;
        let percentOnTargetPage = ${limiteApercuValeur};
        let overlayTitle = "Aperçu limité";

        const rawType = '${limiteApercuType}'.toLowerCase();

        if (!${estDebloque}) {
          if (rawType === 'page') {
            const pageCount = Number(${limiteApercuValeur || limiteApercuPages});
            if (pageCount <= 0) {
              maxPages = 1;
              targetCutoffPage = 1;
              percentOnTargetPage = 0;
              overlayTitle = "Document verrouillé";
            } else {
              maxPages = Math.min(pdf.numPages, pageCount);
              targetCutoffPage = -1;
            }
          } else if (rawType.startsWith('fluide') || rawType.startsWith('neutre')) {
            let tPage = ${limiteApercuPages ?? 1};
            let tOffset = Number(${limiteApercuValeur});

            const parts = rawType.split(':');
            if (parts.length >= 3) {
              tPage = parseInt(parts[1]) || tPage;
              tOffset = parseFloat(parts[2]) || tOffset;
            } else if (parts.length === 2) {
              tOffset = parseFloat(parts[1]) || tOffset;
            }

            if (tOffset <= 0 && tPage <= 1) {
              maxPages = 1;
              targetCutoffPage = 1;
              percentOnTargetPage = 0;
              overlayTitle = "Document verrouillé";
            } else if (tOffset >= 100 && tPage >= pdf.numPages) {
              maxPages = pdf.numPages;
              targetCutoffPage = -1;
            } else {
              targetCutoffPage = Math.min(pdf.numPages, Math.max(1, tPage));
              maxPages = targetCutoffPage;
              percentOnTargetPage = Math.max(0, Math.min(100, tOffset));
              overlayTitle = "Aperçu gratuit (Page " + targetCutoffPage + " à " + (tOffset % 1 === 0 ? tOffset : tOffset.toFixed(1)) + "%)";
            }
          } else {
            const globalPercent = Number(${limiteApercuValeur});
            if (globalPercent <= 0) {
              maxPages = 1;
              targetCutoffPage = 1;
              percentOnTargetPage = 0;
              overlayTitle = "Document verrouillé";
            } else if (globalPercent >= 100) {
              maxPages = pdf.numPages;
              targetCutoffPage = -1;
            } else {
              const totalUnits = pdf.numPages;
              const targetUnits = totalUnits * (globalPercent / 100);
              targetCutoffPage = Math.min(pdf.numPages, Math.max(1, Math.ceil(targetUnits)));
              maxPages = targetCutoffPage;
              const fullPreviousPages = targetCutoffPage - 1;
              const remainingUnitsOnPage = targetUnits - fullPreviousPages;
              percentOnTargetPage = Math.max(0, Math.min(100, remainingUnitsOnPage * 100));
              overlayTitle = "Aperçu limité à " + (globalPercent % 1 === 0 ? globalPercent : globalPercent.toFixed(1)) + "% du cours";
            }
          }
        }

        notifyPageChange(1, maxPages, realTotalPages);

        const containerWidth = Math.min(window.innerWidth - 32, 860);
        const dpr = Math.min(window.devicePixelRatio || 1, 2.0);

        // Registre de re-rastérisation vectorielle dynamique à la volée
        window._pageRenderStates = window._pageRenderStates || {};
        const pageRenderStates = window._pageRenderStates;
        let currentZoom = 1.0;
        let appliedZoom = 1.0;
        let debounceTimer = null;
        let badgeTimeout = null;

        function afficherBadgeZoom(texte) {
          const badge = document.getElementById('zoom-badge');
          if (!badge) return;
          badge.innerText = texte;
          badge.style.opacity = '1';
          if (badgeTimeout) clearTimeout(badgeTimeout);
          badgeTimeout = setTimeout(function() {
            badge.style.opacity = '0';
          }, 1200);
        }

        function appliquerZoomCss(targetScale) {
          currentZoom = Math.min(Math.max(targetScale, 0.6), 4.5);
          const tempScale = currentZoom / appliedZoom;
          const container = document.getElementById('canvas-container');
          if (container) {
            container.style.transform = 'scale(' + tempScale.toFixed(4) + ')';
            container.style.transformOrigin = 'top center';
          }
          afficherBadgeZoom(Math.round(currentZoom * 100) + '%');
        }

        function reRasteriserPagesDynamiques() {
          const container = document.getElementById('canvas-container');
          if (container) {
            container.style.transform = 'scale(1)';
          }
          appliedZoom = currentZoom;

          const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

          Object.keys(pageRenderStates).forEach(function(numStr) {
            const pageNum = parseInt(numStr);
            const pState = pageRenderStates[pageNum];
            if (!pState || !pState.page) return;

            // Annuler la tâche précédente si en cours
            if (pState.renderTask) {
              try {
                pState.renderTask.cancel();
              } catch (e) {}
              pState.renderTask = null;
            }

            const finalScale = pState.baseScale * appliedZoom;
            const displayViewport = pState.page.getViewport({ scale: finalScale });
            const renderViewport = pState.page.getViewport({ scale: finalScale * dpr });

            pState.wrapper.style.width = Math.round(displayViewport.width) + 'px';
            pState.wrapper.style.height = Math.round(displayViewport.height) + 'px';

            pState.canvas.width = Math.round(renderViewport.width);
            pState.canvas.height = Math.round(renderViewport.height);
            pState.canvas.style.width = Math.round(displayViewport.width) + 'px';
            pState.canvas.style.height = Math.round(displayViewport.height) + 'px';

            const ctx = pState.canvas.getContext('2d', { alpha: false, willReadFrequently: false });
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            const task = pState.page.render({
              canvasContext: ctx,
              viewport: renderViewport
            });
            pState.renderTask = task;

            task.promise.then(function() {
              if (pState.renderTask === task) {
                pState.renderTask = null;
              }
            }).catch(function(err) {
              if (err && (err.name === 'RenderingCancelledException' || err.message === 'Rendering cancelled')) {
                return;
              }
              console.warn('[PDF.js] Re-rendu page ' + pageNum, err);
            });
          });
        }

        function programmerReRasterisation(delaiMs) {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(function() {
            reRasteriserPagesDynamiques();
          }, delaiMs || 150);
        }

        window._appliquerZoomCss = appliquerZoomCss;
        window._programmerReRasterisation = programmerReRasterisation;

        // Rendu asynchrone fluide de chaque page (rendu progressif initial)
        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
          try {
            const page = await pdf.getPage(pageNum);
            const unscaledViewport = page.getViewport({ scale: 1.0 });
            const baseScale = containerWidth / unscaledViewport.width;
            const displayViewport = page.getViewport({ scale: baseScale });
            const renderViewport = page.getViewport({ scale: baseScale * dpr });

            const wrapper = document.createElement('div');
            wrapper.className = 'page-wrapper';
            wrapper.id = 'page-wrapper-' + pageNum;
            wrapper.style.width = displayViewport.width + 'px';
            wrapper.style.height = displayViewport.height + 'px';

            const canvas = document.createElement('canvas');
            canvas.id = 'pdf-canvas-' + pageNum;
            canvas.width = Math.round(renderViewport.width);
            canvas.height = Math.round(renderViewport.height);
            canvas.style.width = displayViewport.width + 'px';
            canvas.style.height = displayViewport.height + 'px';
            canvas.style.display = 'block';

            const context = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';

            wrapper.appendChild(canvas);
            container.appendChild(wrapper);

            // Coupure proportionnelle sur la page cible si non débloqué
            if (!${estDebloque} && targetCutoffPage > 0 && pageNum === targetCutoffPage) {
              const blurOverlay = document.createElement('div');
              blurOverlay.className = 'blur-overlay';
              blurOverlay.style.top = percentOnTargetPage + '%';
              blurOverlay.innerHTML = \`
                <div class="overlay-card">
                  <div class="overlay-lock-icon">🔒</div>
                  <div class="overlay-title">\${overlayTitle}</div>
                  <div class="overlay-subtitle">Débloquez l'intégralité du cours de \${pdf.numPages} pages pour poursuivre votre apprentissage.</div>
                </div>
              \`;
              wrapper.appendChild(blurOverlay);
            }

            const renderTask = page.render({
              canvasContext: context,
              viewport: renderViewport
            });

            pageRenderStates[pageNum] = {
              page: page,
              baseScale: baseScale,
              canvas: canvas,
              wrapper: wrapper,
              renderTask: renderTask
            };
            
            renderTask.promise.then(function() {
              if (pageRenderStates[pageNum] && pageRenderStates[pageNum].renderTask === renderTask) {
                pageRenderStates[pageNum].renderTask = null;
              }

              // 1. Masquer explicitement le message de chargement
              const loader = document.getElementById('loading');
              if (loader) loader.style.display = 'none';
              
              // 2. Rendre le canvas visible
              canvas.style.display = 'block';
              if (container) container.style.display = 'flex';

              // 3. Notifier React Native
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ 
                  type: 'RENDER_SUCCESS', 
                  page: pageNum 
                }));
              }
            }).catch(function(error) {
              if (error && (error.name === 'RenderingCancelledException' || error.message === 'Rendering cancelled')) {
                return;
              }
              console.error('Erreur renderTask page ' + pageNum, error);
              const loader = document.getElementById('loading');
              if (loader && pageNum === 1) {
                loader.innerHTML = "<p style='color:#6B1124; font-weight:bold;'>Erreur d'affichage de la page. Touchez pour réessayer.</p>";
                loader.style.display = 'block';
              }
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ 
                  type: 'RENDER_ERROR', 
                  message: error ? error.message : 'Erreur de rendu' 
                }));
              }
            });

            await renderTask.promise.catch(function(e) {
              if (e && (e.name === 'RenderingCancelledException' || e.message === 'Rendering cancelled')) {
                return;
              }
              console.warn('Capture renderTask page ' + pageNum, e);
            });

          } catch (pageErr) {
            console.warn('Erreur rendu page ' + pageNum, pageErr);
          }
        }
      }).catch(err => {
        console.error('Erreur getDocument:', err);
        const loadingEl = document.getElementById('loading');
        if (loadingEl) {
          loadingEl.innerHTML = [
            '<div style="text-align:center;padding:40px;">',
              '<p style="color:#DC2626;font-weight:bold;margin-bottom:8px;">⚠️ Impossible de charger le PDF</p>',
              '<p style="color:#6B7280;font-size:13px;margin-bottom:20px;">' + (err && err.message ? err.message : 'Erreur réseau ou fichier inaccessible') + '</p>',
            '</div>'
          ].join('');
          loadingEl.style.display = 'block';
        }
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ 
            type: 'RENDER_ERROR', 
            message: err ? err.message : 'Erreur chargement PDF' 
          }));
        }
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initialiserLecteur);
    } else {
      initialiserLecteur();
    }

    // --- Gestionnaires d'événements de zoom interactif (Web & Mobile) ---
    let touchStartDist = 0;
    let touchStartZoom = 1.0;
    let isPinching = false;

    // 1. Zoom au pinch tactile à deux doigts (Mobile / Tablettes / Touch Web)
    window.addEventListener('touchstart', function(e) {
      if (e.touches && e.touches.length === 2) {
        isPinching = true;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchStartDist = Math.hypot(dx, dy);
        touchStartZoom = (window._pageRenderStates && window._appliquerZoomCss) ? (window._currentZoom || 1.0) : 1.0;
      }
    }, { passive: true });

    window.addEventListener('touchmove', function(e) {
      if (isPinching && e.touches && e.touches.length === 2 && window._appliquerZoomCss) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentDist = Math.hypot(dx, dy);
        if (touchStartDist > 0) {
          const factor = currentDist / touchStartDist;
          window._appliquerZoomCss(touchStartZoom * factor);
        }
      }
    }, { passive: true });

    window.addEventListener('touchend', function(e) {
      if (isPinching && (!e.touches || e.touches.length < 2)) {
        isPinching = false;
        touchStartDist = 0;
        if (window._programmerReRasterisation) {
          window._programmerReRasterisation(150);
        }
      }
    }, { passive: true });

    // 2. Zoom Ctrl + Molette ou Trackpad Pinch (PC / Navigateurs Web)
    window.addEventListener('wheel', function(e) {
      if ((e.ctrlKey || e.metaKey) && window._appliquerZoomCss) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.08 : 0.92;
        const currentZ = window._currentZoom || 1.0;
        window._appliquerZoomCss(currentZ * factor);
        if (window._programmerReRasterisation) {
          window._programmerReRasterisation(150);
        }
      }
    }, { passive: false });

    // 3. Double-tap pour bascule rapide (1.0x <-> 2.0x)
    let dernierTouchEnd = 0;
    window.addEventListener('touchend', function(e) {
      if (isPinching) return;
      const maintenant = Date.now();
      if (maintenant - dernierTouchEnd < 300 && e.changedTouches && e.changedTouches.length === 1 && window._appliquerZoomCss) {
        const currentZ = window._currentZoom || 1.0;
        const target = currentZ > 1.25 ? 1.0 : 2.0;
        window._appliquerZoomCss(target);
        if (window._programmerReRasterisation) {
          window._programmerReRasterisation(150);
        }
      }
      dernierTouchEnd = maintenant;
    }, { passive: true });

    // Détection de la page active lors du défilement
    window.addEventListener('scroll', () => {
      const scrollPos = window.scrollY + window.innerHeight / 3;
      const wrappers = document.querySelectorAll('.page-wrapper');
      let currentPage = 1;
      
      wrappers.forEach((wrapper, index) => {
        const top = wrapper.offsetTop;
        const bottom = top + wrapper.offsetHeight;
        if (scrollPos >= top && scrollPos <= bottom) {
          currentPage = index + 1;
        }
      });

      if (wrappers.length > 0) {
        notifyPageChange(currentPage, wrappers.length);
      }
    });
  </script>
  <div id="zoom-badge">100%</div>
</body>
</html>
    `,
    baseUrl: 'https://localhost'
  };

  const handleBack = () => {

    if (navigation) {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar 
        barStyle="light-content" 
        backgroundColor={couleurs.fondEntete} 
      />
      {/* En-tête de lecture (Compact en mode paysage) */}
      <View style={[styles.header, estPaysage && styles.headerPaysage]}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={estPaysage ? 20 : 24} color="#FFFFFF" />
        </TouchableOpacity>
        
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, estPaysage && styles.headerTitlePaysage]} numberOfLines={1}>{titre}</Text>
          <Text style={[styles.badge, estPaysage && styles.badgePaysage]}>
            {estDebloque ? 'Document complet' : `Aperçu gratuit (${limiteApercuPages} p. max)`}
          </Text>
        </View>

        {/* Bouton de Rotation Manuelle : Uniquement sur Mobile (iOS/Android) */}
        {Platform.OS !== 'web' && (
          <TouchableOpacity 
            style={[styles.rotateBtn, estPaysage && styles.rotateBtnPaysage]} 
            onPress={basculerOrientationManuelle}
          >
            <Ionicons 
              name={estPaysage ? "phone-portrait" : "phone-landscape"} 
              size={estPaysage ? 15 : 18} 
              color="#FFFFFF" 
            />
            <Text style={[styles.rotateBtnText, estPaysage && styles.rotateBtnTextPaysage]}>
              {estPaysage ? "Portrait" : "Paysage"}
            </Text>
          </TouchableOpacity>
        )}
      </View>



      {/* Lecteur PDF */}
      <View style={styles.pdfContainer}>
        {chargementLocal ? (
          <View style={styles.emptyContainer}>
            <ActivityIndicator size="large" color={couleurs.primaire} />
            <Text style={[styles.emptyText, { marginTop: 12 }]}>Préparation sécurisée du document...</Text>
          </View>
        ) : fichierIntrouvable ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="cloud-offline-outline" size={54} color="#E74C3C" />
            <Text style={[styles.emptyText, { color: '#E74C3C', fontWeight: 'bold', fontSize: 16, marginTop: 12 }]}>
              Document Non Accessible
            </Text>
            <Text style={[styles.emptyText, { fontSize: 13, marginTop: 6, paddingHorizontal: 24, textAlign: 'center' }]}>
              {messageErreurPersonnalise || "Le fichier n'a pas pu être chargé localement ni synchronisé depuis votre Cloud Supabase sécurisé."}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity 
                style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: couleurs.primaire, borderRadius: 10 }} 
                onPress={() => setCleRechargement(prev => prev + 1)}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 }}>🔄 Réessayer</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: couleurs.fondCarte, borderRadius: 10 }} 
                onPress={handleBack}
              >
                <Text style={{ color: couleurs.texte, fontWeight: 'bold', fontSize: 13 }}>Retour</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : sourcePdfData && !hasError ? (
          <View style={{ flex: 1, width: '100%', height: '100%', overflow: 'hidden' }}>
            {Platform.OS === 'web' ? (
              // Sur PC/Web : Rendu PDF.js vectoriel haute fidélité avec fond clair/blanc dynamique
              <iframe
                srcDoc={webViewSource.html}
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  border: 'none', 
                  display: 'block', 
                  backgroundColor: couleurs.estSombre ? '#121212' : '#FFFFFF' 
                }}
                title={titre}
              />
            ) : (
              <WebView
                originWhitelist={['*']}
                source={webViewSource}
                onMessage={(event) => {
                  try {
                    const data = JSON.parse(event.nativeEvent.data);
                    if (data.type === 'pageChange') {
                      setPageState({
                        current: data.currentPage,
                        total: data.totalCount || data.totalPages
                      });
                    } else if (data.type === 'RENDER_SUCCESS') {
                      // Le canvas a été rendu avec succès
                      setChargementLocal(false);
                      setHasError(false);
                    } else if (data.type === 'RENDER_ERROR') {
                      // Erreur lors du rendu du canvas
                      setHasError(true);
                      setChargementLocal(false);
                    } else if (event.nativeEvent.data === 'error') {
                      setHasError(true);
                    }
                  } catch (err) {
                    if (event.nativeEvent.data === 'error') {
                      setHasError(true);
                    }
                  }
                }}
                style={{ flex: 1, backgroundColor: couleurs.estSombre ? '#121212' : '#FFFFFF' }}
                startInLoadingState={true}
                domStorageEnabled={true}
                javaScriptEnabled={true}
                scalesPageToFit={true}
                androidHardwareAccelerationDisabled={false}
                androidLayerType="hardware"
                useSharedProcessPool={true}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={true}
                textZoom={100}
                allowFileAccess={true}
                allowUniversalAccessFromFileURLs={true}
                allowFileAccessFromFileURLs={true}
                mixedContentMode="always"
                onError={() => setHasError(true)}



                renderLoading={() => (
                  <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: couleurs.fond }}>
                    <ActivityIndicator size="large" color={couleurs.primaire} />
                  </View>
                )}
              />
            )}

            {/* Indicateur de Page Flottant */}
            <View style={[styles.floatingPageIndicator, { bottom: !estDebloque ? 80 : 24 }]}>
              <Text style={styles.pageIndicatorText}>
                Page {pageState.current} / {pageState.total}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons name={hasError ? "alert-circle-outline" : "document-text-outline"} size={48} color={hasError ? "#E74C3C" : couleurs.texteSecondaire} />
            <Text style={[styles.emptyText, hasError && { color: '#E74C3C', fontWeight: 'bold' }]}>
              {hasError ? "Impossible de charger le document" : "Aucun fichier PDF disponible"}
            </Text>
            {hasError && (
              <TouchableOpacity
                style={{ marginTop: 14, paddingHorizontal: 18, paddingVertical: 8, backgroundColor: couleurs.primaire, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                onPress={() => setCleRechargement(prev => prev + 1)}
              >
                <Ionicons name="refresh-outline" size={16} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 12 }}>Réessayer le chargement</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>


      {/* Banner Paywall si le document n'est pas encore débloqué */}
      {!estDebloque && (
        <View style={styles.paywallBanner}>
          <Ionicons name="lock-closed" size={16} color="#856404" style={{ marginRight: 6 }} />
          <Text style={styles.paywallText}>
            Vous consultez un aperçu. Débloquez le document complet pour accéder à l'intégralité du cours.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const getStyles = (couleurs: any) => StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: couleurs.fond,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  header: { 
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ? StatusBar.currentHeight + 8 : 36) : (Platform.OS === 'ios' ? 14 : 12),
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: couleurs.fondEntete,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
    gap: 8,
    zIndex: 1000,
    elevation: 10,
    flexShrink: 0,
  },
  headerPaysage: {
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ? StatusBar.currentHeight + 4 : 14) : (Platform.OS === 'ios' ? 8 : 8),
    paddingBottom: 8,
    paddingHorizontal: 16,
    gap: 6,
  },

  backBtn: {
    padding: 6,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: { 
    color: '#FFFFFF', 
    fontSize: 15, 
    fontWeight: 'bold' 
  },
  headerTitlePaysage: {
    fontSize: 13,
  },
  badge: { 
    color: couleurs.accent, 
    fontSize: 11, 
    marginTop: 2 
  },
  badgePaysage: {
    fontSize: 9,
    marginTop: 0,
  },
  rotateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
  },
  rotateBtnPaysage: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 3,
  },
  rotateBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  rotateBtnTextPaysage: {
    fontSize: 10,
  },
  pdfContainer: { 
    flex: 1, 
    backgroundColor: couleurs.fond,
    position: 'relative',
    overflow: 'hidden',
  },

  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 8,
    color: couleurs.texteSecondaire,
    fontSize: 14,
  },
  paywallBanner: {
    flexDirection: 'row',
    padding: 14,
    backgroundColor: '#fff3cd',
    borderTopWidth: 1,
    borderColor: '#ffeeba',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paywallText: { 
    color: '#856404', 
    fontSize: 13, 
    textAlign: 'center',
    fontWeight: '600'
  },
  floatingPageIndicator: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    zIndex: 100,
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  pageIndicatorText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

