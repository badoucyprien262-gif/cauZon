import React from 'react';
import type { LecteurPdfProps } from './types';
import { LecteurPdfDesktop } from '../LecteurPdfDesktop';

/**
 * LecteurPwaDesktop (PWA PC / Bureau)
 *
 * Délègue vers le visualiseur PDF natif du navigateur (Edge, Chrome, Safari)
 * via la balise native <object type="application/pdf">.
 * - Fluidité matérielle 60/120 FPS
 * - Prise en charge native parfaite des gestes du pavé tactile (touchpad pinch-to-zoom)
 * - Raccourcis natifs du navigateur (Ctrl+Molette, Ctrl+F, zoom, impression)
 * - Zéro crash mémoire sur les gros documents
 * - Gestion DRM / Paywall sécurisée via extraction stricte des pages autorisées
 */
export const LecteurPwaDesktop: React.FC<LecteurPdfProps> = (props) => {
  return <LecteurPdfDesktop {...props} />;
};

export default LecteurPwaDesktop;
