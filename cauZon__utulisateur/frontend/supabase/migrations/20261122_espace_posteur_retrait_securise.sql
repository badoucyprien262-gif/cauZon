-- ==============================================================================
-- 🎬 cauZon.ci — MIGRATION ÉTAPE 4 : ESPACE POSTEUR, RETRAIT SÉCURISÉ & DURCISSEMENT RLS
-- Fichier : supabase/migrations/20261122_espace_posteur_retrait_securise.sql
-- À exécuter APRÈS 20261121_fondations_fintech_quotas_et_roles.sql
-- ==============================================================================
-- 1. Durcissement : un posteur ne peut PLUS modifier directement son solde / quota
--    (la policy de l'étape 1 autorisait UPDATE sur toutes les colonnes de sa ligne).
-- 2. RPC activer_espace_posteur()  : active le statut posteur (cumul avec lambda).
-- 3. RPC demander_retrait_posteur() : débit atomique + idempotent (service_role only).
-- 4. RPC finaliser_retrait_posteur(): clôture (succès -> ledger / échec -> re-crédit).
-- Aucun numéro de téléphone n'est stocké : il transite uniquement par l'Edge Function.
-- ==============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DURCISSEMENT DES DROITS SUR posteurs_wallets
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE ON public.posteurs_wallets FROM anon, authenticated;
GRANT SELECT ON public.posteurs_wallets TO anon, authenticated;
-- Seules les colonnes d'identité publique sont modifiables par le posteur lui-même
GRANT UPDATE (pseudo_createur, bio_createur, avatar_url) ON public.posteurs_wallets TO authenticated;

-- Les demandes de retrait ne peuvent plus être insérées directement par le client :
-- elles passent exclusivement par la RPC (débit du solde atomique côté serveur).
DROP POLICY IF EXISTS "Le posteur cree une demande de retrait valide" ON public.demandes_retrait_posteurs;
REVOKE INSERT, UPDATE, DELETE ON public.demandes_retrait_posteurs FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ACTIVATION DE L'ESPACE POSTEUR (cumul avec le statut lambda)
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
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentification requise.');
    END IF;

    INSERT INTO public.posteurs_wallets (user_id, est_posteur_actif, pseudo_createur, bio_createur, avatar_url)
    VALUES (v_uid, true, NULLIF(trim(p_pseudo), ''), NULLIF(trim(p_bio), ''), p_avatar_url)
    ON CONFLICT (user_id) DO UPDATE SET
        est_posteur_actif = true,
        pseudo_createur = COALESCE(NULLIF(trim(p_pseudo), ''), public.posteurs_wallets.pseudo_createur),
        bio_createur = COALESCE(NULLIF(trim(p_bio), ''), public.posteurs_wallets.bio_createur),
        avatar_url = COALESCE(p_avatar_url, public.posteurs_wallets.avatar_url),
        updated_at = now();

    RETURN jsonb_build_object('success', true, 'message', 'Espace posteur activé.');
END;
$$;

REVOKE ALL ON FUNCTION public.activer_espace_posteur(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activer_espace_posteur(TEXT, TEXT, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. DEMANDE DE RETRAIT : DÉBIT ATOMIQUE + IDEMPOTENT (service_role uniquement)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.demander_retrait_posteur(
    p_posteur_id UUID,
    p_montant NUMERIC,
    p_operateur TEXT,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wallet RECORD;
    v_existante RECORD;
    v_id UUID;
BEGIN
    IF p_montant IS NULL OR p_montant < 5000 THEN
        RETURN jsonb_build_object('success', false, 'code', 'SEUIL', 'message', 'Le montant minimum de retrait est de 5 000 FCFA.');
    END IF;
    IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
        RETURN jsonb_build_object('success', false, 'code', 'IDEMPOTENCE', 'message', 'Clé d''idempotence invalide.');
    END IF;

    -- Idempotence : même clé => même résultat, aucun second débit
    SELECT * INTO v_existante FROM public.demandes_retrait_posteurs WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_existante.posteur_id <> p_posteur_id THEN
            RETURN jsonb_build_object('success', false, 'code', 'IDEMPOTENCE', 'message', 'Clé d''idempotence déjà utilisée.');
        END IF;
        RETURN jsonb_build_object('success', true, 'deja_traite', true, 'demande_id', v_existante.id, 'statut', v_existante.statut);
    END IF;

    -- Verrouillage de la ligne portefeuille (anti double retrait concurrent)
    SELECT * INTO v_wallet FROM public.posteurs_wallets WHERE user_id = p_posteur_id FOR UPDATE;
    IF NOT FOUND OR v_wallet.est_posteur_actif IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'code', 'STATUT', 'message', 'Espace posteur non activé.');
    END IF;
    IF v_wallet.solde_retirable < p_montant THEN
        RETURN jsonb_build_object('success', false, 'code', 'SOLDE', 'message', 'Solde retirable insuffisant.');
    END IF;

    UPDATE public.posteurs_wallets
    SET solde_retirable = solde_retirable - p_montant, updated_at = now()
    WHERE user_id = p_posteur_id;

    INSERT INTO public.demandes_retrait_posteurs (posteur_id, montant, operateur, statut, idempotency_key)
    VALUES (p_posteur_id, p_montant, p_operateur, 'en_traitement', p_idempotency_key)
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('success', true, 'demande_id', v_id, 'statut', 'en_traitement');
END;
$$;

REVOKE ALL ON FUNCTION public.demander_retrait_posteur(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demander_retrait_posteur(UUID, NUMERIC, TEXT, TEXT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. FINALISATION DU RETRAIT (succès => ledger ; échec => re-crédit du solde)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finaliser_retrait_posteur(
    p_demande_id UUID,
    p_succes BOOLEAN,
    p_reference_payout TEXT DEFAULT NULL,
    p_motif TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_dem RECORD;
BEGIN
    SELECT * INTO v_dem FROM public.demandes_retrait_posteurs WHERE id = p_demande_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Demande introuvable.');
    END IF;
    -- Idempotence : une demande déjà clôturée n'est jamais retraitée
    IF v_dem.statut NOT IN ('en_traitement', 'en_attente') THEN
        RETURN jsonb_build_object('success', true, 'deja_traite', true, 'statut', v_dem.statut);
    END IF;

    IF p_succes THEN
        UPDATE public.demandes_retrait_posteurs
        SET statut = 'valide', reference_feexpay_payout = p_reference_payout, traite_le = now(), updated_at = now()
        WHERE id = p_demande_id;

        INSERT INTO public.ledger_transactions (
            idempotency_key, reference_externe, type_operation, posteur_id,
            montant_brut, part_posteur, part_cauzon_brute, frais_passerelle_estimes, part_cauzon_nette,
            statut, metadata
        ) VALUES (
            'payout:' || p_demande_id::text, p_reference_payout, 'retrait_posteur', v_dem.posteur_id,
            v_dem.montant, 0, 0, 0, 0, 'complete',
            jsonb_build_object('operateur', v_dem.operateur)
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    ELSE
        UPDATE public.demandes_retrait_posteurs
        SET statut = 'rejete', motif_rejet = left(p_motif, 300), traite_le = now(), updated_at = now()
        WHERE id = p_demande_id;

        -- Re-crédit intégral du solde débité
        UPDATE public.posteurs_wallets
        SET solde_retirable = solde_retirable + v_dem.montant, updated_at = now()
        WHERE user_id = v_dem.posteur_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'statut', CASE WHEN p_succes THEN 'valide' ELSE 'rejete' END);
END;
$$;

REVOKE ALL ON FUNCTION public.finaliser_retrait_posteur(UUID, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finaliser_retrait_posteur(UUID, BOOLEAN, TEXT, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
