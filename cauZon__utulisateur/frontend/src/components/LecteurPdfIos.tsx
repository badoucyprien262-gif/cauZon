import React, { useState, useEffect } from 'react';
import type { LecteurPdfProps } from './PdfViewer/types';
import { LecteurPdfErrorBoundary } from './LecteurPdfDesktop';

/**
 * LecteurPdfIos (PWA Mobile iOS — Safari)
 * 
 * Conteneur préliminaire sécurisé pour iOS Safari :
 * - Exploite le moteur WebKit natif d'affichage PDF via <iframe> avec défilement inertiel touch
 * - Verrouillage DRM / Paywall pour les documents fermés
 * - Enveloppé dans un ErrorBoundary étanche
 */
const LecteurPdfIosInternal: React.FC<LecteurPdfProps> = ({
  urlFichier,
  pdfUrl,
  estVerrouille = false,
  limiteApercuPages = 1,
  limiteApercuType = 'pourcentage',
  limiteApercuValeur = 30,
  prix = 100,
  estSombre = false,
  onAcheter,
  onVip,
  onDocumentLoad,
  onError,
  onReessayer,
}) => {
  const [chargement, setChargement] = useState<boolean>(true);
  const source = pdfUrl || (typeof urlFichier === 'string' ? urlFichier : null);

  useEffect(() => {
    if (source) {
      setChargement(false);
      onDocumentLoad?.(1);
    }
  }, [source, onDocumentLoad]);

  // Si document totalement verrouillé
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
            Ce document nécessite une acquisition pour être consulté. Débloquez-le à l'unité ou profitez du Pass VIP.
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

  if (!source) {
    return (
      <div
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          minHeight: '260px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: estSombre ? '#0F172A' : '#F8FAFC',
          color: estSombre ? '#94A3B8' : '#64748B',
          fontFamily: 'sans-serif',
          fontSize: '13px',
        }}
      >
        Préparation du document iOS...
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 'calc(100vh - 64px)',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: estSombre ? '#0F172A' : '#F1F5F9',
        overflow: 'hidden',
      }}
    >
      <iframe
        src={`${source}#toolbar=0`}
        title="Lecteur PDF iOS Safari"
        style={{
          width: '100%',
          height: '100%',
          flex: 1,
          border: 'none',
          backgroundColor: estSombre ? '#0F172A' : '#FFFFFF',
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
