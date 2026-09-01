// Types centraux de l application cauZon

// Document (UI / camelCase) - utilise par tous les ecrans
export interface Document {
  id: string;
  titre: string;
  categorie: string;
  estCertifie: boolean;
  estPretHorsLigne: boolean;
  prix: number;
  estVerrouille: boolean;
  nombrePages: number;
  tailleMo: number;
  limiteApercuPages: number;
  limiteApercuType: 'page' | 'pourcentage' | 'fluide' | 'neutre';
  limiteApercuValeur: number;
  description?: string;
  tags?: string;
  coverUrl?: string;
  urlMiniature?: string;
  cheminLocal?: string;
  statut?: string;
  status?: string;
  is_vip_consultation?: boolean;
  estImporte?: boolean;
  dateAjout?: string;
  date_ajout?: string;
  file_path?: string;
}

// DocumentCourse (Supabase / snake_case)
export interface DocumentCourse {
  id: string;
  titre: string;
  categorie: string;
  description: string;
  tags?: string;
  prix: number;
  est_certifie: boolean;
  est_verrouille: boolean;
  nombre_pages: number;
  limite_apercu_pages: number;
  limite_apercu_type: string;
  limite_apercu_valeur: number;
  taille_mo: number;
  file_path: string;
  status: string;
  is_vip_consultation?: boolean;
  est_importe?: boolean;
  date_ajout?: string;
  coverUrl?: string;
  cheminLocal?: string;
}

// Categorie
export interface Categorie {
  id: string;
  nom: string;
  slug: string;
  icone?: string;
}

// Utilisateur
export interface Utilisateur {
  id: string;
  numeroTelephone?: string;
  identifiantAppareil: string;
  estVip: boolean;
  telechargementsGratuitsRestants: number;
}

// AnnonceBanniere
export interface AnnonceBanniere {
  id: string;
  titre_bande: string;
  contenu_detaille: string;
  type_importance: 'urgent' | 'promo' | 'info';
  date_expiration?: string | null;
  document_id_associe?: string | null;
  est_active: boolean;
  created_at?: string;
}

