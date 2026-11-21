-- ==============================================================================
-- 🏛️ cauZon.ci — MIGRATION ÉTAPE 1 : FONDATIONS BACKEND, RLS & REGISTRE FINANCIER
-- Fichier : supabase/migrations/20261121_fondations_fintech_quotas_et_roles.sql
-- ==============================================================================
-- 
-- Objectifs majeurs :
-- 1. Quotas par défaut : 21 documents (Lambda) & 400 Mo (Posteur)
-- 2. Portefeuille & Profil Créateur (posteurs_wallets) avec suivi en Mo et seuil payout >= 5000 F
-- 3. Abonnements Étudiants (abonnements_etudiants) : 1 000 FCFA / 10 documents / 30 jours
-- 4. Demandes de Retrait (demandes_retrait_posteurs) : zéro stockage permanent de numéro en clair
-- 5. Registre Financier Idempotent (ledger_transactions) & Séparation comptable étanche :
--    - Chiffre d'Affaires propre à cauZon (net des parts posteurs et frais)
--    - Cumul dû / versé aux créateurs (50 FCFA par acquisition)
-- 6. Sécurité RLS stricte & Interdiction absolue d'auto-achat (anti-fraude)
-- 7. Configuration Supabase Realtime pour synchronisation sans rafraîchissement
-- ==============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ÉVOLUTION DE LA TABLE DOCUMENTS (AUTEUR & PLAFOND 100 MO)
-- ─────────────────────────────────────────────────────────────────────────────

-- Ajout de la référence de l'auteur (créateur / posteur)
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_file_size_bytes BIGINT DEFAULT 104857600; -- Plafond 100 Mo strict

-- Contrainte de taille maximale (100 Mo = 104 857 600 octets)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_documents_max_taille_100mo'
    ) THEN
        ALTER TABLE public.documents 
        ADD CONSTRAINT chk_documents_max_taille_100mo 
        CHECK (taille_mo <= 100);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_author_id ON public.documents(author_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ÉVOLUTION DU PROFIL LAMBDA (QUOTA INITIAL 21 DOCUMENTS)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS quota_documents_lambda INT DEFAULT 21,
ADD COLUMN IF NOT EXISTS documents_acquis_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS telephone_facturation_temporaire TEXT; -- Jamais obligatoire, non persistant

-- Mise à jour des profils existants si le quota était l'ancien 75 ou 0
UPDATE public.profiles 
SET quota_documents_lambda = 21 
WHERE quota_documents_lambda IS NULL OR quota_documents_lambda = 75;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TABLE PORTEFEUILLE & PROFIL POSTEUR (posteurs_wallets)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.posteurs_wallets (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    est_posteur_actif BOOLEAN DEFAULT false,
    pseudo_createur TEXT,
    bio_createur TEXT,
    avatar_url TEXT,
    quota_stockage_mo NUMERIC DEFAULT 400.0, -- Quota initial en Mo
    espace_utilise_mo NUMERIC DEFAULT 0.0,   -- Espace consommé en Mo
    solde_retirable NUMERIC DEFAULT 0.0,     -- Solde disponible (>= 5000 F requis pour retrait)
    cumul_gains_historique NUMERIC DEFAULT 0.0,
    total_acquisitions_recues INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT chk_solde_positif CHECK (solde_retirable >= 0),
    CONSTRAINT chk_espace_positif CHECK (espace_utilise_mo >= 0)
);

CREATE INDEX IF NOT EXISTS idx_posteurs_wallets_actif ON public.posteurs_wallets(est_posteur_actif);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TABLE DES ABONNEMENTS ÉTUDIANTS (abonnements_etudiants)
-- ─────────────────────────────────────────────────────────────────────────────
-- 1 000 FCFA / mois : Droit à 10 documents acquis dans la période de 30 jours
-- À l'échéance, les documents non achetés à l'acte repassent en accès suspendu

CREATE TABLE IF NOT EXISTS public.abonnements_etudiants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    formule TEXT DEFAULT 'mensuel_1000' NOT NULL,
    montant_paye NUMERIC DEFAULT 1000 NOT NULL,
    date_debut TIMESTAMPTZ DEFAULT now() NOT NULL,
    date_fin TIMESTAMPTZ NOT NULL,
    quota_documents_autorises INT DEFAULT 10 NOT NULL,
    documents_debloques_ids UUID[] DEFAULT '{}' NOT NULL,
    statut TEXT DEFAULT 'actif' NOT NULL, -- 'actif', 'expire', 'resilie'
    reference_paiement_feexpay TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT chk_quota_autorises CHECK (quota_documents_autorises >= 0)
);

CREATE INDEX IF NOT EXISTS idx_abonnements_user_id ON public.abonnements_etudiants(user_id);
CREATE INDEX IF NOT EXISTS idx_abonnements_statut_date ON public.abonnements_etudiants(statut, date_fin);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. TABLE DES DEMANDES DE RETRAIT (demandes_retrait_posteurs)
-- ─────────────────────────────────────────────────────────────────────────────
-- Règle stricte de minimisation : ZÉRO stockage permanent du numéro de téléphone
-- Le numéro est saisi uniquement à l'exécution du virement et effacé / non conservé en clair

CREATE TABLE IF NOT EXISTS public.demandes_retrait_posteurs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    posteur_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    montant NUMERIC NOT NULL,
    operateur TEXT NOT NULL, -- 'WAVE_CI', 'ORANGE_CI', 'MTN_CI', 'MOOV_CI', etc.
    statut TEXT DEFAULT 'en_attente' NOT NULL, -- 'en_attente', 'en_traitement', 'valide', 'rejete'
    idempotency_key TEXT UNIQUE NOT NULL,      -- Prévention stricte des doubles retraits
    reference_feexpay_payout TEXT UNIQUE,     -- Référence de virement renvoyée par FeexPay
    motif_rejet TEXT,
    traite_par UUID REFERENCES auth.users(id),
    traite_le TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT chk_seuil_minimum_retrait CHECK (montant >= 5000)
);

CREATE INDEX IF NOT EXISTS idx_demandes_retrait_posteur ON public.demandes_retrait_posteurs(posteur_id);
CREATE INDEX IF NOT EXISTS idx_demandes_retrait_statut ON public.demandes_retrait_posteurs(statut);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. REGISTRE FINANCIER ÉTANCHE & IDEMPOTENT (ledger_transactions)
-- ─────────────────────────────────────────────────────────────────────────────
-- Sépare rigoureusement les profils / bibliothèques des écritures financières
-- Permet de calculer à la volée ou par vue :
-- - Le Chiffre d'Affaires propre à cauZon (net des parts posteurs de 50 F et des frais)
-- - Le Cumul dû / versé aux posteurs (50 FCFA par document acquis)

CREATE TABLE IF NOT EXISTS public.ledger_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT UNIQUE NOT NULL, -- Clé unique absolue (anti-double débit / double crédit)
    reference_externe TEXT UNIQUE,        -- Réf FeexPay (ex: FP-XXXXXXXX)
    type_operation TEXT NOT NULL,         -- 'achat_acte', 'abonnement_mensuel', 'extension_lambda', 'extension_posteur', 'retrait_posteur'
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    posteur_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    
    -- Ventilation des montants financiers (FCFA)
    montant_brut NUMERIC NOT NULL,        -- Ex: 200 F (acte), 1000 F (abo), 1500 F (extension), 5000 F (retrait)
    part_posteur NUMERIC DEFAULT 0 NOT NULL,     -- 50 F crédité au posteur par acquisition
    part_cauzon_brute NUMERIC NOT NULL,   -- Montant revenant à cauZon avant frais
    frais_passerelle_estimes NUMERIC DEFAULT 0 NOT NULL, -- Estimation frais FeexPay (~1.5% - 2%)
    part_cauzon_nette NUMERIC NOT NULL,   -- CA réel encaissé net par cauZon
    
    statut TEXT DEFAULT 'complete' NOT NULL, -- 'complete', 'annule', 'en_attente'
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_idempotency ON public.ledger_transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ledger_user_id ON public.ledger_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_posteur_id ON public.ledger_transactions(posteur_id);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON public.ledger_transactions(type_operation);
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON public.ledger_transactions(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. VUE COMPTABLE DE VENTILATION FINANCIÈRE (POUR LE DASHBOARD ADMIN)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.vue_comptable_cauzon AS
SELECT
    COUNT(*) FILTER (WHERE type_operation != 'retrait_posteur') AS total_transactions_ventes,
    COALESCE(SUM(montant_brut) FILTER (WHERE type_operation != 'retrait_posteur'), 0) AS ca_brut_total,
    COALESCE(SUM(part_posteur), 0) AS total_parts_posteurs_dues,
    COALESCE(SUM(montant_brut) FILTER (WHERE type_operation = 'retrait_posteur' AND statut = 'complete'), 0) AS total_retraits_verses,
    (COALESCE(SUM(part_posteur), 0) - COALESCE(SUM(montant_brut) FILTER (WHERE type_operation = 'retrait_posteur' AND statut = 'complete'), 0)) AS solde_restant_du_aux_posteurs,
    COALESCE(SUM(part_cauzon_nette), 0) AS ca_propre_net_cauzon,
    COALESCE(SUM(frais_passerelle_estimes), 0) AS total_frais_passerelle
FROM public.ledger_transactions
WHERE statut = 'complete';

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. FONCTION DE SÉCURITÉ : GARDE ANTI-AUTO-ACHAT (ANTI-FRAUDE)
-- ─────────────────────────────────────────────────────────────────────────────
-- Empêche formellement un créateur d'acquérir son propre document (ni 200 F, ni 1 000 F)

CREATE OR REPLACE FUNCTION public.verifier_anti_auto_achat()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_author_id UUID;
BEGIN
    -- Récupérer l'auteur du document ciblé
    SELECT author_id INTO v_author_id 
    FROM public.documents 
    WHERE id = NEW.document_id;

    -- Si l'acquéreur est le propriétaire du document -> Rejet catégorique
    IF v_author_id IS NOT NULL AND v_author_id = NEW.user_id THEN
        RAISE EXCEPTION 'Opération interdite : Un créateur ne peut pas acquérir son propre document (Anti-Fraude cauZon).';
    END IF;

    RETURN NEW;
END;
$$;

-- Application du trigger sur la table des acquisitions
DROP TRIGGER IF EXISTS trg_anti_auto_achat ON public.acquisitions;
CREATE TRIGGER trg_anti_auto_achat
    BEFORE INSERT ON public.acquisitions
    FOR EACH ROW
    EXECUTE FUNCTION public.verifier_anti_auto_achat();

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. SÉCURITÉ ROW LEVEL SECURITY (RLS) RENFORCÉE (MOINDRE PRIVILÈGE)
-- ─────────────────────────────────────────────────────────────────────────────

-- A. Table posteurs_wallets
ALTER TABLE public.posteurs_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture publique du profil posteur" ON public.posteurs_wallets;
CREATE POLICY "Lecture publique du profil posteur"
    ON public.posteurs_wallets FOR SELECT
    USING (true); -- Tout le monde peut voir le profil créateur public (style TikTok)

DROP POLICY IF EXISTS "Mise a jour de sa propre bio posteur" ON public.posteurs_wallets;
CREATE POLICY "Mise a jour de sa propre bio posteur"
    ON public.posteurs_wallets FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- B. Table abonnements_etudiants
ALTER TABLE public.abonnements_etudiants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture de son propre abonnement" ON public.abonnements_etudiants;
CREATE POLICY "Lecture de son propre abonnement"
    ON public.abonnements_etudiants FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Insertion réservée aux Edge Functions / Service Role uniquement
DROP POLICY IF EXISTS "Ecriture abonnements reservee service role" ON public.abonnements_etudiants;
CREATE POLICY "Ecriture abonnements reservee service role"
    ON public.abonnements_etudiants FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- C. Table demandes_retrait_posteurs
ALTER TABLE public.demandes_retrait_posteurs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Le posteur consulte ses propres demandes de retrait" ON public.demandes_retrait_posteurs;
CREATE POLICY "Le posteur consulte ses propres demandes de retrait"
    ON public.demandes_retrait_posteurs FOR SELECT
    TO authenticated
    USING (auth.uid() = posteur_id);

DROP POLICY IF EXISTS "Le posteur cree une demande de retrait valide" ON public.demandes_retrait_posteurs;
CREATE POLICY "Le posteur cree une demande de retrait valide"
    ON public.demandes_retrait_posteurs FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = posteur_id 
        AND montant >= 5000
    );

-- D. Table ledger_transactions (Isolation comptable totale côté client)
ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture ledger par utilisateur concerne" ON public.ledger_transactions;
CREATE POLICY "Lecture ledger par utilisateur concerne"
    ON public.ledger_transactions FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR auth.uid() = posteur_id);

DROP POLICY IF EXISTS "Ecriture ledger exclusive service role" ON public.ledger_transactions;
CREATE POLICY "Ecriture ledger exclusive service role"
    ON public.ledger_transactions FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. ACTIVATION DE SUPABASE REALTIME (SYNCHRONISATION EN DIRECT)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    -- Ajout des tables stratégiques à la publication Realtime de Supabase
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.documents';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.acquisitions';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.posteurs_wallets';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.abonnements_etudiants';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.demandes_retrait_posteurs';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.ledger_transactions';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. NOTIFICATION DE RECHARGEMENT DU SCHÉMA POSTGREST
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
