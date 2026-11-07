import React from 'react';
import type { LecteurPdfProps } from './PdfViewer/types';
import { LecteurPdfErrorBoundary } from './LecteurPdfDesktop';
import { LecteurPwaMobile } from './PdfViewer/LecteurPwaMobile';

/**
 * LecteurPdfIos (PWA Mobile iOS — Safari / WebKit)
 * 
 * Moteur 100% natif React & Canvas (PDF.js) via LecteurPwaMobile :
 * 1. Zéro iframe (Empêche Safari iOS d'afficher les boutons de partage/téléchargement natifs).
 * 2. Protection DRM absolue : désactivation de la copie et du clic droit.
 * 3. Rendu Retina haute fidélité avec pinch-to-zoom 2 doigts et double-tap.
 * 4. Gestion de l'aperçu limité avec paywall intégré et liaison d'achat sécurisée.
 */
export const LecteurPdfIos: React.FC<LecteurPdfProps> = (props) => {
  return (
    <LecteurPdfErrorBoundary estSombre={props.estSombre} onReessayer={props.onReessayer}>
      <LecteurPwaMobile {...props} />
    </LecteurPdfErrorBoundary>
  );
};

export default LecteurPdfIos;
