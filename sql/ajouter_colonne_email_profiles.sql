-- ==============================================================================
-- 👤 cauZon - AJOUT DES COLONNES IDENTITÉ ET EMAIL DANS LA TABLE PROFILES
-- Exécuter ce script dans l'éditeur SQL du Dashboard Supabase
-- ==============================================================================

-- 1. Ajout de la colonne email si elle n'existe pas encore
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Ajout de la colonne nom_complet si elle n'existe pas encore
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS nom_complet TEXT;

-- 3. Ajout d'un index pour accélérer la recherche par email
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- 4. Rétro-remplissage automatique des emails depuis auth.users vers profiles
-- (Supabase Auth stocke les emails officiels des comptes Google et email/mdp)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    UPDATE public.profiles p
    SET 
      email = COALESCE(p.email, u.email),
      nom_complet = COALESCE(p.nom_complet, p.username, u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name')
    FROM auth.users u
    WHERE p.id = u.id;
  END IF;
END $$;

-- 5. Vérification
SELECT id, username, nom_complet, email, avatar_url, est_actif, updated_at 
FROM public.profiles 
ORDER BY updated_at DESC 
LIMIT 10;
