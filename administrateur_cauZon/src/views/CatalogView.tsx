import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Filter,
  RefreshCw,
  Download,
  Save,
  X,
  FileText,
  Sliders,
  Lock as LockIcon,
  Unlock as UnlockIcon,
  Eye,
} from 'lucide-react';
import type { DocumentRow } from '../types';
import { DocumentCard } from '../components/DocumentCard';
import { PdfPreviewIframe } from '../components/PdfPreviewIframe';
import { ModalAjoutDocument } from '../components/ModalAjoutDocument';
import { getDocumentPublicUrl, toggleDocumentCertified, toggleDocumentStatus, fetchAcquisitionsCount } from '../services/serviceDocuments';
import { supabase } from '../lib/supabase';

interface CatalogViewProps {
  documents: DocumentRow[];
  setDocuments: React.Dispatch<React.SetStateAction<DocumentRow[]>>;
  darkMode: boolean;
  onReload: () => void;
}

type CatalogFilter = 'all' | 'published' | 'inactif' | 'scheduled';

const FILTER_LABELS: Record<CatalogFilter, string> = {
  all: 'Tous',
  published: 'Publiés',
  inactif: 'Inactifs',
  scheduled: 'Planifiés',
};

export function CatalogView({ documents, setDocuments, darkMode, onReload }: CatalogViewProps) {
  const [showUploadPanel, setShowUploadPanel] = useState(false);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CatalogFilter>('all');
  const [acqCounts, setAcqCounts] = useState<Record<string, number>>({});

  // Management Modal (Preview + Edit)
  const [previewDoc, setPreviewDoc] = useState<DocumentRow | null>(null);
  const [tempType, setTempType] = useState<string>('pourcentage');
  const [tempValue, setTempValue] = useState(30);
  const [savingDoc, setSavingDoc] = useState(false);
  const [editForm, setEditForm] = useState({
    titre: '',
    categorie: '',
    description: '',
    tags: '',
    prix: '100',
    nombre_pages: '1',
    est_certifie: false,
    status: 'published',
  });

  const textColor = darkMode ? '#FAF6EB' : '#1F2937';
  const subText = darkMode ? '#9CA3AF' : '#6B7280';
  const border = darkMode ? '#2D1220' : '#E5E7EB';
  const inputBg = darkMode ? '#121212' : '#F9FAFB';

  useEffect(() => {
    documents.forEach(async (doc) => {
      if (acqCounts[doc.id] === undefined) {
        const count = await fetchAcquisitionsCount(doc.id);
        setAcqCounts(prev => ({ ...prev, [doc.id]: count }));
      }
    });
  }, [documents]);

  const filteredDocs = documents
    .filter(d => filter === 'all' || d.status === filter)
    .filter(d => !search || (d.titre ?? '').toLowerCase().includes(search.toLowerCase()) || (d.categorie ?? '').toLowerCase().includes(search.toLowerCase()) || (d.tags ?? '').toLowerCase().includes(search.toLowerCase()));

  const handleDelete = async (id: string) => {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;
    const acqs = acqCounts[id] ?? 0;
    const msg = acqs > 0
      ? `Ce cours a ${acqs} acquisition(s). Il sera DÉSACTIVÉ mais restera accessible aux acheteurs. Confirmer ?`
      : `Aucune acquisition. Ce cours sera SUPPRIMÉ DÉFINITIVEMENT. Confirmer ?`;
    if (!window.confirm(msg)) return;
    try {
      if (acqs > 0) {
        await supabase.from('documents').update({ status: 'inactif' }).eq('id', id);
        alert('✅ Cours désactivé.');
      } else {
        if (doc.file_path) await supabase.storage.from('cours-documents').remove([doc.file_path.trim()]).catch(() => {});
        if (doc.cover_url) {
          const coverPath = doc.cover_url.split('/cours-documents/')[1];
          if (coverPath) await supabase.storage.from('cours-documents').remove([decodeURIComponent(coverPath)]).catch(() => {});
        }
        await supabase.from('documents').delete().eq('id', id);
        alert('✅ Cours supprimé définitivement.');
      }
      setDocuments(prev => prev.filter(d => d.id !== id));
      if (previewDoc?.id === id) setPreviewDoc(null);
      onReload();
    } catch (err: unknown) { alert('Erreur : ' + (err instanceof Error ? err.message : String(err))); }
  };

  const handleToggleCertified = async (doc: DocumentRow) => {
    await toggleDocumentCertified(doc.id, doc.est_certifie);
    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, est_certifie: !d.est_certifie } : d));
  };

  const handleToggleStatus = async (doc: DocumentRow) => {
    await toggleDocumentStatus(doc.id, doc.status);
    const newStatus = doc.status === 'published' ? 'inactif' : 'published';
    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: newStatus } : d));
  };

  const handleOpenPreview = (doc: DocumentRow) => {
    setPreviewDoc(doc);
    const rawType = (doc.limite_apercu_type ?? 'pourcentage').trim();
    let initialType = rawType;
    let initialVal = doc.limite_apercu_valeur ?? 30;

    if (rawType.startsWith('fluide:') || rawType.startsWith('neutre:')) {
      const parts = rawType.split(':');
      if (parts.length >= 3) {
        initialVal = parseFloat(parts[2]) || initialVal;
      } else if (parts.length === 2) {
        initialVal = parseFloat(parts[1]) || initialVal;
      }
    }

    setTempType(initialType);
    setTempValue(initialVal);
    setEditForm({
      titre: doc.titre ?? '',
      categorie: doc.categorie ?? '',
      description: doc.description ?? '',
      tags: doc.tags ?? '',
      prix: String(doc.prix ?? 100),
      nombre_pages: String(doc.nombre_pages ?? 1),
      est_certifie: !!doc.est_certifie,
      status: doc.status ?? 'published',
    });
  };

  const handleSaveFullDocument = async () => {
    if (!previewDoc) return;
    setSavingDoc(true);
    try {
      const nbPages = parseInt(editForm.nombre_pages) || previewDoc.nombre_pages || 1;
      const rawPaywall = Number(tempValue);
      let dbType = tempType;
      let targetPages = 1;
      let targetVal = Math.round(rawPaywall);

      if (tempType.startsWith('fluide:') || tempType === 'fluide' || tempType === 'neutre') {
        const parts = tempType.split(':');
        let tPage = 1;
        let tOffset = rawPaywall;
        if (parts.length >= 3) {
          tPage = parseInt(parts[1]) || 1;
          tOffset = parseFloat(parts[2]) || rawPaywall;
        } else if (parts.length === 2) {
          tOffset = parseFloat(parts[1]) || rawPaywall;
        }
        dbType = `fluide:${tPage}:${tOffset}`;
        targetPages = tPage;
        targetVal = Math.round(tOffset);
      } else if (tempType === 'page') {
        dbType = 'page';
        targetPages = Math.max(1, Math.min(nbPages, Math.round(rawPaywall)));
        targetVal = targetPages;
      } else {
        dbType = 'pourcentage';
        targetVal = Math.max(0, Math.min(100, Math.round(rawPaywall)));
        targetPages = Math.max(1, Math.round(nbPages * (targetVal / 100)));
      }

      const payload = {
        titre: editForm.titre.trim(),
        categorie: editForm.categorie.trim(),
        description: editForm.description.trim(),
        tags: editForm.tags.trim() || null,
        prix: parseInt(editForm.prix) || 0,
        nombre_pages: nbPages,
        est_certifie: editForm.est_certifie,
        status: editForm.status,
        limite_apercu_type: dbType,
        limite_apercu_valeur: targetVal,
        limite_apercu_pages: targetPages,
      };

      const { error } = await supabase
        .from('documents')
        .update(payload)
        .eq('id', previewDoc.id);

      if (error) throw error;

      setDocuments(prev => prev.map(d => d.id === previewDoc.id ? { ...d, ...payload } : d));
      setPreviewDoc(prev => prev ? { ...prev, ...payload } : null);

      alert('✅ Document et réglages Paywall enregistrés avec succès dans Supabase ! 🎉');
    } catch (e: any) {
      const errMsg = e?.message || (typeof e === 'object' ? JSON.stringify(e) : String(e));
      alert('Erreur lors de la sauvegarde : ' + errMsg);
    } finally {
      setSavingDoc(false);
    }
  };

  const exportCsv = () => {
    const csv = 'data:text/csv;charset=utf-8,' + ['ID,Titre,Catégorie,Prix,Pages,Statut'].join(',') + '\n'
      + documents.map(d => `"${d.id}","${d.titre}","${d.categorie}",${d.prix},${d.nombre_pages},"${d.status === 'published' ? 'Publié' : d.status === 'inactif' ? 'Inactif' : d.status}"`).join('\n');
    const a = document.createElement('a'); a.href = encodeURI(csv); a.download = 'cauzon_catalogue.csv'; a.click();
  };

  return (
    <div style={{ width: '100%', paddingBottom: '80px' }}>
      {/* Header */}
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: textColor, fontFamily: 'Outfit, sans-serif', margin: 0 }}>Catalogue & Gestion des Cours</h1>
          <p style={{ color: subText, fontSize: '14px', margin: '4px 0 0' }}>{filteredDocs.length} document(s) affiché(s) sur {documents.length} au total</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={exportCsv} style={{ padding: '10px 16px', border: `1px solid ${border}`, borderRadius: '8px', background: 'none', color: subText, cursor: 'pointer', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Download size={15} /> Exporter CSV
          </button>
          <button onClick={onReload} style={{ padding: '10px 16px', border: `1px solid ${border}`, borderRadius: '8px', background: 'none', color: subText, cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }} title="Actualiser le catalogue">
            <RefreshCw size={15} /> Actualiser
          </button>
          <button onClick={() => setShowUploadPanel(true)} style={{ padding: '10px 20px', backgroundColor: '#6B1124', color: '#FAF6EB', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={16} /> Publier un cours
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <div style={{ width: '100%', display: 'flex', gap: '12px', marginBottom: '22px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: subText }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par titre, matière, tag…"
            style={{ width: '100%', padding: '10px 12px 10px 38px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: textColor, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Filter size={15} color={subText} />
          {(['all', 'published', 'inactif', 'scheduled'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: '8px 16px', borderRadius: '20px', border: `1px solid ${filter === f ? '#6B1124' : border}`, backgroundColor: filter === f ? '#6B1124' : 'transparent', color: filter === f ? '#FAF6EB' : subText, fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filteredDocs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: subText }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📂</div>
          <p style={{ fontSize: '16px', fontWeight: 700 }}>Aucun cours trouvé</p>
          <p style={{ fontSize: '14px' }}>{search ? 'Essayez un autre terme de recherche.' : 'Ajoutez votre premier document avec le bouton "Publier un cours".'}</p>
        </div>
      ) : (
        <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px' }}>
          {filteredDocs.map(doc => (
            <DocumentCard key={doc.id} doc={doc} darkMode={darkMode} acquisitionsCount={acqCounts[doc.id]} onPreview={handleOpenPreview} onDelete={handleDelete} onToggleCertified={handleToggleCertified} onToggleStatus={handleToggleStatus} />
          ))}
        </div>
      )}

      {/* Modale d'Upload R2 & Compression Académique */}
      <ModalAjoutDocument
        isOpen={showUploadPanel}
        onClose={() => setShowUploadPanel(false)}
        onSuccess={() => {
          onReload();
        }}
        darkMode={darkMode}
      />

      {/* MODALE SPLIT-SCREEN : LECTEUR PDF INTÉGRÉ + PANNEAU D'ÉDITION & PAYWALL */}
      {previewDoc && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', flexDirection: 'column', backdropFilter: 'blur(4px)' }}>
          {/* Modal Header */}
          <div style={{ height: '60px', padding: '0 24px', backgroundColor: '#6B1124', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ padding: '6px 10px', backgroundColor: '#FAF6EB', borderRadius: '6px', color: '#6B1124', fontWeight: 800, fontSize: '12px' }}>
                GESTION DU COURS
              </span>
              <div>
                <h2 style={{ color: '#FAF6EB', margin: 0, fontSize: '16px', fontWeight: 700 }}>{editForm.titre || previewDoc.titre}</h2>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                onClick={handleSaveFullDocument}
                disabled={savingDoc}
                style={{ padding: '8px 20px', backgroundColor: savingDoc ? '#4B5563' : '#FAF6EB', color: '#6B1124', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: savingDoc ? 'wait' : 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}
              >
                <Save size={16} /> {savingDoc ? 'Enregistrement…' : 'Enregistrer les modifications'}
              </button>
              <button
                onClick={() => setPreviewDoc(null)}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#FAF6EB', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px' }}
                title="Fermer la vue"
              >
                <X size={18} /> Fermer
              </button>
            </div>
          </div>

          {/* Modal Content Body : Split View */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Left Column : PDF Viewer Live Preview */}
            <div style={{ flex: 1, height: '100%', overflow: 'hidden', padding: '16px', display: 'flex', flexDirection: 'column', backgroundColor: '#18181B' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#A1A1AA', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={15} /> Prévisualisation PDF (Simulation Paywall en temps réel)
                </span>
                <span style={{ fontSize: '12px', color: '#E4E4E7' }}>
                  {tempType.startsWith('fluide') ? (() => {
                    const parts = tempType.split(':');
                    const p = parts[1] || '1';
                    const o = parts[2] ? parseFloat(parts[2]).toFixed(1) : Number(tempValue).toFixed(1);
                    return `🎯 Mode Fluide : Page ${p} à ${o}% (Flou positionné au pixel près)`;
                  })() : tempType === 'pourcentage' ? (
                    tempValue === 0 ? '🔒 0% (Tout est verrouillé dès la 1ère page)' : tempValue >= 100 ? '🔓 100% (Accès libre / Gratuit)' : `📖 ${tempValue}% accessible gratuitement`
                  ) : (
                    tempValue === 0 ? '🔒 0 page (Tout est verrouillé dès la 1ère page)' : `📖 ${tempValue} page(s) accessible(s) gratuitement`
                  )}
                </span>
              </div>
              <div style={{ flex: 1, borderRadius: '8px', overflow: 'hidden', border: '1px solid #27272A', backgroundColor: '#ECEFF1' }}>
                <PdfPreviewIframe
                  pdfUrl={getDocumentPublicUrl(previewDoc.file_path ?? '')}
                  cutoffType={tempType}
                  cutoffValue={tempValue}
                  onCutoffChange={(newType, newVal) => {
                    setTempType(newType);
                    setTempValue(newVal);
                  }}
                />
              </div>
            </div>

            {/* Right Column : Metadata Form & Paywall Slider */}
            <div style={{ width: '420px', minWidth: '380px', height: '100%', overflowY: 'auto', backgroundColor: darkMode ? '#1e1e1e' : '#FFFFFF', borderLeft: `1px solid ${border}`, padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Section 1 : Réglage Paywall */}
              <div style={{ backgroundColor: darkMode ? '#150a0e' : '#FAF6EB', border: '1px solid #6B1124', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sliders size={18} color="#6B1124" />
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#6B1124' }}>
                    Contrôle de l'Aperçu Paywall
                  </h3>
                </div>

                {/* 3 Modes Toggle : Fluide / Pourcentage / Pages */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
                  {[
                    { id: 'fluide' as const, label: '🎯 Fluide / Neutre' },
                    { id: 'pourcentage' as const, label: '% Pourcent' },
                    { id: 'page' as const, label: '📄 Pages' },
                  ].map(t => {
                    const isSelected = t.id === 'fluide' ? tempType.startsWith('fluide') : tempType === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          if (t.id === 'fluide') {
                            setTempType('fluide:1:' + tempValue);
                          } else {
                            setTempType(t.id);
                          }
                          if (t.id !== 'page' && tempValue > 100) setTempValue(30);
                        }}
                        style={{
                          padding: '8px 4px', borderRadius: '6px',
                          border: `1px solid ${isSelected ? '#6B1124' : border}`,
                          backgroundColor: isSelected ? '#6B1124' : 'transparent',
                          color: isSelected ? '#FAF6EB' : textColor,
                          fontWeight: 700, fontSize: '11px', cursor: 'pointer', textAlign: 'center'
                        }}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                {/* Jauge Slider de 0% à 100% sans restriction */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 700, color: textColor }}>
                      {tempType === 'fluide' ? 'Position continue :' : 'Limite visible :'}
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="number"
                        min="0"
                        max={tempType !== 'page' ? 100 : (parseInt(editForm.nombre_pages) || 1000)}
                        step={tempType === 'fluide' ? '0.1' : '1'}
                        value={tempValue}
                        onChange={e => {
                          const val = Number(e.target.value);
                          const maxVal = tempType !== 'page' ? 100 : (parseInt(editForm.nombre_pages) || 1000);
                          setTempValue(Math.max(0, Math.min(maxVal, isNaN(val) ? 0 : val)));
                        }}
                        style={{
                          width: '72px', padding: '4px 8px', borderRadius: '6px',
                          border: `1px solid ${border}`, backgroundColor: inputBg,
                          color: textColor, fontSize: '14px', fontWeight: 800, textAlign: 'center'
                        }}
                      />
                      <span style={{ fontWeight: 800, color: '#6B1124' }}>
                        {tempType !== 'page' ? '%' : 'p.'}
                      </span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max={tempType !== 'page' ? 100 : (parseInt(editForm.nombre_pages) || 50)}
                    step={tempType === 'fluide' ? '0.1' : '1'}
                    value={tempValue}
                    onChange={e => setTempValue(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#6B1124', cursor: 'pointer' }}
                  />

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: subText, marginTop: '4px' }}>
                    <span style={{ fontWeight: tempValue === 0 ? 800 : 400, color: tempValue === 0 ? '#E74C3C' : subText }}>
                      0% (Verrouillé)
                    </span>
                    <span>50%</span>
                    <span style={{ fontWeight: tempValue >= 100 ? 800 : 400, color: tempValue >= 100 ? '#10B981' : subText }}>
                      100% (Accès libre)
                    </span>
                  </div>
                </div>

                {/* Explication dynamique */}
                <div style={{ padding: '10px 12px', borderRadius: '8px', backgroundColor: darkMode ? '#1E1E1E' : '#FFFFFF', border: `1px solid ${border}`, fontSize: '12px', color: textColor, display: 'flex', alignItems: 'center', gap: '8px', lineHeight: 1.4 }}>
                  {tempValue === 0 ? (
                    <><LockIcon size={15} color="#E74C3C" /> <span><strong>0% :</strong> Achat obligatoire dès la 1ère page.</span></>
                  ) : tempValue >= 100 ? (
                    <><UnlockIcon size={15} color="#10B981" /> <span><strong>100% :</strong> Document accessible en intégralité gratuitement.</span></>
                  ) : tempType === 'fluide' ? (
                    <><Eye size={15} color="#8B5CF6" /> <span><strong>Mode Fluide :</strong> Coupure continue à <strong>{tempValue.toFixed(1)}%</strong> du document.</span></>
                  ) : (
                    <><Eye size={15} color="#3B82F6" /> <span><strong>Aperçu :</strong> {tempValue}{tempType === 'pourcentage' ? '%' : ' page(s)'} visible(s) sans payer.</span></>
                  )}
                </div>
              </div>

              {/* Section 2 : Métadonnées du cours */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: textColor, borderBottom: `1px solid ${border}`, paddingBottom: '8px' }}>
                  Métadonnées du document
                </h3>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: subText, marginBottom: '6px', textTransform: 'uppercase' }}>
                    Titre du cours *
                  </label>
                  <input
                    value={editForm.titre}
                    onChange={e => setEditForm(p => ({ ...p, titre: e.target.value }))}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: textColor, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: subText, marginBottom: '6px', textTransform: 'uppercase' }}>
                      Catégorie / Matière
                    </label>
                    <input
                      value={editForm.categorie}
                      onChange={e => setEditForm(p => ({ ...p, categorie: e.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: textColor, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: subText, marginBottom: '6px', textTransform: 'uppercase' }}>
                      Prix (FCFA)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.prix}
                      onChange={e => setEditForm(p => ({ ...p, prix: e.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: textColor, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: subText, marginBottom: '6px', textTransform: 'uppercase' }}>
                      Nombre de pages total
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={editForm.nombre_pages}
                      onChange={e => setEditForm(p => ({ ...p, nombre_pages: e.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: textColor, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: subText, marginBottom: '6px', textTransform: 'uppercase' }}>
                      Statut
                    </label>
                    <select
                      value={editForm.status}
                      onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: textColor, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                    >
                      <option value="published">Publié</option>
                      <option value="inactif">Inactif</option>
                      <option value="scheduled">Planifié</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: subText, marginBottom: '6px', textTransform: 'uppercase' }}>
                    Tags (mots-clés)
                  </label>
                  <input
                    value={editForm.tags}
                    onChange={e => setEditForm(p => ({ ...p, tags: e.target.value }))}
                    placeholder="Ex: examen, physique, terminale"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: textColor, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: subText, marginBottom: '6px', textTransform: 'uppercase' }}>
                    Description
                  </label>
                  <textarea
                    value={editForm.description}
                    onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
                    rows={3}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: textColor, fontSize: '14px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                  <input
                    type="checkbox"
                    id="edit_certifie"
                    checked={editForm.est_certifie}
                    onChange={e => setEditForm(p => ({ ...p, est_certifie: e.target.checked }))}
                    style={{ width: '18px', height: '18px', accentColor: '#6B1124' }}
                  />
                  <label htmlFor="edit_certifie" style={{ fontSize: '13px', fontWeight: 700, color: textColor, cursor: 'pointer' }}>
                    🏅 Cours certifié officiel cauZon
                  </label>
                </div>
              </div>

              {/* Bouton de sauvegarde en bas */}
              <button
                onClick={handleSaveFullDocument}
                disabled={savingDoc}
                style={{
                  marginTop: 'auto', padding: '14px', backgroundColor: savingDoc ? '#4B5563' : '#6B1124',
                  color: '#FAF6EB', border: 'none', borderRadius: '8px', fontWeight: 800,
                  fontSize: '14px', cursor: savingDoc ? 'wait' : 'pointer', display: 'flex',
                  justifyContent: 'center', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(107,17,36,0.25)'
                }}
              >
                <Save size={18} /> {savingDoc ? 'Enregistrement en cours…' : 'Enregistrer toutes les modifications'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
