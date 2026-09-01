import React, { useState, useRef } from 'react';
import { ArrowRight, ArrowLeft, CheckCircle, X, Image as ImageIcon, Film, FileText, Upload, Trash2, Ban } from 'lucide-react';
import type { BannerRow, DocumentRow } from '../types';
import { uploadBannerMedia } from '../services/serviceBanners';

type BannerFormData = Omit<BannerRow, 'id' | 'created_at'>;

interface BannerWizardProps {
  documents: DocumentRow[];
  editingBanner?: BannerRow | null;
  onSave: (data: BannerFormData, editingId: string | null) => Promise<void>;
  onClose: () => void;
  darkMode: boolean;
}

const EMPTY_FORM: BannerFormData = {
  titre_bande: '',
  contenu_detaille: '',
  type_importance: 'info',
  date_debut: '',
  date_fin: '',
  ciblage_role: 'tous',
  document_id_associe: null,
  statut: 'actif',
};

const IMPORTANCE_COLORS: Record<string, string> = { info: '#3B82F6', promo: '#10B981', urgent: '#E74C3C' };

export function BannerWizard({ documents, editingBanner, onSave, onClose, darkMode }: BannerWizardProps) {
  const [step, setStep] = useState(1);

  // Détection du média existant dans le contenu_detaille
  const parseInitialMedia = (rawContent: string) => {
    const match = rawContent.match(/\[MEDIA:(image|video):([^\]]+)\]/);
    if (match) {
      return {
        text: rawContent.replace(/\[MEDIA:(image|video):([^\]]+)\]/, '').trim(),
        type: match[1] as 'image' | 'video',
        url: match[2]
      };
    }
    return { text: rawContent, type: null, url: null };
  };

  const initialMedia = parseInitialMedia(editingBanner?.contenu_detaille ?? '');

  const [form, setForm] = useState<BannerFormData>(editingBanner ? {
    titre_bande: editingBanner.titre_bande,
    contenu_detaille: initialMedia.text,
    type_importance: editingBanner.type_importance,
    date_debut: editingBanner.date_debut?.split('T')[0] ?? '',
    date_fin: editingBanner.date_fin?.split('T')[0] ?? '',
    ciblage_role: editingBanner.ciblage_role,
    document_id_associe: editingBanner.document_id_associe,
    statut: editingBanner.statut,
  } : { ...EMPTY_FORM });

  // Mode de liaison : 'none' | 'document' | 'media'
  const [attachmentMode, setAttachmentMode] = useState<'none' | 'document' | 'media'>(
    editingBanner?.document_id_associe ? 'document' : initialMedia.url ? 'media' : 'none'
  );

  // Média local importé
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(initialMedia.url);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(initialMedia.type);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (field: keyof BannerFormData, value: unknown) => setForm(p => ({ ...p, [field]: value }));

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVid = file.type.startsWith('video/') || !!file.name.match(/\.(mp4|webm|mov|mkv)$/i);
    const type: 'image' | 'video' = isVid ? 'video' : 'image';

    setMediaFile(file);
    setMediaType(type);
    setMediaPreviewUrl(URL.createObjectURL(file));
  };

  const handleRemoveMedia = () => {
    setMediaFile(null);
    setMediaPreviewUrl(null);
    setMediaType(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const canGoNext = () => {
    if (step === 1) return form.titre_bande.trim().length > 0;
    if (step === 2) return form.contenu_detaille.trim().length > 0;
    if (step === 3) return !!form.date_fin;
    return true;
  };

  const handleFinish = async () => {
    setSaving(true);
    setError('');
    try {
      let finalContent = form.contenu_detaille.trim();
      let finalDocId = form.document_id_associe;

      if (attachmentMode === 'none') {
        finalDocId = null;
      } else if (attachmentMode === 'document') {
        // Document associé conservé, aucun tag média
      } else if (attachmentMode === 'media') {
        finalDocId = null;
        let finalMediaUrl = mediaPreviewUrl;
        let finalMediaType = mediaType;

        if (mediaFile) {
          const uploadRes = await uploadBannerMedia(mediaFile);
          finalMediaUrl = uploadRes.url;
          finalMediaType = uploadRes.type;
        }

        if (finalMediaUrl && finalMediaType) {
          finalContent = `${finalContent}\n\n[MEDIA:${finalMediaType}:${finalMediaUrl}]`;
        }
      }

      const payload: BannerFormData = {
        ...form,
        contenu_detaille: finalContent,
        document_id_associe: finalDocId,
      };

      await onSave(payload, editingBanner?.id ?? null);
      onClose();
    } catch (e: any) {
      console.error('Erreur publication bannière :', e);
      const msg = e?.message || e?.error_description || (typeof e === 'object' ? JSON.stringify(e) : String(e));
      setError(msg || 'Erreur lors de la publication de la bannière.');
    } finally {
      setSaving(false);
    }
  };

  const bg = darkMode ? '#1e1e1e' : '#FFFFFF';
  const overlay = 'rgba(0,0,0,0.7)';
  const textColor = darkMode ? '#FAF6EB' : '#1F2937';
  const inputBg = darkMode ? '#121212' : '#F9FAFB';
  const borderColor = darkMode ? '#2D1220' : '#E5E7EB';

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: overlay, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '620px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', backgroundColor: bg, borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        {/* Header */}
        <div style={{ backgroundColor: '#6B1124', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <h2 style={{ color: '#FAF6EB', fontWeight: 700, fontSize: '18px', margin: 0 }}>
              {editingBanner ? 'Modifier la bannière' : 'Nouvelle bannière d\'annonce'}
            </h2>
            <p style={{ color: 'rgba(250,246,235,0.7)', fontSize: '13px', margin: '4px 0 0' }}>Étape {step} / 4</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#FAF6EB', cursor: 'pointer' }}><X size={22} /></button>
        </div>

        {/* Progress */}
        <div style={{ height: '4px', backgroundColor: '#2D1220', position: 'relative', flexShrink: 0 }}>
          <div style={{ height: '100%', width: `${(step / 4) * 100}%`, backgroundColor: '#FAF6EB', transition: 'width 0.3s' }} />
        </div>

        {/* Content with scroll */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {step === 1 && (
            <div>
              <label style={{ fontWeight: 700, color: textColor, fontSize: '15px', display: 'block', marginBottom: '8px' }}>📌 Titre de la bannière <span style={{ color: '#E74C3C' }}>*</span></label>
              <p style={{ color: darkMode ? '#9CA3AF' : '#6B7280', fontSize: '13px', marginBottom: '12px' }}>Ce texte court s'affiche dans la pile de cartes sur l'accueil de l'application utilisateur.</p>
              <input value={form.titre_bande} onChange={e => update('titre_bande', e.target.value)} placeholder="Ex: Nouveau cours de Mathématiques L2 disponible !" maxLength={80}
                style={{ width: '100%', padding: '13px 16px', borderRadius: '8px', border: `2px solid ${form.titre_bande ? '#6B1124' : borderColor}`, backgroundColor: inputBg, color: textColor, fontSize: '15px', outline: 'none', boxSizing: 'border-box' }} />
              <p style={{ textAlign: 'right', fontSize: '12px', color: darkMode ? '#6B7280' : '#9CA3AF', marginTop: '6px' }}>{form.titre_bande.length}/80</p>
            </div>
          )}

          {step === 2 && (
            <div>
              <label style={{ fontWeight: 700, color: textColor, fontSize: '15px', display: 'block', marginBottom: '8px' }}>📝 Contenu détaillé <span style={{ color: '#E74C3C' }}>*</span></label>
              <p style={{ color: darkMode ? '#9CA3AF' : '#6B7280', fontSize: '13px', marginBottom: '12px' }}>Message complet affiché dans la boîte de lecture de l'annonce.</p>
              <textarea value={form.contenu_detaille} onChange={e => update('contenu_detaille', e.target.value)} placeholder="Décrivez l'annonce ou l'offre en détail…" rows={6}
                style={{ width: '100%', padding: '13px 16px', borderRadius: '8px', border: `2px solid ${form.contenu_detaille ? '#6B1124' : borderColor}`, backgroundColor: inputBg, color: textColor, fontSize: '14px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontWeight: 700, color: textColor, fontSize: '14px', display: 'block', marginBottom: '8px' }}>Niveau d'importance</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['info', 'promo', 'urgent'] as const).map(t => (
                    <button key={t} onClick={() => update('type_importance', t)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: `2px solid ${form.type_importance === t ? IMPORTANCE_COLORS[t] : borderColor}`, backgroundColor: form.type_importance === t ? IMPORTANCE_COLORS[t] + '22' : 'transparent', color: form.type_importance === t ? IMPORTANCE_COLORS[t] : darkMode ? '#9CA3AF' : '#6B7280', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize', fontSize: '13px' }}>
                      {t === 'info' ? '💬 Info' : t === 'promo' ? '🎁 Promo' : '🚨 Urgent'}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontWeight: 600, color: textColor, fontSize: '13px', display: 'block', marginBottom: '6px' }}>Date de début</label>
                  <input type="date" value={form.date_debut} onChange={e => update('date_debut', e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${borderColor}`, backgroundColor: inputBg, color: textColor, fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontWeight: 600, color: textColor, fontSize: '13px', display: 'block', marginBottom: '6px' }}>Date de fin <span style={{ color: '#E74C3C' }}>*</span></label>
                  <input type="date" value={form.date_fin} onChange={e => update('date_fin', e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `2px solid ${form.date_fin ? '#6B1124' : borderColor}`, backgroundColor: inputBg, color: textColor, fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} required />
                </div>
              </div>
              <div>
                <label style={{ fontWeight: 600, color: textColor, fontSize: '13px', display: 'block', marginBottom: '6px' }}>Ciblage</label>
                <select value={form.ciblage_role} onChange={e => update('ciblage_role', e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${borderColor}`, backgroundColor: inputBg, color: textColor, fontSize: '13px', outline: 'none' }}>
                  <option value="tous">👥 Tous les utilisateurs</option>
                  <option value="non_abonnes">🆓 Non abonnés uniquement</option>
                  <option value="abonnes">👑 Abonnés VIP uniquement</option>
                </select>
              </div>
            </div>
          )}

          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Sélecteur Hybride de Liaison / Médias */}
              <div>
                <label style={{ fontWeight: 700, color: textColor, fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                  📎 Élément attaché / Média visuel
                </label>
                <div style={{ display: 'flex', gap: '6px', backgroundColor: darkMode ? '#150a0e' : '#F3F4F6', borderRadius: '10px', padding: '4px' }}>
                  {[
                    { id: 'none' as const, label: 'Aucun', icon: <Ban size={14} /> },
                    { id: 'document' as const, label: 'Document PDF', icon: <FileText size={14} /> },
                    { id: 'media' as const, label: 'Média Local (Photo / Vidéo)', icon: <ImageIcon size={14} /> },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setAttachmentMode(tab.id)}
                      style={{
                        flex: 1,
                        padding: '8px 10px',
                        borderRadius: '7px',
                        border: 'none',
                        backgroundColor: attachmentMode === tab.id ? '#6B1124' : 'transparent',
                        color: attachmentMode === tab.id ? '#FAF6EB' : (darkMode ? '#9CA3AF' : '#6B7280'),
                        fontWeight: 700,
                        fontSize: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        transition: 'all 0.2s',
                      }}
                    >
                      {tab.icon} {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Option A : Document PDF */}
              {attachmentMode === 'document' && (
                <div style={{ padding: '14px', backgroundColor: inputBg, borderRadius: '10px', border: `1px solid ${borderColor}` }}>
                  <label style={{ fontWeight: 600, color: textColor, fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                    Sélectionner le cours du catalogue :
                  </label>
                  <select
                    value={form.document_id_associe ?? ''}
                    onChange={e => update('document_id_associe', e.target.value || null)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${borderColor}`, backgroundColor: bg, color: textColor, fontSize: '13px', outline: 'none' }}
                  >
                    <option value="">— Aucun document —</option>
                    {documents.map(d => <option key={d.id} value={d.id}>{d.titre ?? d.id}</option>)}
                  </select>
                </div>
              )}

              {/* Option B : Média Local (Photo / Vidéo) */}
              {attachmentMode === 'media' && (
                <div style={{ padding: '14px', backgroundColor: inputBg, borderRadius: '10px', border: `1px solid ${borderColor}`, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/mp4,video/webm,video/quicktime"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />

                  {!mediaPreviewUrl ? (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        border: `2px dashed ${borderColor}`,
                        borderRadius: '10px',
                        padding: '24px 16px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ width: '44px', height: '44px', borderRadius: '22px', backgroundColor: 'rgba(107, 17, 36, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B1124' }}>
                        <Upload size={22} />
                      </div>
                      <p style={{ fontWeight: 700, color: textColor, fontSize: '13px', margin: 0 }}>
                        Cliquez pour importer une Photo ou Vidéo locale
                      </p>
                      <p style={{ color: darkMode ? '#9CA3AF' : '#6B7280', fontSize: '11.5px', margin: 0 }}>
                        Formats supportés : JPG, PNG, WEBP, MP4 (Vidéo marketing)
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', maxHeight: '200px', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {mediaType === 'video' ? (
                          <video
                            src={mediaPreviewUrl}
                            controls
                            style={{ maxHeight: '200px', width: '100%', borderRadius: '10px' }}
                          />
                        ) : (
                          <img
                            src={mediaPreviewUrl}
                            alt="Aperçu média"
                            style={{ maxHeight: '200px', width: '100%', objectFit: 'cover', borderRadius: '10px' }}
                          />
                        )}
                        <span style={{ position: 'absolute', top: '8px', left: '8px', backgroundColor: 'rgba(0,0,0,0.7)', color: '#FAF6EB', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {mediaType === 'video' ? <Film size={12} /> : <ImageIcon size={12} />}
                          {mediaType === 'video' ? 'Vidéo MP4' : 'Image'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${borderColor}`, background: 'none', color: textColor, fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                        >
                          🔄 Remplacer le fichier
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveMedia}
                          style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', backgroundColor: '#FEE2E2', color: '#DC2626', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Trash2 size={13} /> Supprimer
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Aperçu Final */}
              <div style={{ backgroundColor: IMPORTANCE_COLORS[form.type_importance] + '22', border: `2px solid ${IMPORTANCE_COLORS[form.type_importance]}`, borderRadius: '10px', padding: '16px' }}>
                <p style={{ fontWeight: 700, color: IMPORTANCE_COLORS[form.type_importance], fontSize: '13px', margin: '0 0 6px' }}>Aperçu de la bannière :</p>
                <p style={{ fontWeight: 700, color: textColor, margin: '0 0 4px', fontSize: '15px' }}>{form.titre_bande || '(titre vide)'}</p>
                <p style={{ color: darkMode ? '#9CA3AF' : '#6B7280', fontSize: '13px', margin: 0 }}>{form.contenu_detaille || '(contenu vide)'}</p>
                
                {attachmentMode === 'media' && mediaPreviewUrl && (
                  <p style={{ color: '#10B981', fontSize: '12px', fontWeight: 700, marginTop: '6px' }}>
                    📎 Média attaché : {mediaType === 'video' ? '🎬 Vidéo marketing' : '🖼️ Photo promotionnelle'}
                  </p>
                )}

                {attachmentMode === 'document' && form.document_id_associe && (
                  <p style={{ color: '#3B82F6', fontSize: '12px', fontWeight: 700, marginTop: '6px' }}>
                    📄 Cours attaché : {documents.find(d => d.id === form.document_id_associe)?.titre || form.document_id_associe}
                  </p>
                )}

                <p style={{ fontSize: '12px', color: darkMode ? '#6B7280' : '#9CA3AF', marginTop: '8px' }}>
                  {form.date_debut ? `Du ${form.date_debut}` : 'Immédiatement'} → {form.date_fin ? `au ${form.date_fin}` : '(sans fin)'} · {form.ciblage_role}
                </p>
              </div>

              {error && <p style={{ color: '#E74C3C', fontSize: '13px', fontWeight: 600 }}>❌ {error}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'space-between', gap: '12px', flexShrink: 0 }}>
          {step > 1 ? (
            <button onClick={() => setStep(s => s - 1)} style={{ padding: '10px 20px', borderRadius: '8px', border: `1px solid ${borderColor}`, background: 'none', color: textColor, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
              <ArrowLeft size={16} /> Précédent
            </button>
          ) : <div />}
          {step < 4 ? (
            <button onClick={() => setStep(s => s + 1)} disabled={!canGoNext()} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', backgroundColor: canGoNext() ? '#6B1124' : '#4B5563', color: '#FAF6EB', cursor: canGoNext() ? 'pointer' : 'not-allowed', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', opacity: canGoNext() ? 1 : 0.6 }}>
              Suivant <ArrowRight size={16} />
            </button>
          ) : (
            <button onClick={handleFinish} disabled={saving} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', backgroundColor: saving ? '#4B5563' : '#6B1124', color: '#FAF6EB', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
              <CheckCircle size={16} /> {saving ? 'Enregistrement…' : 'Publier la bannière'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

