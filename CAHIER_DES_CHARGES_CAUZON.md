# 📄 Cahier des Charges Global - cauZon

Ce cahier des charges dresse les spécifications fonctionnelles et techniques complètes de la plateforme éducative **cauZon** (Application Utilisateur Mobile et Application Administrateur Web).

---

## 🎨 Charte Graphique & Identité (Commune)
*   **Logo / Marque** : cauZon (Z majuscule).
*   **Couleur Primaire** : Bordeaux (`#6B1124`) - Représente la rigueur et l'excellence académique.
*   **Couleur Secondaire / Accent** : Or / Sable Chaud (`#E5C158` / `#FAF6EB`).
*   **Fonds Sombre (Mode Mat Reposant)** : Anthracite mat chaud (`#181615`), cartes (`#22201E`), textes ivoire (`#E5DFD5`).
*   **Polices** : Inter, Outfit ou sans-serif système moderne.

---

## 📱 VOLET 1 : APPLICATION UTILISATEUR (`cauZon__ utulisateur`)

L'application mobile (iOS/Android/Web) s'adresse aux élèves et étudiants pour la consultation et l'acquisition de supports d'études certifiés.

### 1.1 Catalogue & Recherche Dynamique
*   **Grille Adaptative** : Affichage responsive en grille fluide (2 à 5 colonnes) selon la taille d'écran.
*   **Filtre Catégoriel** : Navigation rapide par matières / filières.
*   **Badges de Certification** :
    *   Pastille visuelle sur la carte du document : **« Certifié »** ou **« Certifié par [Nom Entité / Professeur] »**.

### 1.2 Lecteur PDF Hybride Sécurisé
*   **Rendu Multiplateforme** :
    *   *iOS/Web* : Affichage PDF natif via WebView.
    *   *Android* : Intégration locale sécurisée de **Mozilla PDF.js** dans la WebView pour contourner les bogues d'affichage et de CORS.
*   **Aperçu Limité** : Rendu des 3 premières pages max si non débloqué.

### 1.3 Système d'Acquisition & Offre de Bienvenue
*   **Déblocage Matériel (Device ID)** : Temps de déblocage automatique du 1er cours gratuit par téléphone via l'identifiant matériel (`expo-application`), permettant le déblocage en mode invité.
*   **Paiement Mobile Money** : Achat des cours suivants au tarif unique de **100 FCFA** par document.

### 1.4 Espace Commentaires & Notifications
*   **Système de Retours Privés** (Paramètres > Écrire à l'Équipe) :
    *   Formulaire d'envoi de messages d'amélioration ou de signalements.
    *   **Badge Rouge de Notification** : Pastille d'alerte sur l'onglet Paramètres/Commentaires indiquant la réception d'une réponse de l'équipe administrative.
*   **Centre d'Annonces Publiques** : Onglet distinct affichant les communiqués globaux, bannières d'alerte ou annonces de nouveaux cours.

---

## 💻 VOLET 2 : APPLICATION ADMINISTRATEUR (`administrateur_cauZon`)

L'application d'administration (Web Desktop Responsive) permet aux équipes pédagogiques et techniques de piloter la plateforme de façon centralisée.

### 2.1 Interface & Accès Sécurisé
*   **Design & Navigation** :
    *   Web Desktop en bordeaux `#6B1124` avec Sidebar latérale fluide et pliable.
    *   Cartes de statistiques en haut de page (Revenus, Téléchargements, Nouveaux comptes, Fichiers en attente).
*   **Sécurité d'Accès** :
    *   Authentification forte à l'entrée par Clé d'Accès unique / Code Secret d'administration configuré via les variables d'environnement (`.env`).

### 2.2 Assistant d'Upload PDF Pas-à-Pas (Wizard)
Formulaire dynamique par étapes pour la création de cours sans erreur :
*   *Étape 1* : Métadonnées de base (Titre, Description courte, Matière/Catégorie).
*   *Étape 2* : Détails de tarification & Limites (Prix en FCFA, Nombre de pages d'aperçu gratuit autorisées).
*   *Étape 3* : Fichier PDF (Zone de glisser-déposer du document PDF brut, téléversé vers Supabase Storage).
*   *Étape 4* : Certification (Choix du type de badge de certification et signature de validation).

### 2.3 Gestion du Catalogue
*   **Tableau de Bord dynamique** : Recherche instantanée, filtres par matière, pagination.
*   **Actions directes** : Édition des métadonnées, mise à jour du fichier PDF, masquage temporaire ou suppression définitive.

### 2.4 Classement de Performance des Documents
*   Module listant l'ensemble des cours triés par taux de déblocage / nombre de lectures.
*   Affichage d'un classement exhaustif du **Rang #1 au Rang #N** pour identifier instantanément les contenus les plus attractifs.

### 2.5 Module de Modération des Utilisateurs
*   Moteur de recherche par numéro de téléphone ou identifiant d'appareil (`device_id`).
*   **Actions de modération** :
    *   Consultation de l'historique d'acquisitions.
    *   Réinitialisation de l'Offre de Bienvenue de l'appareil (pour accorder un nouveau cadeau).
    *   Suppression définitive de compte ou bannissement de l'appareil.

### 2.6 Configuration Générale
*   Modification globale du prix par défaut des cours (ex: 100 FCFA).
*   Interrupteur (Bouton ON/OFF) global pour désactiver/activer l'Offre de Bienvenue sur l'ensemble de la plateforme.
*   Éditeur de bannière d'alerte publique pour diffusion instantanée sur les mobiles des utilisateurs.

### 2.7 Boite de Réception des Commentaires (Feedback Hub)
*   Visualisation de tous les commentaires envoyés par les élèves.
*   Espace de téléchargement des PDF joints ou captures d'écran transmises par les élèves.
*   **Module de Réponse Privée** : Formulaire permettant d'envoyer une réponse textuelle ou un fichier d'aide directement à l'élève (qui verra la pastille rouge sur son application mobile).

### 2.8 Bilan Financier & Export
*   Graphes d'évolution des ventes journalières, hebdomadaires et mensuelles.
*   Module d'export comptable complet au format **CSV et Excel** de l'ensemble des transactions enregistrées.
