import { supabase } from '../lib/supabase';
import type {
  GlobalConfig,
  TransactionRow,
  FinancialStats,
  AdminGlobalStats,
  AdminTransactionDetail,
  PaginatedTransactionsResult
} from '../types';

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
  const profilesMap = new Map<string, { username: string; avatar: string | null; phone: string | null; email: string | null }>();
  const devicesMap = new Map<string, { username: string; phone: string | null }>();

  // 0. Pré-chargement des dictionnaires (titres de cours, profils et appareils)
  try {
    const [docsRes, profsRes, appsRes] = await Promise.allSettled([
      supabase.from('documents').select('id, titre'),
      supabase.from('profiles').select('id, username, email, nom_complet, avatar_url, phone_number'),
      supabase.from('appareils_historique_bienvenue').select('device_id, username, phone_number'),
    ]);

    if (docsRes.status === 'fulfilled' && docsRes.value.data) {
      docsRes.value.data.forEach((d: { id: string; titre: string | null }) => {
        if (d.id && d.titre) docsMap.set(d.id, d.titre);
      });
    }

    if (profsRes.status === 'fulfilled' && profsRes.value.data) {
      profsRes.value.data.forEach((p: { id: string; username: string | null; email?: string | null; nom_complet?: string | null; avatar_url: string | null; phone_number: string | null }) => {
        if (p.id) {
          profilesMap.set(p.id, {
            username: p.nom_complet?.trim() || p.username?.trim() || p.phone_number || (p.email ? p.email.split('@')[0] : 'Étudiant cauZon'),
            avatar: p.avatar_url,
            phone: p.phone_number,
            email: p.email || null,
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

  const resolveBuyer = (userId?: string | null, devId?: string | null, clientName?: string | null, clientTel?: string | null, clientEmail?: string | null) => {
    if (clientName && clientName.trim() && !clientName.toLowerCase().startsWith('client_') && !clientName.toLowerCase().startsWith('anon')) {
      return { name: clientName.trim(), avatar: null, email: clientEmail || null, phone: clientTel || null };
    }
    if (userId && profilesMap.has(userId)) {
      const p = profilesMap.get(userId)!;
      return { name: p.username, avatar: p.avatar, email: clientEmail || p.email, phone: clientTel || p.phone };
    }
    if (devId && devicesMap.has(devId)) {
      const d = devicesMap.get(devId)!;
      return { name: d.username, avatar: null, email: clientEmail || null, phone: clientTel || d.phone };
    }
    if (clientTel && clientTel.trim()) {
      return { name: `Étudiant (${clientTel.trim()})`, avatar: null, email: clientEmail || null, phone: clientTel.trim() };
    }
    if (devId) {
      return { name: `Étudiant Invité (${devId.substring(0, 6)})`, avatar: null, email: clientEmail || null, phone: null };
    }
    return { name: 'Étudiant cauZon', avatar: null, email: clientEmail || null, phone: null };
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
        const emailClient = (t.email_client as string) || null;

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

        const buyer = resolveBuyer(userId, devId, nomClient, telClient, emailClient);
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
          userEmail: buyer.email,
          userPhone: buyer.phone,
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

/**
 * 📊 Statistiques globales pour l'administrateur :
 * - Total profils inscrits
 * - Chiffre d'affaires cumulé (somme des montants des transactions validées)
 * - Abonnés VIP actifs (has_vip_pass = true et non expirés)
 */
export const fetchStatistiquesGlobales = async (): Promise<AdminGlobalStats> => {
  try {
    const [profilesRes, vipRes, txsRes] = await Promise.allSettled([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id, vip_expiration_date').eq('has_vip_pass', true),
      supabase.from('transactions_fedapay').select('montant, type_achat, statut').in('statut', ['approved', 'successful', 'success', 'valide']),
    ]);

    const totalProfiles = profilesRes.status === 'fulfilled' ? (profilesRes.value.count || 0) : 0;

    let activeVipSubscribers = 0;
    if (vipRes.status === 'fulfilled' && vipRes.value.data) {
      const now = new Date();
      activeVipSubscribers = vipRes.value.data.filter((p: { vip_expiration_date?: string | null }) => 
        !p.vip_expiration_date || new Date(p.vip_expiration_date) > now
      ).length;
    }

    let totalRevenue = 0;
    let revenueCours = 0;
    let revenueVip = 0;
    let revenueStockage = 0;
    let totalTransactions = 0;

    if (txsRes.status === 'fulfilled' && txsRes.value.data) {
      totalTransactions = txsRes.value.data.length;
      txsRes.value.data.forEach((t: { montant?: number | null; type_achat?: string | null }) => {
        const montant = Number(t.montant) || 0;
        const typeAchat = t.type_achat || 'acte';
        totalRevenue += montant;
        if (typeAchat === 'vip') {
          revenueVip += montant;
        } else if (typeAchat === 'stockage') {
          revenueStockage += montant;
        } else {
          revenueCours += montant;
        }
      });
    }

    return {
      totalProfiles,
      totalRevenue,
      activeVipSubscribers,
      totalTransactions,
      revenueCours,
      revenueVip,
      revenueStockage,
    };
  } catch (error) {
    console.error('Erreur fetchStatistiquesGlobales :', error);
    return {
      totalProfiles: 0,
      totalRevenue: 0,
      activeVipSubscribers: 0,
      totalTransactions: 0,
      revenueCours: 0,
      revenueVip: 0,
      revenueStockage: 0,
    };
  }
};

/**
 * 📑 Historique paginé des transactions pour la vue Administrateur :
 * Jointure avec profiles (nom, email, avatar, téléphone) et documents (titre du cours pour les actes)
 * Trié par created_at DESC
 */
export const fetchHistoriqueTransactionsAdmin = async (
  page: number = 1,
  limit: number = 20
): Promise<PaginatedTransactionsResult> => {
  const from = Math.max(0, (page - 1) * limit);
  const to = from + limit - 1;

  try {
    // 1. Récupération paginée des transactions
    const { data: rawTxs, count, error } = await supabase
      .from('transactions_fedapay')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Erreur récupération transactions admin :', error);
      throw error;
    }

    const total = count ?? (rawTxs?.length || 0);
    const totalPages = Math.ceil(total / limit) || 1;

    if (!rawTxs || rawTxs.length === 0) {
      return { data: [], total, page, limit, totalPages };
    }

    // 2. Collecte des IDs uniques pour enrichir (documents et profiles)
    const userIds = Array.from(new Set(rawTxs.map((t: Record<string, unknown>) => t.user_id).filter(Boolean))) as string[];
    const docIds = Array.from(new Set(rawTxs.map((t: Record<string, unknown>) => t.document_id).filter(Boolean))) as string[];

    const [profilesRes, docsRes] = await Promise.allSettled([
      userIds.length > 0
        ? supabase.from('profiles').select('id, username, nom_complet, email, phone_number, avatar_url').in('id', userIds)
        : Promise.resolve({ data: [] }),
      docIds.length > 0
        ? supabase.from('documents').select('id, titre').in('id', docIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profilesMap = new Map<string, { nom: string; email: string | null; phone: string | null; avatar: string | null }>();
    if (profilesRes.status === 'fulfilled' && (profilesRes.value as any)?.data) {
      (profilesRes.value as any).data.forEach((p: any) => {
        profilesMap.set(p.id, {
          nom: p.nom_complet?.trim() || p.username?.trim() || 'Étudiant cauZon',
          email: p.email || null,
          phone: p.phone_number || null,
          avatar: p.avatar_url || null,
        });
      });
    }

    const docsMap = new Map<string, string>();
    if (docsRes.status === 'fulfilled' && (docsRes.value as any)?.data) {
      (docsRes.value as any).data.forEach((d: any) => {
        docsMap.set(d.id, d.titre || 'Document');
      });
    }

    // 3. Mapping et enrichissement des lignes
    const data: AdminTransactionDetail[] = rawTxs.map((t: Record<string, unknown>) => {
      const userId = (t.user_id as string) || null;
      const p = userId ? profilesMap.get(userId) : null;
      const nom = (t.nom_client as string) || p?.nom || ((t.device_id as string) ? `Étudiant (${(t.device_id as string).substring(0, 6)})` : 'Étudiant cauZon');
      const email = (t.email_client as string) || p?.email || null;
      const phone = (t.telephone_client as string) || p?.phone || null;
      const avatar = p?.avatar || null;
      const typeAchat = (t.type_achat as string) || 'acte';
      const docId = (t.document_id as string) || null;

      let titreDoc: string | null = null;
      if (typeAchat === 'vip') {
        titreDoc = 'Location VIP Catalogue (30 jours)';
      } else if (typeAchat === 'stockage') {
        titreDoc = 'Extension de Stockage (+75 documents)';
      } else if (docId && docsMap.has(docId)) {
        titreDoc = docsMap.get(docId) || 'Cours';
      }

      return {
        id: (t.id as string) || (t.transaction_id as string),
        transaction_id: (t.transaction_id as string) || (t.id as string),
        created_at: (t.created_at as string) || new Date().toISOString(),
        type_achat: typeAchat,
        montant: Number(t.montant) || 0,
        devise: (t.devise as string) || 'XOF',
        operateur: (t.operateur as string) || 'Mobile Money',
        statut: (t.statut as string) || 'approved',
        user_id: userId,
        device_id: (t.device_id as string) || null,
        document_id: docId,
        document_titre: titreDoc,
        nom_client: nom,
        email_client: email,
        telephone_client: phone,
        user_avatar: avatar,
      };
    });

    return { data, total, page, limit, totalPages };
  } catch (err) {
    console.error('Erreur fetchHistoriqueTransactionsAdmin :', err);
    return { data: [], total: 0, page, limit, totalPages: 1 };
  }
};
