-- ==============================================================================
-- 🎬 cauZon.ci — CORRECTIF STRICT ORDRE SQL & RPC ACTIVATION POSTEUR (SANS 42P13)
-- Fichier : sql/20261122_fix_rpc_activer_posteur_et_colonnes_auteurs.sql
-- À exécuter dans le Dashboard Supabase > SQL Editor
-- ==============================================================================
-- 1. Crée d'abord la table public.posteurs_wallets et les colonnes auteurs sur documents
-- 2. Supprime proprement toute version antérieure de public.activer_espace_posteur (anti-42P13)
-- 3. Recrée la fonction RPC avec une signature unique, propre et sécurisée
-- 4. Installe les triggers de synchronisation automatique profil créateur <-> documents
-- 5. Force le rechargement immédiat du cache PostgREST via NOTIFY pgrst
-- ==============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CRÉATION DE LA TABLE POSTEURS_WALLETS (EN PREMIER)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.posteurs_wallets (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    est_posteur_actif BOOLEAN DEFAULT false,
    pseudo_createur TEXT,
    bio_createur TEXT,
    avatar_url TEXT,
    quota_stockage_mo NUMERIC(8,2) DEFAULT 400.0,
    espace_utilise_mo NUMERIC(8,2) DEFAULT 0.0,
    solde_retirable NUMERIC(12,2) DEFAULT 0.0,
    cumul_gains_historique NUMERIC(12,2) DEFAULT 0.0,
    total_acquisitions_recues INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS & Privilèges sur posteurs_wallets
ALTER TABLE public.posteurs_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture publique profils posteurs" ON public.posteurs_wallets;
CREATE POLICY "Lecture publique profils posteurs"
ON public.posteurs_wallets FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Le posteur modifie son propre profil" ON public.posteurs_wallets;
CREATE POLICY "Le posteur modifie son propre profil"
ON public.posteurs_wallets FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

GRANT SELECT ON public.posteurs_wallets TO anon, authenticated;
GRANT UPDATE (pseudo_createur, bio_createur, avatar_url) ON public.posteurs_wallets TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. COLONNES D'IDENTITÉ AUTEUR SUR LA TABLE DOCUMENTS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS author_pseudo TEXT,
ADD COLUMN IF NOT EXISTS author_avatar_url TEXT;

CREATE INDEX IF NOT EXISTS idx_documents_author_id ON public.documents(author_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. SUPPRESSION PRÉALABLE DES ANCIENNES FONCTIONS (ÉVITE L'ERREUR 42P13)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.activer_espace_posteur CASCADE;
DROP FUNCTION IF EXISTS public.activer_espace_posteur(text, text, text);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CRÉATION DE LA FONCTION RPC UNIQUE : activer_espace_posteur
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.activer_espace_posteur(
    p_pseudo TEXT DEFAULT NULL,
    p_bio TEXT DEFAULT NULL,
    p_avatar_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_pseudo_clean TEXT;
    v_bio_clean TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentification requise pour activer l''espace posteur.');
    END IF;

    v_pseudo_clean := NULLIF(trim(COALESCE(p_pseudo, '')), '');
    v_bio_clean := NULLIF(trim(COALESCE(p_bio, '')), '');

    -- Création ou mise à jour atomique du portefeuille & profil créateur
    INSERT INTO public.posteurs_wallets (
        user_id,
        est_posteur_actif,
        pseudo_createur,
        bio_createur,
        avatar_url,
        quota_stockage_mo,
        espace_utilise_mo,
        solde_retirable,
        cumul_gains_historique,
        total_acquisitions_recues
    )
    VALUES (
        v_uid,
        true,
        v_pseudo_clean,
        v_bio_clean,
        p_avatar_url,
        400.0,
        0.0,
        0.0,
        0.0,
        0
    )
    ON CONFLICT (user_id) DO UPDATE SET
        est_posteur_actif = true,
        pseudo_createur = COALESCE(v_pseudo_clean, public.posteurs_wallets.pseudo_createur),
        bio_createur = COALESCE(v_bio_clean, public.posteurs_wallets.bio_createur),
        avatar_url = COALESCE(p_avatar_url, public.posteurs_wallets.avatar_url),
        updated_at = now();

    -- Synchronisation immédiate des documents existants de cet auteur
    UPDATE public.documents
    SET author_pseudo = COALESCE(v_pseudo_clean, author_pseudo),
        author_avatar_url = COALESCE(p_avatar_url, author_avatar_url)
    WHERE author_id = v_uid;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Espace posteur activé avec succès. Vos droits d''étudiant lambda restent intacts.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.activer_espace_posteur(TEXT, TEXT, TEXT) TO authenticated, service_role, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. TRIGGERS DE SYNCHRONISATION POSTEUR <-> DOCUMENTS
-- ─────────────────────────────────────────────────────────────────────────────

-- A. À la publication d'un document par un posteur
CREATE OR REPLACE FUNCTION public.trg_sync_doc_author_info()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.author_id IS NOT NULL THEN
        SELECT pseudo_createur, avatar_url 
        INTO NEW.author_pseudo, NEW.author_avatar_url
        FROM public.posteurs_wallets
        WHERE user_id = NEW.author_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_document_author ON public.documents;
CREATE TRIGGER trg_sync_document_author
BEFORE INSERT OR UPDATE OF author_id ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_doc_author_info();

-- B. À la modification du profil créateur dans posteurs_wallets
CREATE OR REPLACE FUNCTION public.trg_sync_posteur_wallets_to_docs()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.documents
    SET author_pseudo = NEW.pseudo_createur,
        author_avatar_url = NEW.avatar_url
    WHERE author_id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_wallet_to_docs ON public.posteurs_wallets;
CREATE TRIGGER trg_sync_wallet_to_docs
AFTER UPDATE OF pseudo_createur, avatar_url ON public.posteurs_wallets
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_posteur_wallets_to_docs();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. VERROUILLAGE DU PRIX : AUCUN POUVOIR DU POSTEUR SUR LE PRIX DE VENTE
-- ─────────────────────────────────────────────────────────────────────────────
-- A. À l'insertion : tout document publié avec author_id a son prix fixé à 200 FCFA
CREATE OR REPLACE FUNCTION public.trg_lock_posteur_doc_price_on_insert()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.author_id IS NOT NULL THEN
        NEW.prix := 200; -- Valeur de référence administrative stricte
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_lock_doc_price_insert ON public.documents;
CREATE TRIGGER trg_lock_doc_price_insert
BEFORE INSERT ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.trg_lock_posteur_doc_price_on_insert();

-- B. À la mise à jour : l'auteur posteur ne peut jamais altérer la colonne prix
CREATE OR REPLACE FUNCTION public.trg_lock_posteur_doc_price_on_update()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.author_id IS NOT NULL AND auth.uid() = OLD.author_id THEN
        NEW.prix := OLD.prix; -- Le posteur ne peut pas altérer le prix décidé par cauZon
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_lock_doc_price_update ON public.documents;
CREATE TRIGGER trg_lock_doc_price_update
BEFORE UPDATE OF prix ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.trg_lock_posteur_doc_price_on_update();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RECHARGEMENT IMMÉDIAT DU CACHE POSTGREST
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
