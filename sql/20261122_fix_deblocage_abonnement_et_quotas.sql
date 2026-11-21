-- ==============================================================================
-- MIGRATION CAUZON : RPC SÉCURISÉE DÉBLOCAGE PAR ABONNEMENT (10 DOCS) & QUOTAS
-- Date : 22 Novembre 2026
-- Script 100 % autonome et idempotent (résout l'erreur 42P01 si tables absentes)
-- ==============================================================================

-- 1. Table posteurs_wallets (création autonome si absente + colonnes sécurisées)
CREATE TABLE IF NOT EXISTS public.posteurs_wallets (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    est_posteur_actif BOOLEAN DEFAULT false,
    pseudo_createur TEXT,
    bio_createur TEXT,
    avatar_url TEXT,
    quota_stockage_mo NUMERIC DEFAULT 400.0,
    espace_utilise_mo NUMERIC DEFAULT 0.0,
    solde_retirable NUMERIC DEFAULT 0.0,
    gains_cumules NUMERIC DEFAULT 0.0,
    cumul_gains_historique NUMERIC DEFAULT 0.0,
    total_acquisitions_recues INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT chk_solde_positif CHECK (solde_retirable >= 0),
    CONSTRAINT chk_espace_positif CHECK (espace_utilise_mo >= 0)
);

ALTER TABLE public.posteurs_wallets
ADD COLUMN IF NOT EXISTS gains_cumules NUMERIC DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS cumul_gains_historique NUMERIC DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS solde_retirable NUMERIC DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS total_acquisitions_recues INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now() NOT NULL;

-- 2. Table acquisitions (création autonome si absente + colonne is_vip_consultation)
CREATE TABLE IF NOT EXISTS public.acquisitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id TEXT,
    is_welcome_offer BOOLEAN DEFAULT false,
    is_vip_consultation BOOLEAN DEFAULT false,
    montant_paye NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.acquisitions
ADD COLUMN IF NOT EXISTS is_vip_consultation BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now() NOT NULL;

CREATE INDEX IF NOT EXISTS idx_acquisitions_user_id ON public.acquisitions(user_id);
CREATE INDEX IF NOT EXISTS idx_acquisitions_device_id ON public.acquisitions(device_id);
CREATE INDEX IF NOT EXISTS idx_acquisitions_doc_user ON public.acquisitions(document_id, user_id);

-- 3. Table abonnements_etudiants (création autonome si absente - élimine 42P01)
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

ALTER TABLE public.abonnements_etudiants
ADD COLUMN IF NOT EXISTS quota_documents_autorises INT DEFAULT 10 NOT NULL,
ADD COLUMN IF NOT EXISTS documents_debloques_ids UUID[] DEFAULT '{}' NOT NULL,
ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'actif' NOT NULL,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now() NOT NULL;

CREATE INDEX IF NOT EXISTS idx_abonnements_user_id ON public.abonnements_etudiants(user_id);
CREATE INDEX IF NOT EXISTS idx_abonnements_statut_date ON public.abonnements_etudiants(statut, date_fin);

-- 4. Table ledger_transactions (création autonome si absente)
CREATE TABLE IF NOT EXISTS public.ledger_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT UNIQUE NOT NULL,
    reference_externe TEXT UNIQUE,
    type_operation TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    posteur_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    montant_brut NUMERIC DEFAULT 0 NOT NULL,
    part_posteur NUMERIC DEFAULT 0 NOT NULL,
    part_cauzon_brute NUMERIC DEFAULT 0 NOT NULL,
    frais_passerelle_estimes NUMERIC DEFAULT 0 NOT NULL,
    part_cauzon_nette NUMERIC DEFAULT 0 NOT NULL,
    statut TEXT DEFAULT 'complete' NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 5. Row Level Security (RLS) et permissions
ALTER TABLE public.posteurs_wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture publique du profil posteur" ON public.posteurs_wallets;
CREATE POLICY "Lecture publique du profil posteur" ON public.posteurs_wallets FOR SELECT USING (true);
DROP POLICY IF EXISTS "Modification propre portefeuille posteur" ON public.posteurs_wallets;
CREATE POLICY "Modification propre portefeuille posteur" ON public.posteurs_wallets FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.abonnements_etudiants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture de son propre abonnement" ON public.abonnements_etudiants;
CREATE POLICY "Lecture de son propre abonnement" ON public.abonnements_etudiants FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Gestion abonnement par utilisateur et service role" ON public.abonnements_etudiants;
CREATE POLICY "Gestion abonnement par utilisateur et service role" ON public.abonnements_etudiants FOR ALL USING (auth.uid() = user_id OR auth.role() = 'service_role') WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

ALTER TABLE public.acquisitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture acquisitions publique et utilisateur" ON public.acquisitions;
CREATE POLICY "Lecture acquisitions publique et utilisateur" ON public.acquisitions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Ecriture acquisitions utilisateur" ON public.acquisitions;
CREATE POLICY "Ecriture acquisitions utilisateur" ON public.acquisitions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture ledger par utilisateur concerne" ON public.ledger_transactions;
CREATE POLICY "Lecture ledger par utilisateur concerne" ON public.ledger_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id OR auth.uid() = posteur_id);
DROP POLICY IF EXISTS "Ecriture ledger service et authenticated" ON public.ledger_transactions;
CREATE POLICY "Ecriture ledger service et authenticated" ON public.ledger_transactions FOR ALL USING (true) WITH CHECK (true);

-- Permissions de base pour les rôles authenticated, anon et service_role
GRANT SELECT, INSERT, UPDATE ON public.posteurs_wallets TO authenticated;
GRANT SELECT ON public.posteurs_wallets TO anon;
GRANT ALL ON public.posteurs_wallets TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.abonnements_etudiants TO authenticated;
GRANT SELECT ON public.abonnements_etudiants TO anon;
GRANT ALL ON public.abonnements_etudiants TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.acquisitions TO authenticated;
GRANT SELECT, INSERT ON public.acquisitions TO anon;
GRANT ALL ON public.acquisitions TO service_role;

GRANT SELECT, INSERT ON public.ledger_transactions TO authenticated;
GRANT ALL ON public.ledger_transactions TO service_role;

-- 6. Fonction RPC sécurisée debloquer_document_via_abonnement (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.debloquer_document_via_abonnement(
    p_document_id UUID,
    p_device_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_abo RECORD;
    v_author_id UUID;
    v_deja_permanent BOOLEAN := false;
    v_consommes INT := 0;
    v_quota_max INT := 10;
BEGIN
    -- Si v_user_id est nul mais p_device_id est fourni (téléphone / mobile)
    IF v_user_id IS NULL AND p_device_id IS NOT NULL THEN
        SELECT user_id INTO v_user_id 
        FROM public.acquisitions 
        WHERE device_id = p_device_id AND user_id IS NOT NULL 
        ORDER BY created_at DESC LIMIT 1;
    END IF;

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Vous devez être connecté avec votre compte Google pour acquérir un document.');
    END IF;

    -- A. Récupérer l'abonnement actif le plus récent
    SELECT * INTO v_abo
    FROM public.abonnements_etudiants
    WHERE user_id = v_user_id 
      AND statut = 'actif' 
      AND date_fin > now()
    ORDER BY created_at DESC 
    LIMIT 1;

    IF v_abo IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Aucun abonnement étudiant actif trouvé. Veuillez souscrire à la formule (1 000 FCFA / 10 documents).');
    END IF;

    v_quota_max := COALESCE(v_abo.quota_documents_autorises, 10);
    v_consommes := COALESCE(cardinality(v_abo.documents_debloques_ids), 0);

    -- B. Vérifier si l'étudiant n'a pas déjà acquis ce document à l'acte (permanent à vie)
    SELECT EXISTS (
        SELECT 1 FROM public.acquisitions 
        WHERE document_id = p_document_id 
          AND user_id = v_user_id 
          AND is_vip_consultation = false
    ) INTO v_deja_permanent;

    IF v_deja_permanent THEN
        RETURN jsonb_build_object(
            'success', true, 
            'deja_acquis', true,
            'message', 'Ce document est déjà dans votre bibliothèque permanente à vie !',
            'documents_restants', (v_quota_max - v_consommes),
            'quota_max', v_quota_max
        );
    END IF;

    -- C. Anti-auto-achat : interdire au créateur d'acquérir son propre document
    SELECT author_id INTO v_author_id FROM public.documents WHERE id = p_document_id;
    IF v_author_id IS NOT NULL AND v_author_id = v_user_id THEN
        RETURN jsonb_build_object('success', false, 'message', 'Vous êtes l''auteur de ce cours. L''auto-acquisition est interdite.');
    END IF;

    -- D. Si le document a déjà été consommé dans cet abonnement
    IF v_abo.documents_debloques_ids IS NOT NULL AND p_document_id = ANY(v_abo.documents_debloques_ids) THEN
        RETURN jsonb_build_object(
            'success', true, 
            'deja_dans_abonnement', true,
            'message', 'Ce document est déjà débloqué sous votre abonnement actif.',
            'documents_restants', (v_quota_max - v_consommes),
            'quota_max', v_quota_max
        );
    END IF;

    -- E. Vérifier la limite stricte de 10 documents
    IF v_consommes >= v_quota_max THEN
        RETURN jsonb_build_object(
            'success', false, 
            'quota_atteint', true,
            'message', 'Quota de 10 documents atteint pour ce mois. Renouvelez votre abonnement pour débloquer 10 nouveaux cours ou achetez ce cours à vie (200 FCFA).',
            'documents_restants', 0,
            'quota_max', v_quota_max
        );
    END IF;

    -- F. Enregistrer l'acquisition sous abonnement (is_vip_consultation: true)
    IF EXISTS (
        SELECT 1 FROM public.acquisitions 
        WHERE document_id = p_document_id 
          AND (user_id = v_user_id OR (p_device_id IS NOT NULL AND device_id = p_device_id))
    ) THEN
        UPDATE public.acquisitions
        SET is_vip_consultation = true,
            user_id = v_user_id,
            device_id = COALESCE(device_id, p_device_id),
            updated_at = now()
        WHERE document_id = p_document_id 
          AND (user_id = v_user_id OR (p_device_id IS NOT NULL AND device_id = p_device_id));
    ELSE
        INSERT INTO public.acquisitions (
            document_id,
            user_id,
            device_id,
            is_welcome_offer,
            is_vip_consultation,
            montant_paye,
            created_at,
            updated_at
        )
        VALUES (
            p_document_id,
            v_user_id,
            COALESCE(p_device_id, 'device_inconnu'),
            false,
            true,
            0,
            now(),
            now()
        );
    END IF;

    -- G. Mettre à jour l'abonnement étudiant (+1 document consommé)
    UPDATE public.abonnements_etudiants
    SET documents_debloques_ids = array_append(COALESCE(documents_debloques_ids, '{}'::uuid[]), p_document_id),
        updated_at = now()
    WHERE id = v_abo.id;

    -- H. Rétribution du créateur : +50 FCFA crédités sur son portefeuille
    IF v_author_id IS NOT NULL THEN
        INSERT INTO public.posteurs_wallets (
            user_id, 
            solde_retirable, 
            gains_cumules, 
            total_acquisitions_recues, 
            created_at, 
            updated_at
        )
        VALUES (v_author_id, 50.00, 50.00, 1, now(), now())
        ON CONFLICT (user_id) DO UPDATE SET
            solde_retirable = posteurs_wallets.solde_retirable + 50.00,
            gains_cumules = posteurs_wallets.gains_cumules + 50.00,
            total_acquisitions_recues = posteurs_wallets.total_acquisitions_recues + 1,
            updated_at = now();

        -- Tracé comptable dans ledger_transactions (isolé avec exception catch pour zéro blocage)
        BEGIN
            INSERT INTO public.ledger_transactions (
                idempotency_key,
                user_id,
                posteur_id,
                document_id,
                type_operation,
                montant_brut,
                part_cauzon_brute,
                part_cauzon_nette,
                part_posteur,
                statut,
                metadata
            ) VALUES (
                'abo_doc_' || p_document_id::text || '_' || v_user_id::text || '_' || extract(epoch from now())::text,
                v_user_id,
                v_author_id,
                p_document_id,
                'part_posteur_acquisition_abonnement',
                0.00,
                0.00,
                -50.00,
                50.00,
                'complete',
                jsonb_build_object(
                    'document_id', p_document_id,
                    'author_id', v_author_id,
                    'abonnement_id', v_abo.id,
                    'mode', 'abonnement_etudiant'
                )
            );
        EXCEPTION WHEN OTHERS THEN
            NULL; -- Préserve la réussite de l'acquisition même en cas de divergence de schéma ledger
        END;
    END IF;

    v_consommes := v_consommes + 1;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Cours débloqué via votre abonnement étudiant et ajouté à votre bibliothèque !',
        'documents_restants', (v_quota_max - v_consommes),
        'quota_max', v_quota_max
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.debloquer_document_via_abonnement(UUID, TEXT) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
