import React from 'react';
import type { LecteurPdfProps } from './PdfViewer/types';
import { LecteurPdfErrorBoundary } from './LecteurPdfDesktop';
import { LecteurPwaMobile } from './PdfViewer/LecteurPwaMobile';

/**
 * LecteurPdfAndroid (PWA Mobile Android)
 * 
 * Moteur 100% natif React & Canvas (PDF.js) via LecteurPwaMobile :
 * 1. Zéro iframe & Zéro dépendance Google Docs Viewer (Élimination définitive de l'erreur 400).
 * 2. Zéro bouton de téléchargement ou pop-out (Protection DRM absolue des documents cauZon).
 * 3. Blocage total du clic droit et de la sélection de texte.
 * 4. Rendu haute fidélité Retina avec pinch-to-zoom fluide 60/120 FPS et double-tap.
 * 5. Gestion rigoureuse de l'aperçu limité (Paywall avec flou et déblocage direct).
 * 6. Fonctionne aussi bien en ligne que hors-ligne sans risque de crash.
 */
export const LecteurPdfAndroid: React.FC<LecteurPdfProps> = (props) => {
  return (
    <LecteurPdfErrorBoundary estSombre={props.estSombre} onReessayer={props.onReessayer}>
      <LecteurPwaMobile {...props} />
    </LecteurPdfErrorBoundary>
  );
};

export default LecteurPdfAndroid;
