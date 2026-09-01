import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  Platform,
  StatusBar,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as FileSystem from 'expo-file-system/legacy';
import { Accelerometer } from 'expo-sensors';
import { useApp } from '../store/ContexteApp';

import { RootStackParamList } from '../navigation/NavigateurApp';
import { getDocumentPdfUrl, exporterDocumentVersAppareil, verifierFichierLocalExiste } from '../services/serviceDocument';

import ModaleAchat from '../components/ModaleAchat';
import ModaleVip from '../components/ModaleVip';

type DocumentViewerRouteProp = RouteProp<RootStackParamList, 'DocumentViewer'>;

export default function EcranLecteurDocument() {
  const navigation = useNavigation();
  const route = useRoute<DocumentViewerRouteProp>();
  const { document, onUnlock } = route.params;
  const { docsDebloquesIds, debloquerDocument, couleurs, estAbonneVIP } = useApp();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const styles = getStyles(couleurs);

  // Détection stricte d'un document personnel importé (Stockage 100% local)
  const cheminBrut = document.cheminLocal || (document as any).file_path || '';
  const estDocumentImporte = 
    Boolean((document as any).est_importe) ||
    Boolean((document as any).estImporte) ||
    document.id.startsWith('imported_') ||
    cheminBrut.startsWith('file:') ||
    cheminBrut.startsWith('blob:') ||
    cheminBrut.startsWith('data:') ||
    cheminBrut.startsWith('content:');

  // Les documents importés sont toujours 100% débloqués et ne nécessitent aucun calcul de paywall
  const estDebloqueGlobalement = estDocumentImporte || docsDebloquesIds.includes(document.id) || estAbonneVIP;
  const estVerrouille = !estDocumentImporte && document.prix > 0 && !estDebloqueGlobalement;

  const [modaleAchatVisible, setModaleAchatVisible] = useState(false);
  const [modaleVipVisible, setModaleVipVisible] = useState(false);
  const [nombrePagesReel, setNombrePagesReel] = useState<number>(document.nombrePages || 1);
  const [pageState, setPageState] = useState({ current: 1, total: document.nombrePages || 1 });
  const [hasError, setHasError] = useState(false);
  const [fichierIntrouvable, setFichierIntrouvable] = useState(false);
  const [chargementLocal, setChargementLocal] = useState(true);
  const [sourcePdfData, setSourcePdfData] = useState<string>('');
  const [modePaysageActif, setModePaysageActif] = useState(false);

  // Détection dynamique et fluide du mode Paysage (asservie au bouton)
  const estPaysage = Platform.OS === 'web' ? (modePaysageActif || screenWidth > screenHeight) : modePaysageActif;

  // Paramètres de coupure dynamiques
  const limiteApercuType = document.limiteApercuType ?? 'pourcentage';
  const limiteApercuValeur = document.limiteApercuValeur ?? 30;
  const limiteApercuPages = limiteApercuType === 'page' ? limiteApercuValeur : 1;

  // Préparation de la source PDF (Conversion Base64 sécurisée sur Mobile pour contourner les restrictions CORS WebView)
  useEffect(() => {
    let estMonte = true;
    async function preparerSource() {
      try {
        setChargementLocal(true);

        if (estDocumentImporte) {
          if (Platform.OS !== 'web') {
            const existe = await verifierFichierLocalExiste(cheminBrut);
            if (!existe) {
              console.warn('❌ Fichier local introuvable sur l\'appareil :', cheminBrut);
              if (estMonte) {
                setFichierIntrouvable(true);
                setChargementLocal(false);
              }
              return;
            }


            // Lecture en Base64 pour injecter directement dans PDF.js sans requête réseau
            const base64 = await FileSystem.readAsStringAsync(cheminBrut, {
              encoding: FileSystem.EncodingType.Base64,
            });
            if (estMonte) {
              setSourcePdfData(`data:application/pdf;base64,${base64}`);
            }
          } else {
            // Sur Web, l'URL blob ou data est directement utilisable
            if (estMonte) {
              setSourcePdfData(cheminBrut);
            }
          }
        } else {
          // Document Supabase distant
          const urlPublique = getDocumentPdfUrl(cheminBrut);
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
  }, [cheminBrut, estDocumentImporte]);

  // Synchronisation du nombre réel de pages et réceptions des messages sur Web
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleWebMessage = (event: MessageEvent) => {
        if (event.data) {
          try {
            const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            if (data.type === 'pageChange') {
              const total = data.totalCount || data.totalPages || data.total;
              if (total && total > 0) {
                setNombrePagesReel(total);
                setPageState({
                  current: data.currentPage || 1,
                  total: total,
                });
              }
            } else if (data.type === 'buy') {
              setModaleAchatVisible(true);
            } else if (data.type === 'vip') {
              setModaleVipVisible(true);
            }
          } catch (e) {
            // Message non JSON, ignorer
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

  const handleBack = () => {
    navigation.goBack();
  };

  const handleUnlockSuccess = () => {
    debloquerDocument(document.id);
    if (onUnlock) {
      onUnlock(document.id);
    }
  };

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

  // Code HTML5/PDF.js cross-platform standard & ultra-robuste avec fond clair/blanc dynamique
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
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05);
      border: 1px solid ${couleurs.estSombre ? '#27272A' : '#E2E8F0'};
      border-radius: 6px;
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
      padding: 24px;
      margin: 20px 0 60px 0;
      background-color: ${couleurs.estSombre ? '#1E1B18' : '#FFFBEB'};
      border: 1px solid ${couleurs.estSombre ? '#452A18' : '#FDE68A'};
      color: ${couleurs.estSombre ? '#FCD34D' : '#92400E'};
      border-radius: 16px;
      font-size: 14px;
      text-align: center;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.12);
    }
    .blur-overlay {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(to bottom, 
        rgba(${couleurs.estSombre ? '18,18,18' : '255,255,255'}, 0) 0%, 
        rgba(${couleurs.estSombre ? '18,18,18' : '255,255,255'}, 0.95) 20%, 
        rgba(${couleurs.estSombre ? '18,18,18' : '255,255,255'}, 1) 100%
      );
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justifyContent: center;
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
    .overlay-buttons { display: flex; gap: 10px; justify-content: center; }
    .btn-buy {
      background-color: #6B1124;
      color: #FFFFFF;
      border: none;
      padding: 12px 18px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
    }
    .btn-vip {
      background-color: #E5C158;
      color: #6B1124;
      border: none;
      padding: 12px 18px;
      border-radius: 10px;
      font-weight: 800;
      font-size: 13px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div id="loading">📄 Chargement haute fidélité du document...</div>
  <div id="canvas-container"></div>
  
  ${estVerrouille && limiteApercuType === 'page' ? `
    <div id="limit-banner">
      <div class="overlay-lock-icon">🔒</div>
      <div class="overlay-title">Aperçu gratuit limité à ${limiteApercuValeur} page(s)</div>
      <div class="overlay-subtitle" id="banner-pages-text">Débloquez le cours complet pour poursuivre votre lecture.</div>
      <div class="overlay-buttons">
        <button class="btn-buy" onclick="triggerPayment('buy')">🛒 Acheter (${document.prix ?? 100} F)</button>
        <button class="btn-vip" onclick="triggerPayment('vip')">🎁 Pass VIP (500 F)</button>
      </div>
    </div>
  ` : ''}

  <script>
    const url = '${sourcePdfData}';
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

    function triggerPayment(type) {
      const payload = JSON.stringify({ type: type });
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(payload);
      } else if (window.parent) {
        window.parent.postMessage(payload, '*');
      }
    }
    window.triggerPayment = triggerPayment;

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
      const bannerText = document.getElementById('banner-pages-text');
      if (bannerText) {
        bannerText.innerText = "Débloquez le cours complet de " + realTotalPages + " pages pour poursuivre votre lecture.";
      }
      
      let maxPages = pdf.numPages;
      let targetCutoffPage = 1;
      let percentOnTargetPage = ${limiteApercuValeur};
      let overlayTitle = "Aperçu limité";

      const rawType = '${limiteApercuType}'.toLowerCase();

      if (${estVerrouille}) {
        if (rawType === 'page') {
          // RÉCEPTEUR 1 : MODE PAGES FIXES
          const pageCount = Number(${limiteApercuValeur});
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
          let tPage = ${document.limiteApercuPages ?? 1};
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

      // Largeur optimale et densité haute fidélité (Ultra-Crisp Text équivalent natif)
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


          // Coupure sur la page cible
          if (${estVerrouille} && targetCutoffPage > 0 && pageNum === targetCutoffPage) {
            const blurOverlay = document.createElement('div');
            blurOverlay.className = 'blur-overlay';
            blurOverlay.style.top = percentOnTargetPage + '%';
            blurOverlay.innerHTML = \`
              <div class="overlay-card">
                <div class="overlay-lock-icon">🔒</div>
                <div class="overlay-title">\${overlayTitle}</div>
                <div class="overlay-subtitle">Débloquez l'intégralité du cours de \${pdf.numPages} pages pour poursuivre votre apprentissage.</div>
                <div class="overlay-buttons">
                  <button class="btn-buy" onclick="triggerPayment('buy')">🛒 Acheter (${document.prix ?? 100} F)</button>
                  <button class="btn-vip" onclick="triggerPayment('vip')">🎁 Pass VIP (500 F)</button>
                </div>
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

    window.addEventListener('scroll', () => {
      const scrollPos = window.scrollY + window.innerHeight / 3;
      const wrappers = document.querySelectorAll('.page-wrapper');
      wrappers.forEach((w, idx) => {
        const top = w.offsetTop;
        const height = w.offsetHeight;
        if (scrollPos >= top && scrollPos < top + height) {
          notifyPageChange(idx + 1, wrappers.length);
        }
      });
    });
  </script>
</body>
</html>
    `
  };

  return (

    <SafeAreaView style={styles.container}>
      <StatusBar 
        barStyle="light-content" 
        backgroundColor={couleurs.fondEntete} 
      />
      {/* Entête Adaptatif (Compact en Mode Paysage) */}
      <View style={[styles.header, estPaysage && styles.headerPaysage]}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={estPaysage ? 20 : 24} color="#FFFFFF" />
        </TouchableOpacity>
        
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, estPaysage && styles.headerTitlePaysage]} numberOfLines={1}>
            {document.titre}
          </Text>
          <Text style={[styles.headerSubtitle, estPaysage && styles.headerSubtitlePaysage]} numberOfLines={1}>
            {document.categorie} • {nombrePagesReel} page{nombrePagesReel > 1 ? 's' : ''}
          </Text>
        </View>

        {document.estCertifie && (
          <View style={[styles.certifiedBadge, estPaysage && { paddingVertical: 1, paddingHorizontal: 4 }]}>
            <Text style={[styles.certifiedBadgeText, estPaysage && { fontSize: 8 }]}>🎓 Certifié</Text>
          </View>
        )}

        {/* Boutons d'Action (uniquement si débloqué) */}
        {!estVerrouille && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              style={[styles.rotateBtn, estPaysage && styles.rotateBtnPaysage]}
              onPress={async () => {
                const res = await exporterDocumentVersAppareil(document);
                if (Platform.OS === 'web') {
                  window.alert(res.message);
                } else {
                  Alert.alert("Exportation 💾", res.message);
                }
              }}
            >
              <Ionicons name="download-outline" size={estPaysage ? 15 : 18} color="#FFFFFF" />
              <Text style={[styles.rotateBtnText, estPaysage && styles.rotateBtnTextPaysage]}>Exporter</Text>
            </TouchableOpacity>

            {/* Bouton Rotation Paysage/Portrait : Uniquement sur Mobile (iOS/Android) */}
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
        )}
      </View>

      {/* Zone du document */}
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
              style={[styles.buyBtn, { marginTop: 16, paddingHorizontal: 20, backgroundColor: couleurs.primaire }]} 
              onPress={handleBack}
            >
              <Text style={styles.buyBtnText}>Retour à la bibliothèque</Text>
            </TouchableOpacity>
          </View>
        ) : sourcePdfData && !hasError ? (
          <View style={{ flex: 1, width: '100%', height: '100%', overflow: 'hidden' }}>
            {Platform.OS === 'web' ? (
              // Sur PC/Web : Rendu PDF.js direct garantissant un fond blanc pur / clair adaptatif sans fond noir de navigateur
              <iframe
                srcDoc={webViewSource.html}
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  border: 'none', 
                  display: 'block', 
                  backgroundColor: couleurs.estSombre ? '#121212' : '#FFFFFF' 
                }}
                title={document.titre}
              />
            ) : (
              <WebView
                originWhitelist={['*']}
                source={webViewSource}
                onMessage={(event) => {
                  try {
                    const data = JSON.parse(event.nativeEvent.data);
                    if (data.type === 'pageChange') {
                      const total = data.totalCount || data.totalPages || data.total;
                      if (total && total > 0) {
                        setNombrePagesReel(total);
                        setPageState({
                          current: data.currentPage || 1,
                          total: total
                        });
                      }
                    } else if (data.type === 'buy') {
                      setModaleAchatVisible(true);
                    } else if (data.type === 'vip') {
                      setModaleVipVisible(true);
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
            <View
              style={[
                styles.floatingPageIndicator,
                {
                  bottom:
                    estVerrouille ||
                    (estAbonneVIP && !docsDebloquesIds.includes(document.id) && !estDocumentImporte)
                      ? 80
                      : 24,
                },
              ]}
            >
              <Text style={styles.pageIndicatorText}>
                Page {pageState.current} / {nombrePagesReel}
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

        {/* 👑 Barre d'Acquisition VIP Fixe en Bas de Page (Lecture intégrale autorisée) */}
        {estAbonneVIP && !docsDebloquesIds.includes(document.id) && !estDocumentImporte && (
          <View style={styles.vipFloatingBar}>
            <View style={styles.vipFloatingIcon}>
              <Ionicons name="sparkles" size={18} color="#10B981" />
            </View>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.vipFloatingTitle}>Inclus dans votre Pass VIP</Text>
              <Text style={styles.vipFloatingSub} numberOfLines={1}>
                Ajoutez ce cours à votre espace VIP
              </Text>
            </View>
            <TouchableOpacity
              style={styles.vipFloatingBtn}
              onPress={async () => {
                const { acquerirDocumentVIP } = await import('../services/serviceDocument');
                const res = await acquerirDocumentVIP(document.id);
                if (res.success) {
                  debloquerDocument(document.id);
                  if (onUnlock) onUnlock(document.id);
                  Alert.alert(
                    'Accès VIP 👑',
                    'Ce cours a été ajouté avec succès à votre dossier VIP !'
                  );
                } else {
                  Alert.alert('Erreur ❌', res.message);
                }
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="download-outline" size={16} color="#121212" style={{ marginRight: 4 }} />
              <Text style={styles.vipFloatingBtnText}>Acquérir</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Paywall Natif superposé au bas de l'écran en cas d'aperçu verrouillé pour Non-VIP */}
        {estVerrouille && limiteApercuValeur < 100 && (
          <View style={styles.lockOverlayPanel}>
            <View style={styles.lockIconContainer}>
              <Ionicons name="lock-closed" size={20} color={couleurs.accent} />
            </View>
            <View style={styles.lockTextContainer}>
              <Text style={styles.lockTitle}>
                {limiteApercuValeur === 0
                  ? 'Document Verrouillé (Achat requis)'
                  : limiteApercuType === 'page'
                    ? `Aperçu Limité (${limiteApercuValeur} p.)`
                    : (limiteApercuType?.startsWith('fluide') || limiteApercuType?.startsWith('neutre'))
                      ? `Aperçu Gratuit (Page ${document.limiteApercuPages ?? 1})`
                      : `Aperçu Limité à ${Number(limiteApercuValeur) % 1 === 0 ? Number(limiteApercuValeur) : Number(limiteApercuValeur).toFixed(1)}%`}
              </Text>
              <Text style={styles.lockSubtitle}>
                Débloquez le cours complet de {nombrePagesReel} pages.
              </Text>
            </View>

            <View style={styles.ctaContainer}>
              <TouchableOpacity
                style={styles.buyBtn}
                onPress={() => setModaleAchatVisible(true)}
              >
                <Ionicons name="cart" size={14} color={couleurs.blanc} />
                <Text style={styles.buyBtnText}>Acheter ({document.prix ?? 100} F)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.vipBtn}
                onPress={() => setModaleVipVisible(true)}
              >
                <Ionicons name="gift" size={14} color={couleurs.primaire} />
                <Text style={styles.vipBtnText}>Pass VIP (500 F)</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Modales de paiement */}
      <ModaleAchat
        visible={modaleAchatVisible}
        onClose={() => setModaleAchatVisible(false)}
        onSuccess={handleUnlockSuccess}
        documentTitle={document.titre}
        documentId={document.id}
        documentPrix={document.prix ?? 100}
      />


      <ModaleVip
        visible={modaleVipVisible}
        onClose={() => setModaleVipVisible(false)}
        onSuccess={handleUnlockSuccess}
      />
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
    backgroundColor: couleurs.fondEntete,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ? StatusBar.currentHeight + 8 : 36) : (Platform.OS === 'ios' ? 14 : 12),
    paddingBottom: 16,
    paddingHorizontal: 16,
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
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerTitlePaysage: {
    fontSize: 13,
  },
  headerSubtitle: {
    fontSize: 11,
    color: couleurs.accent,
    marginTop: 2,
  },
  headerSubtitlePaysage: {
    fontSize: 9,
    marginTop: 0,
  },
  certifiedBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: couleurs.accent,
  },
  certifiedBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#FFFFFF',
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
  lockOverlayPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: couleurs.estSombre ? 'rgba(28, 28, 30, 0.96)' : 'rgba(255, 255, 255, 0.96)',
    borderTopWidth: 1.5,
    borderColor: couleurs.bordure,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  lockIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: couleurs.primaire,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  lockTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  lockTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: couleurs.texte,
  },
  lockSubtitle: {
    fontSize: 11,
    color: couleurs.texteSecondaire,
    marginTop: 2,
    lineHeight: 14,
  },
  ctaContainer: {
    flexDirection: 'column',
    gap: 4,
  },
  buyBtn: {
    backgroundColor: couleurs.primaire,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  buyBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 11,
  },
  vipBtn: {
    backgroundColor: couleurs.accent,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  vipBtnText: {
    color: couleurs.primaire,
    fontWeight: 'bold',
    fontSize: 11,
  },
  vipFloatingBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: couleurs.estSombre ? 'rgba(20, 20, 22, 0.95)' : 'rgba(255, 255, 255, 0.96)',
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(212, 175, 55, 0.4)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  vipFloatingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  vipFloatingTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#10B981',
  },
  vipFloatingSub: {
    fontSize: 11,
    color: couleurs.texteSecondaire,
    marginTop: 1,
  },
  vipFloatingBtn: {
    backgroundColor: '#6B1124',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    shadowColor: '#6B1124',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  vipFloatingBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FAF6EB',
  },
});
