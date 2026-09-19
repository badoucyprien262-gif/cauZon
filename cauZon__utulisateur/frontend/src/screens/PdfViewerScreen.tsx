import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, StatusBar, ActivityIndicator, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '../components/AppIcon';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as FileSystem from 'expo-file-system/legacy';
import { Accelerometer } from 'expo-sensors';
import { getDocumentPdfUrl, verifierFichierLocalExiste, telechargerFichierVersDossierPersistant, DOSSIER_DOCS_PERSISTANTS, normaliserCheminFichier, retrouverFichierDansSandbox, resoudreSourcePdf } from '../services/serviceDocument';

import { useApp } from '../store/ContexteApp';
import { LecteurPdfWeb } from '../components/PdfViewer';

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
      transition: none;
    }
    .page-wrapper {
      position: relative;
      background-color: #FFFFFF;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
      border-radius: 4px;
      overflow: hidden;
      margin: 0 auto;
      box-sizing: border-box;
      contain: layout size paint;
      content-visibility: auto;
    }
    .page-wrapper canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100% !important;
      height: 100% !important;
      display: block;
      image-rendering: -webkit-optimize-contrast;
      image-rendering: crisp-edges;
      -webkit-font-smoothing: subpixel-antialiased;
      -webkit-backface-visibility: hidden;
      backface-visibility: hidden;
      transform: translateZ(0);
      -webkit-transform: translateZ(0);
      pointer-events: none;
      transition: opacity 0.05s linear;
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

        // Bornes strictes de sécurité et constantes d'amortissement
        const MIN_SCALE = 1.0;
        const MAX_SCALE = 3.5;
        const MAX_CANVAS_DIM = 4096; // Plafond matériel GPU anti-crash

        function bornerEchelle(valeur) {
          return Math.min(MAX_SCALE, Math.max(MIN_SCALE, valeur));
        }

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

        function appliquerZoomCss(targetScale, focalX, focalY, animate) {
          currentZoom = bornerEchelle(targetScale);
          window._currentZoom = currentZoom;
          const tempScale = currentZoom / appliedZoom;
          const container = document.getElementById('canvas-container');
          if (container) {
            if (animate) {
              container.style.transition = 'transform 0.1s ease-out';
            } else {
              container.style.transition = 'none';
            }
            if (typeof focalX === 'number' && typeof focalY === 'number') {
              const rect = container.getBoundingClientRect();
              const originX = ((focalX - rect.left) / rect.width) * 100;
              const originY = ((focalY - rect.top) / rect.height) * 100;
              container.style.transformOrigin = originX.toFixed(2) + '% ' + originY.toFixed(2) + '%';
            }
            container.style.transform = 'scale(' + tempScale.toFixed(4) + ')';
          }
          afficherBadgeZoom(Math.round(currentZoom * 100) + '%');
        }

        let renderSessionId = 0;
        let isReRasterizing = false;

        function annulerReRasterisationEnCours() {
          if (!isReRasterizing) return;
          renderSessionId++;
          isReRasterizing = false;
          const pageNums = Object.keys(pageRenderStates).map(Number);
          pageNums.forEach(function(pageNum) {
            const pState = pageRenderStates[pageNum];
            if (pState && pState.offscreenTask) {
              try {
                pState.offscreenTask.cancel();
              } catch (e) {}
              pState.offscreenTask = null;
            }
          });
        }

        function estPageDansViewport(wrapper) {
          if (!wrapper) return false;
          const rect = wrapper.getBoundingClientRect();
          const windowHeight = window.innerHeight || document.documentElement.clientHeight;
          return (rect.bottom >= -350 && rect.top <= windowHeight + 350);
        }

        function reRasteriserPagesDynamiques() {
          const currentSessionId = ++renderSessionId;
          const targetZoom = currentZoom;
          const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
          const MAX_CANVAS_DIM = 4096;

          const pageNums = Object.keys(pageRenderStates).map(Number);
          if (pageNums.length === 0) return;

          // 1. Détecter les pages actuellement visibles dans le viewport (+ marge de 350px)
          const pagesVisibles = pageNums.filter(function(pageNum) {
            const pState = pageRenderStates[pageNum];
            return pState && estPageDansViewport(pState.wrapper);
          });

          // Fallback : cibler la page 1 si aucune n'est détectée
          const cibles = pagesVisibles.length > 0 ? pagesVisibles : [1];

          // 2. Filtrer uniquement les pages qui ne sont PAS encore rendues à targetZoom
          const pagesARendre = cibles.filter(function(pageNum) {
            const pState = pageRenderStates[pageNum];
            return pState && pState.renderedZoom !== targetZoom;
          });

          // Si aucune page visible ne nécessite de rendu et que l'échelle est déjà synchronisée
          if (pagesARendre.length === 0 && appliedZoom === targetZoom) {
            return;
          }

          isReRasterizing = true;
          const renderTasks = [];

          pagesARendre.forEach(function(pageNum) {
            const pState = pageRenderStates[pageNum];
            if (!pState || !pState.page) return;

            // Annuler la tâche offscreen précédente si encore en cours
            if (pState.offscreenTask) {
              try {
                pState.offscreenTask.cancel();
              } catch (e) {}
              pState.offscreenTask = null;
            }

            const unscaledViewport = pState.page.getViewport({ scale: 1.0 });
            const finalScale = pState.baseScale * targetZoom;

            // Plafonnement CPU / Échelle effective : 1.75 * dpr max pour garantir un rendu < 60ms
            let effectiveRenderScale = Math.min(finalScale * dpr, 1.75 * dpr);
            const renderW = unscaledViewport.width * effectiveRenderScale;
            const renderH = unscaledViewport.height * effectiveRenderScale;
            if (renderW > MAX_CANVAS_DIM || renderH > MAX_CANVAS_DIM) {
              const capRatio = Math.min(MAX_CANVAS_DIM / renderW, MAX_CANVAS_DIM / renderH);
              effectiveRenderScale = effectiveRenderScale * capRatio;
            }

            const renderViewport = pState.page.getViewport({ scale: effectiveRenderScale });

            // Zero-Allocation Buffer : Réutilisation directe du bufferCanvas existant
            const targetBuffer = pState.bufferCanvas;
            targetBuffer.width = Math.round(renderViewport.width);
            targetBuffer.height = Math.round(renderViewport.height);

            const offscreenCtx = targetBuffer.getContext('2d', { alpha: false, willReadFrequently: false });
            offscreenCtx.imageSmoothingEnabled = true;
            offscreenCtx.imageSmoothingQuality = 'high';

            const task = pState.page.render({
              canvasContext: offscreenCtx,
              viewport: renderViewport
            });
            pState.offscreenTask = task;

            const promise = task.promise.then(function() {
              return {
                pageNum: pageNum,
                pState: pState
              };
            }).catch(function(err) {
              if (err && (err.name === 'RenderingCancelledException' || err.message === 'Rendering cancelled')) {
                return null;
              }
              console.warn('[PDF.js] Erreur offscreen render page ' + pageNum, err);
              return null;
            });

            renderTasks.push(promise);
          });

          // Dès que les rendus hors-champ sont résolus : permutation atomique synchrone en 1 frame
          Promise.all(renderTasks).then(function(results) {
            if (currentSessionId !== renderSessionId) return;

            requestAnimationFrame(function() {
              if (currentSessionId !== renderSessionId) return;

              const scrollEl = document.scrollingElement || document.documentElement || document.body;
              const zoomChange = (appliedZoom !== targetZoom);

              let scrollRatioY = 0;
              let scrollRatioX = 0;
              if (zoomChange) {
                scrollRatioY = scrollEl.scrollTop / (scrollEl.scrollHeight - scrollEl.clientHeight || 1);
                scrollRatioX = scrollEl.scrollLeft / (scrollEl.scrollWidth - scrollEl.clientWidth || 1);

                // Découplage strict de la géométrie : mise à jour des dimensions stables de TOUS les wrappers
                pageNums.forEach(function(num) {
                  const ps = pageRenderStates[num];
                  if (ps && ps.wrapper) {
                    ps.wrapper.style.width = Math.round(ps.baseWidth * targetZoom) + 'px';
                    ps.wrapper.style.height = Math.round(ps.baseHeight * targetZoom) + 'px';
                  }
                });
              }

              // Permutation de visibilité Zero-Allocation (0 createElement, 0 replaceChild, 0 garbage collection)
              results.forEach(function(res) {
                if (!res) return;
                const pState = res.pState;
                const newlyRendered = pState.bufferCanvas;
                const previouslyActive = pState.activeCanvas;

                // Rendre le nouveau buffer visible
                newlyRendered.style.zIndex = '2';
                newlyRendered.style.opacity = '1';

                // Masquer l'ancien canvas sans le détruire pour le réutiliser au prochain cycle
                previouslyActive.style.zIndex = '1';
                previouslyActive.style.opacity = '0';

                // Inverser les rôles
                pState.activeCanvas = newlyRendered;
                pState.bufferCanvas = previouslyActive;
                pState.renderedZoom = targetZoom;
                pState.offscreenTask = null;
              });

              if (zoomChange) {
                const container = document.getElementById('canvas-container');
                if (container) {
                  container.style.transition = 'none';
                  container.style.transformOrigin = 'top center';
                  container.style.transform = 'scale(1)';
                }
                appliedZoom = targetZoom;

                // Réalignement synchrone sans animation du scroll
                const maxScrollY = scrollEl.scrollHeight - scrollEl.clientHeight;
                const maxScrollX = scrollEl.scrollWidth - scrollEl.clientWidth;
                if (maxScrollY > 0) {
                  scrollEl.scrollTop = Math.round(scrollRatioY * maxScrollY);
                }
                if (maxScrollX > 0) {
                  scrollEl.scrollLeft = Math.round(scrollRatioX * maxScrollX);
                }
              }

              isReRasterizing = false;
            });
          });
        }

        let idleHandle = null;

        function programmerReRasterisation(delaiMs) {
          if (debounceTimer) clearTimeout(debounceTimer);
          if (idleHandle) {
            if (window.cancelIdleCallback) {
              window.cancelIdleCallback(idleHandle);
            } else {
              clearTimeout(idleHandle);
            }
            idleHandle = null;
          }

          debounceTimer = setTimeout(function() {
            // Décalage non-bloquant via requestIdleCallback pour ne jamais figer le thread principal
            const planifierRendu = window.requestIdleCallback || function(cb) { return setTimeout(cb, 50); };
            idleHandle = planifierRendu(function() {
              idleHandle = null;
              reRasteriserPagesDynamiques();
            }, { timeout: 180 });
          }, delaiMs || 90);
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

            // Garde-fou GPU initial
            let initRenderScale = baseScale * dpr;
            const initW = unscaledViewport.width * initRenderScale;
            const initH = unscaledViewport.height * initRenderScale;
            if (initW > MAX_CANVAS_DIM || initH > MAX_CANVAS_DIM) {
              const capRatio = Math.min(MAX_CANVAS_DIM / initW, MAX_CANVAS_DIM / initH);
              initRenderScale = initRenderScale * capRatio;
            }
            const renderViewport = page.getViewport({ scale: initRenderScale });

            const wrapper = document.createElement('div');
            wrapper.className = 'page-wrapper';
            wrapper.id = 'page-wrapper-' + pageNum;
            wrapper.style.width = displayViewport.width + 'px';
            wrapper.style.height = displayViewport.height + 'px';

            // Canvas A (Actif visible)
            const canvasA = document.createElement('canvas');
            canvasA.id = 'pdf-canvas-' + pageNum + '-a';
            canvasA.width = Math.round(renderViewport.width);
            canvasA.height = Math.round(renderViewport.height);
            canvasA.style.position = 'absolute';
            canvasA.style.top = '0';
            canvasA.style.left = '0';
            canvasA.style.width = '100%';
            canvasA.style.height = '100%';
            canvasA.style.display = 'block';
            canvasA.style.zIndex = '2';
            canvasA.style.opacity = '1';

            // Canvas B (Tampon persistant hors-champ Zero-Allocation)
            const canvasB = document.createElement('canvas');
            canvasB.id = 'pdf-canvas-' + pageNum + '-b';
            canvasB.width = 1;
            canvasB.height = 1;
            canvasB.style.position = 'absolute';
            canvasB.style.top = '0';
            canvasB.style.left = '0';
            canvasB.style.width = '100%';
            canvasB.style.height = '100%';
            canvasB.style.display = 'block';
            canvasB.style.zIndex = '1';
            canvasB.style.opacity = '0';

            const contextA = canvasA.getContext('2d', { alpha: false, willReadFrequently: false });
            contextA.imageSmoothingEnabled = true;
            contextA.imageSmoothingQuality = 'high';

            wrapper.appendChild(canvasA);
            wrapper.appendChild(canvasB);
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
              canvasContext: contextA,
              viewport: renderViewport
            });

            pageRenderStates[pageNum] = {
              page: page,
              baseScale: baseScale,
              baseWidth: displayViewport.width,
              baseHeight: displayViewport.height,
              activeCanvas: canvasA,
              bufferCanvas: canvasB,
              renderedZoom: 1.0,
              renderTask: renderTask,
              offscreenTask: null
            };
            
            renderTask.promise.then(function() {
              if (pageRenderStates[pageNum] && pageRenderStates[pageNum].renderTask === renderTask) {
                pageRenderStates[pageNum].renderTask = null;
              }

              // 1. Masquer explicitement le message de chargement
              const loader = document.getElementById('loading');
              if (loader) loader.style.display = 'none';
              
              // 2. Rendre le canvas visible
              canvasA.style.display = 'block';
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

    // --- Suivi cinématique tactile direct 1:1 & RAF Ticking 120 FPS ---
    let initialPinchDist = 0;
    let initialPinchScale = 1.0;
    let isPinching = false;
    let pinchFocalX = null;
    let pinchFocalY = null;
    let pinchRafId = null;
    let pendingPinchDist = 0;
    let pendingFocalX = null;
    let pendingFocalY = null;

    // 1. Débrayage strict des transitions CSS & Capture du point focal (Mobile / Tablettes)
    window.addEventListener('touchstart', function(e) {
      if (e.touches && e.touches.length === 2) {
        isPinching = true;
        const container = document.getElementById('canvas-container');
        if (container) {
          container.style.transition = 'none';
        }
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialPinchDist = Math.hypot(dx, dy);
        initialPinchScale = window._currentZoom || 1.0;

        pinchFocalX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        pinchFocalY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        pendingPinchDist = initialPinchDist;
        pendingFocalX = pinchFocalX;
        pendingFocalY = pinchFocalY;
      }
    }, { passive: false });

    // 2. Découplage complet de l'écouteur tactile (RAF Ticking 120 FPS sans manipulation DOM directe)
    window.addEventListener('touchmove', function(e) {
      if (isPinching && e.touches && e.touches.length === 2) {
        e.preventDefault(); // Bloquer impérativement le zoom natif WebView
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pendingPinchDist = Math.hypot(dx, dy);
        pendingFocalX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        pendingFocalY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

        if (!pinchRafId) {
          pinchRafId = requestAnimationFrame(function() {
            pinchRafId = null;
            if (!isPinching || initialPinchDist <= 0 || !window._appliquerZoomCss) return;
            const ratio = pendingPinchDist / initialPinchDist;
            const targetScale = initialPinchScale * ratio;
            window._appliquerZoomCss(targetScale, pendingFocalX, pendingFocalY, false);
          });
        }
      }
    }, { passive: false });

    window.addEventListener('touchend', function(e) {
      if (isPinching && (!e.touches || e.touches.length < 2)) {
        isPinching = false;
        if (pinchRafId) {
          cancelAnimationFrame(pinchRafId);
          pinchRafId = null;
        }
        initialPinchDist = 0;
        // Rappel doux aux bornes si nécessaire
        const currentZ = window._currentZoom || 1.0;
        const clampedZ = Math.min(3.5, Math.max(1.0, currentZ));
        if (clampedZ !== currentZ && window._appliquerZoomCss) {
          window._appliquerZoomCss(clampedZ, undefined, undefined, true);
        }
        if (window._programmerReRasterisation) {
          window._programmerReRasterisation(90);
        }
      }
    }, { passive: true });

    // 2. Zoom Ctrl + Molette ou Trackpad Pinch (PC / Navigateurs Web)
    window.addEventListener('wheel', function(e) {
      if ((e.ctrlKey || e.metaKey) && window._appliquerZoomCss) {
        e.preventDefault();
        const container = document.getElementById('canvas-container');
        if (container) {
          container.style.transition = 'none';
        }
        const pasZoom = 0.018;
        const direction = -Math.sign(e.deltaY);
        const currentZ = window._currentZoom || 1.0;
        const cibleZoom = currentZ * (1 + direction * pasZoom);
        window._appliquerZoomCss(cibleZoom, e.clientX, e.clientY, false);
        if (window._programmerReRasterisation) {
          window._programmerReRasterisation(90);
        }
      }
    }, { passive: false });

    // 3. Double-tap pour bascule rapide amortie (1.0x <-> 2.0x)
    let dernierTouchEnd = 0;
    window.addEventListener('touchend', function(e) {
      if (isPinching) return;
      const maintenant = Date.now();
      if (maintenant - dernierTouchEnd < 300 && e.changedTouches && e.changedTouches.length === 1 && window._appliquerZoomCss) {
        const currentZ = window._currentZoom || 1.0;
        const target = currentZ > 1.25 ? 1.0 : 2.0;
        const tapX = e.changedTouches[0].clientX;
        const tapY = e.changedTouches[0].clientY;
        window._appliquerZoomCss(target, tapX, tapY, true);
        if (window._programmerReRasterisation) {
          window._programmerReRasterisation(90);
        }
      }
      dernierTouchEnd = maintenant;
    }, { passive: true });

    // Priorité absolue au scroll : Interrompre tout calcul vectoriel lourd si l'utilisateur scroll
    window.addEventListener('scroll', () => {
      if (window._annulerReRasterisation) {
        window._annulerReRasterisation();
      }
      if (!isPinching && window._programmerReRasterisation) {
        window._programmerReRasterisation(150);
      }

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
    }, { passive: true });
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
              <LecteurPdfWeb
                documentId={docObj.id || (params as any)?.id || ''}
                urlFichier={sourcePdfData}
                estVerrouille={!estDebloque}
                limiteApercuPages={limiteApercuPages}
                prix={docObj.prix}
                estSombre={couleurs.estSombre}
                onPageChange={(current, total) => {
                  setPageState({ current, total });
                }}
                onDocumentLoad={(total) => {
                  setPageState(prev => ({ ...prev, total }));
                }}
                onReessayer={() => setCleRechargement(prev => prev + 1)}
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

            {/* Indicateur de Page Flottant (Mobile uniquement) */}
            {Platform.OS !== 'web' && (
              <View style={[styles.floatingPageIndicator, { bottom: !estDebloque ? 80 : 24 }]}>
                <Text style={styles.pageIndicatorText}>
                  Page {pageState.current} / {pageState.total}
                </Text>
              </View>
            )}
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

