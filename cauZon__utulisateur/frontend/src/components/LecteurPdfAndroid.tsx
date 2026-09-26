import React, { useState } from 'react';
import type { LecteurPdfProps } from './PdfViewer/types';
import { LecteurPdfErrorBoundary } from './LecteurPdfDesktop';

/**
 * LecteurPdfAndroid (PWA Mobile Android — Approche 2 : Google Docs Viewer)
 * 
 * Intégration du moteur Google Docs Viewer dans une iframe fluide et responsive.
 * Élimination de la gestion Canvas et des écouteurs Pointer Events maison.
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

  const pdfTargetUrl = (typeof pdfUrl === 'string' && pdfUrl) || (typeof urlFichier === 'string' && urlFichier) || '';
  const viewerUrl = pdfTargetUrl
    ? `https://docs.google.com/viewer?url=${encodeURIComponent(pdfTargetUrl)}&embedded=true`
    : '';

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

  // URL de fichier absente
  if (!pdfTargetUrl) {
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
          backgroundColor: estSombre ? '#0F172A' : '#F8FAFC',
          textAlign: 'center',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: '38px', marginBottom: '8px' }}>⚠️</div>
        <div style={{ color: '#EF4444', fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>
          URL du document introuvable
        </div>
        <button
          onClick={onReessayer}
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
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: estSombre ? '#0F172A' : '#171717',
        fontFamily: 'sans-serif',
      }}
    >
      <style>{`
        @keyframes cauzon-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Indicateur visuel de chargement léger */}
      {enChargement && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: estSombre ? '#0F172A' : '#F8FAFC',
            gap: '12px',
            zIndex: 10,
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              border: '3.5px solid rgba(127, 1, 31, 0.15)',
              borderTopColor: '#7F011F',
              borderRadius: '50%',
              animation: 'cauzon-spin 0.8s linear infinite',
            }}
          />
          <div style={{ color: '#7F011F', fontSize: '14px', fontWeight: 700 }}>
            Chargement du document...
          </div>
          <div style={{ color: '#64748B', fontSize: '11px' }}>
            Moteur Google Docs Viewer
          </div>
        </div>
      )}

      {/* Iframe Google Docs Viewer */}
      <iframe
        src={viewerUrl}
        className="w-full h-full border-0"
        title="Visualiseur PDF"
        allowFullScreen
        loading="lazy"
        onLoad={() => {
          setEnChargement(false);
          onDocumentLoad?.(1);
        }}
        onError={(e) => {
          setEnChargement(false);
          onError?.(e);
        }}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          flex: 1,
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
