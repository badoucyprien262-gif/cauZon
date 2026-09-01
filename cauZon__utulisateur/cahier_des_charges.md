# Cahier des Charges - cauZon

Ce document répertorie l'ensemble des spécifications fonctionnelles, techniques et graphiques de l'application **cauZon** (version 1.0.0).

---

## 📱 1. Spécifications Techniques & Lancement

L'application est construite sur le framework **React Native** en utilisant **Expo SDK 54** et **React Native Web**. Cette stack technique permet de générer des applications mobiles natives (iOS et Android) ainsi qu'une version Web compatible PC (ordinateurs).

### Commandes de Lancement depuis le Terminal

Pour démarrer et tester l'application :

- **Sur Mobile (via l'application Expo Go)** :
  ```powershell
  npx expo start
  ```
  *Cette commande affiche un code QR dans la console. Scannez ce code QR avec l'appareil photo de votre smartphone ou l'application Expo Go pour lancer l'application en direct.*

- **Sur PC / Navigateur Web (Ordinateur)** :
  ```powershell
  npx expo start --web
  ```
  *Cette commande lance le support Web d'Expo et ouvre automatiquement le projet dans le navigateur web par défaut de votre ordinateur.*

---

## 🎨 2. Charte Graphique & Thèmes

cauZon intègre deux thèmes graphiques exclusifs :

### A. Thème Clair (Premium Warm)
- **Couleur Primaire (Rouge Vin)** : `#7F011F` (appliquée aux entêtes de pages, boutons principaux, et icônes actives).
- **Couleur d'Accentuation (Sable Clair)** : `#F5EBD0` (utilisée pour les badges de certification, boutons VIP et bordures).
- **Arrière-plan (Beige Doux)** : `#FAF6EB` (fond chaleureux adapté à l'apprentissage).
- **Cartes et Listes** : Blanc pur (`#FFFFFF`) pour un aspect clair et aéré.

### B. Thème Sombre Mat Chaleureux (Reposant)
Afin de respecter la consigne de ne contenir **aucune couleur originelle** (pas de Rouge Vin ni de Sable Clair de la version d'origine), le thème sombre est 100% mat et chaleureux pour éliminer la fatigue oculaire :
- **Fond principal** : Anthracite chaud mat (`#181615`).
- **Tuiles, Cartes et Onglets** : Gris-brun doux (`#22201E`).
- **Éléments d'accentuation et Textes principaux** : Blanc ivoire doux (`#E5DFD5`).
- **Textes secondaires** : Gris ardoise chaleureux (`#9E9790`).
- **Bordures** : Gris discret (`#2D2A28`).

---

## 📐 3. Dispositions Visuelles & Ergonomie

- **Contrainte Web (PC)** : L'application occupe 100% de la largeur d'écran disponible sur ordinateur. Le rendu s'ajuste dynamiquement via `useWindowDimensions()` en 3, 4 ou 5 colonnes pour exploiter l'espace du moniteur.
- **Gestion de l'Encoche (Samsung A55)** : Un décalage de marge supérieur (`paddingTop` basé sur `StatusBar.currentHeight` sur Android et `54` pixels sur iOS) est injecté dynamiquement dans les bandeaux d'en-tête pour repousser le titre **`cauZon`** et le bouton des paramètres sous la caméra frontale de l'appareil.
- **Affichage du Feed (Accueil)** : Les cartes de documents s'affichent sous forme de grille verticale de 2 colonnes sur mobile, et de 3 à 5 colonnes sur PC/Tablette, avec des bords arrondis soignés (`borderRadius: 16`) et un ombrage doux.

---

## 📁 4. Logique de la Bibliothèque Hors-ligne

La bibliothèque locale (`Bibliothèque`) organise l'ensemble des fichiers disponibles pour une lecture hors-ligne sans connexion internet :

- **Rangement Thématique** : Les documents ne sont plus présentés sous forme de liste globale. Ils sont **directement et uniquement rangés dans des dossiers thématiques cliquables** représentant leur catégorie (ex: *Mathématiques*, *Droit*, *Français*).
- **Navigation Drill-down** : L'utilisateur clique sur le dossier (ex: *Droit*), ce qui ouvre le dossier et affiche la liste des fichiers à l'intérieur. Un bouton de retour arrière (`←`) permet de revenir au répertoire principal des dossiers.
- **Recherche Ciblée** :
  - Sur l'écran des dossiers, la barre de recherche filtre les dossiers.
  - Dans la vue du dossier, la barre de recherche filtre spécifiquement les fichiers **de ce dossier**.
- **Jauge de Capacité d'Espace** : Indique le nombre de documents locaux possédés par rapport à la limite. Si la limite est atteinte, l'utilisateur doit acquérir l'extension.

---

## 💳 5. Offres Commerciales & Transactions

cauZon intègre trois offres distinctes de facturation avec des flux de paiement simulés par mobile money (Orange Money, Wave, MTN Mobile Money) :

1. **Achat Unique de Document (100 FCFA)** :
   - Débloque l'accès complet à un document (cours ou annale BAC/BEPC).
   - Un **cadeau de bienvenue** ("1er document offert sur cet appareil") s'active automatiquement lors du premier achat. Ce cadeau est validé par l'ID unique de l'appareil et se masque dès que l'utilisateur possède au moins un document débloqué.
2. **Abonnement mensuel Pass VIP (500 FCFA)** :
   - Offre des avantages Premium : 🚫 Zéro publicité, ♾️ Téléchargements illimités et support prioritaire.
   - *Note : L'avantage d'extension cloud a été retiré de cette offre et est réservé à l'achat d'extension.*
3. **Achat unique d'Extension de Capacité (1000 FCFA)** :
   - Augmente définitivement la limite de stockage cloud de la bibliothèque locale de **125 documents par défaut à 250 documents**.

---

## ⚙️ 6. Paramètres de l'Application

La modale des paramètres (accessible en cliquant sur le bouton de profil interactif en haut à droite de l'Accueil) propose les contrôles suivants :
- **Photo de Profil / Avatar** : Choix parmi 6 avatars académiques expressifs (👨‍🎓, 👩‍🎓, 🧑‍🔬, 📚, 💡, 💼) ou simulation d'import de photo personnalisée depuis l'appareil. La photo sélectionnée est affichée en temps réel en haut à droite de l'écran d'Accueil.
- **Profil Utilisateur** : Modification du **Nom d'utilisateur** et du **Numéro mobile de facturation** utilisé pour les transactions.
- **Sélecteur de Thème** : Un interrupteur à bascule pour activer/désactiver le Mode Sombre Monochrome en temps réel.
- **Abonnement VIP** : Affiche l'état de l'abonnement VIP (Actif / Inactif) et propose un bouton direct d'abonnement.
- **Réinitialisation Démo** : Un bouton pour remettre à zéro toutes les acquisitions de documents et les statuts d'offres pour recommencer les démonstrations.

---

## 📥 Téléchargements associés

- Le fichier PDF officiel est disponible en téléchargement dans votre répertoire racine sous le nom : [cahier_des_charges.pdf](file:///c:/Users/badou/cauZon/cahier_des_charges.pdf).
