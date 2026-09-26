import React, { useState, useEffect, useCallback } from 'react';
import type { LecteurPdfProps } from './PdfViewer/types';
import { LecteurPdfErrorBoundary } from './LecteurPdfDesktop';

/**
 * LecteurPdfIos (PWA Mobile iOS — Safari / WebKit)
 * 
 * Exploite le moteur de rendu PDF natif de WebKit (Safari iOS) via une iframe optimisée :
 * 1. Rendu natif instantané et fluide sans bibliothèque JS lourde.
 * 2. Gestes tactiles et pinch-to-zoom natifs pris en charge directement par le système iOS.
 * 3. Propriétés spécifiques WebKit (-webkit-overflow-scrolling: touch) pour éliminer les débordements.
 * 4. Gestion d'états fluide : spinner d'ouverture, gestion d'erreur et protection du paywall.
 */
const LecteurPdfIosInternal: React.FC<LecteurPdfProps> = ({
  urlFichier,
  pdfUrl,
  estVerrouille = false,
  limiteApercuValeur = 30,
  prix = 100,
  estSombre = false,
  onAcheter,
  onVip,
  onDocumentLoad,
  onError,
  onReessayer,
}) => {
  const [enChargement, setEnChargement] = useState<boolean>(true);
  const [erreurChargement, setErreurChargement] = useState<boolean>(false);
  const [cleIframe, setCleIframe] = useState<number>(0);

  // 1. Récupération et formatage de l'URL valide
  const targetUrl = (typeof pdfUrl === 'string' && pdfUrl) || (typeof urlFichier === 'string' && urlFichier) || '';

  // Neutralisation des défilements externes parasites sur le viewport iOS
  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyOverscroll = document.body.style.overscrollBehavior;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.overscrollBehavior = originalBodyOverscroll;
    };
  }, []);

  const rechargerIframe = useCallback(() => {
    setErreurChargement(false);
    setEnChargement(true);
    setCleIframe((c) => c + 1);
    onReessayer?.();
  }, [onReessayer]);

  // 3. Document totalement verrouillé (0 page autorisée)
  if (estVerrouille && limiteApercuValeur === 0) {
    return (
      <div
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          backgroundColor: estSombre ? '#0F172A' : '#F8FAFC',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: '380px',
            width: '100%',
            backgroundColor: estSombre ? '#1E293B' : '#FFFFFF',
            borderRadius: '18px',
            padding: '28px 20px',
            textAlign: 'center',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            border: estSombre ? '1px solid #334155' : '1px solid #E2E8F0',
          }}
        >
          <div style={{ fontSize: '38px', marginBottom: '12px' }}>🔒</div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800, color: estSombre ? '#FFFFFF' : '#0F172A' }}>
            Document Verrouillé
          </h3>
          <p style={{ margin: '0 0 20px 0', fontSize: '13px', lineHeight: '19px', color: estSombre ? '#94A3B8' : '#64748B' }}>
            Ce cours complet nécessite une acquisition pour être consulté. Débloquez-le à l'unité ou profitez du Pass VIP.
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onAcheter}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#7F011F',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              🛒 Débloquer ({prix} F)
            </button>
            <button
              onClick={onVip}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#F59E0B',
                color: '#1E1B4B',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              👑 Pass VIP (500 F)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // URL du document absente
  if (!targetUrl) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          backgroundColor: estSombre ? '#0F172A' : '#171717',
          color: '#FFFFFF',
          textAlign: 'center',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: '38px', marginBottom: '8px' }}>⚠️</div>
        <div style={{ color: '#EF4444', fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>
          URL du document introuvable
        </div>
        <div style={{ color: '#94A3B8', fontSize: '13px', marginBottom: '16px', maxWidth: '300px' }}>
          Le document PDF demandé n'a pas pu être chargé.
        </div>
        <button
          onClick={rechargerIframe}
          style={{
            padding: '10px 20px',
            backgroundColor: '#7F011F',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '10px',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          🔄 Réessayer
        </button>
      </div>
    );
  }

  // 2. Structure d'affichage adaptée à WebKit Mobile iOS
  return (
    <div
      className="w-full h-full relative overflow-hidden flex flex-col bg-neutral-900"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#171717',
        overflow: 'hidden',
        WebkitOverflowScrolling: 'touch',
        fontFamily: 'sans-serif',
      }}
    >
      <style>{`
        @keyframes cauzon-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* 3. Indicateur visuel de chargement fluide et discret */}
      {enChargement && !erreurChargement && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: estSombre ? '#0F172A' : '#171717',
            gap: '14px',
            zIndex: 10,
          }}
        >
          <div
            style={{
              width: '38px',
              height: '38px',
              border: '3.5px solid rgba(255, 255, 255, 0.15)',
              borderTopColor: '#7F011F',
              borderRadius: '50%',
              animation: 'cauzon-spin 0.8s linear infinite',
            }}
          />
          <div style={{ color: '#FFFFFF', fontSize: '14px', fontWeight: 600, letterSpacing: '0.2px' }}>
            Ouverture du document...
          </div>
          <div style={{ color: '#94A3B8', fontSize: '11.5px' }}>
            Moteur WebKit iOS Safari
          </div>
        </div>
      )}

      {/* 3. Gestion d'erreur sans plantage de l'écran */}
      {erreurChargement && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            backgroundColor: estSombre ? '#0F172A' : '#171717',
            color: '#FFFFFF',
            textAlign: 'center',
            zIndex: 15,
          }}
        >
          <div style={{ fontSize: '38px', marginBottom: '8px' }}>⚠️</div>
          <div style={{ color: '#EF4444', fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>
            Impossible de charger le document
          </div>
          <div style={{ color: '#94A3B8', fontSize: '12.5px', maxWidth: '320px', marginBottom: '16px' }}>
            Le chargement du fichier PDF a échoué. Veuillez actualiser pour retenter.
          </div>
          <button
            onClick={rechargerIframe}
            style={{
              padding: '10px 20px',
              backgroundColor: '#7F011F',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '10px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            🔄 Actualiser
          </button>
        </div>
      )}

      {/* Iframe optimisée pour WebKit iOS */}
      <iframe
        key={cleIframe}
        src={targetUrl}
        className="w-full h-full border-0"
        title="Document de cours"
        loading="eager"
        onLoad={() => {
          setEnChargement(false);
          onDocumentLoad?.(1);
        }}
        onError={(e) => {
          setEnChargement(false);
          setErreurChargement(true);
          onError?.(e);
        }}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          flex: 1,
          backgroundColor: '#171717',
        }}
      />
    </div>
  );
};

export const LecteurPdfIos: React.FC<LecteurPdfProps> = (props) => {
  return (
    <LecteurPdfErrorBoundary estSombre={props.estSombre} onReessayer={props.onReessayer}>
      <LecteurPdfIosInternal {...props} />
    </LecteurPdfErrorBoundary>
  );
};

export default LecteurPdfIos;
