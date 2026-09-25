import React from 'react';
import { LecteurPdf as NativeLecteurPdf } from './PdfViewer/LecteurPdf';
import type { LecteurPdfProps } from './PdfViewer/types';

/**
 * Aiguilleur Racine Mobile Natif (iOS / Android)
 * Délégué vers ./PdfViewer/LecteurPdf
 */
export const LecteurPdf: React.FC<LecteurPdfProps> = (props) => {
  return <NativeLecteurPdf {...props} />;
};

export default LecteurPdf;
