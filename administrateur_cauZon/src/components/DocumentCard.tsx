import React from 'react';
import { Trash2, Eye, ShieldCheck, TrendingUp, Shield, CheckCircle } from 'lucide-react';
import type { DocumentRow } from '../types';

interface DocumentCardProps {
  doc: DocumentRow;
  darkMode: boolean;
  acquisitionsCount?: number;
  onPreview: (doc: DocumentRow) => void;
  onDelete: (id: string) => void;
  onToggleCertified: (doc: DocumentRow) => void;
  onToggleStatus: (doc: DocumentRow) => void;
}

const STATUS_LABELS: Record<string, string> = {
  published: 'Publié',
  inactif: 'Inactif',
  scheduled: 'Planifié',
  draft: 'Brouillon',
};

const STATUS_COLORS: Record<string, string> = {
  published: '#10B981',
  inactif: '#6B7280',
  scheduled: '#F59E0B',
  draft: '#6B7280',
};

export function DocumentCard({ doc, darkMode, acquisitionsCount, onPreview, onDelete, onToggleCertified, onToggleStatus }: DocumentCardProps) {
  const cardBg = darkMode ? '#1e1e1e' : '#FFFFFF';
  const border = darkMode ? '#2D1220' : '#E5E7EB';
  const textSub = darkMode ? '#9CA3AF' : '#6B7280';
  const statusColor = STATUS_COLORS[doc.status ?? 'inactif'] ?? '#6B7280';
  const statusLabel = STATUS_LABELS[doc.status ?? 'inactif'] ?? (doc.status || 'Inactif');

  return (
    <div
      style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'transform 0.15s, box-shadow 0.15s', cursor: 'pointer' }}
      onClick={() => onPreview(doc)}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(107,17,36,0.14)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
    >
      {/* Cover */}
      <div style={{ height: '125px', backgroundColor: '#2D1220', position: 'relative', overflow: 'hidden' }}>
        {doc.cover_url ? (
          <img src={doc.cover_url} alt={doc.titre ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #6B1124, #2D1220)' }}>
            <span style={{ fontSize: '36px' }}>📄</span>
          </div>
        )}
        {/* Status badge */}
        <span style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: statusColor, color: '#FFF', fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '20px' }}>
          {statusLabel}
        </span>
        {doc.est_certifie && (
          <span style={{ position: 'absolute', top: '8px', left: '8px', backgroundColor: '#6B1124', color: '#FAF6EB', fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle size={10} /> Certifié
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '14px', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: darkMode ? '#FAF6EB' : '#1F2937', margin: 0, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {doc.titre ?? 'Sans titre'}
        </h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: textSub }}>
          <span>{doc.categorie ?? 'Non catégorisé'}</span>
          <span style={{ fontWeight: 700, color: '#6B1124' }}>{doc.prix ?? '0'} FCFA</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: textSub, marginTop: 'auto' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <span>📄 {doc.nombre_pages ?? '?'} p.</span>
            <span>💾 {doc.taille_mo ?? '?'} Mo</span>
          </div>
          {acquisitionsCount !== undefined && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10B981', fontWeight: 700 }}>
              <TrendingUp size={12} /> {acquisitionsCount} acq.
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: '10px 14px', borderTop: `1px solid ${border}`, display: 'flex', gap: '6px', backgroundColor: darkMode ? '#18181B' : '#FAFAFA' }} onClick={(e) => e.stopPropagation()}>
        <button onClick={() => onPreview(doc)} title="Ouvrir le lecteur & gérer le cours" style={{ flex: 1, padding: '7px', background: 'none', border: `1px solid ${border}`, borderRadius: '7px', cursor: 'pointer', color: '#6B1124', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: '11px', fontWeight: 700 }}>
          <Eye size={14} /> Gérer le cours
        </button>
        <button onClick={() => onToggleCertified(doc)} title={doc.est_certifie ? 'Retirer la certification' : 'Certifier ce cours'} style={{ padding: '7px 10px', background: doc.est_certifie ? '#6B1124' : 'none', border: `1px solid ${border}`, borderRadius: '7px', cursor: 'pointer', color: doc.est_certifie ? '#FAF6EB' : textSub, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ShieldCheck size={14} />
        </button>
        <button onClick={() => onToggleStatus(doc)} title={doc.status === 'published' ? 'Dépublier (rendre inactif)' : 'Publier dans le catalogue'} style={{ padding: '7px 10px', background: doc.status === 'published' ? '#10B981' : 'none', border: `1px solid ${border}`, borderRadius: '7px', cursor: 'pointer', color: doc.status === 'published' ? '#FFF' : textSub, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Shield size={14} />
        </button>
        <button onClick={() => onDelete(doc.id)} title="Supprimer ce document" style={{ padding: '7px 10px', background: 'none', border: `1px solid #E74C3C`, borderRadius: '7px', cursor: 'pointer', color: '#E74C3C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
