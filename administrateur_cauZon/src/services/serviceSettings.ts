import { supabase } from '../lib/supabase';
import type { GlobalConfig, TransactionRow, FinancialStats } from '../types';

const CONFIG_KEY = 'global_config';

export const fetchConfig = async (): Promise<GlobalConfig | null> => {
  const { data } = await supabase.from('settings').select('value').eq('key', CONFIG_KEY).maybeSingle();
  return data ? (data.value as GlobalConfig) : null;
};

export const saveConfig = async (config: GlobalConfig): Promise<void> => {
  const { error } = await supabase.from('settings').upsert({ key: CONFIG_KEY, value: config });
  if (error) throw error;
};

const formatPaymentMethod = (operateur?: string | null, mode?: string | null): string => {
  const op = (operateur || mode || '').toLowerCase();
  if (op.includes('wave')) return '🌊 Wave';
  if (op.includes('orange') || op.includes('om')) return '🟠 Orange Money';
  if (op.includes('mtn') || op.includes('momo')) return '🟡 MTN MoMo';
  if (op.includes('moov')) return '🔵 Moov Money';
  if (op.includes('card') || op.includes('visa') || op.includes('master')) return '💳 Carte Bancaire';
  if (op.includes('feexpay') || op.includes('fedapay') || op.includes('cinetpay')) return '📱 Mobile Money';
  return op ? `📱 ${op.toUpperCase()}` : '📱 Mobile Money';
};

export const fetchFinancialData = async (): Promise<FinancialStats> => {
  let totalRevenu = 0;
  let revenueCours = 0;
  let revenueVip = 0;
  let revenueStockage = 0;
  let countCours = 0;
  let countVip = 0;
  let countStockage = 0;

  const list: TransactionRow[] = [];
  const registeredTxIds = new Set<string>();

  // Dictionnaires de résolution métiers
  const docsMap = new Map<string, string>();
  const profilesMap = new Map<string, { username: string; avatar: string | null; phone: string | null }>();
  const devicesMap = new Map<string, { username: string; phone: string | null }>();

  // 0. Pré-chargement des dictionnaires (titres de cours, profils et appareils)
  try {
    const [docsRes, profsRes, appsRes] = await Promise.allSettled([
      supabase.from('documents').select('id, titre'),
      supabase.from('profiles').select('id, username, avatar_url, phone_number'),
      supabase.from('appareils_historique_bienvenue').select('device_id, username, phone_number'),
    ]);

    if (docsRes.status === 'fulfilled' && docsRes.value.data) {
      docsRes.value.data.forEach((d: { id: string; titre: string | null }) => {
        if (d.id && d.titre) docsMap.set(d.id, d.titre);
      });
    }

    if (profsRes.status === 'fulfilled' && profsRes.value.data) {
      profsRes.value.data.forEach((p: { id: string; username: string | null; avatar_url: string | null; phone_number: string | null }) => {
        if (p.id) {
          profilesMap.set(p.id, {
            username: p.username?.trim() || p.phone_number || 'Étudiant cauZon',
            avatar: p.avatar_url,
            phone: p.phone_number,
          });
        }
      });
    }

    if (appsRes.status === 'fulfilled' && appsRes.value.data) {
      appsRes.value.data.forEach((a: { device_id: string; username: string | null; phone_number: string | null }) => {
        if (a.device_id) {
          devicesMap.set(a.device_id, {
            username: a.username?.trim() || (a.phone_number ? `Étudiant (${a.phone_number})` : `Étudiant Invité (${a.device_id.substring(0, 6)})`),
            phone: a.phone_number,
          });
        }
      });
    }
  } catch (errInitMaps) {
    console.warn('Note résolution dictionnaires finances :', errInitMaps);
  }

  const resolveBuyer = (userId?: string | null, devId?: string | null, clientName?: string | null, clientTel?: string | null) => {
    if (clientName && clientName.trim() && !clientName.toLowerCase().startsWith('client_') && !clientName.toLowerCase().startsWith('anon')) {
      return { name: clientName.trim(), avatar: null };
    }
    if (userId && profilesMap.has(userId)) {
      const p = profilesMap.get(userId)!;
      return { name: p.username, avatar: p.avatar };
    }
    if (devId && devicesMap.has(devId)) {
      const d = devicesMap.get(devId)!;
      return { name: d.username, avatar: null };
    }
    if (clientTel && clientTel.trim()) {
      return { name: `Étudiant (${clientTel.trim()})`, avatar: null };
    }
    if (devId) {
      return { name: `Étudiant Invité (${devId.substring(0, 6)})`, avatar: null };
    }
    return { name: 'Étudiant cauZon', avatar: null };
  };

  // 1. Transactions Mobile Money / FeexPay (Tous types : Acte, VIP, Stockage)
  try {
    const { data: txs } = await supabase
      .from('transactions_fedapay')
      .select('*')
      .order('created_at', { ascending: false });

    if (txs) {
      txs.forEach((t: Record<string, unknown>) => {
        const statut = ((t.statut as string) || '').toLowerCase();
        const isApproved = ['approved', 'successful', 'success', 'valide'].includes(statut);
        const montant = Number(t.montant) || 0;
        const txId = (t.transaction_id as string) || (t.id as string);
        const typeAchat = (t.type_achat as string) || 'acte';
        const docId = (t.document_id as string) || '';
        const userId = (t.user_id as string) || null;
        const devId = (t.device_id as string) || null;
        const nomClient = (t.nom_client as string) || null;
        const telClient = (t.telephone_client as string) || null;

        if (isApproved && montant > 0) {
          totalRevenu += montant;
          if (typeAchat === 'vip') {
            revenueVip += montant;
            countVip++;
          } else if (typeAchat === 'stockage') {
            revenueStockage += montant;
            countStockage++;
          } else {
            revenueCours += montant;
            countCours++;
          }
        }

        registeredTxIds.add(txId);

        const buyer = resolveBuyer(userId, devId, nomClient, telClient);
        let docDesignation = '📄 Document de cours';
        if (typeAchat === 'vip') {
          docDesignation = '👑 Location Catalogue (30 jours)';
        } else if (typeAchat === 'stockage') {
          docDesignation = '📦 Extension de Stockage (+75 documents)';
        } else if (docId && docsMap.has(docId)) {
          docDesignation = `📄 ${docsMap.get(docId)}`;
        } else {
          docDesignation = '📄 Achat Cours à l\'acte';
        }

        list.push({
          date: t.created_at ? new Date(t.created_at as string).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—',
          id: txId,
          userName: buyer.name,
          userAvatar: buyer.avatar,
          doc: docDesignation,
          price: `${montant > 0 ? montant : 100} FCFA`,
          method: formatPaymentMethod(t.operateur as string, t.mode_paiement as string),
          status: isApproved ? 'Complété' : (t.statut as string) || 'En attente',
        });
      });
    }
  } catch (e) {
    console.warn('Erreur lecture transactions :', e);
  }

  // 2. Acquisitions payantes (Achats à l'acte non présents dans transactions)
  try {
    const { data: acqs } = await supabase
      .from('acquisitions')
      .select('*')
      .eq('is_welcome_offer', false)
      .gt('montant_paye', 0)
      .order('created_at', { ascending: false });

    if (acqs) {
      acqs.forEach((a: Record<string, unknown>) => {
        const acqId = `acq_${(a.id as string).substring(0, 8)}`;
        if (!registeredTxIds.has(acqId)) {
          const montant = Number(a.montant_paye) || 100;
          totalRevenu += montant;
          revenueCours += montant;
          countCours++;

          const docId = (a.document_id as string) || '';
          const userId = (a.user_id as string) || null;
          const devId = (a.device_id as string) || null;
          const buyer = resolveBuyer(userId, devId, null, null);

          let designation = '📄 Cours à l\'acte';
          if (a.is_vip_consultation) {
            designation = '👑 Consultation VIP';
          } else if (docId && docsMap.has(docId)) {
            designation = `📄 ${docsMap.get(docId)}`;
          }

          list.push({
            date: a.created_at ? new Date(a.created_at as string).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Récente',
            id: acqId,
            userName: buyer.name,
            userAvatar: buyer.avatar,
            doc: designation,
            price: `${montant} FCFA`,
            method: '📱 Mobile Money',
            status: 'Complété',
          });
        }
      });
    }
  } catch (e) {
    console.warn('Erreur lecture acquisitions :', e);
  }

  // 3. Détection des Pass VIP et Extensions Stockage actifs dans profiles (Fallback de sécurité)
  try {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, username, has_vip_pass, vip_expiration_date, has_extended_storage, storage_limit, created_at');

    if (profs) {
      profs.forEach((p: Record<string, unknown>) => {
        const userId = p.id as string;
        const nomUser = (p.username as string) || `Utilisateur ${userId.substring(0, 6)}`;

        // Location active
        if (p.has_vip_pass) {
          const vipTxId = `vip_prof_${userId.substring(0, 8)}`;
          if (!registeredTxIds.has(vipTxId) && countVip === 0) {
            totalRevenu += 500;
            revenueVip += 500;
            countVip++;
            registeredTxIds.add(vipTxId);
            list.push({
              date: p.created_at ? new Date(p.created_at as string).toLocaleString('fr-FR') : 'Actif',
              id: vipTxId,
              userName: nomUser,
              doc: `👑 Location Catalogue 30j (${nomUser})`,
              price: '500 FCFA',
              method: 'FeexPay',
              status: 'Complété',
            });
          }
        }

        // Extension de stockage
        if (p.has_extended_storage || (Number(p.storage_limit) > 75)) {
          const storageLimit = Number(p.storage_limit) || 150;
          const nbPaliers = Math.max(1, Math.floor((storageLimit - 75) / 75));
          for (let i = 1; i <= nbPaliers; i++) {
            const stockTxId = `stock_prof_${userId.substring(0, 8)}_p${i}`;
            if (!registeredTxIds.has(stockTxId) && countStockage < nbPaliers) {
              totalRevenu += 1000;
              revenueStockage += 1000;
              countStockage++;
              registeredTxIds.add(stockTxId);
              list.push({
                date: p.created_at ? new Date(p.created_at as string).toLocaleString('fr-FR') : 'Actif',
                id: stockTxId,
                userName: nomUser,
                doc: `📦 Extension Stockage (+75 docs - ${nomUser})`,
                price: '1000 FCFA',
                method: 'FeexPay',
                status: 'Complété',
              });
            }
          }
        }
      });
    }
  } catch (e) {
    console.warn('Erreur lecture profils (fallback finances) :', e);
  }

  // 4. Détection des Locations et Extensions Stockage dans appareils_historique_bienvenue
  try {
    const { data: apps } = await supabase
      .from('appareils_historique_bienvenue')
      .select('device_id, has_vip_pass, has_extended_storage, storage_limit, created_at');

    if (apps) {
      apps.forEach((app: Record<string, unknown>) => {
        const devId = (app.device_id as string) || 'dev';
        if (app.has_vip_pass) {
          const vipDevTxId = `vip_dev_${devId.substring(0, 8)}`;
          if (!registeredTxIds.has(vipDevTxId) && countVip === 0) {
            totalRevenu += 500;
            revenueVip += 500;
            countVip++;
            registeredTxIds.add(vipDevTxId);
            list.push({
              date: app.created_at ? new Date(app.created_at as string).toLocaleString('fr-FR') : 'Actif',
              id: vipDevTxId,
              userName: `Appareil ${devId.substring(0, 8)}`,
              doc: '👑 Location Catalogue Appareil (500F)',
              price: '500 FCFA',
              method: 'FeexPay',
              status: 'Complété',
            });
          }
        }

        if (app.has_extended_storage || (Number(app.storage_limit) > 75)) {
          const storageLimit = Number(app.storage_limit) || 150;
          const nbPaliers = Math.max(1, Math.floor((storageLimit - 75) / 75));
          for (let i = 1; i <= nbPaliers; i++) {
            const stockDevTxId = `stock_dev_${devId.substring(0, 8)}_p${i}`;
            if (!registeredTxIds.has(stockDevTxId) && countStockage < nbPaliers) {
              totalRevenu += 1000;
              revenueStockage += 1000;
              countStockage++;
              registeredTxIds.add(stockDevTxId);
              list.push({
                date: app.created_at ? new Date(app.created_at as string).toLocaleString('fr-FR') : 'Actif',
                id: stockDevTxId,
                userName: `Appareil ${devId.substring(0, 8)}`,
                doc: '📦 Extension Stockage Appareil (1000F)',
                price: '1000 FCFA',
                method: 'FeexPay',
                status: 'Complété',
              });
            }
          }
        }
      });
    }
  } catch (e) {
    console.warn('Erreur lecture appareils (fallback finances) :', e);
  }

  return {
    revenue: totalRevenu,
    count: list.length,
    revenueCours,
    revenueVip,
    revenueStockage,
    countCours,
    countVip,
    countStockage,
    transactions: list,
  };
};
