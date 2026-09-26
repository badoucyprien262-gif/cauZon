import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  Platform,
  StatusBar,
  ActivityIndicator,
  useWindowDimensions,
  BackHandler,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '../components/AppIcon';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as ScreenCapture from 'expo-screen-capture';
import * as FileSystem from 'expo-file-system/legacy';
import { Accelerometer } from 'expo-sensors';
import { useApp } from '../store/ContexteApp';

import { RootStackParamList } from '../navigation/NavigateurApp';
import { getDocumentPdfUrl, exporterDocumentVersTelephone, exporterDocumentVersAppareil, verifierFichierLocalExiste, telechargerFichierVersDossierPersistant, DOSSIER_DOCS_PERSISTANTS, normaliserCheminFichier, retrouverFichierDansSandbox, resoudreSourcePdf, sourceCacheMemoire } from '../services/serviceDocument';

import ModaleAchat from '../components/ModaleAchat';
import ModaleVip from '../components/ModaleVip';
import { LecteurPdf } from '../components/PdfViewer';

type DocumentViewerRouteProp = RouteProp<RootStackParamList, 'DocumentViewer'>;

export default function EcranLecteurDocument() {
  const navigation = useNavigation();
  const route = useRoute<DocumentViewerRouteProp>();
  const { document, onUnlock } = route.params;
  const { docsDebloquesIds, debloquerDocument, couleurs, estAbonneVIP, afficherToast } = useApp();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const styles = getStyles(couleurs);

  const estWeb = Platform.OS === 'web';
  const docParams = (route.params as any)?.document || (route.params as any) || {};

  // Extraction prioritaire et propre des références Cloud (sans chemins locaux physiques mobiles)
  const listeCandidatsCloud = [
    (document as any).cloud_path,
    docParams.cloud_path,
    (document as any).file_path,
    docParams.file_path,
    (document as any).filePath,
    (route.params as any)?.file_path,
    (route.params as any)?.filePath,
    (document as any).pdf_url,
    (document as any).url,
    docParams.pdf_url,
    docParams.url,
  ];

  const cloudPathNettoye = listeCandidatsCloud.find(c =>
    Boolean(c && typeof c === 'string' && !c.startsWith('file:') && !c.startsWith('content:') && !c.startsWith('/data/') && !c.startsWith('/storage/'))
  ) || '';

  const cheminLocalPhysique = estWeb ? '' : (
    (route.params as any)?.cheminLocal ||
    (route.params as any)?.document?.cheminLocal ||
    document.cheminLocal ||
    (document as any).local_uri ||
    docParams.local_uri ||
    ''
  );

  const cheminBrut = estWeb ? (cloudPathNettoye || (document as any).file_path || '') : (cheminLocalPhysique || cloudPathNettoye || (document as any).file_path || '');

  // Détection stricte d'un document personnel importé (Stockage local ou sauvegarde Cloud utilisateur)
  const estDocumentImporte = Boolean(
    (document as any).est_importe ||
    (document as any).estImporte ||
    docParams.est_importe ||
    docParams.estImporte ||
    document.id?.startsWith('imported_') ||
    docParams.id?.startsWith('imported_') ||
    cheminBrut.startsWith('file:') ||
    cheminBrut.startsWith('blob:') ||
    cheminBrut.startsWith('data:') ||
    cheminBrut.startsWith('content:') ||
    cheminBrut.startsWith('/data/') ||
    cheminBrut.startsWith('/storage/') ||
    (document as any).cloud_path ||
    (document as any).bucket === 'documents_utilisateurs' ||
    docParams.bucket === 'documents_utilisateurs'
  );

  // Les documents importés sont toujours 100% débloqués et ne nécessitent aucun calcul de paywall
  const estDebloqueGlobalement = estDocumentImporte || docsDebloquesIds.includes(document.id) || estAbonneVIP;
  const estVerrouille = !estDocumentImporte && document.prix > 0 && !estDebloqueGlobalement;

  // ⚡ Détection synchrone ultra-rapide (< 1 ms) si la source est déjà en mémoire RAM (Cache L1)
  const idDocumentCourant = document.id || docParams.id || cloudPathNettoye || cheminBrut;
  const sourceInitialeCache = sourceCacheMemoire.get(idDocumentCourant);
  const sourcePreteEnCache = Boolean(sourceInitialeCache?.source && (Date.now() - sourceInitialeCache.timestamp < 3600000));

  const [modaleAchatVisible, setModaleAchatVisible] = useState(false);
  const [modaleVipVisible, setModaleVipVisible] = useState(false);
  const [nombrePagesReel, setNombrePagesReel] = useState<number>(document.nombrePages || 1);
  const [pageState, setPageState] = useState({ current: 1, total: document.nombrePages || 1 });
  const [hasError, setHasError] = useState(false);
  const [fichierIntrouvable, setFichierIntrouvable] = useState(false);
  const [messageErreurPersonnalise, setMessageErreurPersonnalise] = useState<string>('');
  const [chargementLocal, setChargementLocal] = useState(!sourcePreteEnCache);
  const [sourcePdfData, setSourcePdfData] = useState<string>(sourcePreteEnCache ? sourceInitialeCache!.source : '');
  const [modePaysageActif, setModePaysageActif] = useState(false);
  const [cleRechargement, setCleRechargement] = useState(0);

  // Contrôles et persistance du zoom mobile natif
  const [zoomMobileActif, setZoomMobileActif] = useState<number>(1.0);

  const handleZoomIn = () => {
    setZoomMobileActif(prev => Math.min(4.0, Math.round((prev + 0.25) * 100) / 100));
  };

  const handleZoomOut = () => {
    setZoomMobileActif(prev => Math.max(1.0, Math.round((prev - 0.25) * 100) / 100));
  };

  const handleResetZoom = () => {
    setZoomMobileActif(prev => (prev > 1.05 ? 1.0 : 1.5));
  };

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
        if (!sourcePdfData) {
          setChargementLocal(true);
        }
        setHasError(false);
        setFichierIntrouvable(false);
        setMessageErreurPersonnalise('');

        // 🎯 Résolution unifiée résiliente (Local Vault / Docs Persistants vs URLs signées Supabase)
        const resolution = await resoudreSourcePdf({
          id: document.id || docParams.id,
          titre: document.titre || docParams.titre,
          file_path: cloudPathNettoye || (document as any).file_path || docParams.file_path,
          cheminLocal: cheminLocalPhysique,
          local_uri: estWeb ? '' : ((document as any).local_uri || docParams.local_uri),
          cloud_path: cloudPathNettoye || (document as any).cloud_path || docParams.cloud_path,
          bucket: (document as any).bucket || docParams.bucket || 'documents_utilisateurs',
          pdf_url: (document as any).pdf_url || docParams.pdf_url,
          url: (document as any).url || docParams.url,
        });

        if (!resolution.uri) {
          if (estMonte) {
            setMessageErreurPersonnalise(resolution.messageErreur || '');
            setFichierIntrouvable(true);
            setChargementLocal(false);
          }
          return;
        }

        if (resolution.isLocal && Platform.OS !== 'web') {
          // Lecture en Base64 pure (sans préfixe MIME) pour transmission sécurisée à PDF.js via Uint8Array
          const base64Brut = await FileSystem.readAsStringAsync(resolution.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const cleanBase64 = base64Brut.replace(/^data:application\/pdf;base64,/i, '');
          if (estMonte) {
            setSourcePdfData(cleanBase64);
            setChargementLocal(false);
          }
        } else {
          // Streaming direct HTTP/HTTPS ou blob Web
          if (estMonte) {
            setSourcePdfData(resolution.uri);
            setChargementLocal(false);
          }
        }
      } catch (err) {
        if (__DEV__) console.error('Erreur chargement source PDF :', err);
        if (estMonte) {
          setHasError(true);
          setChargementLocal(false);
        }
      }
    }

    preparerSource();
    return () => { estMonte = false; };
  }, [cheminBrut, estDocumentImporte, cleRechargement]);

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

  // 🛡️ Bouclier Anti-Capture d'écran sur mobile
  useEffect(() => {
    if (Platform.OS !== 'web') {
      ScreenCapture.preventScreenCaptureAsync().catch(() => {});
    }
  }, []);

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

  // 🤖 Interception rigoureuse du bouton Retour physique sous Android
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const onHardwareBackPress = () => {
      if (modaleAchatVisible) {
        setModaleAchatVisible(false);
        return true;
      }
      if (modaleVipVisible) {
        setModaleVipVisible(false);
        return true;
      }
      handleBack();
      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBackPress);
    return () => sub.remove();
  }, [modaleAchatVisible, modaleVipVisible, navigation]);

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
                afficherToast(
                  res.message,
                  "Exportation 💾",
                  res.success ? "succes" : "erreur"
                );
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
            <Ionicons name="cloud-offline-outline" size={54} color="#E74C3C" />
            <Text style={[styles.emptyText, { color: '#E74C3C', fontWeight: 'bold', fontSize: 16, marginTop: 12 }]}>
              Document Non Accessible
            </Text>
            <Text style={[styles.emptyText, { fontSize: 13, marginTop: 6, paddingHorizontal: 24, textAlign: 'center' }]}>
              {messageErreurPersonnalise || "Le fichier n'a pas pu être chargé localement ni synchronisé depuis votre Cloud Supabase sécurisé."}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity 
                style={[styles.buyBtn, { paddingHorizontal: 16, backgroundColor: couleurs.primaire }]} 
                onPress={() => setCleRechargement(prev => prev + 1)}
              >
                <Text style={styles.buyBtnText}>🔄 Réessayer</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.buyBtn, { paddingHorizontal: 16, backgroundColor: couleurs.fondCarte }]} 
                onPress={handleBack}
              >
                <Text style={[styles.buyBtnText, { color: couleurs.texte }]}>Retour</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : sourcePdfData && !hasError ? (
          <View style={{ flex: 1, width: '100%', height: '100%', overflow: 'hidden' }}>
            <LecteurPdf
              documentId={document.id || docParams.id}
              urlFichier={sourcePdfData}
              estVerrouille={estVerrouille}
              limiteApercuPages={limiteApercuPages}
              limiteApercuType={limiteApercuType}
              limiteApercuValeur={limiteApercuValeur}
              prix={document.prix}
              estSombre={couleurs.estSombre}
              scale={zoomMobileActif}
              onAcheter={() => setModaleAchatVisible(true)}
              onVip={() => setModaleVipVisible(true)}
              onFermer={handleBack}
              onPageChange={(current, total) => {
                setPageState({ current, total });
                setNombrePagesReel(total);
              }}
              onDocumentLoad={(total) => {
                setNombrePagesReel(total);
                setPageState(prev => ({ ...prev, total }));
                setChargementLocal(false);
                setHasError(false);
              }}
              onError={(err) => {
                console.error('[EcranLecteurDocument] Erreur lecteur PDF :', err);
                setHasError(true);
                setChargementLocal(false);
              }}
              onReessayer={() => setCleRechargement(prev => prev + 1)}
            />

            {/* Barre flottante mobile : Indicateur de Page & Contrôles Zoom */}
            {Platform.OS !== 'web' && (
              <View
                style={[
                  styles.floatingControlsContainer,
                  {
                    bottom:
                      estVerrouille ||
                      (estAbonneVIP && !docsDebloquesIds.includes(document.id) && !estDocumentImporte)
                        ? 80
                        : 24,
                  },
                ]}
              >
                {/* Indicateur de Page */}
                <View style={styles.floatingPagePill}>
                  <Text style={styles.pageIndicatorText}>
                    Page {pageState.current} / {nombrePagesReel}
                  </Text>
                </View>

                {/* Contrôles d'Accessibilité Zoom */}
                <View style={styles.floatingZoomPill}>
                  <TouchableOpacity
                    style={styles.zoomButton}
                    onPress={handleZoomOut}
                    activeOpacity={0.7}
                    accessibilityLabel="Dézoomer"
                  >
                    <Ionicons name="remove" size={16} color="#FFFFFF" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.zoomResetButton}
                    onPress={handleResetZoom}
                    activeOpacity={0.7}
                    accessibilityLabel="Réinitialiser le zoom"
                  >
                    <Text style={styles.zoomResetText}>
                      {Math.round(zoomMobileActif * 100)}%
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.zoomButton}
                    onPress={handleZoomIn}
                    activeOpacity={0.7}
                    accessibilityLabel="Zoomer"
                  >
                    <Ionicons name="add" size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
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
                style={[styles.buyBtn, { marginTop: 14, paddingHorizontal: 18, paddingVertical: 8, backgroundColor: couleurs.primaire }]}
                onPress={() => setCleRechargement(prev => prev + 1)}
              >
                <Ionicons name="refresh-outline" size={16} color="#FFFFFF" />
                <Text style={styles.buyBtnText}>Réessayer le chargement</Text>
              </TouchableOpacity>
            )}
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
                  afficherToast(
                    'Ce cours a été ajouté avec succès à votre dossier VIP !',
                    'Accès VIP 👑',
                    'succes'
                  );
                } else {
                  afficherToast(res.message, 'Erreur ❌', 'erreur');
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
  floatingControlsContainer: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 100,
  },
  floatingPagePill: {
    backgroundColor: 'rgba(0, 0, 0, 0.80)',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  floatingZoomPill: {
    backgroundColor: 'rgba(0, 0, 0, 0.80)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 20,
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    gap: 4,
  },
  zoomButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomResetButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.20)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomResetText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
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
