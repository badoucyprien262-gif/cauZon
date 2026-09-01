import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, StatusBar, ActivityIndicator, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as FileSystem from 'expo-file-system/legacy';
import { Accelerometer } from 'expo-sensors';
import { getDocumentPdfUrl, verifierFichierLocalExiste } from '../services/serviceDocument';

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
  const [chargementLocal, setChargementLocal] = useState(true);
  const [sourcePdfData, setSourcePdfData] = useState<string>('');
  const [pageState, setPageState] = useState({ current: 1, total: 1 });
  const [modePaysageActif, setModePaysageActif] = useState(false);

  // Détection dynamique et fluide du mode Paysage (asservie au bouton)
  const estPaysage = Platform.OS === 'web' ? (modePaysageActif || screenWidth > screenHeight) : modePaysageActif;


  const { 
    titre, 
    filePath, 
    estDebloque, 
    limiteApercuPages = 3,
    limiteApercuType = 'pourcentage',
    limiteApercuValeur = 30
  } = route?.params || {
    titre: 'Document',
    filePath: '',
    estDebloque: false,
    limiteApercuPages: 3,
    limiteApercuType: 'pourcentage',
    limiteApercuValeur: 30,
  };

  const estLocalOuImporte = 
    filePath.startsWith('file:') ||
    filePath.startsWith('blob:') ||
    filePath.startsWith('data:') ||
    filePath.startsWith('content:');

  // Préparation de la source PDF (Conversion Base64 sécurisée sur Mobile)
  useEffect(() => {
    let estMonte = true;
    async function preparerSource() {
      try {
        setChargementLocal(true);

        if (estLocalOuImporte) {
          if (Platform.OS !== 'web') {
            const existe = await verifierFichierLocalExiste(filePath);
            if (!existe) {
              console.warn('❌ Fichier local introuvable sur l\'appareil :', filePath);
              if (estMonte) {
                setFichierIntrouvable(true);
                setChargementLocal(false);
              }
              return;
            }


            const base64 = await FileSystem.readAsStringAsync(filePath, {
              encoding: FileSystem.EncodingType.Base64,
            });
            if (estMonte) {
              setSourcePdfData(`data:application/pdf;base64,${base64}`);
            }
          } else {
            if (estMonte) {
              setSourcePdfData(filePath);
            }
          }
        } else {
          const urlPublique = getDocumentPdfUrl(filePath);
          if (estMonte) {
            setSourcePdfData(urlPublique);
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
  }, [filePath, estLocalOuImporte]);

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
      height: auto !important;
      image-rendering: -webkit-optimize-contrast;
      image-rendering: crisp-edges;
      -webkit-font-smoothing: subpixel-antialiased;
      -webkit-backface-visibility: hidden;
      backface-visibility: hidden;
      transform: translateZ(0);
      -webkit-transform: translateZ(0);
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
    const url = '${sourcePdfData}';
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

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

    pdfjsLib.getDocument(url).promise.then(async (pdf) => {
      const loadingEl = document.getElementById('loading');
      if (loadingEl) loadingEl.style.display = 'none';
      const container = document.getElementById('canvas-container');
      
      const realTotalPages = pdf.numPages;

      // ── Calcul Proportionnel de Coupure Multi-Pages ──────────────────
      let maxPages = pdf.numPages;
      let targetCutoffPage = 1;
      let percentOnTargetPage = ${limiteApercuValeur};
      let overlayTitle = "Aperçu limité";

      const rawType = '${limiteApercuType}'.toLowerCase();

      if (!${estDebloque}) {
        if (rawType === 'page') {
          // RÉCEPTEUR 1 : MODE PAGES FIXES
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
          // RÉCEPTEUR 2 : MODE FLUIDE / NEUTRE (Position absolue Page + Hauteur relative au pixel près)
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
          // RÉCEPTEUR 3 : MODE POURCENTAGE CLASSIQUE
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
      const dpr = Math.max(window.devicePixelRatio || 1, 3.5);

      // Rendu asynchrone robuste de chaque page en ultra haute définition
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
          canvas.width = Math.round(renderViewport.width);
          canvas.height = Math.round(renderViewport.height);
          canvas.style.width = displayViewport.width + 'px';
          canvas.style.height = displayViewport.height + 'px';

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

          await page.render({
            canvasContext: context,
            viewport: renderViewport
          }).promise;

        } catch (pageErr) {
          console.warn('Erreur rendu page ' + pageNum, pageErr);
        }
      }
    }).catch(err => {
      const loadingEl = document.getElementById('loading');
      if (loadingEl) {
        loadingEl.innerHTML = [
          '<div style="text-align:center;padding:40px;">',
            '<p style="color:#DC2626;font-weight:bold;margin-bottom:8px;">⚠️ Impossible de charger le PDF</p>',
            '<p style="color:#6B7280;font-size:13px;margin-bottom:20px;">' + (err && err.message ? err.message : 'Erreur réseau ou fichier inaccessible') + '</p>',
            '<a href="' + url + '" target="_blank" style="background:#6B1124;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">📄 Ouvrir dans le navigateur</a>',
          '</div>'
        ].join('');
      }
    });

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
</body>
</html>
    `
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
            <Ionicons name="alert-circle-outline" size={54} color="#E74C3C" />
            <Text style={[styles.emptyText, { color: '#E74C3C', fontWeight: 'bold', fontSize: 16, marginTop: 12 }]}>
              Document Local Introuvable
            </Text>
            <Text style={[styles.emptyText, { fontSize: 13, marginTop: 6, paddingHorizontal: 24, textAlign: 'center' }]}>
              Le fichier de ce cours personnel a été déplacé ou supprimé de l'appareil. Vous pouvez le réimporter facilement depuis votre bibliothèque.
            </Text>
            <TouchableOpacity 
              style={{ marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: couleurs.primaire, borderRadius: 10 }} 
              onPress={handleBack}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 }}>Retour à la bibliothèque</Text>
            </TouchableOpacity>

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
              {hasError ? "Format de document non supporté ou fichier corrompu" : "Aucun fichier PDF disponible"}
            </Text>
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

