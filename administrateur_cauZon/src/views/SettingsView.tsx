import React, { useState } from 'react';
import { Search, Shield, ShieldOff, Crown, HardDrive, Trash2, CreditCard, Save, RefreshCw, Bell, Send, Compass, BookOpen, FileText, Zap, User } from 'lucide-react';
import type { ProfileRow, TransactionRow, GlobalConfig, BanDuration, DocumentRow } from '../types';
import { banUser, unbanUser, grantVip, grantStorage, deleteUser, formatErrorMessage } from '../services/serviceUsers';
import { saveConfig } from '../services/serviceSettings';
import { sendRemotePushNotification, fetchRegisteredPushTokens } from '../services/servicePushNotifications';

interface SettingsViewProps {
  profiles: ProfileRow[];
  setProfiles: React.Dispatch<React.SetStateAction<ProfileRow[]>>;
  documents?: DocumentRow[];
  transactions: TransactionRow[];
  revenue: number;
  revenueCours?: number;
  revenueVip?: number;
  revenueStockage?: number;
  countCours?: number;
  countVip?: number;
  countStockage?: number;
  transactionsCount: number;
  config: GlobalConfig | null;
  setConfig: React.Dispatch<React.SetStateAction<GlobalConfig | null>>;
  darkMode: boolean;
  onReload: () => void;
  subTab?: 'users' | 'finance' | 'config';
  setSubTab?: (tab: 'users' | 'finance' | 'config') => void;
}

const DEFAULT_CONFIG: GlobalConfig = {
  welcomeOfferActive: true,
  defaultPrice: 100,
  vipPrice: 1000,
  storageExtensionPrice: 500,
  alertBannerText: '',
  bannerImageUrl: '',
  bannerRedirectUrl: '',
};

type SubTab = 'users' | 'finance' | 'config';

export function SettingsView({
  profiles,
  setProfiles,
  documents = [],
  transactions,
  revenue,
  revenueCours: propRevenueCours = 0,
  revenueVip: propRevenueVip = 0,
  revenueStockage: propRevenueStockage = 0,
  countCours: propCountCours = 0,
  countVip: propCountVip = 0,
  countStockage: propCountStockage = 0,
  transactionsCount,
  config,
  setConfig,
  darkMode,
  onReload,
  subTab: propSubTab,
  setSubTab: propSetSubTab
}: SettingsViewProps) {
  const [internalSubTab, setInternalSubTab] = useState<SubTab>('config');
  const subTab = propSubTab ?? internalSubTab;
  const setSubTab = propSetSubTab ?? setInternalSubTab;
  const [userSearch, setUserSearch] = useState('');
  const [localConfig, setLocalConfig] = useState<GlobalConfig>(config ?? DEFAULT_CONFIG);
  const [savingConfig, setSavingConfig] = useState(false);

  // Ban modal
  const [banTarget, setBanTarget] = useState<ProfileRow | null>(null);
  const [banDuration, setBanDuration] = useState<BanDuration>('3d');
  const [banReason, setBanReason] = useState('');
  const [processingUser, setProcessingUser] = useState<string | null>(null);

  const textColor = darkMode ? '#FAF6EB' : '#1F2937';
  const subText = darkMode ? '#9CA3AF' : '#6B7280';
  const border = darkMode ? '#2D1220' : '#E5E7EB';
  const cardBg = darkMode ? '#1e1e1e' : '#FFFFFF';
  const inputBg = darkMode ? '#121212' : '#F9FAFB';

  // ─── États du panneau Notifications Push ──────────────────
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [pushRoute, setPushRoute] = useState<'Catalogue' | 'Bibliotheque' | 'Abonnement' | 'document'>('Catalogue');
  const [pushDocId, setPushDocId] = useState('');
  const [pushCible, setPushCible] = useState<'tous' | 'non_abonnes' | 'abonnes'>('tous');
  const [sendingPush, setSendingPush] = useState(false);
  const [pushResult, setPushResult] = useState<{ success: boolean; message: string } | null>(null);
  const [pushTokenCount, setPushTokenCount] = useState<number | null>(null);
  const [loadingTokenCount, setLoadingTokenCount] = useState(false);

  const handleFetchTokenCount = async (targetCible: 'tous' | 'non_abonnes' | 'abonnes' = pushCible) => {
    setLoadingTokenCount(true);
    try {
      const tokens = await fetchRegisteredPushTokens(targetCible);
      setPushTokenCount(tokens.length);
    } catch {
      setPushTokenCount(0);
    } finally {
      setLoadingTokenCount(false);
    }
  };

  const handleSendPush = async () => {
    if (!pushTitle.trim() || !pushBody.trim()) {
      setPushResult({ success: false, message: 'Le titre et le corps du message sont obligatoires.' });
      return;
    }
    if (pushRoute === 'document' && !pushDocId) {
      setPushResult({ success: false, message: 'Veuillez sélectionner le document cible à ouvrir.' });
      return;
    }

    setSendingPush(true);
    setPushResult(null);
    try {
      const targetDoc = documents.find(d => d.id === pushDocId);
      const effectiveRoute = pushRoute === 'document' ? 'Bibliotheque' : pushRoute;
      const effectiveDocId = pushRoute === 'document' ? pushDocId : undefined;

      const result = await sendRemotePushNotification({
        title: pushTitle.trim(),
        body: pushBody.trim(),
        document_id: effectiveDocId,
        route: effectiveRoute,
        cible: pushCible,
        data: {
          source: 'admin_panel',
          type: 'diffusion_directe',
          route: effectiveRoute,
          document_id: effectiveDocId,
          doc_titre: targetDoc?.titre || undefined,
        },
      });

      if (result.success && result.sentCount > 0) {
        setPushResult({
          success: true,
          message: `✅ ${result.sentCount} notification(s) push transmise(s) avec succès aux appareils actifs !`,
        });
        setPushTitle('');
        setPushBody('');
        handleFetchTokenCount(pushCible);
      } else {
        setPushResult({
          success: false,
          message: result.message || '⚠️ Aucun appareil trouvé pour ce ciblage.',
        });
      }
    } catch (e: unknown) {
      setPushResult({ success: false, message: `❌ ${formatErrorMessage(e)}` });
    } finally {
      setSendingPush(false);
    }
  };


  const filteredProfiles = profiles.filter(p =>
    !userSearch ||
    (p.username ?? '').toLowerCase().includes(userSearch.toLowerCase()) ||
    (p.nom_complet ?? '').toLowerCase().includes(userSearch.toLowerCase()) ||
    (p.email ?? '').toLowerCase().includes(userSearch.toLowerCase()) ||
    (p.phone_number ?? '').includes(userSearch) ||
    p.id.toLowerCase().includes(userSearch.toLowerCase())
  );

  const handleBan = async () => {
    if (!banTarget || !banReason.trim()) { alert('Motif obligatoire.'); return; }
    setProcessingUser(banTarget.id);
    try {
      await banUser(banTarget.id, banDuration, banReason);
      setProfiles(prev => prev.map(p => p.id === banTarget.id ? { ...p, is_banned: true, ban_reason: banReason } : p));
      setBanTarget(null); setBanReason('');
      alert('✅ Utilisateur suspendu.');
    } catch (e: unknown) { alert('Erreur : ' + formatErrorMessage(e)); }
    finally { setProcessingUser(null); }
  };

  const handleUnban = async (profile: ProfileRow) => {
    if (!window.confirm(`Lever la suspension pour ${profile.username ?? profile.id} ?`)) return;
    setProcessingUser(profile.id);
    try {
      await unbanUser(profile.id);
      setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, is_banned: false, banned_until: null, ban_reason: null } : p));
      alert('✅ Suspension levée.');
    } catch (e: unknown) { alert('Erreur : ' + formatErrorMessage(e)); }
    finally { setProcessingUser(null); }
  };

  const handleGrantVip = async (profile: ProfileRow) => {
    setProcessingUser(profile.id);
    try {
      await grantVip(profile.id);
      const exp = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
      setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, has_vip_pass: true, vip_expiration_date: exp } : p));
      alert('✅ Pass VIP 30j accordé.');
    } catch (e: unknown) { alert('Erreur : ' + formatErrorMessage(e)); }
    finally { setProcessingUser(null); }
  };

  const handleGrantStorage = async (profile: ProfileRow) => {
    setProcessingUser(profile.id);
    try {
      await grantStorage(profile.id);
      setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, has_extended_storage: true, storage_limit: 250 } : p));
      alert('✅ Stockage étendu accordé.');
    } catch (e: unknown) { alert('Erreur : ' + formatErrorMessage(e)); }
    finally { setProcessingUser(null); }
  };

  const handleDeleteUser = async (profile: ProfileRow) => {
    if (!window.confirm(`Supprimer DÉFINITIVEMENT l'utilisateur "${profile.username ?? profile.id}" ?`)) return;
    setProcessingUser(profile.id);
    try {
      await deleteUser(profile.id);
      setProfiles(prev => prev.filter(p => p.id !== profile.id));
      alert('✅ Utilisateur supprimé.');
    } catch (e: unknown) { alert('Erreur : ' + formatErrorMessage(e)); }
    finally { setProcessingUser(null); }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      await saveConfig(localConfig);
      setConfig(localConfig);
      alert('✅ Configuration sauvegardée.');
    } catch (e: unknown) { alert('Erreur : ' + formatErrorMessage(e)); }
    finally { setSavingConfig(false); }
  };

  const SUB_TABS: { id: SubTab; label: string; icon: string }[] = [
    { id: 'config', label: 'Configuration', icon: '⚙️' },
    { id: 'users', label: 'Utilisateurs', icon: '👥' },
    { id: 'finance', label: 'Audit Financier', icon: '💰' },
  ];

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '80px' }}>
      <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <button onClick={onReload} style={{ padding: '8px 14px', border: `1px solid ${border}`, borderRadius: '8px', background: 'none', color: subText, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '12px' }}>
          <RefreshCw size={14} /> Actualiser les données
        </button>
      </div>

      {/* Config tab */}
      {subTab === 'config' && (
        <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h2 style={{ color: textColor, fontWeight: 700, fontSize: '17px', margin: 0 }}>⚙️ Configuration Globale</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            {[
              { label: 'Prix par défaut (FCFA)', field: 'defaultPrice', type: 'number' },
              { label: 'Prix Pass VIP (FCFA)', field: 'vipPrice', type: 'number' },
              { label: 'Extension Stockage (FCFA)', field: 'storageExtensionPrice', type: 'number' },
            ].map(({ label, field, type }) => (
              <div key={field}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: subText, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</label>
                <input type={type} value={(localConfig as unknown as Record<string, unknown>)[field] as number} onChange={e => setLocalConfig(p => ({ ...p, [field]: Number(e.target.value) }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: textColor, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: subText, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Message de bannière globale</label>
            <input value={localConfig.alertBannerText} onChange={e => setLocalConfig(p => ({ ...p, alertBannerText: e.target.value }))} placeholder="Ex: Nouvelle mise à jour disponible ! 🎉"
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: textColor, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input type="checkbox" id="welcomeOffer" checked={localConfig.welcomeOfferActive} onChange={e => setLocalConfig(p => ({ ...p, welcomeOfferActive: e.target.checked }))} style={{ width: '18px', height: '18px', accentColor: '#6B1124' }} />
            <label htmlFor="welcomeOffer" style={{ fontSize: '14px', color: textColor, fontWeight: 600, cursor: 'pointer' }}>🎁 Offre de bienvenue active</label>
          </div>
          <button onClick={handleSaveConfig} disabled={savingConfig} style={{ alignSelf: 'flex-start', padding: '12px 24px', backgroundColor: savingConfig ? '#4B5563' : '#6B1124', color: '#FAF6EB', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: savingConfig ? 'wait' : 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Save size={16} /> {savingConfig ? 'Sauvegarde…' : 'Sauvegarder la configuration'}
          </button>
        </div>
      )}
      {/* ── Panneau Notifications Push (toujours visible dans le tab config) ── */}
      {subTab === 'config' && (
        <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Header du panneau */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ color: textColor, fontWeight: 700, fontSize: '17px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bell size={18} color="#6B1124" /> Notifications Push Distantes
            </h2>
            <button onClick={() => handleFetchTokenCount(pushCible)} disabled={loadingTokenCount}
              style={{ padding: '6px 14px', border: `1px solid ${border}`, borderRadius: '8px', background: 'none', color: subText, cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <RefreshCw size={12} /> {loadingTokenCount ? 'Vérification…' : (pushTokenCount !== null ? `${pushTokenCount} appareil(s) ciblés` : 'Vérifier les appareils')}
            </button>
          </div>

          {/* Description & Badge FlashScore */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <p style={{ margin: 0, fontSize: '13px', color: subText, lineHeight: 1.6 }}>
              Envoyez une <strong style={{ color: textColor }}>notification push prioritaire</strong> sur tous les téléphones des étudiants — même si l'application est <strong style={{ color: textColor }}>totalement fermée (mode Killed)</strong>. La notification s'affiche en bannière Heads-Up sur l'écran verrouillé avec son et vibration.
            </p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '8px', backgroundColor: darkMode ? '#1e0d16' : '#FFF1F2', border: '1px solid #FDA4AF', width: 'fit-content' }}>
              <Zap size={14} color="#E11D48" />
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#BE123C' }}>Mode FlashScore Actif : Haute priorité (FCM v1 / Expo) • Réveil en arrière-plan garanti</span>
            </div>
          </div>

          {/* Formulaire */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: subText, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Titre de la notification *</label>
              <input
                value={pushTitle}
                onChange={e => setPushTitle(e.target.value)}
                placeholder="Ex: 📣 Nouveau document disponible !"
                maxLength={65}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: textColor, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
              />
              <span style={{ fontSize: '11px', color: subText }}>{pushTitle.length}/65 caractères</span>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: subText, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Corps du message *</label>
              <textarea
                value={pushBody}
                onChange={e => setPushBody(e.target.value)}
                placeholder="Ex: Le document « Mathématiques L1 – Examen 2025 » vient d'être ajouté au catalogue."
                maxLength={200}
                rows={3}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: textColor, fontSize: '14px', outline: 'none', resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box' }}
              />
              <span style={{ fontSize: '11px', color: subText }}>{pushBody.length}/200 caractères</span>
            </div>

            {/* Sélecteurs de ciblage et Deep Link */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', padding: '14px', backgroundColor: darkMode ? '#150a0e' : '#F9FAFB', borderRadius: '10px', border: `1px solid ${border}` }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: textColor, marginBottom: '6px' }}>
                  🎯 Ciblage des destinataires
                </label>
                <select
                  value={pushCible}
                  onChange={e => {
                    const newCible = e.target.value as 'tous' | 'non_abonnes' | 'abonnes';
                    setPushCible(newCible);
                    handleFetchTokenCount(newCible);
                  }}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: textColor, fontSize: '13px', outline: 'none' }}
                >
                  <option value="tous">👥 Tous les utilisateurs</option>
                  <option value="non_abonnes">🆓 Non abonnés uniquement</option>
                  <option value="abonnes">👑 Abonnés VIP uniquement</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: textColor, marginBottom: '6px' }}>
                  🔗 Action au clic (Deep Link)
                </label>
                <select
                  value={pushRoute}
                  onChange={e => {
                    const val = e.target.value as 'Catalogue' | 'Bibliotheque' | 'Abonnement' | 'document';
                    setPushRoute(val);
                    if (val !== 'document') setPushDocId('');
                  }}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: textColor, fontSize: '13px', outline: 'none' }}
                >
                  <option value="Catalogue">🏪 Ouvrir le Catalogue des cours</option>
                  <option value="Bibliotheque">📚 Ouvrir la Bibliothèque personnelle</option>
                  <option value="Abonnement">👑 Ouvrir la page Offre VIP</option>
                  <option value="document">📄 Ouvrir un document précis…</option>
                </select>
              </div>

              {pushRoute === 'document' && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: textColor, marginBottom: '6px' }}>
                    📑 Document à ouvrir à l'arrivée *
                  </label>
                  <select
                    value={pushDocId}
                    onChange={e => setPushDocId(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `2px solid ${pushDocId ? '#6B1124' : '#E74C3C'}`, backgroundColor: inputBg, color: textColor, fontSize: '13px', outline: 'none' }}
                  >
                    <option value="">-- Sélectionnez un document ({documents.length} disponibles) --</option>
                    {documents.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.titre || 'Document sans titre'} ({d.categorie || 'Général'})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Résultat de l'envoi */}
          {pushResult && (
            <div style={{ padding: '12px 16px', borderRadius: '8px', backgroundColor: pushResult.success ? '#D1FAE5' : '#FEE2E2', border: `1px solid ${pushResult.success ? '#6EE7B7' : '#FCA5A5'}` }}>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: pushResult.success ? '#065F46' : '#991B1B' }}>
                {pushResult.success ? '✅' : '❌'} {pushResult.message}
              </p>
            </div>
          )}

          {/* Bouton d'envoi */}
          <button
            onClick={handleSendPush}
            disabled={sendingPush || !pushTitle.trim() || !pushBody.trim() || (pushRoute === 'document' && !pushDocId)}
            style={{
              alignSelf: 'flex-start', padding: '12px 24px',
              backgroundColor: (sendingPush || !pushTitle.trim() || !pushBody.trim() || (pushRoute === 'document' && !pushDocId)) ? '#4B5563' : '#6B1124',
              color: '#FAF6EB', border: 'none', borderRadius: '8px', fontWeight: 700,
              cursor: (sendingPush || !pushTitle.trim() || !pushBody.trim() || (pushRoute === 'document' && !pushDocId)) ? 'not-allowed' : 'pointer',
              fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px',
              opacity: (sendingPush || !pushTitle.trim() || !pushBody.trim() || (pushRoute === 'document' && !pushDocId)) ? 0.6 : 1,
            }}>
            <Send size={16} /> {sendingPush ? 'Transmission en cours…' : '📡 Diffuser la notification push'}
          </button>
        </div>
      )}

      {/* Users tab */}
      {subTab === 'users' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: subText }} />
            <input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Rechercher par nom, téléphone ou ID…"
              style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: textColor, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: darkMode ? '#150a0e' : '#F9FAFB' }}>
                    {['Utilisateur & Contact', 'Identifiant', 'Pass VIP', 'Capacité Stockage', 'Statut', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: subText, fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredProfiles.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: subText }}>
                        Aucun utilisateur trouvé.
                      </td>
                    </tr>
                  ) : (
                    filteredProfiles.map(p => {
                      const hasAvatarImg = Boolean(p.avatar_url && (p.avatar_url.startsWith('http') || p.avatar_url.startsWith('data:')));
                      const isPushTokenId = Boolean(p.id && (p.id.startsWith('ExponentPushToken') || p.id.startsWith('ExpoPushToken')));
                      const nomAffiche = p.nom_complet || p.username || (p.email ? p.email.split('@')[0] : (isPushTokenId ? '📱 Appareil prêt' : `Étudiant (${p.id.substring(0, 6)})`));
                      return (
                        <tr key={p.id} style={{ borderTop: `1px solid ${border}`, opacity: processingUser === p.id ? 0.5 : 1 }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              {hasAvatarImg ? (
                                <img
                                  src={p.avatar_url!}
                                  alt={nomAffiche}
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                  style={{ width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #6B1124', flexShrink: 0, backgroundColor: '#FAF6EB' }}
                                />
                              ) : (
                                <div style={{ width: '38px', height: '38px', borderRadius: '50%', backgroundColor: darkMode ? '#2B0E17' : '#FCE7ED', border: '1px solid #FDA4AF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B1124', flexShrink: 0 }}>
                                  <User size={18} color="#6B1124" />
                                </div>
                              )}
                              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                <span style={{ fontWeight: 700, color: textColor, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {nomAffiche}
                                </span>
                                {p.email ? (
                                  <span style={{ fontSize: '11px', color: '#6B1124', fontWeight: 600 }}>
                                    ✉️ {p.email}
                                  </span>
                                ) : p.phone_number ? (
                                  <span style={{ fontSize: '11px', color: subText, fontWeight: 500 }}>
                                    📞 {p.phone_number}
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '11px', color: subText, opacity: 0.7 }}>
                                    {isPushTokenId ? 'Terminal Mobile' : (p.id.length > 20 ? 'Compte Google' : 'Terminal Visiteur')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', color: subText, fontFamily: 'monospace', fontSize: '11px' }}>
                            {isPushTokenId ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: darkMode ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5', color: '#059669', padding: '2px 8px', borderRadius: '10px', fontWeight: 700, fontFamily: 'sans-serif' }}>
                                📱 Appareil prêt
                              </span>
                            ) : (
                              p.id.length > 18 ? `${p.id.substring(0, 10)}…${p.id.substring(p.id.length - 4)}` : p.id
                            )}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            {p.has_vip_pass ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800, backgroundColor: '#6B1124', color: '#FAF6EB', width: 'fit-content' }}>
                                  👑 VIP Actif
                                </span>
                                {p.vip_expiration_date && (
                                  <span style={{ fontSize: '10px', color: subText }}>
                                    Expire le {new Date(p.vip_expiration_date).toLocaleDateString('fr-FR')}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: subText, fontSize: '12px' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ color: p.has_extended_storage ? '#10B981' : textColor, fontWeight: p.has_extended_storage ? 700 : 500, fontSize: '12px' }}>
                              📦 {p.storage_limit || (p.has_extended_storage ? 150 : 75)} docs
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            {p.is_banned ? (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 10px',
                                borderRadius: '20px',
                                fontSize: '11px',
                                fontWeight: 700,
                                backgroundColor: '#FEE2E2',
                                color: '#991B1B',
                                border: '1px solid #F87171'
                              }}>
                                🚫 Suspendu
                              </span>
                            ) : p.est_actif === false ? (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 10px',
                                borderRadius: '20px',
                                fontSize: '11px',
                                fontWeight: 700,
                                backgroundColor: '#FEF2F2',
                                color: '#DC2626',
                                border: '1px solid #FCA5A5'
                              }}>
                                🔴 Désactivé
                              </span>
                            ) : (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 10px',
                                borderRadius: '20px',
                                fontSize: '11px',
                                fontWeight: 700,
                                backgroundColor: '#ECFDF5',
                                color: '#047857',
                                border: '1px solid #A7F3D0'
                              }}>
                                🟢 Actif
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {!p.has_vip_pass && (
                                <button onClick={() => handleGrantVip(p)} disabled={processingUser === p.id} title="Accorder VIP" style={{ padding: '5px 10px', borderRadius: '6px', border: `1px solid ${border}`, background: 'none', color: '#6B1124', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                   <Crown size={12} color="#6B1124" /> VIP
                                </button>
                              )}
                              {!p.has_extended_storage && (
                                <button onClick={() => handleGrantStorage(p)} disabled={processingUser === p.id} title="Stockage+" style={{ padding: '5px 10px', borderRadius: '6px', border: `1px solid ${border}`, background: 'none', color: '#10B981', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                   <HardDrive size={12} color="#10B981" /> Stockage
                                </button>
                              )}
                              {p.is_banned ? (
                                <button onClick={() => handleUnban(p)} disabled={processingUser === p.id} title="Lever suspension" style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #10B981', background: 'none', color: '#10B981', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <ShieldOff size={12} /> Débannir
                                </button>
                              ) : (
                                <button onClick={() => { setBanTarget(p); setBanDuration('3d'); setBanReason(''); }} disabled={processingUser === p.id} title="Suspendre" style={{ padding: '5px 10px', borderRadius: '6px', border: `1px solid ${border}`, background: 'none', color: '#6B1124', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <Shield size={12} color="#6B1124" /> Suspendre
                                </button>
                              )}
                              <button onClick={() => handleDeleteUser(p)} disabled={processingUser === p.id} title="Supprimer" style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #E74C3C', background: 'none', color: '#E74C3C', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Finance tab */}
      {subTab === 'finance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px' }}>
            <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <CreditCard size={18} color="#10B981" />
                <span style={{ fontSize: '11px', fontWeight: 700, color: subText, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Chiffre d'Affaires Global</span>
              </div>
              <p style={{ fontSize: '24px', fontWeight: 800, color: '#10B981', margin: 0 }}>{revenue.toLocaleString('fr-FR')} FCFA</p>
              <span style={{ fontSize: '11px', color: subText }}>{transactionsCount} transaction(s) totale(s)</span>
            </div>

            <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span style={{ fontSize: '16px' }}>📚</span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: subText, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cours à l'acte (100F)</span>
              </div>
              <p style={{ fontSize: '22px', fontWeight: 800, color: '#3B82F6', margin: 0 }}>{(propRevenueCours ?? 0).toLocaleString('fr-FR')} FCFA</p>
              <span style={{ fontSize: '11px', color: subText }}>{propCountCours ?? 0} document(s) acheté(s)</span>
            </div>

            <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span style={{ fontSize: '16px' }}>👑</span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: subText, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Location Catalogue (500F)</span>
              </div>
              <p style={{ fontSize: '22px', fontWeight: 800, color: '#6B1124', margin: 0 }}>{(propRevenueVip ?? 0).toLocaleString('fr-FR')} FCFA</p>
              <span style={{ fontSize: '11px', color: subText }}>{propCountVip ?? 0} location(s)</span>
            </div>

            <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span style={{ fontSize: '16px' }}>📦</span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: subText, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Stockage + (1000F)</span>
              </div>
              <p style={{ fontSize: '22px', fontWeight: 800, color: '#10B981', margin: 0 }}>{(propRevenueStockage ?? 0).toLocaleString('fr-FR')} FCFA</p>
              <span style={{ fontSize: '11px', color: subText }}>{propCountStockage ?? 0} extension(s)</span>
            </div>
          </div>
          <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: textColor }}>Journal d'Audit Financier</h3>
                <span style={{ fontSize: '12px', color: subText }}>Historique détaillé de toutes les transactions et acquisitions</span>
              </div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '4px 10px', borderRadius: '12px' }}>
                {transactions.length} flux comptabilisés
              </span>
            </div>
            {transactions.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: subText }}>
                <p>Aucune transaction enregistrée</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: darkMode ? '#150a0e' : '#F9FAFB' }}>
                      {['Date & Heure', 'Acheteur', 'Désignation du Service', 'Montant', 'Moyen de paiement', 'Statut'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: subText, fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${border}` }}>
                        <td style={{ padding: '12px 16px', color: subText, whiteSpace: 'nowrap', fontSize: '12px' }}>
                          {tx.date}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {tx.userAvatar ? (
                              <img src={tx.userAvatar} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#6B1124', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FAF6EB', fontWeight: 800, fontSize: '11px', flexShrink: 0 }}>
                                {(tx.userName || '?')[0].toUpperCase()}
                              </div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 700, color: textColor, fontSize: '13px' }}>
                                {tx.userName || 'Étudiant cauZon'}
                              </span>
                              {(tx.userEmail || tx.userPhone) && (
                                <span style={{ fontSize: '11px', color: subText }}>
                                  {tx.userEmail || tx.userPhone}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', color: textColor, fontWeight: 600, fontSize: '13px' }}>
                          {tx.doc}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 800, color: '#10B981', whiteSpace: 'nowrap', fontSize: '13px' }}>
                          {tx.price}
                        </td>
                        <td style={{ padding: '12px 16px', color: textColor, fontWeight: 600, fontSize: '12px' }}>
                          {tx.method}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, backgroundColor: tx.status === 'Complété' ? '#D1FAE5' : '#FEF3C7', color: tx.status === 'Complété' ? '#065F46' : '#92400E' }}>
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ban Modal */}
      {banTarget && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ width: '100%', maxWidth: '440px', backgroundColor: cardBg, borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', backgroundColor: '#92400E', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ color: '#FEF3C7', margin: 0, fontSize: '17px', fontWeight: 700 }}>🚫 Suspendre l'utilisateur</h2>
              <button onClick={() => setBanTarget(null)} style={{ background: 'none', border: 'none', color: '#FEF3C7', cursor: 'pointer', fontSize: '20px' }}>×</button>
            </div>
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ color: textColor, fontSize: '14px', margin: 0 }}>Suspendre <strong>{banTarget.username ?? banTarget.id}</strong></p>
              <div>
                <label style={{ display: 'block', fontWeight: 600, color: textColor, fontSize: '13px', marginBottom: '8px' }}>Durée</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {(['1d', '3d', '7d', '14d', '30d', 'permanent'] as BanDuration[]).map(d => (
                    <button key={d} onClick={() => setBanDuration(d)} style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${banDuration === d ? '#E74C3C' : border}`, backgroundColor: banDuration === d ? '#E74C3C' : 'transparent', color: banDuration === d ? '#FFF' : subText, fontWeight: 600, cursor: 'pointer', fontSize: '12px' }}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, color: textColor, fontSize: '13px', marginBottom: '6px' }}>Motif <span style={{ color: '#E74C3C' }}>*</span></label>
                <textarea value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Expliquez la raison de la suspension…" rows={3}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: textColor, fontSize: '14px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => setBanTarget(null)} style={{ padding: '10px 20px', border: `1px solid ${border}`, borderRadius: '8px', background: 'none', color: subText, cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>Annuler</button>
                <button onClick={handleBan} disabled={!banReason.trim()} style={{ padding: '10px 20px', backgroundColor: !banReason.trim() ? '#4B5563' : '#E74C3C', color: '#FFF', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: !banReason.trim() ? 'not-allowed' : 'pointer', fontSize: '14px', opacity: !banReason.trim() ? 0.6 : 1 }}>
                  Confirmer la suspension
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
