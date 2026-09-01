import { useState, useEffect, useCallback } from 'react';
import { fetchDocuments } from '../services/serviceDocuments';
import { fetchProfiles } from '../services/serviceUsers';
import { fetchFeedbacks } from '../services/serviceFeedbacks';
import { fetchBanners } from '../services/serviceBanners';
import { fetchFinancialData, fetchConfig } from '../services/serviceSettings';
import type { DocumentRow, ProfileRow, FeedbackRow, BannerRow, TransactionRow, GlobalConfig } from '../types';

import { supabase } from '../lib/supabase';

export function useAppData() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [feedbacks, setFeedbacks] = useState<FeedbackRow[]>([]);
  const [banners, setBanners] = useState<BannerRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [revenue, setRevenue] = useState(0);
  const [revenueCours, setRevenueCours] = useState(0);
  const [revenueVip, setRevenueVip] = useState(0);
  const [revenueStockage, setRevenueStockage] = useState(0);
  const [countCours, setCountCours] = useState(0);
  const [countVip, setCountVip] = useState(0);
  const [countStockage, setCountStockage] = useState(0);
  const [transactionsCount, setTransactionsCount] = useState(0);
  const [config, setConfig] = useState<GlobalConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [docs, profs, fbs, bnrs, fin, cfg] = await Promise.allSettled([
        fetchDocuments(),
        fetchProfiles(),
        fetchFeedbacks(),
        fetchBanners(),
        fetchFinancialData(),
        fetchConfig()
      ]);
      if (docs.status === 'fulfilled') {
        console.log('✅ Documents chargés depuis Supabase :', docs.value.length);
        setDocuments(docs.value);
      } else {
        console.error('❌ Erreur chargement documents :', docs.reason);
      }
      if (profs.status === 'fulfilled') setProfiles(profs.value);
      if (fbs.status === 'fulfilled') setFeedbacks(fbs.value);
      if (bnrs.status === 'fulfilled') setBanners(bnrs.value);
      if (fin.status === 'fulfilled') {
        setTransactions(fin.value.transactions);
        setRevenue(fin.value.revenue);
        setRevenueCours(fin.value.revenueCours);
        setRevenueVip(fin.value.revenueVip);
        setRevenueStockage(fin.value.revenueStockage);
        setCountCours(fin.value.countCours);
        setCountVip(fin.value.countVip);
        setCountStockage(fin.value.countStockage);
        setTransactionsCount(fin.value.count);
      }
      if (cfg.status === 'fulfilled' && cfg.value) setConfig(cfg.value);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();

    // 📡 Écoute en temps réel Supabase Realtime (Zéro rafraîchissement manuel requis)
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const triggerReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        console.log('🔄 Événement Supabase Realtime détecté -> Actualisation instantanée Admin');
        loadAll();
      }, 300);
    };

    const channel = supabase
      .channel('admin-dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions_fedapay' },
        triggerReload
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'acquisitions' },
        triggerReload
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        triggerReload
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appareils_historique_bienvenue' },
        triggerReload
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'documents' },
        triggerReload
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feedbacks' },
        triggerReload
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'annonces_bannieres' },
        triggerReload
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settings' },
        triggerReload
      )
      .subscribe((status) => {
        console.log('📡 Statut Canal Realtime Admin :', status);
      });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [loadAll]);

  return {
    documents, setDocuments,
    profiles, setProfiles,
    feedbacks, setFeedbacks,
    banners, setBanners,
    transactions,
    revenue,
    revenueCours,
    revenueVip,
    revenueStockage,
    countCours,
    countVip,
    countStockage,
    transactionsCount,
    config, setConfig,
    loading, error,
    reload: loadAll
  };
}
