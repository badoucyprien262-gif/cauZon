import React, { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';
import { LecteurPdf as NativeLecteurPdf } from './PdfViewer/LecteurPdf';
import type { LecteurPdfProps } from './PdfViewer/types';

/**
 * Aiguilleur Racine Mobile Natif (iOS / Android)
 * Délégué vers ./PdfViewer/LecteurPdf avec interception BackHandler Android
 */
export const LecteurPdf: React.FC<LecteurPdfProps> = (props) => {
  useEffect(() => {
    if (Platform.OS !== 'android' || !props.onFermer) return;

    const onBackPress = () => {
      props.onFermer?.();
      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [props.onFermer]);

  return <NativeLecteurPdf {...props} />;
};

export default LecteurPdf;
