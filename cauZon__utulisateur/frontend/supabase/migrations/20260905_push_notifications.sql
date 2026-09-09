-- ==============================================================================
-- 📡 CauZon — Migration SQL : Notifications Push Supabase
-- Colonnes profiles (push_token, derniere_activite_notif) & Table push_tokens
-- À exécuter dans Supabase SQL Editor
-- ==============================================================================

-- 1. Ajout des colonnes requises dans la table profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_token TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS derniere_activite_notif TIMESTAMPTZ;

-- 2. Création de la table dédiée push_tokens pour tous les appareils
CREATE TABLE IF NOT EXISTS public.push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT UNIQUE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    push_token TEXT NOT NULL,
    plateforme TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Configuration Row Level Security (RLS)
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- 4. Politiques RLS pour autoriser l'enregistrement et la mise à jour (anon et authentifié)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'push_tokens' AND policyname = 'Lecture push_tokens pour tous'
    ) THEN
        CREATE POLICY "Lecture push_tokens pour tous"
            ON public.push_tokens FOR SELECT
            TO anon, authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'push_tokens' AND policyname = 'Insertion push_tokens pour tous'
    ) THEN
        CREATE POLICY "Insertion push_tokens pour tous"
            ON public.push_tokens FOR INSERT
            TO anon, authenticated
            WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'push_tokens' AND policyname = 'Mise à jour push_tokens pour tous'
    ) THEN
        CREATE POLICY "Mise à jour push_tokens pour tous"
            ON public.push_tokens FOR UPDATE
            TO anon, authenticated
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- 5. Index pour les recherches rapides et performances de ciblage
CREATE INDEX IF NOT EXISTS idx_push_tokens_device_id ON public.push_tokens(device_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON public.push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_push_token ON public.profiles(push_token);
