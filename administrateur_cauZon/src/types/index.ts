// cauZon Admin — Types centralisés

export interface DocumentRow {
  id: string;
  titre: string | null;
  categorie: string | null;
  description: string | null;
  tags?: string | null;
  prix: number | null;
  est_certifie: boolean | null;
  est_verrouille: boolean | null;
  nombre_pages: number | null;
  limite_apercu_pages: number | null;
  limite_apercu_type: string | null;
  limite_apercu_valeur: number | null;
  taille_mo: number | null;
  file_path: string | null;
  cover_url: string | null;
  scheduled_at: string | null;
  importance_level: string | null;
  status: string | null;
  created_at?: string | null;
}

export interface ProfileRow {
  id: string;
  username: string | null;
  phone_number?: string | null;
  avatar_url: string | null;
  has_extended_storage: boolean | null;
  storage_limit?: number | null;
  is_banned?: boolean | null;
  banned_until?: string | null;
  ban_reason?: string | null;
  has_vip_pass?: boolean | null;
  vip_expiration_date?: string | null;
  created_at?: string | null;
}

export interface FeedbackRow {
  id: string;
  device_id: string;
  username: string;
  message: string;
  reponse_admin: string | null;
  reponse_vue: boolean;
  pdf_attached_url?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface BannerRow {
  id: string;
  titre_bande: string;
  contenu_detaille: string;
  type_importance: 'info' | 'promo' | 'urgent';
  date_debut: string;
  date_fin: string;
  ciblage_role: 'tous' | 'non_abonnes' | 'abonnes';
  document_id_associe: string | null;
  statut: 'actif' | 'inactif';
  created_at?: string;
}

export interface TransactionRow {
  date: string;
  id: string;
  userName: string;
  userAvatar?: string | null;
  doc: string;
  price: string;
  method: string;
  status: string;
}

export interface FinancialStats {
  revenue: number;
  count: number;
  revenueCours: number;
  revenueVip: number;
  revenueStockage: number;
  countCours: number;
  countVip: number;
  countStockage: number;
  transactions: TransactionRow[];
}

export interface GlobalConfig {
  welcomeOfferActive: boolean;
  defaultPrice: number;
  vipPrice: number;
  storageExtensionPrice: number;
  alertBannerText: string;
  bannerImageUrl: string;
  bannerRedirectUrl: string;
}

export type ActiveView = 'dashboard' | 'catalog' | 'studio' | 'messaging' | 'settings';
export type BanDuration = '1d' | '3d' | '7d' | '14d' | '30d' | 'permanent';
