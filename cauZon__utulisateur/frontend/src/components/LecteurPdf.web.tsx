import React from 'react';
import { LecteurPdf as WebLecteurPdf, LecteurPdfErrorBoundary } from './PdfViewer/LecteurPdf.web';
import type { LecteurPdfProps } from './PdfViewer/types';

/**
 * Aiguilleur Racine Web / PWA (Desktop & Mobile Web)
 * Isolé exclusivement pour la plateforme Web avec ErrorBoundary intégré
 */
export const LecteurPdf: React.FC<LecteurPdfProps> = (props) => {
  return (
    <LecteurPdfErrorBoundary estSombre={props.estSombre} onReessayer={props.onReessayer}>
      <WebLecteurPdf {...props} />
    </LecteurPdfErrorBoundary>
  );
};

export default LecteurPdf;
