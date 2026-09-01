import React, { useState, useRef, useEffect } from 'react';
import { Send, RefreshCw, Trash2, Search, MessageSquare } from 'lucide-react';
import type { FeedbackRow } from '../types';
import { sendAdminReply, deleteFeedback } from '../services/serviceFeedbacks';

interface MessagingViewProps {
  feedbacks: FeedbackRow[];
  setFeedbacks: React.Dispatch<React.SetStateAction<FeedbackRow[]>>;
  darkMode: boolean;
  onReload: () => void;
}

export function MessagingView({ feedbacks, setFeedbacks, darkMode, onReload }: MessagingViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const textColor = darkMode ? '#FAF6EB' : '#1F2937';
  const subText = darkMode ? '#9CA3AF' : '#6B7280';
  const border = darkMode ? '#2D1220' : '#E5E7EB';
  const sidebarBg = darkMode ? '#150a0e' : '#F9FAFB';
  const cardBg = darkMode ? '#1e1e1e' : '#FFFFFF';

  const unread = feedbacks.filter(f => !f.reponse_admin);

  const filtered = feedbacks.filter(f => !search || f.username.toLowerCase().includes(search.toLowerCase()) || f.message.toLowerCase().includes(search.toLowerCase()));

  const selected = feedbacks.find(f => f.id === selectedId) ?? null;

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [selectedId, feedbacks]);

  const handleSend = async () => {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    try {
      await sendAdminReply(selected.id, replyText);
      setFeedbacks(prev => prev.map(f => f.id === selected.id ? { ...f, reponse_admin: replyText.trim() } : f));
      setReplyText('');
    } catch (e: unknown) {
      alert('Erreur : ' + (e instanceof Error ? e.message : String(e)));
    } finally { setSending(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer ce message ?')) return;
    await deleteFeedback(id).catch(() => {});
    setFeedbacks(prev => prev.filter(f => f.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div style={{ width: '100%', display: 'flex', height: 'calc(100vh - 56px - 64px - 48px)', borderRadius: '14px', overflow: 'hidden', border: `1px solid ${border}`, marginBottom: '0' }}>
      {/* Sidebar list */}
      <div style={{ width: '300px', minWidth: '260px', backgroundColor: sidebarBg, borderRight: `1px solid ${border}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: `1px solid ${border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ color: textColor, margin: 0, fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageSquare size={18} color="#6B1124" /> Messages
              {unread.length > 0 && <span style={{ backgroundColor: '#E74C3C', color: '#FFF', borderRadius: '12px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>{unread.length}</span>}
            </h2>
            <button onClick={onReload} style={{ background: 'none', border: 'none', cursor: 'pointer', color: subText }}><RefreshCw size={16} /></button>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: subText }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" style={{ width: '100%', padding: '8px 10px 8px 30px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: darkMode ? '#1e1e1e' : '#FFFFFF', color: textColor, fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: subText }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>💬</div>
              <p style={{ fontSize: '14px', margin: 0 }}>Aucun message reçu</p>
            </div>
          )}
          {filtered.map(fb => {
            const isSelected = fb.id === selectedId;
            const hasReply = !!fb.reponse_admin;
            return (
              <button key={fb.id} onClick={() => setSelectedId(fb.id)}
                style={{ width: '100%', textAlign: 'left', padding: '14px 16px', border: 'none', backgroundColor: isSelected ? '#6B1124' : 'transparent', cursor: 'pointer', borderBottom: `1px solid ${border}`, display: 'flex', gap: '12px', alignItems: 'flex-start', transition: 'background 0.15s' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '50%', backgroundColor: '#2D1220', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FAF6EB', fontWeight: 700, fontSize: '15px', flexShrink: 0 }}>
                  {(fb.username || '?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: isSelected ? '#FAF6EB' : textColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fb.username || fb.device_id}
                    </span>
                    {!hasReply && <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#E74C3C', flexShrink: 0 }} />}
                  </div>
                  <p style={{ fontSize: '12px', color: isSelected ? 'rgba(250,246,235,0.7)' : subText, margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fb.message}
                  </p>
                  <p style={{ fontSize: '11px', color: isSelected ? 'rgba(250,246,235,0.5)' : (darkMode ? '#4B5563' : '#D1D5DB'), margin: '2px 0 0' }}>
                    {new Date(fb.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: cardBg }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: subText, gap: '12px' }}>
            <MessageSquare size={48} color="#2D1220" />
            <p style={{ fontSize: '16px', fontWeight: 600 }}>Sélectionnez une conversation</p>
            <p style={{ fontSize: '14px' }}>Répondez aux retours de vos étudiants</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: darkMode ? '#1e1e1e' : '#FFFFFF' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#6B1124', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FAF6EB', fontWeight: 700, fontSize: '16px' }}>
                  {(selected.username || '?')[0].toUpperCase()}
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '14px', color: textColor }}>{selected.username}</p>
                  <p style={{ margin: 0, fontSize: '12px', color: subText }}>{selected.device_id}</p>
                </div>
              </div>
              <button onClick={() => handleDelete(selected.id)} style={{ background: 'none', border: `1px solid #E74C3C`, color: '#E74C3C', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Trash2 size={13} /> Supprimer
              </button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Student message */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', maxWidth: '80%' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: darkMode ? '#2D1220' : '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', color: darkMode ? '#FAF6EB' : '#6B7280', flexShrink: 0 }}>
                  {(selected.username || '?')[0].toUpperCase()}
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: '11px', color: subText }}>{selected.username} · {new Date(selected.created_at).toLocaleString('fr-FR')}</p>
                  <div style={{ backgroundColor: darkMode ? '#2D1220' : '#F3F4F6', borderRadius: '0 12px 12px 12px', padding: '12px 16px' }}>
                    <p style={{ margin: 0, fontSize: '14px', color: textColor, lineHeight: 1.6 }}>{selected.message}</p>
                  </div>
                  {selected.pdf_attached_url && (
                    <a href={selected.pdf_attached_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '12px', color: '#6B1124', fontWeight: 600 }}>📎 Fichier joint</a>
                  )}
                </div>
              </div>
              {/* Admin reply */}
              {selected.reponse_admin && (
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', maxWidth: '80%', alignSelf: 'flex-end', flexDirection: 'row-reverse' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#6B1124', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', color: '#FAF6EB', flexShrink: 0 }}>
                    A
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: '0 0 4px', fontSize: '11px', color: subText }}>Admin cauZon</p>
                    <div style={{ backgroundColor: '#6B1124', borderRadius: '12px 0 12px 12px', padding: '12px 16px' }}>
                      <p style={{ margin: 0, fontSize: '14px', color: '#FAF6EB', lineHeight: 1.6 }}>{selected.reponse_admin}</p>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Reply input */}
            <div style={{ padding: '14px 20px', borderTop: `1px solid ${border}`, display: 'flex', gap: '10px', alignItems: 'flex-end', backgroundColor: darkMode ? '#1e1e1e' : '#FFFFFF' }}>
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Répondre à l'étudiant… (Entrée pour envoyer)"
                rows={2}
                style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: `1px solid ${border}`, backgroundColor: darkMode ? '#121212' : '#F9FAFB', color: textColor, fontSize: '14px', outline: 'none', resize: 'none', lineHeight: 1.5 }}
              />
              <button onClick={handleSend} disabled={!replyText.trim() || sending}
                style={{ padding: '10px 18px', backgroundColor: !replyText.trim() || sending ? '#4B5563' : '#6B1124', color: '#FAF6EB', border: 'none', borderRadius: '10px', cursor: !replyText.trim() || sending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '13px', opacity: !replyText.trim() || sending ? 0.6 : 1 }}>
                <Send size={16} /> {sending ? '…' : 'Envoyer'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
