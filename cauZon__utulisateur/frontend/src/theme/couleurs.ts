// ─── Palette de Base ─────────────────────────────────────────────────────────
export const PALETTE = {
  bordeaux:       '#7F011F',
  bordeauxProfond:'#5A0015',
  bordeauxClair:  '#C0392B',
  sable:          '#F5EBD0',
  sableChaud:     '#FAF6EB',
  blanc:          '#FFFFFF',
  noir:           '#121212',
  vert:           '#2ECC71',
  rouge:          '#E74C3C',
  orange:         '#F39C12',
  bleuGris:       '#7D6B6E',
};

// ─── Couleurs Claires ─────────────────────────────────────────────────────────
export const couleursClair = {
  primaire:         PALETTE.bordeaux,
  primaireProfond:  PALETTE.bordeauxProfond,
  primaireClair:    PALETTE.bordeauxClair,
  accent:           PALETTE.sable,
  accentOr:         PALETTE.bordeaux,
  fond:             PALETTE.sableChaud,
  fondEleve:        '#FFFFFF',
  fondCarte:        '#FFFFFF',
  fondEntete:       PALETTE.bordeaux,
  blanc:            '#FFFFFF',
  texte:            '#3B0B14',
  texteEntete:      PALETTE.sable,
  texteSecondaire:  PALETTE.bleuGris,
  bordure:          '#EFE6D4',
  bordureElevee:    'rgba(127, 1, 31, 0.12)',
  erreur:           PALETTE.rouge,
  succes:           PALETTE.vert,
  alerte:           PALETTE.orange,
  vipOr:            PALETTE.bordeaux,
  vipOrClair:       PALETTE.bordeauxProfond,
  // Glassmorphism / Overlay
  glassLight:       'rgba(255, 255, 255, 0.72)',
  glassBorder:      'rgba(255, 255, 255, 0.4)',
  overlay:          'rgba(59, 11, 20, 0.55)',
  // Shadows
  shadowColor:      '#3B0B14',
  shadowSm:         { shadowColor: '#3B0B14', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  shadowMd:         { shadowColor: '#3B0B14', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.09, shadowRadius: 12, elevation: 4 },
  shadowLg:         { shadowColor: '#3B0B14', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 22, elevation: 8 },
  // Shimmer
  shimmerBase:      '#F0E8D8',
  shimmerHighlight: '#FAF6EB',
  // Catégories sémantiques
  categorieDroit:   '#7F011F',
  categorieEco:     '#1A6B3C',
  categorieGestion: '#2C4E8A',
  categoriePhilo:   '#6B2FA0',
  categorieHistoire:'#8B4513',
  estSombre:        false,
};

// ─── Couleurs Sombres ─────────────────────────────────────────────────────────
export const couleursSombre = {
  primaire:         '#F9A8B8',
  primaireProfond:  '#E87090',
  primaireClair:    '#FFC8D4',
  accent:           '#3F3F46',
  accentOr:         '#F9A8B8',
  fond:             '#121212',
  fondEleve:        '#1E1E1E',
  fondCarte:        '#1E1E1E',
  fondEntete:       '#1E1E1E',
  blanc:            '#1E1E1E',
  texte:            '#FFFFFF',
  texteEntete:      '#FFFFFF',
  texteSecondaire:  '#9CA3AF',
  bordure:          '#27272A',
  bordureElevee:    'rgba(249, 168, 184, 0.18)',
  erreur:           '#F87171',
  succes:           '#4ADE80',
  alerte:           '#F87171',
  vipOr:            '#F9A8B8',
  vipOrClair:       '#E87090',
  glassLight:       'rgba(30, 30, 30, 0.82)',
  glassBorder:      'rgba(255, 255, 255, 0.08)',
  overlay:          'rgba(0, 0, 0, 0.72)',
  shadowColor:      '#000000',
  shadowSm:         { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 2 },
  shadowMd:         { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 4 },
  shadowLg:         { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 22, elevation: 8 },
  shimmerBase:      '#252525',
  shimmerHighlight: '#2E2E2E',
  categorieDroit:   '#F9A8B8',
  categorieEco:     '#86EFAC',
  categorieGestion: '#93C5FD',
  categoriePhilo:   '#C4B5FD',
  categorieHistoire:'#FCA5A5',
  estSombre:        true,
};

// ─── Design Tokens Partagés ───────────────────────────────────────────────────
export const TOKENS = {
  // Typographie
  fontSize: { xs: 9, sm: 11, base: 13, md: 15, lg: 17, xl: 20, xxl: 26, hero: 34 },
  fontWeight: { regular: '400', medium: '500', semibold: '600', bold: '700', heavy: '800', black: '900' } as const,
  lineHeight: { tight: 1.2, normal: 1.5, relaxed: 1.7 },
  // Rayons
  radius: { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, full: 999 },
  // Espacement
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  // Animation
  duration: { fast: 160, normal: 280, slow: 420, verySlow: 640 },
};

// ─── Couleurs Sémantiques par Catégorie ───────────────────────────────────────
export const COULEUR_CATEGORIE: Record<string, string> = {
  'Droit': '#7F011F',
  'Économie': '#1A6B3C',
  'Gestion': '#2C4E8A',
  'Philosophie': '#6B2FA0',
  'Histoire': '#8B4513',
  'Géographie': '#0E7490',
  'Sciences': '#0F766E',
  'Littérature': '#B45309',
  'Mathématiques': '#1D4ED8',
  'Informatique': '#0369A1',
  'default': '#7F011F',
};

export const getCouleurCategorie = (categorie?: string): string =>
  COULEUR_CATEGORIE[categorie ?? ''] ?? COULEUR_CATEGORIE['default'];

export default couleursClair;

