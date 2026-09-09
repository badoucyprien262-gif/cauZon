// ==============================================================================
// 🌟 CauZon — Composant Pont d'Icônes Universel (AppIcon)
// Fichier : src/components/AppIcon.tsx
//
// Stratégie hybride optimale :
// - Mobile Android & iOS natif (Platform.OS !== 'web') :
//   Délègue directement à @expo/vector-icons/Ionicons (police native de l'APK/IPA).
// - Web (Platform.OS === 'web') :
//   Rendu vectoriel SVG inline pur (zéro dépendance @font-face, élimination
//   totale des carrés vides 'tofu' sur Safari iOS, Chrome Android et Desktop).
// ==============================================================================

import React from 'react';
import { Platform } from 'react-native';
import { Ionicons as ExpoIonicons } from '@expo/vector-icons';

export interface AppIconProps {
  name: string;
  size?: number;
  color?: string;
  style?: any;
}

// Helper de rendu SVG pour l'environnement Web
function renderSvg(
  size: number,
  color: string,
  children: React.ReactNode,
  style?: any,
  viewBox: string = '0 0 24 24',
  fillColor: string = 'none',
  strokeWidth: string | number = '2'
) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        lineHeight: 0,
        verticalAlign: 'middle',
        flexShrink: 0,
        ...style,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill={fillColor}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ width: size, height: size, display: 'block' }}
      >
        {children}
      </svg>
    </span>
  );
}

// Dictionnaire de glyphes SVG vectoriels haute fidélité pour le Web
function getWebSvgIcon(name: string, size: number, color: string, style?: any): React.ReactNode {
  const norm = (name || '').toLowerCase().replace(/^(ion-|md-|ios-)/, '');

  // 1. Logo Google officiel 4-couleurs
  if (norm === 'logo-google') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          lineHeight: 0,
          verticalAlign: 'middle',
          flexShrink: 0,
          ...style,
        }}
      >
        <svg width={size} height={size} viewBox="0 0 24 24" style={{ width: size, height: size, display: 'block' }}>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
        </svg>
      </span>
    );
  }

  // 2. Boussole / Découverte / Accueil (compass, compass-outline)
  if (norm.includes('compass')) {
    const isFilled = norm === 'compass';
    return renderSvg(size, color, (
      <>
        <circle cx="12" cy="12" r="10" />
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill={isFilled ? color : 'none'} />
      </>
    ), style);
  }

  // 3. Marque-page / Bibliothèque (bookmarks, bookmarks-outline, bookmark)
  if (norm.includes('bookmark')) {
    const isFilled = norm === 'bookmarks' || norm === 'bookmark';
    return renderSvg(size, color, (
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" fill={isFilled ? color : 'none'} />
    ), style);
  }

  // 4. Recherche / Loupe (search, search-outline)
  if (norm.includes('search')) {
    return renderSvg(size, color, (
      <>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </>
    ), style);
  }

  // 5. Fermeture (close, close-circle, close-outline)
  if (norm.includes('close')) {
    const isCircle = norm.includes('circle');
    return renderSvg(size, color, (
      <>
        {isCircle && <circle cx="12" cy="12" r="10" />}
        <line x1={isCircle ? "15" : "18"} y1={isCircle ? "9" : "6"} x2={isCircle ? "9" : "6"} y2={isCircle ? "15" : "18"} />
        <line x1={isCircle ? "9" : "6"} y1={isCircle ? "9" : "6"} x2={isCircle ? "15" : "18"} y2={isCircle ? "15" : "18"} />
      </>
    ), style);
  }

  // 6. Validation (checkmark, checkmark-circle, checkmark-done)
  if (norm.includes('check')) {
    const isCircle = norm.includes('circle');
    const isDone = norm.includes('done');
    return renderSvg(size, color, (
      <>
        {isCircle && <circle cx="12" cy="12" r="10" />}
        <polyline points={isCircle ? "8 12 11 15 16 9" : "20 6 9 17 4 12"} />
        {isDone && <polyline points="16 6 8 14 6 12" />}
      </>
    ), style);
  }

  // 7. Cadenas / Verrouillage (lock-closed, lock-closed-outline, lock-open, key)
  if (norm.includes('lock') || norm.includes('key')) {
    const isFilled = norm === 'lock-closed' || norm === 'lock';
    const isOpen = norm.includes('open');
    return renderSvg(size, color, (
      <>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" fill={isFilled ? color : 'none'} />
        <path d={isOpen ? "M7 11V7a5 5 0 0 1 9.9-1" : "M7 11V7a5 5 0 0 1 10 0v4"} />
      </>
    ), style);
  }

  // 8. Dossier (folder, folder-open, folder-open-outline)
  if (norm.includes('folder')) {
    const isOpen = norm.includes('open');
    const isFilled = norm === 'folder';
    return renderSvg(size, color, (
      <>
        <path
          d={
            isOpen
              ? "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z M2 10h20"
              : "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
          }
          fill={isFilled ? color : 'none'}
        />
      </>
    ), style);
  }

  // 9. Document / Fichier texte (document, document-text, document-attach)
  if (norm.includes('document') || norm.includes('file')) {
    const isFilled = norm === 'document' || norm === 'document-text';
    return renderSvg(size, color, (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill={isFilled ? color : 'none'} />
        <polyline points="14 2 14 8 20 8" stroke={isFilled ? '#FAF6EB' : color} />
        <line x1="16" y1="13" x2="8" y2="13" stroke={isFilled ? '#FAF6EB' : color} />
        <line x1="16" y1="17" x2="8" y2="17" stroke={isFilled ? '#FAF6EB' : color} />
        {norm.includes('attach') && <path d="M10 9H8" stroke={isFilled ? '#FAF6EB' : color} />}
      </>
    ), style);
  }

  // 10. Nuage / Cloud (cloud, cloud-upload, cloud-download, cloud-offline)
  if (norm.includes('cloud')) {
    const isUpload = norm.includes('upload');
    const isDownload = norm.includes('download');
    const isOffline = norm.includes('offline');
    return renderSvg(size, color, (
      <>
        <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" fill={norm === 'cloud' ? color : 'none'} />
        {isUpload && (
          <>
            <polyline points="16 16 12 12 8 16" />
            <line x1="12" y1="12" x2="12" y2="21" />
          </>
        )}
        {isDownload && (
          <>
            <polyline points="8 17 12 21 16 17" />
            <line x1="12" y1="12" x2="12" y2="21" />
          </>
        )}
        {isOffline && (
          <line x1="1" y1="1" x2="23" y2="23" stroke="#DC2626" strokeWidth="2.5" />
        )}
      </>
    ), style);
  }

  // 11. Flèches (arrow-back, arrow-forward, back, forward)
  if (norm.includes('arrow-back') || norm === 'back') {
    return renderSvg(size, color, (
      <>
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </>
    ), style);
  }
  if (norm.includes('arrow-forward') || norm === 'forward') {
    return renderSvg(size, color, (
      <>
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </>
    ), style);
  }

  // 12. Chevrons (chevron-forward, chevron-back, chevron-down, chevron-up)
  if (norm.includes('chevron-forward')) {
    return renderSvg(size, color, <polyline points="9 18 15 12 9 6" />, style);
  }
  if (norm.includes('chevron-back')) {
    return renderSvg(size, color, <polyline points="15 18 9 12 15 6" />, style);
  }
  if (norm.includes('chevron-down')) {
    return renderSvg(size, color, <polyline points="6 9 12 15 18 9" />, style);
  }
  if (norm.includes('chevron-up')) {
    return renderSvg(size, color, <polyline points="18 15 12 9 6 15" />, style);
  }

  // 13. Bouclier de sécurité (shield, shield-checkmark, shield-outline)
  if (norm.includes('shield')) {
    const hasCheck = norm.includes('checkmark') || norm.includes('check');
    const isFilled = norm === 'shield' || norm === 'shield-checkmark';
    return renderSvg(size, color, (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill={isFilled ? color : 'none'} />
        {hasCheck && (
          <polyline points="9 12 11 14 15 10" stroke={isFilled ? '#FAF6EB' : color} strokeWidth="2.2" />
        )}
      </>
    ), style);
  }

  // 14. Oeil / Aperçu / Lecture (eye, eye-outline)
  if (norm.includes('eye')) {
    return renderSvg(size, color, (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ), style);
  }

  // 15. Paramètres / Rouage (settings, settings-sharp, gear)
  if (norm.includes('setting') || norm.includes('gear')) {
    return renderSvg(size, color, (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </>
    ), style);
  }

  // 16. Ruban / Pass VIP (ribbon, ribbon-outline)
  if (norm.includes('ribbon') || norm.includes('diploma')) {
    const isFilled = norm === 'ribbon';
    return renderSvg(size, color, (
      <>
        <circle cx="12" cy="8" r="6" fill={isFilled ? color : 'none'} />
        <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
      </>
    ), style);
  }

  // 17. Panier d'achat (cart, cart-outline)
  if (norm.includes('cart')) {
    const isFilled = norm === 'cart';
    return renderSvg(size, color, (
      <>
        <circle cx="9" cy="21" r="1" fill={isFilled ? color : 'none'} />
        <circle cx="20" cy="21" r="1" fill={isFilled ? color : 'none'} />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </>
    ), style);
  }

  // 18. Cadeau / Promo (gift, gift-outline, promo)
  if (norm.includes('gift') || norm.includes('promo')) {
    const isFilled = norm === 'gift';
    return renderSvg(size, color, (
      <>
        <polyline points="20 12 20 22 4 22 4 12" fill={isFilled ? color : 'none'} />
        <rect x="2" y="7" width="20" height="5" />
        <line x1="12" y1="22" x2="12" y2="7" />
        <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
        <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
      </>
    ), style);
  }

  // 19. Éclair / Vitesse / Action (flash, flash-outline)
  if (norm.includes('flash')) {
    const isFilled = norm === 'flash';
    return renderSvg(size, color, (
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill={isFilled ? color : 'none'} />
    ), style);
  }

  // 20. Notifications / Cloche (notifications, notifications-outline, bell)
  if (norm.includes('notification') || norm.includes('bell')) {
    const isFilled = norm === 'notifications';
    return renderSvg(size, color, (
      <>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" fill={isFilled ? color : 'none'} />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </>
    ), style);
  }

  // 21. Livre / Cours (book, book-outline)
  if (norm.includes('book')) {
    const isFilled = norm === 'book';
    return renderSvg(size, color, (
      <>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" fill={isFilled ? color : 'none'} />
      </>
    ), style);
  }

  // 22. Utilisateur / Profil (person, person-outline, user)
  if (norm.includes('person') || norm.includes('user')) {
    const isFilled = norm === 'person';
    return renderSvg(size, color, (
      <>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" fill={isFilled ? color : 'none'} />
      </>
    ), style);
  }

  // 23. Téléphone (call, call-outline, phone)
  if (norm.includes('call') || norm.includes('phone')) {
    if (norm.includes('portrait') || norm.includes('landscape')) {
      return renderSvg(size, color, (
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      ), style);
    }
    return renderSvg(size, color, (
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    ), style);
  }

  // 24. Appareil photo / Images (camera, images, images-outline)
  if (norm.includes('camera') || norm.includes('image')) {
    const isFilled = norm === 'camera' || norm === 'images';
    if (norm.includes('image')) {
      return renderSvg(size, color, (
        <>
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </>
      ), style);
    }
    return renderSvg(size, color, (
      <>
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" fill={isFilled ? color : 'none'} />
        <circle cx="12" cy="13" r="4" stroke={isFilled ? '#FAF6EB' : color} />
      </>
    ), style);
  }

  // 25. Corbeille / Retirer (trash, trash-outline, delete)
  if (norm.includes('trash') || norm.includes('delete')) {
    return renderSvg(size, color, (
      <>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </>
    ), style);
  }

  // 26. Partage (share, share-outline)
  if (norm.includes('share')) {
    return renderSvg(size, color, (
      <>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </>
    ), style);
  }

  // 27. Téléchargement (download, download-outline)
  if (norm.includes('download')) {
    return renderSvg(size, color, (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </>
    ), style);
  }

  // 28. Mégaphone / Annonce (megaphone)
  if (norm.includes('megaphone')) {
    return renderSvg(size, color, (
      <>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
      </>
    ), style);
  }

  // 29. Lecture vidéo / audio (play, play-circle)
  if (norm.includes('play')) {
    const isCircle = norm.includes('circle');
    const isFilled = norm === 'play';
    return renderSvg(size, color, (
      <>
        {isCircle && <circle cx="12" cy="12" r="10" />}
        <polygon points="10 8 16 12 10 16 10 8" fill={isFilled || isCircle ? color : 'none'} />
      </>
    ), style);
  }

  // 30. Étoiles / Étincelles (sparkles, star)
  if (norm.includes('sparkle') || norm.includes('star')) {
    return renderSvg(size, color, (
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill={color} />
    ), style);
  }

  // 31. Alerte / Attention (alert, warning)
  if (norm.includes('alert') || norm.includes('warning') || norm.includes('urgent')) {
    return renderSvg(size, color, (
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="3" />
      </>
    ), style);
  }

  // 32. Information (info, information)
  if (norm.includes('info')) {
    return renderSvg(size, color, (
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" strokeWidth="3" />
      </>
    ), style);
  }

  // 33. Actualiser / Recharger (refresh, reload)
  if (norm.includes('refresh') || norm.includes('reload')) {
    return renderSvg(size, color, (
      <>
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </>
    ), style);
  }

  // 34. Bulle de discussion (chatbubble, chatbubble-ellipses)
  if (norm.includes('chat') || norm.includes('message')) {
    const isFilled = norm === 'chatbubble' || norm === 'chatbubble-ellipses';
    return renderSvg(size, color, (
      <>
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" fill={isFilled ? color : 'none'} />
        {norm.includes('ellipses') && (
          <>
            <circle cx="8" cy="12" r="1" fill={isFilled ? '#FAF6EB' : color} stroke="none" />
            <circle cx="12" cy="12" r="1" fill={isFilled ? '#FAF6EB' : color} stroke="none" />
            <circle cx="16" cy="12" r="1" fill={isFilled ? '#FAF6EB' : color} stroke="none" />
          </>
        )}
      </>
    ), style);
  }

  // 35. Carte bancaire / Paiement (card)
  if (norm.includes('card')) {
    return renderSvg(size, color, (
      <>
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </>
    ), style);
  }

  // 36. Ajouter (add, add-circle, plus)
  if (norm.includes('add') || norm.includes('plus')) {
    const isCircle = norm.includes('circle');
    return renderSvg(size, color, (
      <>
        {isCircle && <circle cx="12" cy="12" r="10" />}
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </>
    ), style);
  }

  // 37. Déconnexion / Extinction (log-out, power-outline)
  if (norm.includes('log-out') || norm.includes('logout') || norm.includes('power')) {
    return renderSvg(size, color, (
      <>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </>
    ), style);
  }

  // 38. Journal / Actualité (newspaper, newspaper-outline)
  if (norm.includes('newspaper')) {
    return renderSvg(size, color, (
      <>
        <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
        <path d="M18 14h-8" />
        <path d="M15 18h-5" />
        <path d="M10 6h8v4h-8V6Z" />
      </>
    ), style);
  }

  // 39. Fusée / Nouveauté (rocket, rocket-outline)
  if (norm.includes('rocket')) {
    return renderSvg(size, color, (
      <>
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
        <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
        <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
        <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
      </>
    ), style);
  }

  // 40. Thème clair (sun, sunny) & Thème sombre (moon)
  if (norm.includes('sun')) {
    return renderSvg(size, color, (
      <>
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
      </>
    ), style);
  }
  if (norm.includes('moon')) {
    return renderSvg(size, color, (
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    ), style);
  }

  // 🎯 Fallback universel : cercle avec puce stylisée (jamais de rectangle vide / tofu)
  return renderSvg(size, color, (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" fill={color} />
    </>
  ), style);
}

// Composant Pont d'Icônes Universel
export function AppIcon({ name, size = 20, color = '#000000', style }: AppIconProps) {
  // Sur le Web : Rendu vectoriel SVG pur direct (garanti sans problème de police ni délai)
  if (Platform.OS === 'web') {
    return getWebSvgIcon(name, size, color, style);
  }

  // Sur Android & iOS natif : Rendu natif Expo Vector Icons
  return <ExpoIonicons name={name as any} size={size} color={color} style={style} />;
}

AppIcon.glyphMap = ExpoIonicons.glyphMap;

// Export par défaut et alias Ionicons pour compatibilité directe
export default AppIcon;
export { AppIcon as Ionicons };