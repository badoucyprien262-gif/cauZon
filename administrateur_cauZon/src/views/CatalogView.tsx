import React, { useState, useRef, useEffect } from 'react';
import { Plus, Search, Filter, X, RefreshCw, Download, Eye, ShieldCheck, Shield, CheckCircle, Save, FileText, Lock, Unlock, Sliders } from 'lucide-react';
import type { DocumentRow } from '../types';
import { DocumentCard } from '../components/DocumentCard';
import { PdfPreviewIframe } from '../components/PdfPreviewIframe';
import { extraireNombrePagesPdf, getDocumentPublicUrl, toggleDocumentCertified, toggleDocumentStatus, fetchAcquisitionsCount } from '../services/serviceDocuments';
import { supabase } from '../lib/supabase';

interface CatalogViewProps {
  documents: DocumentRow[];
  setDocuments: React.Dispatch<React.SetStateAction<DocumentRow[]>>;
  darkMode: boolean;
  onReload: () => void;
}

type UploadStep = 1 | 2 | 3 | 4;
type CatalogFilter = 'all' | 'published' | 'inactif' | 'scheduled';

const FILTER_LABELS: Record<CatalogFilter, string> = {
  all: 'Tous',
  published: 'Publiés',
  inactif: 'Inactifs',
  scheduled: 'Planifiés',
};

function assainirNomFichier(nom: string, dossier = ''): string {
  const idx = nom.lastIndexOf('.');
  const base = idx !== -1 ? nom.substring(0, idx) : nom;
  const ext = idx !== -1 ? nom.substring(idx).toLowerCase() : '';
  const clean = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  const result = `${clean || 'document'}_${Date.now()}${ext}`;
  return dossier ? `${dossier.replace(/\/+$/, '')}/${result}` : result;
}

const EMPTY_WIZARD = {
  titre: '', description: '', categorie: '', tags: '', prix: '100',
  limiteApercuType: 'pourcentage' as 'page' | 'pourcentage', limiteApercuValeur: '30',
  estCertifie: true, nombre_pages: '', taille_mo: '1.5',
  scheduled_at: '', importance_level: 'normal', status: 'published'
};

export function CatalogView({ documents, setDocuments, darkMode, onReload }: CatalogViewProps) {
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [uploadStep, setUploadStep] = useState<UploadStep>(1);
  const [wizard, setWizard] = useState({ ...EMPTY_WIZARD });
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState('');
  const [uploadProgress, setUploadProgress] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const pdfRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

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
  const cardBg = darkMode ? '#1e1e1e' : '#FFFFFF';
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

  const updateWizard = (field: string, value: unknown) => setWizard(p => ({ ...p, [field]: value }));

  const handlePdfChange = async (file: File) => {
    setPdfFile(file);
    const taille = (file.size / (1024 * 1024)).toFixed(1);
    const pages = await extraireNombrePagesPdf(file);
    updateWizard('file_path', file.name);
    updateWizard('nombre_pages', String(pages));
    updateWizard('taille_mo', taille);
  };

  const handleCoverChange = (file: File) => {
    setCoverFile(file);
    updateWizard('cover_url', file.name);
    const reader = new FileReader();
    reader.onloadend = () => setCoverPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!pdfFile) { alert('Fichier PDF obligatoire.'); return; }
    setUploadProgress('uploading');
    try {
      const cleanPdf = assainirNomFichier(pdfFile.name);
      const { error: pdfErr } = await supabase.storage.from('cours-documents').upload(cleanPdf, pdfFile, { upsert: true });
      if (pdfErr) throw new Error(`Upload PDF : ${pdfErr.message}`);

      let coverUrl: string | null = null;
      if (coverFile) {
        const cleanCover = assainirNomFichier(coverFile.name, 'covers');
        const { error: cErr } = await supabase.storage.from('cours-documents').upload(cleanCover, coverFile, { upsert: true });
        if (!cErr) { const { data } = supabase.storage.from('cours-documents').getPublicUrl(cleanCover); coverUrl = data?.publicUrl ?? null; }
      }

      let pages = parseInt(wizard.nombre_pages);
      if (!pages || isNaN(pages) || pages <= 0) pages = await extraireNombrePagesPdf(pdfFile);

      const valPaywall = parseInt(wizard.limiteApercuValeur) || 0;
      const payload = {
        titre: wizard.titre, description: wizard.description, categorie: wizard.categorie,
        tags: wizard.tags.trim() || null, prix: parseInt(wizard.prix) || 100,
        est_certifie: wizard.estCertifie, est_verrouille: true, nombre_pages: pages,
        limite_apercu_pages: wizard.limiteApercuType === 'page' ? valPaywall : Math.max(0, Math.round(pages * (valPaywall / 100))),
        limite_apercu_type: wizard.limiteApercuType, limite_apercu_valeur: valPaywall,
        taille_mo: parseFloat(wizard.taille_mo) || 1.5, file_path: cleanPdf, cover_url: coverUrl,
        scheduled_at: wizard.status === 'scheduled' && wizard.scheduled_at ? new Date(wizard.scheduled_at).toISOString() : null,
        importance_level: wizard.importance_level, status: wizard.status
      };

      const { error: insertErr } = await supabase.from('documents').insert([payload]);
      if (insertErr) throw insertErr;

      setUploadProgress('success');
      onReload();
      setTimeout(() => {
        setWizard({ ...EMPTY_WIZARD }); setPdfFile(null); setCoverFile(null);
        setCoverPreview(''); setUploadStep(1); setUploadProgress('idle');
        setShowUploadPanel(false);
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert('Erreur : ' + msg); setUploadProgress('error');
    }
  };

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
          <button onClick={() => { setShowUploadPanel(true); setUploadStep(1); }} style={{ padding: '10px 20px', backgroundColor: '#6B1124', color: '#FAF6EB', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
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

      {/* Upload Panel (slide-in) */}
      {showUploadPanel && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 150, display: 'flex' }}>
          <div style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={() => setShowUploadPanel(false)} />
          <div style={{ width: '100%', maxWidth: '520px', backgroundColor: darkMode ? '#1e1e1e' : '#FFFFFF', height: '100%', overflowY: 'auto', boxShadow: '-8px 0 24px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px 24px', backgroundColor: '#6B1124', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
              <div>
                <h2 style={{ color: '#FAF6EB', margin: 0, fontSize: '18px', fontWeight: 700 }}>📤 Publier un cours</h2>
                <p style={{ color: 'rgba(250,246,235,0.7)', margin: '4px 0 0', fontSize: '13px' }}>Étape {uploadStep} / 4</p>
              </div>
              <button onClick={() => setShowUploadPanel(false)} style={{ background: 'none', border: 'none', color: '#FAF6EB', cursor: 'pointer' }}><X size={22} /></button>
            </div>
            {/* Progress bar */}
            <div style={{ height: '4px', backgroundColor: '#2D1220' }}>
              <div style={{ height: '100%', width: `${(uploadStep / 4) * 100}%`, backgroundColor: '#FAF6EB', transition: 'width 0.3s' }} />
            </div>

            <div style={{ padding: '24px', flex: 1 }}>
              {uploadStep === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h3 style={{ color: textColor, fontSize: '16px', fontWeight: 700, margin: 0 }}>📁 Fichiers du cours</h3>
                  <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) handlePdfChange(e.dataTransfer.files[0]); }}
                    onClick={() => pdfRef.current?.click()}
                    style={{ border: `2px dashed ${pdfFile ? '#6B1124' : border}`, borderRadius: '10px', padding: '28px', textAlign: 'center', cursor: 'pointer', backgroundColor: pdfFile ? (darkMode ? '#2D1220' : '#FAF6EB') : 'transparent', transition: 'all 0.2s' }}>
                    <input ref={pdfRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handlePdfChange(e.target.files[0])} />
                    {pdfFile ? (
                      <div>
                        <span style={{ fontSize: '32px' }}>✅</span>
                        <p style={{ color: '#6B1124', fontWeight: 700, margin: '8px 0 4px' }}>{pdfFile.name}</p>
                        <p style={{ color: subText, fontSize: '13px', margin: 0 }}>{wizard.nombre_pages ? `${wizard.nombre_pages} pages auto-détectées ✨` : ''} · {wizard.taille_mo} Mo</p>
                      </div>
                    ) : (
                      <div>
                        <span style={{ fontSize: '40px' }}>📄</span>
                        <p style={{ color: textColor, fontWeight: 600, margin: '8px 0 4px' }}>Déposer le fichier PDF ici</p>
                        <p style={{ color: subText, fontSize: '13px', margin: 0 }}>ou cliquer pour parcourir vos fichiers</p>
                      </div>
                    )}
                  </div>
                  <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) handleCoverChange(e.dataTransfer.files[0]); }}
                    onClick={() => coverRef.current?.click()}
                    style={{ border: `2px dashed ${coverFile ? '#6B1124' : border}`, borderRadius: '10px', padding: '20px', textAlign: 'center', cursor: 'pointer', overflow: 'hidden', backgroundColor: 'transparent' }}>
                    <input ref={coverRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleCoverChange(e.target.files[0])} />
                    {coverPreview ? <img src={coverPreview} alt="Couverture" style={{ maxHeight: '100px', maxWidth: '100%', borderRadius: '6px', objectFit: 'cover' }} />
                      : <><span style={{ fontSize: '28px' }}>🖼️</span><p style={{ color: subText, fontSize: '13px', margin: '6px 0 0' }}>Image de couverture (optionnelle)</p></>}
                  </div>
                </div>
              )}
              {uploadStep === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h3 style={{ color: textColor, fontSize: '16px', fontWeight: 700, margin: 0 }}>📝 Informations du cours</h3>
                  {[
                    { label: 'Titre du cours *', field: 'titre', placeholder: 'Ex: Cours de Mathématiques L2', required: true },
                    { label: 'Matière / Catégorie *', field: 'categorie', placeholder: 'Ex: Mathématiques, Physique, Droit…', required: true },
                    { label: 'Description', field: 'description', placeholder: 'Présentez le sommaire ou les objectifs du cours…', textarea: true },
                    { label: 'Tags (séparés par virgules)', field: 'tags', placeholder: 'licence, maths, algèbre' },
                  ].map(({ label, field, placeholder, required, textarea }) => (
                    <div key={field}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: textColor, marginBottom: '6px' }}>{label}</label>
                      {textarea ? (
                        <textarea value={(wizard as unknown as Record<string, string>)[field]} onChange={e => updateWizard(field, e.target.value)} placeholder={placeholder} rows={3}
                          style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: textColor, fontSize: '14px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                      ) : (
                        <input value={(wizard as unknown as Record<string, string>)[field]} onChange={e => updateWizard(field, e.target.value)} placeholder={placeholder} required={required}
                          style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: `1px solid ${required && !(wizard as unknown as Record<string, string>)[field] ? '#E74C3C' : border}`, backgroundColor: inputBg, color: textColor, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                      )}
                    </div>
                  ))}
                </div>
              )}
              {uploadStep === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h3 style={{ color: textColor, fontSize: '16px', fontWeight: 700, margin: 0 }}>💰 Prix & Réglage Paywall</h3>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: textColor, marginBottom: '6px' }}>Prix d'achat (FCFA) *</label>
                    <input type="number" value={wizard.prix} onChange={e => updateWizard('prix', e.target.value)} min="0"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: textColor, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: textColor, marginBottom: '8px' }}>Type de coupure aperçu gratuit</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {(['pourcentage', 'page'] as const).map(t => (
                        <button key={t} onClick={() => updateWizard('limiteApercuType', t)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: `2px solid ${wizard.limiteApercuType === t ? '#6B1124' : border}`, backgroundColor: wizard.limiteApercuType === t ? '#6B1124' : 'transparent', color: wizard.limiteApercuType === t ? '#FAF6EB' : subText, fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}>
                          {t === 'pourcentage' ? '% Pourcentage' : '📄 Pages fixes'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: 600, color: textColor }}>
                        {wizard.limiteApercuType === 'pourcentage' ? 'Pourcentage visible en aperçu' : 'Nombre de pages visibles'} :
                      </label>
                      <span style={{ fontWeight: 800, color: '#6B1124' }}>
                        {wizard.limiteApercuValeur}{wizard.limiteApercuType === 'pourcentage' ? '%' : ' pages'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={wizard.limiteApercuType === 'pourcentage' ? 100 : (parseInt(wizard.nombre_pages) || 50)}
                      value={wizard.limiteApercuValeur}
                      onChange={e => updateWizard('limiteApercuValeur', e.target.value)}
                      style={{ width: '100%', accentColor: '#6B1124' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: subText, marginTop: '4px' }}>
                      <span>0% (Verrouillage total)</span>
                      <span>50%</span>
                      <span>100% (100% Gratuit)</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input type="checkbox" id="certifie" checked={wizard.estCertifie} onChange={e => updateWizard('estCertifie', e.target.checked)} style={{ width: '18px', height: '18px', accentColor: '#6B1124' }} />
                    <label htmlFor="certifie" style={{ fontSize: '14px', color: textColor, fontWeight: 600, cursor: 'pointer' }}>🏅 Marquer comme cours officiel certifié</label>
                  </div>
                </div>
              )}
              {uploadStep === 4 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h3 style={{ color: textColor, fontSize: '16px', fontWeight: 700, margin: 0 }}>📋 Récapitulatif & Publication</h3>
                  <div style={{ backgroundColor: darkMode ? '#150a0e' : '#F9FAFB', borderRadius: '10px', padding: '16px', fontSize: '14px', lineHeight: 1.8 }}>
                    <p style={{ margin: 0 }}><strong style={{ color: '#6B1124' }}>Titre :</strong> <span style={{ color: textColor }}>{wizard.titre || '—'}</span></p>
                    <p style={{ margin: 0 }}><strong style={{ color: '#6B1124' }}>Catégorie :</strong> <span style={{ color: textColor }}>{wizard.categorie || '—'}</span></p>
                    <p style={{ margin: 0 }}><strong style={{ color: '#6B1124' }}>Prix :</strong> <span style={{ color: textColor }}>{wizard.prix} FCFA</span></p>
                    <p style={{ margin: 0 }}><strong style={{ color: '#6B1124' }}>Pages :</strong> <span style={{ color: '#10B981', fontWeight: 700 }}>{wizard.nombre_pages || '?'} ✨ auto-détecté</span></p>
                    <p style={{ margin: 0 }}><strong style={{ color: '#6B1124' }}>Aperçu gratuit :</strong> <span style={{ color: textColor }}>{wizard.limiteApercuValeur}{wizard.limiteApercuType === 'pourcentage' ? '%' : ' pages'}</span></p>
                    <p style={{ margin: 0 }}><strong style={{ color: '#6B1124' }}>Certifié :</strong> <span style={{ color: textColor }}>{wizard.estCertifie ? 'Oui 🏅' : 'Non'}</span></p>
                  </div>
                  {uploadProgress === 'uploading' && <div style={{ textAlign: 'center', padding: '16px', color: '#6B1124', fontWeight: 700 }}>⏳ Téléversement et insertion dans Supabase…</div>}
                  {uploadProgress === 'success' && <div style={{ textAlign: 'center', padding: '16px', color: '#10B981', fontWeight: 700 }}>✅ Cours publié avec succès dans le catalogue !</div>}
                  {uploadProgress === 'error' && <div style={{ textAlign: 'center', padding: '16px', color: '#E74C3C', fontWeight: 700 }}>❌ Erreur lors de la publication.</div>}
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div style={{ padding: '16px 24px', borderTop: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', gap: '12px', position: 'sticky', bottom: 0, backgroundColor: darkMode ? '#1e1e1e' : '#FFFFFF' }}>
              {uploadStep > 1 ? (
                <button onClick={() => setUploadStep(s => (s - 1) as UploadStep)} style={{ padding: '10px 20px', borderRadius: '8px', border: `1px solid ${border}`, background: 'none', color: textColor, cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>← Précédent</button>
              ) : <div />}
              {uploadStep < 4 ? (
                <button onClick={() => setUploadStep(s => (s + 1) as UploadStep)} disabled={uploadStep === 1 && !pdfFile} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', backgroundColor: uploadStep === 1 && !pdfFile ? '#4B5563' : '#6B1124', color: '#FAF6EB', cursor: uploadStep === 1 && !pdfFile ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '14px', opacity: uploadStep === 1 && !pdfFile ? 0.6 : 1 }}>
                  Suivant →
                </button>
              ) : (
                <button onClick={handleSubmit} disabled={uploadProgress === 'uploading'} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', backgroundColor: uploadProgress === 'uploading' ? '#4B5563' : '#6B1124', color: '#FAF6EB', cursor: uploadProgress === 'uploading' ? 'wait' : 'pointer', fontWeight: 700, fontSize: '14px' }}>
                  🚀 Publier le cours
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
                    <><Lock size={15} color="#E74C3C" /> <span><strong>0% :</strong> Achat obligatoire dès la 1ère page.</span></>
                  ) : tempValue >= 100 ? (
                    <><Unlock size={15} color="#10B981" /> <span><strong>100% :</strong> Document accessible en intégralité gratuitement.</span></>
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
