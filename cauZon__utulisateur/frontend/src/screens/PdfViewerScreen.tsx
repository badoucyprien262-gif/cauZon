import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, StatusBar, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '../components/AppIcon';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as ScreenCapture from 'expo-screen-capture';
import * as FileSystem from 'expo-file-system/legacy';
import { Accelerometer } from 'expo-sensors';
import { getDocumentPdfUrl, verifierFichierLocalExiste, telechargerFichierVersDossierPersistant, DOSSIER_DOCS_PERSISTANTS, normaliserCheminFichier, retrouverFichierDansSandbox, resoudreSourcePdf } from '../services/serviceDocument';

import { useApp } from '../store/ContexteApp';
import { LecteurPdf } from '../components/PdfViewer';

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
            <LecteurPdf
              documentId={docObj.id || (params as any)?.id || ''}
              urlFichier={sourcePdfData}
              estVerrouille={!estDebloque}
              limiteApercuPages={limiteApercuPages}
              prix={docObj.prix}
              estSombre={couleurs.estSombre}
              scale={zoomMobileActif}
              onPageChange={(current, total) => {
                setPageState({ current, total });
              }}
              onDocumentLoad={(total) => {
                setPageState(prev => ({ ...prev, total }));
                setChargementLocal(false);
                setHasError(false);
              }}
              onError={(err) => {
                console.error('[PdfViewerScreen] Erreur lecteur PDF :', err);
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
                  { bottom: !estDebloque ? 80 : 24 },
                ]}
              >
                {/* Indicateur de Page */}
                <View style={styles.floatingPagePill}>
                  <Text style={styles.pageIndicatorText}>
                    Page {pageState.current} / {pageState.total}
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
});

