import React, { useState, useEffect, useCallback } from 'react';
import type { LecteurPdfProps } from './PdfViewer/types';
import { LecteurPdfErrorBoundary } from './LecteurPdfDesktop';

/**
 * LecteurPdfAndroid (PWA Mobile Android — Visualiseur Intégré Google Docs Viewer)
 * 
 * Solution éprouvée, robuste et zéro crash pour la consultation mobile sur Android :
 * 1. Moteur Google Docs Viewer en iframe plein écran (aucun plugin requis, zoom tactile natif).
 * 2. Neutralisation des scrolls externes parasites sur le conteneur parent / body.
 * 3. Indicateur de chargement soigné et fluide ("Ouverture du document...").
 * 4. Gestion d'erreur robuste avec rechargement sans crash.
 */
const LecteurPdfAndroidInternal: React.FC<LecteurPdfProps> = ({
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

  const targetUrl = (typeof pdfUrl === 'string' && pdfUrl) || (typeof urlFichier === 'string' && urlFichier) || '';
  const viewerUrl = targetUrl
    ? `https://docs.google.com/viewer?url=${encodeURIComponent(targetUrl)}&embedded=true`
    : '';

  // 2. Neutralisation de tout comportement de défilement externe parasite sur body/html
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

  // Document totalement verrouillé (0 page autorisée)
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

  // URL du document introuvable
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
          Le lien du document PDF n'a pas pu être chargé.
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
            Visualiseur optimisé mobile
          </div>
        </div>
      )}

      {/* 3. Gestion d'erreur robuste avec actualisation sans plantage */}
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
            Impossible de charger l'aperçu
          </div>
          <div style={{ color: '#94A3B8', fontSize: '12.5px', maxWidth: '320px', marginBottom: '16px' }}>
            La connexion au visualiseur a été interrompue. Veuillez actualiser pour retenter.
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

      {/* 2. Iframe Google Docs Viewer Plein Écran */}
      <iframe
        key={cleIframe}
        src={viewerUrl}
        className="w-full h-full border-0"
        title="Visualiseur PDF Google Docs"
        allowFullScreen
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

export const LecteurPdfAndroid: React.FC<LecteurPdfProps> = (props) => {
  return (
    <LecteurPdfErrorBoundary estSombre={props.estSombre} onReessayer={props.onReessayer}>
      <LecteurPdfAndroidInternal {...props} />
    </LecteurPdfErrorBoundary>
  );
};

export default LecteurPdfAndroid;
