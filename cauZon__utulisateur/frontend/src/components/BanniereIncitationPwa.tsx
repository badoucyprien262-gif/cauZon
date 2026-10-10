import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Platform,
  useWindowDimensions,
  StyleSheet,
} from 'react-native';
import { Ionicons } from './AppIcon';
import { useApp } from '../store/ContexteApp';

export interface BanniereIncitationPwaProps {
  onSInscrire?: () => void;
}

/**
 * BanniereIncitationPwa (Web / PWA)
 *
 * 1. Condition d'affichage :
 *    - Uniquement sur Web (Platform.OS === 'web')
 *    - Visiteur non connecté (utilisateur === null)
 *    - Application non installée en mode standalone
 *    - Non fermé durant la session
 *
 * 2. Cycle temporel infini :
 *    - Entrée fluide (slide-up / fade-in)
 *    - Reste visible pendant 10 secondes
 *    - Sortie fluide (slide-down / fade-out) pendant 2 secondes
 *    - Reste masqué pendant 5 secondes
 *    - Réapparaît et boucle indéfiniment
 *
 * 3. Actions :
 *    - Bouton "Installer / S'inscrire" : déclenche prompt PWA ou ouvre inscription
 *    - Bouton (×) pour fermer la bannière durant la session
 */
export default function BanniereIncitationPwa({ onSInscrire }: BanniereIncitationPwaProps) {
  // Sur plateformes natives (Android/iOS), ne rien rendre
  if (Platform.OS !== 'web') {
    return null;
  }

  return <BanniereIncitationPwaWeb onSInscrire={onSInscrire} />;
}

function BanniereIncitationPwaWeb({ onSInscrire }: BanniereIncitationPwaProps) {
  const { width } = useWindowDimensions();
  const { utilisateur, estConnecteGoogle } = useApp();

  // Détection du mode standalone / déjà installé
  const estStandalone = useMemo(() => {
    if (typeof window === 'undefined') return false;
    try {
      const matchMediaStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches;
      const navigatorStandalone = (navigator as any)?.standalone === true;
      return Boolean(matchMediaStandalone || navigatorStandalone);
    } catch {
      return false;
    }
  }, []);

  // Mémorisation de la fermeture manuelle en sessionStorage
  const [fermeManuellement, setFermeManuellement] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        return window.sessionStorage.getItem('CAUZON_BANNIERE_PWA_FERMEE') === 'true';
      } catch {}
    }
    return false;
  });

  const [aInstalle, setAInstalle] = useState<boolean>(false);
  const deferredPromptRef = useRef<any>(null);
  const [peutInstallerNatif, setPeutInstallerNatif] = useState<boolean>(false);

  // État d'animation du cycle périodique
  const [estVisible, setEstVisible] = useState<boolean>(false);
  const [estEnTransitionSortie, setEstEnTransitionSortie] = useState<boolean>(false);

  // Interception de l'événement beforeinstallprompt natif du navigateur
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setPeutInstallerNatif(true);
    };

    const handleAppInstalled = () => {
      setAInstalle(true);
      deferredPromptRef.current = null;
      try {
        window.sessionStorage?.setItem('CAUZON_BANNIERE_PWA_FERMEE', 'true');
      } catch {}
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Détermine si la bannière doit être active
  const devraitAfficher =
    !utilisateur &&
    !estConnecteGoogle &&
    !estStandalone &&
    !fermeManuellement &&
    !aInstalle;

  // ── Cycle Temporel Infini ──────────────────────────────────────────────────
  // 1. Visible 10 secondes
  // 2. Sortie 2 secondes (animation CSS)
  // 3. Masqué 5 secondes
  // Répétition indéfinie
  useEffect(() => {
    if (!devraitAfficher) {
      setEstVisible(false);
      return;
    }

    let timerPhaseVisible: ReturnType<typeof setTimeout> | null = null;
    let timerPhaseMasquee: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;

    const lancerCycle = () => {
      if (isCancelled) return;

      // Début : Visible avec entrée douce
      setEstEnTransitionSortie(false);
      setEstVisible(true);

      // Reste visible pendant 10 secondes
      timerPhaseVisible = setTimeout(() => {
        if (isCancelled) return;

        // Déclenche la sortie fluide de 2 secondes
        setEstEnTransitionSortie(true);
        setEstVisible(false);

        // Sortie (2s) + Masqué (5s) = 7 secondes avant la prochaine apparition
        timerPhaseMasquee = setTimeout(() => {
          if (!isCancelled) {
            lancerCycle();
          }
        }, 7000);
      }, 10000);
    };

    // Petit délai d'apparition initial pour laisser le chargement de la page se stabiliser (800ms)
    const initialDelay = setTimeout(() => {
      lancerCycle();
    }, 800);

    return () => {
      isCancelled = true;
      clearTimeout(initialDelay);
      if (timerPhaseVisible) clearTimeout(timerPhaseVisible);
      if (timerPhaseMasquee) clearTimeout(timerPhaseMasquee);
    };
  }, [devraitAfficher]);

  if (!devraitAfficher) {
    return null;
  }

  // Clic sur l'action principale : prompt natif PWA si dispo, sinon inscription
  const handleAction = async () => {
    if (deferredPromptRef.current) {
      try {
        const promptEvent = deferredPromptRef.current;
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice?.outcome === 'accepted') {
          setAInstalle(true);
          try {
            window.sessionStorage?.setItem('CAUZON_BANNIERE_PWA_FERMEE', 'true');
          } catch {}
          return;
        }
      } catch (err) {
        console.warn('[PWA] Prompt installation ignoré :', err);
      }
    }

    // Si prompt PWA non disponible ou annulé, guider vers l'inscription/connexion
    if (onSInscrire) {
      onSInscrire();
    }
  };

  const handleFermer = () => {
    setFermeManuellement(true);
    setEstVisible(false);
    try {
      window.sessionStorage?.setItem('CAUZON_BANNIERE_PWA_FERMEE', 'true');
    } catch {}
  };

  const isMobile = width < 768;

  // Calcul du style dynamique pour la transition CSS fluide à 60 FPS
  const transitionStyle: React.CSSProperties = {
    opacity: estVisible ? 1 : 0,
    transform: estVisible ? 'translateY(0)' : 'translateY(24px)',
    pointerEvents: estVisible ? 'auto' : 'none',
    transition: estEnTransitionSortie
      ? 'opacity 2000ms ease-in-out, transform 2000ms ease-in-out'
      : 'opacity 500ms cubic-bezier(0.16, 1, 0.3, 1), transform 500ms cubic-bezier(0.16, 1, 0.3, 1)',
  };

  return (
    <div
      id="cauzon-pwa-incentive-banner"
      style={{
        position: 'fixed',
        bottom: isMobile ? '78px' : '24px',
        right: isMobile ? '12px' : '24px',
        left: isMobile ? '12px' : 'auto',
        maxWidth: isMobile ? 'calc(100vw - 24px)' : '440px',
        zIndex: 900,
        boxSizing: 'border-box',
        ...transitionStyle,
      }}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #7F011F 0%, #520013 100%)',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35), 0 2px 8px rgba(127, 1, 31, 0.25)',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          position: 'relative',
          overflow: 'hidden',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        {/* Halo doré décoratif en arrière-plan */}
        <div
          style={{
            position: 'absolute',
            top: '-24px',
            right: '-24px',
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(212, 175, 55, 0.25) 0%, rgba(212, 175, 55, 0) 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Bouton de fermeture (×) discret */}
        <button
          onClick={handleFermer}
          aria-label="Fermer la bannière"
          style={{
            position: 'absolute',
            top: '6px',
            right: '8px',
            background: 'transparent',
            border: 'none',
            color: 'rgba(250, 246, 235, 0.65)',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            fontSize: '14px',
            lineHeight: 1,
            outline: 'none',
            zIndex: 2,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = '#FFFFFF';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = 'rgba(250, 246, 235, 0.65)';
          }}
        >
          <Ionicons name="close" size={16} color="currentColor" />
        </button>

        {/* Logo / Icône cauZon */}
        <div
          style={{
            width: '42px',
            height: '42px',
            minWidth: '42px',
            borderRadius: '11px',
            overflow: 'hidden',
            backgroundColor: '#FFFFFF',
            boxShadow: '0 4px 10px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(255, 255, 255, 0.3)',
          }}
        >
          <Image
            source={require('../../assets/icon.png')}
            style={{ width: 42, height: 42 }}
            resizeMode="cover"
          />
        </div>

        {/* Contenu textuel */}
        <div style={{ flex: 1, minWidth: 0, paddingRight: '14px' }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: '#FFFFFF',
              letterSpacing: '0.15px',
              lineHeight: 1.25,
              marginBottom: '3px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Installez cauZon sur votre appareil
          </div>
          <div
            style={{
              fontSize: '11.5px',
              fontWeight: 500,
              color: 'rgba(250, 246, 235, 0.88)',
              lineHeight: 1.3,
            }}
          >
            Accédez à vos cours et annales hors-ligne en 1 clic.
          </div>
        </div>

        {/* Bouton d'action principal "Installer / S'inscrire" */}
        <button
          onClick={handleAction}
          style={{
            backgroundColor: '#FAF6EB',
            color: '#7F011F',
            border: 'none',
            borderRadius: '10px',
            padding: '7px 11px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.18)',
            outline: 'none',
            flexShrink: 0,
            transition: 'transform 150ms ease, box-shadow 150ms ease, background-color 150ms ease',
          }}
          onMouseEnter={(e) => {
            const btn = e.currentTarget as HTMLElement;
            btn.style.transform = 'translateY(-1px)';
            btn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.28)';
            btn.style.backgroundColor = '#FFFFFF';
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget as HTMLElement;
            btn.style.transform = 'translateY(0)';
            btn.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.18)';
            btn.style.backgroundColor = '#FAF6EB';
          }}
        >
          <Ionicons
            name={peutInstallerNatif ? 'download-outline' : 'sparkles-outline'}
            size={14}
            color="#7F011F"
          />
          <span>Installer / S'inscrire</span>
        </button>
      </div>
    </div>
  );
}
