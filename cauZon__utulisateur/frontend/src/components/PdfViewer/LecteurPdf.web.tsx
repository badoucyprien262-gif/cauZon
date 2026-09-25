import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LecteurPdfDesktop } from '../LecteurPdfDesktop';
import { LecteurPdfAndroid } from '../LecteurPdfAndroid';
import { LecteurPdfIos } from '../LecteurPdfIos';
import type { LecteurPdfProps } from './types';

/**
 * Type des environnements clients Web pris en charge
 */
export type PlateformeClientWeb = 'desktop' | 'ios' | 'android';

/**
 * Détection fiable de l'environnement client Web
 * - 'ios' : iPhone, iPad, iPod, iPad Pro sous iPadOS
 * - 'android' : Smartphones et tablettes Android (Chrome, Samsung Internet, PWA)
 * - 'desktop' : Ordinateurs de bureau (PC Windows, Mac, Linux)
 */
export function detecterPlateformeClient(): PlateformeClientWeb {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'desktop';
  }

  const ua = navigator.userAgent || '';
  const platform = (navigator as any).userAgentData?.platform || navigator.platform || '';

  // 1. Détection iOS (iPhone, iPad, iPod et iPadOS simulant macOS)
  const estIos =
    /iPhone|iPod|iPad/i.test(ua) ||
    ((/Macintosh|MacIntel/i.test(platform) || /Macintosh/i.test(ua)) &&
      typeof navigator.maxTouchPoints === 'number' &&
      navigator.maxTouchPoints > 1);

  if (estIos) return 'ios';

  // 2. Détection Android (Chrome Android, Samsung Internet, Firefox Mobile, PWA)
  const estAndroid = /Android/i.test(ua);
  if (estAndroid) return 'android';

  // 3. Fallback mobile compact (< 768px avec points tactiles) non-iOS
  if (
    window.innerWidth < 768 &&
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 0
  ) {
    return 'android';
  }

  // 4. Par défaut : Navigateur de bureau Desktop
  return 'desktop';
}

/**
 * Gestionnaire d'erreur robuste (ErrorBoundary) pour le lecteur Web
 * Empêche tout crash blanc de l'arbre React et offre une récupération utilisateur
 */
interface ErrorBoundaryProps {
  estSombre?: boolean;
  onReessayer?: () => void;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class LecteurPdfErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Une erreur inattendue est survenue dans le visualiseur.',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[LecteurPdf Web ErrorBoundary] Erreur capturée :', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const sombre = this.props.estSombre ?? false;
      return (
        <View style={[styles.errorContainer, { backgroundColor: sombre ? '#0F172A' : '#F8FAFC' }]}>
          <View
            style={[
              styles.errorCard,
              {
                backgroundColor: sombre ? '#1E293B' : '#FFFFFF',
                borderColor: sombre ? '#334155' : '#E2E8F0',
              },
            ]}
          >
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={[styles.errorTitle, { color: sombre ? '#F1F5F9' : '#0F172A' }]}>
              Affichage du document interrompu
            </Text>
            <Text style={[styles.errorSubtitle, { color: sombre ? '#94A3B8' : '#64748B' }]}>
              {this.state.errorMessage}
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              activeOpacity={0.8}
              onPress={() => {
                this.setState({ hasError: false, errorMessage: '' });
                this.props.onReessayer?.();
              }}
            >
              <Text style={styles.retryButtonText}>🔄 Réessayer</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}

/**
 * Aiguilleur Web / PWA à Routage Fin (Desktop, iOS Safari, Android Chrome/PWA)
 * - Desktop : Rendu natif ultra-fluide <object>/<embed> (LecteurPdfDesktop)
 * - iOS : Conteneur préliminaire sécurisé WebKit (LecteurPdfIos)
 * - Android : Liseuse contrôlée Canvas/PDF.js anti-blocage (LecteurPdfAndroid)
 * - Validation préalable de l'URL pour prévenir tout crash silencieux
 */
const LecteurPdfWebContainer: React.FC<LecteurPdfProps> = (props) => {
  const { urlFichier, pdfUrl, estSombre } = props;
  const source = pdfUrl || (typeof urlFichier === 'string' ? urlFichier : null);

  const [plateforme, setPlateforme] = useState<PlateformeClientWeb>(() => detecterPlateformeClient());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const recalculerPlateforme = () => {
      setPlateforme(detecterPlateformeClient());
    };

    window.addEventListener('resize', recalculerPlateforme);
    return () => window.removeEventListener('resize', recalculerPlateforme);
  }, []);

  // Vérification de la présence d'une source valide avant affichage
  if (!source && !urlFichier) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: estSombre ? '#0F172A' : '#F8FAFC' }]}>
        <ActivityIndicator size="large" color="#7F011F" />
        <Text style={[styles.loadingText, { color: estSombre ? '#94A3B8' : '#64748B' }]}>
          Préparation du document en cours...
        </Text>
      </View>
    );
  }

  // Aiguillage par plateforme client
  switch (plateforme) {
    case 'ios':
      return <LecteurPdfIos {...props} />;
    case 'android':
      return <LecteurPdfAndroid {...props} />;
    case 'desktop':
    default:
      return <LecteurPdfDesktop {...props} />;
  }
};

export const LecteurPdf: React.FC<LecteurPdfProps> = (props) => {
  return (
    <LecteurPdfErrorBoundary estSombre={props.estSombre} onReessayer={props.onReessayer}>
      <LecteurPdfWebContainer {...props} />
    </LecteurPdfErrorBoundary>
  );
};

// Rétrocompatibilité avec les anciens imports LecteurPdfWeb
export const LecteurPdfWeb = LecteurPdf;

export default LecteurPdf;

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    minHeight: 250,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    minHeight: 300,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorCard: {
    maxWidth: 420,
    width: '100%',
    alignItems: 'center',
    padding: 28,
    borderRadius: 16,
    borderWidth: 1,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
  },
  errorIcon: {
    fontSize: 38,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#7F011F',
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
