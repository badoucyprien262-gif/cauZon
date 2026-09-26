import React, { useState, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  BackHandler,
  Platform,
} from 'react-native';
import Pdf from 'react-native-pdf';

export interface LecteurPdfMobileProps {
  documentId?: string;
  urlFichier: string;
  estVerrouille?: boolean;
  limiteApercuPages?: number;
  limiteApercuType?: string;
  limiteApercuValeur?: number;
  prix?: number;
  estSombre?: boolean;
  scale?: number;
  onAcheter?: () => void;
  onVip?: () => void;
  onFermer?: () => void;
  onPageChange?: (currentPage: number, totalPages: number) => void;
  onDocumentLoad?: (totalPages: number) => void;
  onError?: (error: any) => void;
  onReessayer?: () => void;
}

export const LecteurPdfMobile: React.FC<LecteurPdfMobileProps> = ({
  urlFichier,
  estVerrouille = false,
  limiteApercuPages = 3,
  prix = 100,
  estSombre = false,
  scale = 1.0,
  onAcheter,
  onVip,
  onFermer,
  onPageChange,
  onDocumentLoad,
  onError,
  onReessayer,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);

  useEffect(() => {
    if (Platform.OS !== 'android' || !onFermer) return;

    const onBackPress = () => {
      onFermer();
      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [onFermer]);
  const [chargement, setChargement] = useState<boolean>(true);
  const [erreur, setErreur] = useState<string | null>(null);

  // Normalisation intelligente de la source pour react-native-pdf
  const pdfSource = useMemo(() => {
    if (!urlFichier) return null;

    const trimmed = urlFichier.trim();

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return { uri: trimmed, cache: true };
    }

    if (trimmed.startsWith('file://')) {
      return { uri: trimmed, cache: true };
    }

    if (trimmed.startsWith('data:application/pdf;base64,')) {
      return { uri: trimmed, cache: true };
    }

    // Base64 brut (sans préfixe MIME)
    if (trimmed.startsWith('JVBER') || /^[A-Za-z0-9+/=]+$/.test(trimmed.slice(0, 100))) {
      return { uri: `data:application/pdf;base64,${trimmed}`, cache: true };
    }

    // Chemin local brut (ex: /data/user/0/...)
    if (trimmed.startsWith('/')) {
      return { uri: `file://${trimmed}`, cache: true };
    }

    return { uri: trimmed, cache: true };
  }, [urlFichier]);

  const pageEstVerrouillee = Boolean(
    estVerrouille &&
    limiteApercuPages > 0 &&
    currentPage > limiteApercuPages
  );

  const couleurs = {
    fond: estSombre ? '#0F172A' : '#F8FAFC',
    primaire: '#6B1124',
    or: '#D97706',
    texte: estSombre ? '#F1F5F9' : '#0F172A',
    texteSecondaire: estSombre ? '#94A3B8' : '#64748B',
    carte: estSombre ? 'rgba(30, 41, 59, 0.96)' : 'rgba(255, 255, 255, 0.96)',
    bordure: estSombre ? '#334155' : '#E2E8F0',
  };

  if (!pdfSource) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: couleurs.fond }]}>
        <Text style={[styles.erreurTitre, { color: couleurs.texte }]}>Document non disponible</Text>
        <Text style={[styles.erreurSousTitre, { color: couleurs.texteSecondaire }]}>
          La source du document n'a pas pu être résolue.
        </Text>
        {onReessayer && (
          <TouchableOpacity
            style={[styles.boutonAction, { backgroundColor: couleurs.primaire }]}
            onPress={onReessayer}
          >
            <Text style={styles.boutonActionTexte}>🔄 Réessayer</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: couleurs.fond }]}>
      {/* Lecteur Natif C++ Android / iOS */}
      <Pdf
        source={pdfSource}
        minScale={1.0}
        maxScale={4.0}
        scale={scale}
        enableDoubleTapZoom={true}
        enableAntialiasing={true}
        fitPolicy={0}
        spacing={10}
        trustAllCerts={false}
        style={styles.pdf}
        onLoadComplete={(numberOfPages) => {
          setTotalPages(numberOfPages);
          setChargement(false);
          setErreur(null);
          onDocumentLoad?.(numberOfPages);
        }}
        onPageChanged={(page, numberOfPages) => {
          setCurrentPage(page);
          setTotalPages(numberOfPages);
          onPageChange?.(page, numberOfPages);
        }}
        onError={(err) => {
          console.error('[LecteurPdfMobile] Erreur chargement PDF natif :', err);
          setChargement(false);
          setErreur(err?.message || 'Erreur lors du chargement du PDF.');
          onError?.(err);
        }}
      />

      {/* Indicateur de chargement initial */}
      {chargement && (
        <View style={[styles.overlayCenter, { backgroundColor: couleurs.fond }]}>
          <ActivityIndicator size="large" color={couleurs.primaire} />
          <Text style={[styles.chargementTexte, { color: couleurs.texteSecondaire }]}>
            Ouverture ultra-nette en cours...
          </Text>
        </View>
      )}

      {/* Affichage d'erreur avec bouton réessayer */}
      {erreur && (
        <View style={[styles.overlayCenter, { backgroundColor: couleurs.fond }]}>
          <Text style={styles.lockIcon}>⚠️</Text>
          <Text style={[styles.erreurTitre, { color: couleurs.texte }]}>Erreur de lecture</Text>
          <Text style={[styles.erreurSousTitre, { color: couleurs.texteSecondaire }]}>{erreur}</Text>
          {onReessayer && (
            <TouchableOpacity
              style={[styles.boutonAction, { backgroundColor: couleurs.primaire }]}
              onPress={() => {
                setErreur(null);
                setChargement(true);
                onReessayer();
              }}
            >
              <Text style={styles.boutonActionTexte}>🔄 Réessayer</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Calque de Verrouillage Paywall (au-delà de la limite d'aperçu) */}
      {pageEstVerrouillee && (
        <View style={styles.lockOverlay}>
          <View style={[styles.lockCard, { backgroundColor: couleurs.carte, borderColor: couleurs.bordure }]}>
            <Text style={styles.lockIcon}>🔒</Text>
            <Text style={[styles.lockTitle, { color: couleurs.texte }]}>
              Aperçu gratuit terminé ({limiteApercuPages} pages)
            </Text>
            <Text style={[styles.lockDescription, { color: couleurs.texteSecondaire }]}>
              Débloquez l'intégralité du document de {totalPages} pages pour poursuivre votre apprentissage en toute sérénité.
            </Text>

            <View style={styles.lockActions}>
              {onAcheter && (
                <TouchableOpacity
                  style={[styles.boutonAchat, { backgroundColor: couleurs.primaire }]}
                  onPress={onAcheter}
                  activeOpacity={0.88}
                >
                  <Text style={styles.boutonAchatTexte}>🛒 Débloquer ({prix} FCFA)</Text>
                </TouchableOpacity>
              )}

              {onVip && (
                <TouchableOpacity
                  style={[styles.boutonVip, { backgroundColor: couleurs.or }]}
                  onPress={onVip}
                  activeOpacity={0.88}
                >
                  <Text style={styles.boutonVipTexte}>🎁 Pass VIP Annuel</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  pdf: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  overlayCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 10,
  },
  chargementTexte: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: '600',
  },
  erreurTitre: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  erreurSousTitre: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  boutonAction: {
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
  },
  boutonActionTexte: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 20,
  },
  lockCard: {
    width: Math.min(width - 40, 420),
    padding: 24,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  lockIcon: {
    fontSize: 44,
    marginBottom: 12,
  },
  lockTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  lockDescription: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  lockActions: {
    width: '100%',
    gap: 10,
  },
  boutonAchat: {
    width: '100%',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
  },
  boutonAchatTexte: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  boutonVip: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  boutonVipTexte: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
});

export default LecteurPdfMobile;
