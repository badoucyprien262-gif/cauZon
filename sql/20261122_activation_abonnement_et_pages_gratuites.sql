-- ==============================================================================
-- 🏛️ cauZon.ci — MIGRATION : ACTIVATION ABONNEMENT RPC & SÉLECTEUR PAGES GRATUITES
-- Fichier : sql/20261122_activation_abonnement_et_pages_gratuites.sql
-- ==============================================================================

-- 1. Ajout de la colonne pages_gratuites sur public.documents si non existante
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS pages_gratuites INT DEFAULT 1;

-- Synchroniser les données existantes
UPDATE public.documents 
SET pages_gratuites = COALESCE(limite_apercu_pages, 1) 
WHERE pages_gratuites IS NULL;

-- 2. Fonction RPC sécurisée d'activation d'abonnement étudiant (1 000 FCFA / 10 cours / 30 jours)
-- Exécutable par tout utilisateur connecté (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.activer_abonnement_etudiant(
    p_montant NUMERIC DEFAULT 1000,
    p_reference TEXT DEFAULT NULL,
    p_operateur TEXT DEFAULT 'mobile_money'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_date_fin TIMESTAMPTZ;
    v_abo_id UUID;
    v_ref TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Utilisateur non authentifié.');
    END IF;

    -- Génération de référence si absente
    v_ref := COALESCE(p_reference, 'FP_SUB_' || extract(epoch from now())::bigint || '_' || substr(v_user_id::text, 1, 8));
    v_date_fin := now() + interval '30 days';

    -- 1. Clôturer tout ancien abonnement actif pour cet utilisateur
    UPDATE public.abonnements_etudiants
    SET statut = 'expire',
        updated_at = now()
    WHERE user_id = v_user_id AND statut = 'actif';

    -- 2. Créer le nouvel abonnement étudiant (10 documents)
    INSERT INTO public.abonnements_etudiants (
        user_id,
        formule,
        montant_paye,
        date_debut,
        date_fin,
        quota_documents_autorises,
        documents_debloques_ids,
        statut,
        reference_paiement_feexpay,
        created_at
    )
    VALUES (
        v_user_id,
        'mensuel_1000',
        COALESCE(p_montant, 1000),
        now(),
        v_date_fin,
        10,
        '{}',
        'actif',
        v_ref,
        now()
    )
    RETURNING id INTO v_abo_id;

    -- 3. Synchroniser la table public.profiles
    UPDATE public.profiles
    SET has_vip_pass = true,
        vip_expiration_date = v_date_fin,
        updated_at = now()
    WHERE id = v_user_id;

    -- 4. Écriture comptable dans public.ledger_transactions
    INSERT INTO public.ledger_transactions (
        idempotency_key,
        reference_externe,
        type_operation,
        user_id,
        montant_brut,
        part_posteur,
        part_cauzon_brute,
        frais_passerelle_estimes,
        part_cauzon_nette,
        statut,
        metadata
    )
    VALUES (
        v_ref,
        v_ref,
        'abonnement_mensuel',
        v_user_id,
        COALESCE(p_montant, 1000),
        0,
        COALESCE(p_montant, 1000),
        round(COALESCE(p_montant, 1000) * 0.02),
        COALESCE(p_montant, 1000) - round(COALESCE(p_montant, 1000) * 0.02),
        'complete',
        jsonb_build_object(
            'quota', 10,
            'date_fin', v_date_fin,
            'operateur', p_operateur,
            'abonnement_id', v_abo_id
        )
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Abonnement étudiant activé avec succès (10 documents valables 30 jours).',
        'date_fin', v_date_fin,
        'quota_restant', 10,
        'abonnement_id', v_abo_id
    );
END;
$$;

-- Droits d'exécution
GRANT EXECUTE ON FUNCTION public.activer_abonnement_etudiant(NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activer_abonnement_etudiant(NUMERIC, TEXT, TEXT) TO anon;

-- Rafraîchir le schéma PostgREST
NOTIFY pgrst, 'reload schema';
