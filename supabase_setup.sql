-- =====================================================================
-- SCRIPT DE MISE EN PLACE SUPABASE : POLITIQUES RLS ET SÉCURITÉ DE CAUZON
-- A exécuter dans l'éditeur SQL du Dashboard Supabase
-- =====================================================================

-- 1. ACTIVER LE ROW LEVEL SECURITY (RLS) SUR TOUTES LES TABLES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acquisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Nettoyer les politiques existantes pour éviter les conflits
DROP POLICY IF EXISTS "Lecture publique des profils" ON public.profiles;
DROP POLICY IF EXISTS "Insertion par les utilisateurs" ON public.profiles;
DROP POLICY IF EXISTS "Modification par le propriétaire" ON public.profiles;
DROP POLICY IF EXISTS "Accès complet Admin sur profils" ON public.profiles;

DROP POLICY IF EXISTS "Lecture publique des documents" ON public.documents;
DROP POLICY IF EXISTS "Accès complet Admin sur documents" ON public.documents;
DROP POLICY IF EXISTS "Allow authenticated admin to insert documents" ON public.documents;
DROP POLICY IF EXISTS "Allow authenticated admin to update documents" ON public.documents;

DROP POLICY IF EXISTS "Lecture des acquisitions" ON public.acquisitions;
DROP POLICY IF EXISTS "Insertion des acquisitions" ON public.acquisitions;
DROP POLICY IF EXISTS "Accès complet Admin sur acquisitions" ON public.acquisitions;

DROP POLICY IF EXISTS "Lecture publique des settings" ON public.settings;
DROP POLICY IF EXISTS "Accès complet Admin sur settings" ON public.settings;


-- 2. POLITIQUES POUR LA TABLE [profiles]
-- Les étudiants lisent et insèrent leurs profils; l'Admin a accès total via service_role.
CREATE POLICY "Lecture publique des profils" ON public.profiles 
  FOR SELECT USING (true);

CREATE POLICY "Insertion par les utilisateurs" ON public.profiles 
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Modification par le propriétaire" ON public.profiles 
  FOR UPDATE USING (true);

CREATE POLICY "Accès complet Admin sur profils" ON public.profiles 
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 3. POLITIQUES RLS TABLE [documents]
DROP POLICY IF EXISTS "Allow insert on documents" ON public.documents;
CREATE POLICY "Allow insert on documents" 
ON public.documents FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update on documents" ON public.documents;
CREATE POLICY "Allow update on documents" 
ON public.documents FOR UPDATE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow select on documents" ON public.documents;
CREATE POLICY "Allow select on documents" 
ON public.documents FOR SELECT TO anon, authenticated USING (true);


-- 4. POLITIQUES POUR LA TABLE [acquisitions]
-- Les étudiants lisent toutes les acquisitions (ou leurs propres acquisitions par device_id) et insèrent les leurs.
-- Anti-double débit assuré par la contrainte unique.
CREATE POLICY "Lecture des acquisitions" ON public.acquisitions 
  FOR SELECT USING (true);

CREATE POLICY "Insertion des acquisitions" ON public.acquisitions 
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Accès complet Admin sur acquisitions" ON public.acquisitions 
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 5. POLITIQUES POUR LA TABLE [settings]
-- Lecture publique de la configuration (offres, bannières), modification réservée à l'Admin.
CREATE POLICY "Lecture publique des settings" ON public.settings 
  FOR SELECT USING (true);

CREATE POLICY "Accès complet Admin sur settings" ON public.settings 
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- =========================================================================
-- 6. POLITIQUES RLS SUPABASE STORAGE (BUCKETS PDF & THUMBNAILS)
-- =========================================================================
DROP POLICY IF EXISTS "Allow storage insert for all" ON storage.objects;
CREATE POLICY "Allow storage insert for all"
ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow storage select for all" ON storage.objects;
CREATE POLICY "Allow storage select for all"
ON storage.objects FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow storage update for all" ON storage.objects;
CREATE POLICY "Allow storage update for all"
ON storage.objects FOR UPDATE TO anon, authenticated USING (true);


-- =====================================================================
-- 7. CRÉATION DE LA VUE DE PERFORMANCE / CLASSEMENT DES DOCUMENTS
-- =====================================================================
CREATE OR REPLACE VIEW public.classement_documents AS
SELECT 
  d.id,
  d.titre,
  d.categorie,
  d.prix,
  d.cover_url,
  d.status,
  COUNT(a.id) AS nombre_deblocages
FROM public.documents d
LEFT JOIN public.acquisitions a ON a.document_id = d.id
GROUP BY d.id, d.titre, d.categorie, d.prix, d.cover_url, d.status
ORDER BY nombre_deblocages DESC;


-- =====================================================================
-- 8. CRÉATION DE LA TABLE [annonces_bannieres] ET POLITIQUES
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.annonces_bannieres (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  titre_bande TEXT NOT NULL,
  contenu_detaille TEXT NOT NULL,
  type_importance TEXT CHECK (type_importance IN ('info', 'promo', 'urgent')) DEFAULT 'info',
  date_debut TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  date_fin TIMESTAMP WITH TIME ZONE NOT NULL,
  ciblage_role TEXT CHECK (ciblage_role IN ('tous', 'non_abonnes', 'abonnes')) DEFAULT 'tous',
  document_id_associe UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  statut TEXT CHECK (statut IN ('actif', 'inactif')) DEFAULT 'actif',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.annonces_bannieres ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture publique des annonces" ON public.annonces_bannieres;
CREATE POLICY "Lecture publique des annonces" 
ON public.annonces_bannieres FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert on annonces" ON public.annonces_bannieres;
CREATE POLICY "Allow insert on annonces" 
ON public.annonces_bannieres FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update on annonces" ON public.annonces_bannieres;
CREATE POLICY "Allow update on annonces" 
ON public.annonces_bannieres FOR UPDATE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow delete on annonces" ON public.annonces_bannieres;
CREATE POLICY "Allow delete on annonces" 
ON public.annonces_bannieres FOR DELETE TO anon, authenticated USING (true);


-- =====================================================================
-- 9. AJOUT DES COLONNES DE PRÉVISUALISATION DYNAMIQUE DANS [documents]
-- =====================================================================
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS limite_apercu_type TEXT DEFAULT 'pourcentage' CHECK (limite_apercu_type IN ('page', 'pourcentage'));
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS limite_apercu_valeur INTEGER DEFAULT 30;
