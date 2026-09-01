-- ==============================================================================
-- 🛡️ cauZon - SUPPRESSION DE COMPTE (DROIT À L'OUBLI) & TRAÇABILITÉ ANTI-ABUS DEVICE ID
-- ==============================================================================

-- 1. Table d'archivage anonymisé des empreintes matérielles (Device ID)
CREATE TABLE IF NOT EXISTS public.appareils_historique_bienvenue (
    device_id TEXT PRIMARY KEY,
    a_consomme_offre_bienvenue BOOLEAN DEFAULT TRUE,
    date_premier_deblocage TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    date_derniere_suppression TIMESTAMP WITH TIME ZONE,
    nombre_suppressions_compte INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index pour recherche instantanée O(1)
CREATE INDEX IF NOT EXISTS idx_appareils_device_id ON public.appareils_historique_bienvenue(device_id);

-- Activation RLS
ALTER TABLE public.appareils_historique_bienvenue ENABLE ROW LEVEL SECURITY;

-- Politiques RLS
DROP POLICY IF EXISTS "Lecture publique table appareils" ON public.appareils_historique_bienvenue;
CREATE POLICY "Lecture publique table appareils"
    ON public.appareils_historique_bienvenue FOR SELECT
    TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS "Modification admin table appareils" ON public.appareils_historique_bienvenue;
CREATE POLICY "Modification admin table appareils"
    ON public.appareils_historique_bienvenue FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 2. Fonction RPC : Suppression de compte avec Droit à l'Oubli et Enregistrement du Device ID
CREATE OR REPLACE FUNCTION public.supprimer_mon_compte_et_archiver_device(p_device_id TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_a_consomme BOOLEAN := FALSE;
BEGIN
    v_user_id := auth.uid();
    
    -- A. Vérifier si l'utilisateur ou l'appareil avait consommé l'offre de bienvenue
    IF EXISTS (
        SELECT 1 FROM public.acquisitions 
        WHERE (user_id = v_user_id OR device_id = p_device_id) AND is_welcome_offer = true
    ) OR EXISTS (
        SELECT 1 FROM public.appareils_historique_bienvenue
        WHERE device_id = p_device_id AND a_consomme_offre_bienvenue = true
    ) THEN
        v_a_consomme := TRUE;
    END IF;

    -- B. Enregistrer / Mettre à jour l'empreinte anonymisée du Device ID (sans email, sans nom)
    IF p_device_id IS NOT NULL AND trim(p_device_id) != '' THEN
        INSERT INTO public.appareils_historique_bienvenue (
            device_id, 
            a_consomme_offre_bienvenue, 
            date_derniere_suppression, 
            nombre_suppressions_compte
        )
        VALUES (
            p_device_id, 
            v_a_consomme, 
            timezone('utc'::text, now()), 
            1
        )
        ON CONFLICT (device_id) DO UPDATE SET
            a_consomme_offre_bienvenue = (appareils_historique_bienvenue.a_consomme_offre_bienvenue OR v_a_consomme),
            date_derniere_suppression = timezone('utc'::text, now()),
            nombre_suppressions_compte = appareils_historique_bienvenue.nombre_suppressions_compte + 1;
    END IF;

    -- C. Purger les données personnelles de l'utilisateur (profiles & auth.users)
    IF v_user_id IS NOT NULL THEN
        -- Supprimer les acquisitions liées au user_id
        DELETE FROM public.acquisitions WHERE user_id = v_user_id;
        
        -- Supprimer le profil personnel
        DELETE FROM public.profiles WHERE id = v_user_id;
        
        -- Supprimer de auth.users (Droit à l'oubli intégral)
        DELETE FROM auth.users WHERE id = v_user_id;
    END IF;

    -- Supprimer les acquisitions locales liées à ce device_id
    IF p_device_id IS NOT NULL AND trim(p_device_id) != '' THEN
        DELETE FROM public.acquisitions WHERE device_id = p_device_id;
    END IF;

    RETURN json_build_object(
        'success', true, 
        'message', 'Compte personnel et données personnelles purgées avec succès. Empreinte anonymisée mise à jour.'
    );
END;
$$;

-- 3. Fonction RPC : Vérification de l'éligibilité à l'Offre de Bienvenue
CREATE OR REPLACE FUNCTION public.verifier_eligibilite_offre_bienvenue(p_device_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_device_id IS NULL OR trim(p_device_id) = '' THEN
        RETURN FALSE;
    END IF;

    -- Si l'appareil est déjà dans l'historique d'archivage avec offre consommée
    IF EXISTS (
        SELECT 1 FROM public.appareils_historique_bienvenue 
        WHERE device_id = p_device_id AND a_consomme_offre_bienvenue = TRUE
    ) THEN
        RETURN FALSE;
    END IF;

    -- Si l'appareil a déjà une acquisition d'offre de bienvenue active
    IF EXISTS (
        SELECT 1 FROM public.acquisitions 
        WHERE device_id = p_device_id AND is_welcome_offer = TRUE
    ) THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$;

-- 4. Fonction RPC : Déblocage Atomique & Inviolable de l'Offre de Bienvenue
CREATE OR REPLACE FUNCTION public.debloquer_offre_bienvenue_securisee(
    p_document_id TEXT,
    p_device_id TEXT
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    IF p_device_id IS NULL OR trim(p_device_id) = '' THEN
        RETURN json_build_object('success', false, 'paywallRequired', true, 'message', 'Identifiant appareil manquant.');
    END IF;

    -- Vérification 1 : Historique d'archivage des Device IDs (même après réinstallation/suppression)
    IF EXISTS (
        SELECT 1 FROM public.appareils_historique_bienvenue
        WHERE device_id = p_device_id AND a_consomme_offre_bienvenue = TRUE
    ) THEN
        RETURN json_build_object(
            'success', false,
            'paywallRequired', true,
            'code', 'DEVICE_DEJA_UTILISE',
            'message', 'Offre de bienvenue déjà consommée sur cet appareil.'
        );
    END IF;

    -- Vérification 2 : Table des acquisitions actives
    IF EXISTS (
        SELECT 1 FROM public.acquisitions
        WHERE device_id = p_device_id AND is_welcome_offer = TRUE
    ) THEN
        -- Marquer rétroactivement dans l'historique d'archivage pour consolidation
        INSERT INTO public.appareils_historique_bienvenue (device_id, a_consomme_offre_bienvenue)
        VALUES (p_device_id, true)
        ON CONFLICT (device_id) DO UPDATE SET a_consomme_offre_bienvenue = true;

        RETURN json_build_object(
            'success', false,
            'paywallRequired', true,
            'code', 'DEVICE_DEJA_UTILISE',
            'message', 'Offre de bienvenue déjà consommée sur cet appareil.'
        );
    END IF;

    -- Enregistrement atomique de l'offre de bienvenue dans acquisitions
    INSERT INTO public.acquisitions (
        document_id,
        device_id,
        user_id,
        is_welcome_offer,
        is_vip_consultation,
        montant_paye
    )
    VALUES (
        p_document_id,
        p_device_id,
        v_user_id,
        true,
        false,
        0
    )
    ON CONFLICT (document_id, device_id) DO NOTHING;

    -- Enregistrement définitif et permanent dans l'historique d'archivage
    INSERT INTO public.appareils_historique_bienvenue (
        device_id,
        a_consomme_offre_bienvenue,
        date_premier_deblocage
    )
    VALUES (
        p_device_id,
        true,
        timezone('utc'::text, now())
    )
    ON CONFLICT (device_id) DO UPDATE SET
        a_consomme_offre_bienvenue = true;

    RETURN json_build_object(
        'success', true,
        'message', 'Félicitations ! Votre 1er document offert a été débloqué 🎉'
    );
END;
$$;
