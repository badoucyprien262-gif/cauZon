export interface DocumentSummary {
  id: string;
  titre: string;
  categorie: string;
  nombre_pages: number;
  est_certifie: boolean;
  prix: number;
}

export interface PricingPlan {
  id: string;
  title: string;
  badge?: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
  tag?: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface FeatureItem {
  icon: string;
  title: string;
  description: string;
  tag: string;
}
