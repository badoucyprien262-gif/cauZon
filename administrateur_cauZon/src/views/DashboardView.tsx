import React from 'react';
import { RefreshCw, BookOpen, Users, Wallet, TrendingUp, CreditCard, Award, Gift, Sparkles, HardDrive, FileText } from 'lucide-react';
import type { DocumentRow, ProfileRow, TransactionRow } from '../types';

interface DashboardViewProps {
  documents: DocumentRow[];
  profiles: ProfileRow[];
  revenue: number;
  revenueCours?: number;
  revenueVip?: number;
  revenueStockage?: number;
  countCours?: number;
  countVip?: number;
  countStockage?: number;
  transactionsCount: number;
  transactions: TransactionRow[];
  loading: boolean;
  darkMode: boolean;
  onReload: () => void;
}

function KpiCard({ icon, label, value, desc, highlight, darkMode }: { icon: React.ReactNode; label: string; value: string | number; desc: string; highlight?: boolean; darkMode: boolean }) {
  const bg = highlight ? (darkMode ? '#0D2B1A' : '#F0FDF4') : (darkMode ? '#1e1e1e' : '#FFFFFF');
  const border = highlight ? '#10B981' : (darkMode ? '#2D1220' : '#E5E7EB');
  return (
    <div style={{ backgroundColor: bg, border: `1px solid ${border}`, borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ opacity: 0.85 }}>{icon}</div>
        <span style={{ fontSize: '11px', color: darkMode ? '#9CA3AF' : '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
      </div>
      <div style={{ fontSize: '26px', fontWeight: 800, color: highlight ? '#10B981' : (darkMode ? '#FAF6EB' : '#1F2937'), letterSpacing: '-0.5px' }}>{value}</div>
      <div style={{ fontSize: '12px', color: darkMode ? '#9CA3AF' : '#6B7280' }}>{desc}</div>
    </div>
  );
}

function RevenueBreakdownCard({ icon, title, amount, count, badgeColor, darkMode }: { icon: React.ReactNode; title: string; amount: number; count: number; badgeColor: string; darkMode: boolean }) {
  const bg = darkMode ? '#181216' : '#FFFFFF';
  const border = darkMode ? '#2D1220' : '#E5E7EB';
  const textColor = darkMode ? '#FAF6EB' : '#111827';
  const subText = darkMode ? '#9CA3AF' : '#6B7280';

  return (
    <div style={{ backgroundColor: bg, border: `1px solid ${border}`, borderRadius: '14px', padding: '18px', display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: `${badgeColor}15`, border: `1px solid ${badgeColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: textColor }}>{title}</span>
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', backgroundColor: `${badgeColor}20`, color: badgeColor }}>
            {count} vente{count > 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ fontSize: '20px', fontWeight: 800, color: badgeColor }}>
          {amount.toLocaleString('fr-FR')} FCFA
        </div>
        <div style={{ fontSize: '11px', color: subText, marginTop: '2px' }}>
          {title.includes('Location') || title.includes('VIP') ? '500 FCFA / location' : title.includes('Stockage') ? '1000 FCFA / +75 docs' : '100 FCFA / document'}
        </div>
      </div>
    </div>
  );
}

export function DashboardView({
  documents,
  profiles,
  revenue,
  revenueCours = 0,
  revenueVip = 0,
  revenueStockage = 0,
  countCours = 0,
  countVip = 0,
  countStockage = 0,
  transactionsCount,
  transactions,
  loading,
  darkMode,
  onReload
}: DashboardViewProps) {
  const published = documents.filter(d => d.status === 'published').length;
  const certifies = documents.filter(d => d.est_certifie).length;
  
  // Calcul précis des VIP / Locations actives (has_vip_pass = true et non expirés ou transactions VIP)
  const now = new Date();
  const vipProfilsActifs = profiles.filter(p => 
    p.has_vip_pass && (!p.vip_expiration_date || new Date(p.vip_expiration_date) > now)
  ).length;
  const vipUsers = Math.max(vipProfilsActifs, countVip);
  const bannedUsers = profiles.filter(p => p.is_banned).length;

  const totalUsersCount = profiles.length;
  const tauxConversionVal = totalUsersCount > 0 ? Math.min(100, (transactionsCount / totalUsersCount) * 100).toFixed(1) : '0.0';

  const textColor = darkMode ? '#FAF6EB' : '#1F2937';
  const border = darkMode ? '#2D1220' : '#E5E7EB';
  const cardBg = darkMode ? '#1e1e1e' : '#FFFFFF';
  const subText = darkMode ? '#9CA3AF' : '#6B7280';

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '28px', paddingBottom: '80px' }}>
      {/* Header */}
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: textColor, fontFamily: 'Outfit, sans-serif', margin: 0 }}>Tableau de bord</h1>
          <p style={{ color: subText, margin: '4px 0 0', fontSize: '14px' }}>Vue d'ensemble et centralisation financière cauZon</p>
        </div>
        <button onClick={onReload} disabled={loading} style={{ padding: '10px 18px', backgroundColor: '#6B1124', color: '#FAF6EB', border: 'none', borderRadius: '8px', cursor: loading ? 'wait' : 'pointer', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Actualiser
        </button>
      </div>

      {/* KPIs Globaux */}
      <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <KpiCard darkMode={darkMode} icon={<Wallet size={24} color="#10B981" />} label="Chiffre d'Affaires Global" value={`${revenue.toLocaleString('fr-FR')} FCFA`} desc={`${transactionsCount} transaction(s) totale(s)`} highlight />
        <KpiCard darkMode={darkMode} icon={<BookOpen size={24} color="#6B1124" />} label="Documents actifs" value={published} desc={`${documents.length} au total`} />
        <KpiCard darkMode={darkMode} icon={<Users size={24} color="#3B82F6" />} label="Utilisateurs & Appareils" value={totalUsersCount} desc={`${vipUsers} location(s) active(s) · ${bannedUsers} suspendu(s)`} />
        <KpiCard darkMode={darkMode} icon={<Award size={24} color="#10B981" />} label="Cours certifiés" value={certifies} desc={`sur ${documents.length} documents`} />
        <KpiCard darkMode={darkMode} icon={<TrendingUp size={24} color="#8B5CF6" />} label="Taux de conversion" value={`${tauxConversionVal}%`} desc={`${transactionsCount} achat(s) / ${totalUsersCount} utilisateur(s)`} />
        <KpiCard darkMode={darkMode} icon={<Gift size={24} color="#6B1124" />} label="Locations actives" value={vipUsers} desc="Formules 30 jours valides" />
      </div>

      {/* 📊 Répartition Détaillée des Revenus (100F, 500F, 1000F) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={18} color="#6B1124" />
          <h2 style={{ fontSize: '17px', fontWeight: 800, color: textColor, margin: 0 }}>Répartition par type de revenu</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
          <RevenueBreakdownCard
            darkMode={darkMode}
            icon={<FileText size={22} color="#3B82F6" />}
            title="Achats Cours à l'acte"
            amount={revenueCours}
            count={countCours}
            badgeColor="#3B82F6"
          />
          <RevenueBreakdownCard
            darkMode={darkMode}
            icon={<Sparkles size={22} color="#6B1124" />}
            title="Locations Catalogue (500F)"
            amount={revenueVip}
            count={countVip}
            badgeColor="#6B1124"
          />
          <RevenueBreakdownCard
            darkMode={darkMode}
            icon={<HardDrive size={22} color="#10B981" />}
            title="Extensions de Stockage"
            amount={revenueStockage}
            count={countStockage}
            badgeColor="#10B981"
          />
        </div>
      </div>

      {/* Recent Transactions */}
      <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CreditCard size={18} color="#6B1124" />
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: textColor, margin: 0 }}>Journal complet des transactions</h2>
          </div>
          <span style={{ fontSize: '12px', color: subText, fontWeight: 600 }}>{transactions.length} enregistrée(s)</span>
        </div>
        {transactions.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: subText }}>
            <p style={{ fontSize: '15px' }}>Aucune transaction enregistrée</p>
            <p style={{ fontSize: '13px' }}>Les paiements FeexPay / Mobile Money et acquisitions payantes apparaîtront ici</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: darkMode ? '#150a0e' : '#F9FAFB' }}>
                  {['Date & Heure', 'Acheteur', 'Désignation du Service', 'Montant', 'Moyen de paiement', 'Statut'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: subText, fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${border}` }}>
                    <td style={{ padding: '12px 16px', color: subText, whiteSpace: 'nowrap', fontSize: '12px' }}>{tx.date}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: '#6B1124', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FAF6EB', fontWeight: 800, fontSize: '11px', flexShrink: 0 }}>
                          {(tx.userName || '?')[0].toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 700, color: textColor, fontSize: '13px' }}>
                          {tx.userName || 'Étudiant cauZon'}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: textColor, fontWeight: 600, fontSize: '13px' }}>{tx.doc}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 800, color: '#10B981', whiteSpace: 'nowrap', fontSize: '13px' }}>{tx.price}</td>
                    <td style={{ padding: '12px 16px', color: textColor, fontWeight: 600, fontSize: '12px' }}>{tx.method}</td>
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
  );
}
