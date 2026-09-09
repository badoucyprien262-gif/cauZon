-- ==============================================================================
-- 📁 SCRIPT SUPABASE : TABLE user_library_documents & BUCKET documents_utilisateurs
-- ==============================================================================

-- 1. Création de la table 'user_library_documents'
CREATE TABLE IF NOT EXISTS public.user_library_documents (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    folder_name TEXT NOT NULL DEFAULT 'Documents Personnels',
    file_path TEXT NOT NULL,
    bucket TEXT NOT NULL DEFAULT 'documents_utilisateurs',
    file_size_bytes BIGINT DEFAULT 0,
    page_count INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_library_docs_user_id ON public.user_library_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_library_docs_folder ON public.user_library_documents(user_id, folder_name);

ALTER TABLE public.user_library_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Les utilisateurs peuvent lire leurs propres documents"
ON public.user_library_documents
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Les utilisateurs peuvent insérer leurs propres documents"
ON public.user_library_documents
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Les utilisateurs peuvent modifier leurs propres documents"
ON public.user_library_documents
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Les utilisateurs peuvent supprimer leurs propres documents"
ON public.user_library_documents
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'documents_utilisateurs',
    'documents_utilisateurs',
    true,
    52428800,
    ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Utilisateurs authentifiés peuvent uploader dans documents_utilisateurs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents_utilisateurs');

CREATE POLICY "Accès en lecture aux documents_utilisateurs"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'documents_utilisateurs');

CREATE POLICY "Utilisateurs peuvent supprimer leurs fichiers de documents_utilisateurs"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'documents_utilisateurs');
