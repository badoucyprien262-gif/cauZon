-- ==============================================================================
-- cauZon - SCRIPT SQL DE MISE À JOUR DU VRAI NOMBRE DE PAGES DES DOCUMENTS
-- Exécutez ce script dans l'Éditeur SQL de votre tableau de bord Supabase (SQL Editor)
-- ==============================================================================

-- 1. Afficher l'état actuel des documents pour vérification
SELECT id, titre, categorie, nombre_pages, taille_mo, file_path 
FROM public.documents 
ORDER BY created_at DESC;

-- 2. Exemple de mise à jour personnalisée par ID ou Titre de document
-- (Remplacez les titres/IDs et les nombres réels de pages selon vos vrais fichiers PDF)

-- Exemple : Mise à jour par mot-clé dans le titre
UPDATE public.documents
SET nombre_pages = 137
WHERE titre ILIKE '%droit constitutionnel%' OR titre ILIKE '%constitution%';

UPDATE public.documents
SET nombre_pages = 84
WHERE titre ILIKE '%droit civil%' OR titre ILIKE '%obligations%';

UPDATE public.documents
SET nombre_pages = 62
WHERE titre ILIKE '%droit administratif%';

UPDATE public.documents
SET nombre_pages = 48
WHERE titre ILIKE '%droit pénal%' OR titre ILIKE '%procédure pénale%';

UPDATE public.documents
SET nombre_pages = 95
WHERE titre ILIKE '%finances publiques%' OR titre ILIKE '%fiscalité%';

UPDATE public.documents
SET nombre_pages = 110
WHERE titre ILIKE '%histoire du droit%';

UPDATE public.documents
SET nombre_pages = 56
WHERE titre ILIKE '%relations internationales%' OR titre ILIKE '%droit international%';

-- 3. Mise à jour de sécurité générale pour tous les documents qui auraient encore la valeur par défaut
-- Vous pouvez définir les vraies valeurs selon les catégories ou cas par cas :
UPDATE public.documents
SET nombre_pages = CASE 
  WHEN categorie = 'Droit Public' THEN 128
  WHEN categorie = 'Droit Privé' THEN 96
  WHEN categorie = 'Sciences Politiques' THEN 74
  WHEN categorie = 'Économie & Gestion' THEN 88
  WHEN categorie = 'Histoire & Société' THEN 65
  ELSE 45
END
WHERE nombre_pages IS NULL OR nombre_pages = 15 OR nombre_pages = 10;

-- 4. Vérification finale des nouvelles valeurs mises à jour
SELECT id, titre, categorie, nombre_pages, taille_mo 
FROM public.documents 
ORDER BY nombre_pages DESC;
