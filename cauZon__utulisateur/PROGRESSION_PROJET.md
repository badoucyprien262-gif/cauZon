# 📈 Progression du Projet - cauZon

Ce document récapitule l'état d'avancement de l'application mobile **cauZon** (React Native / Expo / Supabase) à l'issue de notre session de travail du **3 août 2026**.

---

## 🚦 1. Statut Actuel du Projet

### A. Fonctionnalités Opérationnelles (Frontend & UX)
*   **Grille Dynamique & Responsive** : L'Écran d'Accueil et la Bibliothèque s'adaptent de manière fluide sur Web/PC et mobiles (recalcul en temps réel de 2 à 5 colonnes).
*   **Catalogue d'Accueil** : Connecté en temps réel à la table `documents` de Supabase avec un état de chargement et repli automatique.
*   **Bibliothèque Thématique** : Fichiers débloqués regroupés automatiquement par matière (dossiers virtuels) avec calcul de la jauge d'espace de stockage cloud.
*   **Déblocage & Cadeau de Bienvenue** : Gestion sécurisée de l'offre de bienvenue (premier document gratuit) indexée sur l'identifiant matériel unique (`device_id`).
*   **Lecteur PDF Hybride Sécurisé** : 
    *   **iOS/Web** : Rendu natif rapide via l'URL publique de stockage Supabase.
    *   **Android** : Rendu ultra-compatible et bypass de CORS grâce à l'intégration locale de **Mozilla PDF.js** dans la WebView.
    *   Indicateur de chargement (`ActivityIndicator`) et gestion des erreurs de lecture.

### B. Infrastructure & Synchronisation Supabase CLI
*   **Liaison Locale/Cloud** : Projet local VS Code lié à l'instance Cloud Supabase (`wdipnxewpmhdksrlisix`) via le CLI.
*   **Typage Strict** : Génération automatisée des types de la base de données distante dans **[supabase.ts](file:///c:/Users/badou/cauZon/frontend/src/types/supabase.ts)**.
*   **Visibilité Bucket** : Configuration du stockage `cours-documents` passée de **Privé** à **Public** via requêtes SQL d'administration, ouvrant l'accès direct aux fichiers.

---

## 🛠️ 2. Points Résolus Aujourd'hui

1.  **RLS & Correction d'Insertion (Device ID)** : Neutralisation des blocages de contraintes UUID lors de l'insertion d'acquisitions par des utilisateurs non connectés (invités).
2.  **Nettoyage Regex du File Path** : Intégration d'une regex robuste (`/^[\r\n]+|[\r\n]+$/g`) dans le service pour éliminer les sauts de ligne parasites (`%0D%0A`) au début/fin du chemin de fichier.
3.  **Correction d'Encodage et de Cache du Visualiseur** : Retrait des query parameters obsolètes qui provoquaient des erreurs de décodage (400 Bad Request) sur le serveur de stockage.
4.  **Base de Données Corrigée** : Mise à jour SQL de la ligne corrompue dans la table `documents` (`visily-multiscreens.pdf` ➔ `Avisily-multiscreens.pdf`) pour la faire correspondre au nom stocké dans Supabase Storage.

---

## 🗺️ 3. Feuille de Route pour Demain

### 📅 Étape 1 : Gestion des Accès Restreints (Aperçu)
*   Implémenter la limitation à **3 pages maximum** de lecture pour les fichiers non débloqués/non achetés.
*   Interdire le téléchargement complet ou le défilement au-delà de la limite d'aperçu dans l'écran de lecture WebView.

### 📅 Étape 2 : Passerelle de Paiement Mobile Money
*   Intégration du module d'achat direct à **100 FCFA** par document.
*   Mise en place de l'API de paiement (ex: **Wave**, **CinetPay** ou **Orange Money / MTN**) avec callback webhook pour l'enregistrement automatique de la transaction dans `acquisitions`.

### 📅 Étape 3 : Authentification Utilisateur Supabase Auth
*   Interface d'Inscription/Connexion par email ou numéro de téléphone (OTP).
*   Migration transparente des documents débloqués en mode invité (liés au `device_id`) vers le compte utilisateur permanent à la création.
