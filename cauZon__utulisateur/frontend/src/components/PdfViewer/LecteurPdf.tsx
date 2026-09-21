import React from 'react';
import { LecteurPdfMobile } from './LecteurPdfMobile';
import type { LecteurPdfProps } from './types';

/**
 * Aiguilleur Mobile Natif (Bloc 1 - APK Android / iOS)
 * Rendu par Metro sur mobile natif sans exécuter aucun code Web DOM
 */
export const LecteurPdf: React.FC<LecteurPdfProps> = (props) => {
  const urlSource = typeof props.urlFichier === 'string'
    ? props.urlFichier
    : (props.pdfUrl || '');

  return (
    <LecteurPdfMobile
      {...props}
      urlFichier={urlSource}
    />
  );
};

export default LecteurPdf;
