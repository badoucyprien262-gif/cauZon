import React, { useState } from 'react';
import { Search, Shield, ShieldOff, Crown, HardDrive, Trash2, CreditCard, Save, RefreshCw } from 'lucide-react';
import type { ProfileRow, TransactionRow, GlobalConfig, BanDuration } from '../types';
import { banUser, unbanUser, grantVip, grantStorage, deleteUser, formatErrorMessage } from '../services/serviceUsers';
import { saveConfig } from '../services/serviceSettings';

interface SettingsViewProps {
  profiles: ProfileRow[];
  setProfiles: React.Dispatch<React.SetStateAction<ProfileRow[]>>;
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

  const filteredProfiles = profiles.filter(p =>
    !userSearch || (p.username ?? '').toLowerCase().includes(userSearch.toLowerCase()) || p.id.includes(userSearch)
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
                      const initial = (p.username || '?')[0].toUpperCase();
                      const hasAvatarImg = p.avatar_url && (p.avatar_url.startsWith('http') || p.avatar_url.startsWith('data:'));
                      return (
                        <tr key={p.id} style={{ borderTop: `1px solid ${border}`, opacity: processingUser === p.id ? 0.5 : 1 }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              {hasAvatarImg ? (
                                <img
                                  src={p.avatar_url!}
                                  alt={p.username || ''}
                                  style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #6B1124', flexShrink: 0 }}
                                />
                              ) : (
                                <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#6B1124', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FAF6EB', fontWeight: 800, fontSize: '14px', flexShrink: 0 }}>
                                  {initial}
                                </div>
                              )}
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 700, color: textColor, fontSize: '13px' }}>{p.username || 'Étudiant cauZon'}</span>
                                {p.phone_number ? (
                                  <span style={{ fontSize: '11px', color: subText, fontWeight: 500 }}>📞 {p.phone_number}</span>
                                ) : (
                                  <span style={{ fontSize: '11px', color: subText, opacity: 0.8 }}>Compte Google / Invité</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', color: subText, fontFamily: 'monospace', fontSize: '11px' }}>
                            {p.id.length > 18 ? `${p.id.substring(0, 10)}…${p.id.substring(p.id.length - 4)}` : p.id}
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
                            <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, backgroundColor: p.is_banned ? '#FEE2E2' : '#D1FAE5', color: p.is_banned ? '#991B1B' : '#065F46' }}>
                              {p.is_banned ? '🚫 Suspendu' : '✅ Actif'}
                            </span>
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
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#6B1124', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FAF6EB', fontWeight: 800, fontSize: '11px', flexShrink: 0 }}>
                              {(tx.userName || '?')[0].toUpperCase()}
                            </div>
                            <span style={{ fontWeight: 700, color: textColor, fontSize: '13px' }}>
                              {tx.userName || 'Étudiant cauZon'}
                            </span>
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
