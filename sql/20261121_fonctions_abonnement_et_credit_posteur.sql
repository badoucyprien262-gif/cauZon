-- ==============================================================================
-- 🏛️ cauZon.ci — FONCTIONS RPC : GESTION ABONNEMENT 10 DOCS & CRÉDIT POSTEUR
-- Fichier : sql/20261121_fonctions_abonnement_et_credit_posteur.sql
-- ==============================================================================

-- 1. Fonction atomique d'incrément de solde posteur (appelée par le webhook ou l'app)
CREATE OR REPLACE FUNCTION public.incrementer_solde_posteur(
    p_posteur_id UUID,
    p_gain NUMERIC DEFAULT 50
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.posteurs_wallets (
        user_id,
        est_posteur_actif,
        solde_retirable,
        cumul_gains_historique,
        total_acquisitions_recues,
        quota_stockage_mo,
        espace_utilise_mo
    )
    VALUES (
        p_posteur_id,
        true,
        p_gain,
        p_gain,
        1,
        400.0,
        0.0
    )
    ON CONFLICT (user_id) DO UPDATE SET
        solde_retirable = public.posteurs_wallets.solde_retirable + p_gain,
        cumul_gains_historique = public.posteurs_wallets.cumul_gains_historique + p_gain,
        total_acquisitions_recues = public.posteurs_wallets.total_acquisitions_recues + 1,
        updated_at = now();
END;
$$;

-- 2. Fonction de déblocage d'un cours sous abonnement (10 documents autorisés)
-- RÈGLE STRICTE :
-- - Débloque le document avec `is_vip_consultation: true`
-- - Incrémente le solde du créateur (+50 FCFA)
-- - Si l'étudiant achète plus tard le document à 200 FCFA à l'acte, la ligne
--   passe à `is_vip_consultation: false` et ne sera JAMAIS re-verrouillée à l'échéance des 30 jours
CREATE OR REPLACE FUNCTION public.debloquer_document_via_abonnement(
    p_document_id UUID,
    p_device_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_abo RECORD;
    v_author_id UUID;
    v_deja_permanent BOOLEAN := false;
BEGIN
    -- A. Vérifier l'existence d'un abonnement actif avec quota disponible
    SELECT * INTO v_abo
    FROM public.abonnements_etudiants
    WHERE user_id = v_user_id 
      AND statut = 'actif' 
      AND date_fin > now()
    ORDER BY created_at DESC 
    LIMIT 1;

    IF v_abo IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Aucun abonnement étudiant actif trouvé.');
    END IF;

    -- B. Vérifier si l'étudiant n'a pas déjà acquis ce document à l'acte (permanent)
    SELECT EXISTS (
        SELECT 1 FROM public.acquisitions 
        WHERE document_id = p_document_id 
          AND user_id = v_user_id 
          AND is_vip_consultation = false
    ) INTO v_deja_permanent;

    IF v_deja_permanent THEN
        RETURN jsonb_build_object('success', true, 'message', 'Document déjà acquis définitivement dans votre bibliothèque.');
    END IF;

    -- C. Vérifier la limite des 10 documents
    IF CARDINALITY(v_abo.documents_debloques_ids) >= v_abo.quota_documents_autorises THEN
        RETURN jsonb_build_object('success', false, 'message', 'Quota de 10 documents atteint pour ce mois. Renouvelez votre abonnement pour débloquer 10 nouveaux cours.');
    END IF;

    -- D. Anti-auto-achat : l'utilisateur ne peut pas acquérir son propre document
    SELECT author_id INTO v_author_id FROM public.documents WHERE id = p_document_id;
    IF v_author_id IS NOT NULL AND v_author_id = v_user_id THEN
        RETURN jsonb_build_object('success', false, 'message', 'Vous ne pouvez pas acquérir votre propre document.');
    END IF;

    -- E. Si le document est déjà dans l'abonnement du mois
    IF p_document_id = ANY(v_abo.documents_debloques_ids) THEN
        RETURN jsonb_build_object('success', true, 'message', 'Document déjà débloqué sous votre abonnement.');
    END IF;

    -- F. Déblocage sous abonnement (is_vip_consultation: true)
    INSERT INTO public.acquisitions (
        document_id,
        user_id,
        device_id,
        is_welcome_offer,
        is_vip_consultation,
        montant_paye
    )
    VALUES (
        p_document_id,
        v_user_id,
        p_device_id,
        false,
        true, -- Marqué pour re-verrouillage à échéance si abonnement expiré
        0
    )
    ON CONFLICT (document_id, device_id) DO UPDATE SET
        is_vip_consultation = true,
        user_id = v_user_id;

    -- G. Mettre à jour l'abonnement (+1 document consommé)
    UPDATE public.abonnements_etudiants
    SET documents_debloques_ids = array_append(documents_debloques_ids, p_document_id),
        updated_at = now()
    WHERE id = v_abo.id;

    -- H. Créditer le posteur de +50 FCFA
    IF v_author_id IS NOT NULL THEN
        PERFORM public.incrementer_solde_posteur(v_author_id, 50);
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Document ajouté à votre bibliothèque via votre abonnement étudiant !',
        'documents_restants', (v_abo.quota_documents_autorises - CARDINALITY(v_abo.documents_debloques_ids) - 1)
    );
END;
$$;
