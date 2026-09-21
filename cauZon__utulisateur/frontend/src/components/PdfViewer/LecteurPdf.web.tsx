import React, { useState, useEffect } from 'react';
import { LecteurPwaMobile } from './LecteurPwaMobile';
import { LecteurPwaDesktop } from './LecteurPwaDesktop';
import type { LecteurPdfProps } from './types';

/**
 * Aiguilleur Web / PWA (Bloc 2 & 3)
 * Détecte de façon étanche si l'appareil est un smartphone/navigateur tactile mobile
 * ou un PC de bureau avec écran large
 */
export const LecteurPdf: React.FC<LecteurPdfProps> = (props) => {
  const [isMobileDevice, setIsMobileDevice] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
  });

  useEffect(() => {
    const verifierAppareil = () => {
      const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
      setIsMobileDevice(mobile);
    };

    window.addEventListener('resize', verifierAppareil);
    return () => window.removeEventListener('resize', verifierAppareil);
  }, []);

  if (isMobileDevice) {
    return <LecteurPwaMobile {...props} />;
  }

  return <LecteurPwaDesktop {...props} />;
};

export default LecteurPdf;
