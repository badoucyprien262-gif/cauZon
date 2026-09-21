import React from 'react';
import { LecteurPdf } from './LecteurPdf';
import type { LecteurPdfProps } from './types';

export type LecteurPdfWebProps = LecteurPdfProps;

/**
 * Pont de rétro-compatibilité Web : délègue directement vers l'aiguilleur LecteurPdf
 * (Bloc 2 Desktop ou Bloc 3 Mobile selon l'appareil)
 */
export const LecteurPdfWeb: React.FC<LecteurPdfWebProps> = (props) => {
  return <LecteurPdf {...props} />;
};

export default LecteurPdfWeb;
