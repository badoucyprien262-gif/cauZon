import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from './AppIcon';
import type { LecteurPdfProps } from './PdfViewer/types';

/**
 * Charge dynamiquement PDFLib sans inclusion statique dans le bundle Metro
 * Évite le crash TypeError: Cannot destructure property '__extends' of 'n.default'
 */
async function getPDFDocumentClass(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if ((window as any).PDFLib?.PDFDocument) {
    return (window as any).PDFLib.PDFDocument;
  }
  if (typeof document === 'undefined') return null;

  return new Promise((resolve, reject) => {
    const scriptId = 'pdf-lib-bundle-loader';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (script) {
      if ((window as any).PDFLib?.PDFDocument) {
        return resolve((window as any).PDFLib.PDFDocument);
      }
      script.addEventListener('load', () => {
        if ((window as any).PDFLib?.PDFDocument) resolve((window as any).PDFLib.PDFDocument);
        else reject(new Error('PDFLib introuvable après chargement'));
      });
      script.addEventListener('error', () => reject(new Error('Échec chargement pdf-lib')));
      return;
    }

    const injectCdnFallback = () => {
      if (typeof document === 'undefined') return reject(new Error('Document introuvable'));
      const cdnScript = document.createElement('script');
      cdnScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.9/pdf-lib.min.js';
      cdnScript.onload = () => {
        if ((window as any).PDFLib?.PDFDocument) {
          resolve((window as any).PDFLib.PDFDocument);
        } else {
          reject(new Error('PDFLib introuvable via CDN'));
        }
      };
      cdnScript.onerror = () => reject(new Error('Échec de chargement CDN de pdf-lib'));
      document.head.appendChild(cdnScript);
    };

    script = document.createElement('script');
    script.id = scriptId;
    script.src = '/pdf-lib.min.js';
    script.onload = () => {
      if ((window as any).PDFLib?.PDFDocument) {
        resolve((window as any).PDFLib.PDFDocument);
      } else {
        injectCdnFallback();
      }
    };
    script.onerror = () => {
      injectCdnFallback();
    };
    document.head.appendChild(script);
  });
}

interface ErrorBoundaryProps {
  estSombre?: boolean;
  onReessayer?: () => void;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class LecteurPdfErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[LecteurPdf] Erreur interceptée par ErrorBoundary :', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            flex: 1,
            width: '100%',
            height: '100%',
            minHeight: '300px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            backgroundColor: this.props.estSombre ? '#0F172A' : '#F8FAFC',
            color: this.props.estSombre ? '#F1F5F9' : '#0F172A',
            fontFamily: 'sans-serif',
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 700 }}>
            Erreur d'affichage du document
          </h3>
          <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#64748B', textAlign: 'center', maxWidth: 400 }}>
            {this.state.error?.message || 'Une anomalie est survenue lors de l’affichage du visualiseur PDF.'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onReessayer?.();
            }}
            style={{
              padding: '10px 20px',
              backgroundColor: '#7F011F',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 8,
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            🔄 Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * LecteurPdfDesktop (Moteur de Rendu Natif Navigateur — Edge, Chrome, Safari)
 *
 * Remplace la rastérisation lourde JS/Canvas par la balise native <object type="application/pdf">.
 * - Fluidité matérielle 60/120 FPS
 * - Prise en charge native parfaite des gestes du pavé tactile (touchpad pinch-to-zoom & smooth scroll)
 * - Raccourcis natifs du navigateur (Ctrl+Molette, Ctrl+F recherche, zoom, signets, impression)
 * - Zéro crash mémoire ou fuite de contexte canvas sur les gros documents
 * - Sécurisation DRM / Paywall : extraction physique côté client des pages autorisées si le document est verrouillé
 */
const LecteurPdfDesktopInternal: React.FC<LecteurPdfProps> = ({
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
  const [chargement, setChargement] = useState<boolean>(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [urlAffichee, setUrlAffichee] = useState<string | null>(null);
  const [pagesApercuAutorisees, setPagesApercuAutorisees] = useState<number>(1);
  const [nombrePagesTotal, setNombrePagesTotal] = useState<number>(1);

  const blobUrlCreeRef = useRef<string | null>(null);

  // Nettoyage systématique des URL de Blob mémoire lors des démontages
  useEffect(() => {
    return () => {
      if (blobUrlCreeRef.current) {
        URL.revokeObjectURL(blobUrlCreeRef.current);
        blobUrlCreeRef.current = null;
      }
    };
  }, []);

  const sourceBrute = pdfUrl || (typeof urlFichier === 'string' ? urlFichier : null);

  useEffect(() => {
    let estActif = true;

    async function preparerDocumentDesktop() {
      try {
        setChargement(true);
        setErreur(null);

        // 1. Détection de document totalement verrouillé (0 page autorisée)
        if (estVerrouille && limiteApercuValeur === 0) {
          if (estActif) {
            setUrlAffichee(null);
            setChargement(false);
          }
          return;
        }

        // 2. Si aucune source disponible
        if (!sourceBrute && !urlFichier) {
          throw new Error('Aucune source PDF disponible pour le document.');
        }

        let arrayBuffer: ArrayBuffer | null = null;
        let urlDirecte: string | null = null;

        // Résolution de la source : String HTTP/HTTPS/Blob, Base64 ou Uint8Array
        if (typeof sourceBrute === 'string') {
          if (sourceBrute.startsWith('http://') || sourceBrute.startsWith('https://') || sourceBrute.startsWith('blob:')) {
            urlDirecte = sourceBrute;
          } else if (sourceBrute.startsWith('data:application/pdf;base64,')) {
            const b64 = sourceBrute.replace('data:application/pdf;base64,', '');
            const binStr = atob(b64);
            const len = binStr.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binStr.charCodeAt(i);
            }
            arrayBuffer = bytes.buffer;
          } else {
            // Chaîne Base64 brute
            try {
              const binStr = atob(sourceBrute);
              const len = binStr.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                bytes[i] = binStr.charCodeAt(i);
              }
            arrayBuffer = bytes.buffer as ArrayBuffer;
            } catch (_) {
              urlDirecte = sourceBrute;
            }
          }
        } else if (urlFichier instanceof Uint8Array) {
          arrayBuffer = urlFichier.buffer as ArrayBuffer;
        }

        // 3. CAS DÉBLOQUÉ (Document acquis ou Pass VIP actif)
        // -> Utilisation directe et instantanée du flux natif sans découpage
        if (!estVerrouille) {
          if (urlDirecte) {
            if (estActif) {
              setUrlAffichee(urlDirecte);
              setChargement(false);
              onDocumentLoad?.(nombrePagesTotal || 1);
            }
            return;
          }

          if (arrayBuffer) {
            const blob = new Blob([arrayBuffer as BlobPart], { type: 'application/pdf' });
            const blobUrl = URL.createObjectURL(blob);
            if (blobUrlCreeRef.current) URL.revokeObjectURL(blobUrlCreeRef.current);
            blobUrlCreeRef.current = blobUrl;

            if (estActif) {
              setUrlAffichee(blobUrl);
              setChargement(false);
              onDocumentLoad?.(nombrePagesTotal || 1);
            }
            return;
          }
        }

        // 4. CAS VERROUILLÉ (Aperçu limité / DRM sécurisé)
        // -> Téléchargement du buffer et découpage strict des seules pages autorisées avec pdf-lib
        if (!arrayBuffer && urlDirecte) {
          const resp = await fetch(urlDirecte);
          if (!resp.ok) throw new Error(`Échec de récupération du document (${resp.status})`);
          arrayBuffer = await resp.arrayBuffer();
        }

        if (!arrayBuffer) {
          throw new Error('Données du document introuvables.');
        }

        const PDFDocument = await getPDFDocumentClass();
        if (!PDFDocument) {
          throw new Error('Moteur de sécurisation PDF indisponible.');
        }

        const sourceDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const total = sourceDoc.getPageCount();
        setNombrePagesTotal(total);

        // Calcul des pages d'aperçu autorisées
        let allowedCount = 1;
        if (limiteApercuType === 'page') {
          allowedCount = Math.min(Number(limiteApercuValeur) || 1, total);
        } else {
          const pct = Number(limiteApercuValeur) || 30;
          allowedCount = Math.min(Math.ceil((total * pct) / 100), total);
        }
        allowedCount = Math.max(1, allowedCount);
        setPagesApercuAutorisees(allowedCount);

        // Si la limite autorise tout le document, on l'affiche directement
        if (allowedCount >= total) {
          const blob = new Blob([arrayBuffer as BlobPart], { type: 'application/pdf' });
          const blobUrl = URL.createObjectURL(blob);
          if (blobUrlCreeRef.current) URL.revokeObjectURL(blobUrlCreeRef.current);
          blobUrlCreeRef.current = blobUrl;

          if (estActif) {
            setUrlAffichee(blobUrl);
            setChargement(false);
            onDocumentLoad?.(total);
          }
          return;
        }

        // Création de l'extrait sécurisé contenant EXCLUSIVEMENT les pages autorisées
        const subDoc = await PDFDocument.create();
        const pageIndices = Array.from({ length: allowedCount }, (_, i) => i);
        const copiedPages = await subDoc.copyPages(sourceDoc, pageIndices);
        copiedPages.forEach((page: any) => subDoc.addPage(page));

        const subPdfBytes = await subDoc.save();
        const subBlob = new Blob([subPdfBytes as any], { type: 'application/pdf' });
        const subBlobUrl = URL.createObjectURL(subBlob);

        if (blobUrlCreeRef.current) URL.revokeObjectURL(blobUrlCreeRef.current);
        blobUrlCreeRef.current = subBlobUrl;

        if (estActif) {
          setUrlAffichee(subBlobUrl);
          setChargement(false);
          onDocumentLoad?.(allowedCount);
          onPageChange?.(1, allowedCount);
        }
      } catch (err: any) {
        console.error('[LecteurPdfDesktop] Erreur préparation du lecteur natif :', err);
        if (estActif) {
          setErreur(err?.message || 'Impossible de préparer le visualiseur natif.');
          setChargement(false);
          onError?.(err);
        }
      }
    }

    preparerDocumentDesktop();

    return () => {
      estActif = false;
    };
  }, [sourceBrute, urlFichier, estVerrouille, limiteApercuPages, limiteApercuType, limiteApercuValeur]);

  // Si le document est totalement verrouillé (0 page autorisée)
  if (estVerrouille && limiteApercuValeur === 0) {
    return (
      <View style={[styles.lockedContainer, { backgroundColor: estSombre ? '#0F172A' : '#F8FAFC' }]}>
        <View style={styles.lockedCard}>
          <View style={styles.lockedIconWrapper}>
            <Ionicons name="lock-closed" size={36} color="#7F011F" />
          </View>
          <Text style={[styles.lockedTitle, { color: estSombre ? '#FFFFFF' : '#0F172A' }]}>
            Document Verrouillé
          </Text>
          <Text style={[styles.lockedSubtitle, { color: estSombre ? '#94A3B8' : '#64748B' }]}>
            Ce document nécessite une acquisition pour être consulté. Débloquez-le à l'acte ou profitez de l'accès illimité avec le Pass VIP.
          </Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.btnAcheter} onPress={onAcheter} activeOpacity={0.85}>
              <Ionicons name="cart-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.btnAcheterText}>Acheter ({prix} FCFA)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnVip} onPress={onVip} activeOpacity={0.85}>
              <Ionicons name="sparkles" size={18} color="#7F011F" style={{ marginRight: 6 }} />
              <Text style={styles.btnVipText}>Pass VIP (500 F)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: 'calc(100vh - 64px)',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        backgroundColor: estSombre ? '#0F172A' : '#F1F5F9',
        overflow: 'hidden',
      }}
    >
      {/* 1. Écran de chargement initial */}
      {chargement && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: estSombre ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            zIndex: 10,
          }}
        >
          <ActivityIndicator size="large" color="#7F011F" />
          <p
            style={{
              marginTop: 14,
              fontSize: '14px',
              fontWeight: 600,
              color: estSombre ? '#E2E8F0' : '#334155',
              fontFamily: 'sans-serif',
            }}
          >
            Chargement dans le lecteur natif du navigateur...
          </p>
        </div>
      )}

      {/* 2. Écran d'erreur avec bouton réessayer */}
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
            zIndex: 10,
          }}
        >
          <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
          <h3
            style={{
              marginTop: 12,
              fontSize: '16px',
              fontWeight: 'bold',
              color: '#EF4444',
              fontFamily: 'sans-serif',
            }}
          >
            Échec d'ouverture du document
          </h3>
          <p
            style={{
              marginTop: 6,
              fontSize: '13px',
              color: estSombre ? '#94A3B8' : '#64748B',
              textAlign: 'center',
              maxWidth: '420px',
              fontFamily: 'sans-serif',
            }}
          >
            {erreur}
          </p>
          <button
            onClick={() => onReessayer?.()}
            style={{
              marginTop: 18,
              padding: '10px 20px',
              backgroundColor: '#7F011F',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            🔄 Réessayer
          </button>
        </div>
      )}

      {/* 3. Moteur de Rendu PDF Natif du Navigateur (<object>) */}
      {urlAffichee && !erreur && (
        <object
          data={`${urlAffichee}#toolbar=1&navpanes=0&view=FitH`}
          type="application/pdf"
          width="100%"
          height="100%"
          className="w-full h-full border-none"
          style={{
            width: '100%',
            height: '100%',
            flex: 1,
            border: 'none',
            display: 'block',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              padding: '32px',
              textAlign: 'center',
              color: estSombre ? '#94A3B8' : '#64748B',
              fontFamily: 'sans-serif',
            }}
          >
            <p style={{ marginBottom: 12 }}>
              Votre navigateur ne supporte pas l'affichage direct du PDF dans cette page.
            </p>
            <a
              href={urlAffichee}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 18px',
                backgroundColor: '#7F011F',
                color: '#FFFFFF',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 'bold',
                fontSize: '13px',
              }}
            >
              📄 Ouvrir le document dans un nouvel onglet
            </a>
          </div>
        </object>
      )}

      {/* 4. Paywall Élégant Flottant pour Extrait Gratuit sur Web Desktop */}
      {estVerrouille && limiteApercuValeur > 0 && !chargement && !erreur && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: estSombre
              ? 'linear-gradient(to top, rgba(15, 23, 42, 0.98) 70%, rgba(15, 23, 42, 0.85) 100%)'
              : 'linear-gradient(to top, rgba(255, 255, 255, 0.98) 70%, rgba(255, 255, 255, 0.85) 100%)',
            borderTop: `1px solid ${estSombre ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
            padding: '14px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.15)',
            zIndex: 30,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                backgroundColor: 'rgba(127, 1, 31, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#7F011F',
              }}
            >
              <Ionicons name="lock-closed" size={20} color="#7F011F" />
            </div>
            <div>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: '14px',
                  color: estSombre ? '#FFFFFF' : '#0F172A',
                  fontFamily: 'sans-serif',
                }}
              >
                Aperçu Limité ({pagesApercuAutorisees} page{pagesApercuAutorisees > 1 ? 's' : ''} sur {nombrePagesTotal})
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: estSombre ? '#94A3B8' : '#64748B',
                  marginTop: 2,
                  fontFamily: 'sans-serif',
                }}
              >
                Débloquez le cours complet pour accéder à l'intégralité du contenu sans restriction.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {onAcheter && (
              <button
                onClick={onAcheter}
                style={{
                  padding: '9px 18px',
                  backgroundColor: '#7F011F',
                  color: '#FFFFFF',
                  borderRadius: '8px',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 8px rgba(127, 1, 31, 0.3)',
                  transition: 'opacity 0.2s',
                }}
              >
                🛒 Débloquer ({prix} FCFA)
              </button>
            )}

            {onVip && (
              <button
                onClick={onVip}
                style={{
                  padding: '9px 18px',
                  backgroundColor: '#F59E0B',
                  color: '#1E1B4B',
                  borderRadius: '8px',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
                  transition: 'opacity 0.2s',
                }}
              >
                👑 Pass VIP (500 F)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const LecteurPdfDesktop: React.FC<LecteurPdfProps> = (props) => {
  return (
    <LecteurPdfErrorBoundary estSombre={props.estSombre} onReessayer={props.onReessayer}>
      <LecteurPdfDesktopInternal {...props} />
    </LecteurPdfErrorBoundary>
  );
};

export default LecteurPdfDesktop;

const styles = StyleSheet.create({
  lockedContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  lockedCard: {
    maxWidth: 440,
    width: '100%',
    alignItems: 'center',
    padding: 32,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  lockedIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(127, 1, 31, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  lockedTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  lockedSubtitle: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    justifyContent: 'center',
  },
  btnAcheter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7F011F',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  btnAcheterText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  btnVip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F59E0B',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  btnVipText: {
    color: '#1E1B4B',
    fontWeight: '800',
    fontSize: 13,
  },
});
