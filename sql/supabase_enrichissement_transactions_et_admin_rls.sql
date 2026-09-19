-- ==============================================================================
-- 💳 cauZon — ENRICHISSEMENT TRANSACTIONS FEEXPAY & SÉCURISATION ADMIN RLS
-- Fichier : sql/supabase_enrichissement_transactions_et_admin_rls.sql
-- ==============================================================================

-- 1. Ajout et fiabilisation des colonnes dans transactions_fedapay
ALTER TABLE public.transactions_fedapay 
ADD COLUMN IF NOT EXISTS transaction_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS device_id TEXT,
ADD COLUMN IF NOT EXISTS type_achat TEXT DEFAULT 'acte',
ADD COLUMN IF NOT EXISTS montant NUMERIC DEFAULT 100,
ADD COLUMN IF NOT EXISTS devise TEXT DEFAULT 'XOF',
ADD COLUMN IF NOT EXISTS operateur TEXT DEFAULT 'FEEXPAY',
ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'approved',
ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS fedapay_reference TEXT,
ADD COLUMN IF NOT EXISTS nom_client TEXT,
ADD COLUMN IF NOT EXISTS email_client TEXT,
ADD COLUMN IF NOT EXISTS telephone_client TEXT,
ADD COLUMN IF NOT EXISTS raw_webhook_payload JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. Index de performance pour les requêtes administratives et de reporting
CREATE INDEX IF NOT EXISTS idx_transactions_fedapay_user_id ON public.transactions_fedapay(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_fedapay_doc_id ON public.transactions_fedapay(document_id);
CREATE INDEX IF NOT EXISTS idx_transactions_fedapay_statut ON public.transactions_fedapay(statut);
CREATE INDEX IF NOT EXISTS idx_transactions_fedapay_created_at ON public.transactions_fedapay(created_at DESC);

-- 3. Sécurité Row Level Security (RLS) - Lecture universelle pour le Dashboard Admin
ALTER TABLE public.transactions_fedapay ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture transactions publique" ON public.transactions_fedapay;
CREATE POLICY "Lecture transactions publique" ON public.transactions_fedapay 
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Insertion transaction autorisée" ON public.transactions_fedapay;
CREATE POLICY "Insertion transaction autorisée" ON public.transactions_fedapay 
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Mise a jour transaction autorisee" ON public.transactions_fedapay;
CREATE POLICY "Mise a jour transaction autorisee" ON public.transactions_fedapay 
  FOR UPDATE USING (true) WITH CHECK (true);

-- 4. Vérification RLS sur les tables jointes (profiles et documents)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture profils publique" ON public.profiles;
CREATE POLICY "Lecture profils publique" ON public.profiles 
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Modification profils publique" ON public.profiles;
CREATE POLICY "Modification profils publique" ON public.profiles 
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture documents publique" ON public.documents;
CREATE POLICY "Lecture documents publique" ON public.documents 
  FOR SELECT USING (true);

-- 5. Recharger le schéma PostgREST
NOTIFY pgrst, 'reload schema';
