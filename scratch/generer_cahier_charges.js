const fs = require('fs');
const path = require('path');
const jspdfPath = path.resolve(__dirname, '../administrateur_cauZon/node_modules/jspdf');
const { jsPDF } = require(jspdfPath);

function genererCahierDesChargesPdf() {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 18;
  const contentWidth = pageWidth - marginX * 2;
  let currentY = 20;

  // Couleurs de la charte cauZon
  const BURGUNDY = [107, 17, 36];     // #6B1124
  const GOLD = [217, 119, 6];         // #D97706
  const EMERALD = [16, 185, 129];     // #10B981
  const TEXT_DARK = [31, 41, 55];     // #1F2937
  const TEXT_MUTED = [107, 114, 128]; // #6B7280
  const CARD_BG = [248, 250, 252];    // #F8FAFC
  const LINE_BORDER = [226, 232, 240];// #E2E8F0

  function checkNewPage(neededSpace = 25) {
    if (currentY + neededSpace > pageHeight - 20) {
      doc.addPage();
      currentY = 22;
      drawHeaderFooter();
    }
  }

  function drawHeaderFooter() {
    const pageNum = doc.internal.getNumberOfPages();
    
    // Header (pages > 1)
    if (pageNum > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...TEXT_MUTED);
      doc.text('cauZon.ci — Cahier des Charges Technique & Spécifications Opérationnelles', marginX, 12);
      doc.setDrawColor(...LINE_BORDER);
      doc.setLineWidth(0.3);
      doc.line(marginX, 14, pageWidth - marginX, 14);
    }

    // Footer (all pages)
    doc.setDrawColor(...LINE_BORDER);
    doc.setLineWidth(0.3);
    doc.line(marginX, pageHeight - 12, pageWidth - marginX, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Confidentiel — cauZon Plateforme Académique 2026', marginX, pageHeight - 8);
    const pageStr = `Page ${pageNum}`;
    const pageStrWidth = doc.getTextWidth(pageStr);
    doc.text(pageStr, pageWidth - marginX - pageStrWidth, pageHeight - 8);
  }

  function drawSectionTitle(num, title) {
    checkNewPage(18);
    currentY += 4;
    doc.setFillColor(...BURGUNDY);
    doc.rect(marginX, currentY, 4, 10, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...BURGUNDY);
    doc.text(`${num}. ${title.toUpperCase()}`, marginX + 7, currentY + 7);
    currentY += 14;
  }

  function drawSubSectionTitle(title) {
    checkNewPage(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...GOLD);
    doc.text(title, marginX, currentY);
    currentY += 6;
  }

  function drawParagraph(text, isBold = false) {
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_DARK);
    const splitLines = doc.splitTextToSize(text, contentWidth);
    const blockHeight = splitLines.length * 4.5;
    checkNewPage(blockHeight + 4);
    doc.text(splitLines, marginX, currentY);
    currentY += blockHeight + 2;
  }

  function drawBulletPoint(label, desc) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...BURGUNDY);
    const bullet = '• ';
    const labelText = bullet + label + ' : ';
    const labelWidth = doc.getTextWidth(labelText);

    checkNewPage(10);
    doc.text(labelText, marginX, currentY);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_DARK);
    const remainingWidth = contentWidth - labelWidth;
    const descLines = doc.splitTextToSize(desc, remainingWidth);

    if (descLines.length === 1) {
      doc.text(descLines[0], marginX + labelWidth, currentY);
      currentY += 5;
    } else {
      doc.text(descLines[0], marginX + labelWidth, currentY);
      currentY += 4.5;
      for (let i = 1; i < descLines.length; i++) {
        checkNewPage(6);
        doc.text(descLines[i], marginX + 6, currentY);
        currentY += 4.5;
      }
      currentY += 1.5;
    }
  }

  function drawStatusBox(moduleName, state, details) {
    checkNewPage(24);
    let badgeColor = [107, 114, 128]; // À faire (Gris)
    let badgeText = 'À FAIRE';
    if (state === 'fait') {
      badgeColor = [16, 185, 129];
      badgeText = 'FAIT / EN PLACE';
    } else if (state === 'pret') {
      badgeColor = [16, 185, 129];
      badgeText = 'VALIDE / PRÊT SQL';
    } else if (state === 'encours') {
      badgeColor = [217, 119, 6];
      badgeText = 'EN COURS / PARTIEL';
    } else if (state === 'a_remplacer') {
      badgeColor = [220, 38, 38];
      badgeText = 'À ADAPTER / CHANGER';
    }

    doc.setFillColor(...CARD_BG);
    doc.setDrawColor(...LINE_BORDER);
    doc.roundedRect(marginX, currentY, contentWidth, 20, 2, 2, 'FD');

    // Titre module
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...TEXT_DARK);
    doc.text(moduleName, marginX + 4, currentY + 6);

    // Badge
    doc.setFillColor(...badgeColor);
    doc.roundedRect(marginX + contentWidth - 52, currentY + 2.5, 48, 5.5, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(255, 255, 255);
    doc.text(badgeText, marginX + contentWidth - 50, currentY + 6.3);

    // Détails
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    const detailLines = doc.splitTextToSize(details, contentWidth - 8);
    doc.text(detailLines.slice(0, 2), marginX + 4, currentY + 12);

    currentY += 23;
  }

  // ==========================================
  // PAGE 1 : COUVERTURE & RÉSUMÉ EXÉCUTIF
  // ==========================================
  // Bandeau supérieur
  doc.setFillColor(...BURGUNDY);
  doc.rect(0, 0, pageWidth, 55, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(255, 255, 255);
  doc.text('cauZon.ci', marginX, 26);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(250, 246, 235);
  doc.text('Plateforme Académique & Écosystème Sécurisé de Partage Universitaire', marginX, 35);

  doc.setFontSize(9);
  doc.setTextColor(220, 200, 205);
  doc.text('DOCUMENT OFFICIEL : CAHIER DES CHARGES TECHNIQUE & SUIVI D\'IMPLÉMENTATION', marginX, 45);

  currentY = 66;

  // Encadré métadonnées
  doc.setFillColor(...CARD_BG);
  doc.setDrawColor(...LINE_BORDER);
  doc.roundedRect(marginX, currentY, contentWidth, 22, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...BURGUNDY);
  doc.text('MÉTADONNÉES DU PROJET & SUIVI D\'AVANCEMENT', marginX + 4, currentY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_DARK);
  doc.text('Date de référence : 22 Novembre 2026   |   Statut : Étapes 1 à 4 validées + Feuilletage complet abonné & Correctif publication validés', marginX + 4, currentY + 12);
  doc.text('Version : 3.15.1 (Compatibilité stricte vue classement_documents ; Typage UUID natif & Overload TEXT ; Auto-guérison VIP)', marginX + 4, currentY + 17);

  currentY += 30;

  drawSectionTitle('1', 'Résumé Exécutif & Vision de cauZon');
  drawParagraph(
    'cauZon est une infrastructure académique conçue pour la Côte d\'Ivoire et la zone UEMOA, combinant une application mobile/PWA ultra-rapide et un tableau de bord d\'administration centralisé. Son objectif est de démocratiser l\'accès aux ressources universitaires tout en garantissant une rétribution juste et sécurisée des créateurs de contenu (étudiants d\'élite, enseignants, délégués et associations d\'étudiants).'
  );
  drawParagraph(
    'Le présent cahier des charges consacre la mise à jour des règles fondamentales : réévaluation de l\'achat à l\'acte à 200 FCFA, abonnement mensuel calibré à 1 000 FCFA / 10 documents avec verrouillage à échéance, création du double statut utilisateur (consommateur lambda + posteur créateur type profil TikTok), seuil de retrait sécurisé à 5 000 FCFA, optimisation du rendu PDF sans extraction brute et architecture fintech étanche articulée avec FeexPay et Supabase Realtime.'
  );

  drawSectionTitle('2', 'État des Lieux du Dépôt & Cartographie Réelle');
  drawParagraph('Le scan approfondi du code source et de l\'infrastructure Git/Vercel révèle l\'organisation suivante :');

  drawBulletPoint('Architecture Git Monorepo', 'Dépôt unique localisé à la racine (c:\\Users\\badou\\creation__cauZon\\.git, remote origin sur github.com/badoucyprien262-gif/cauZon.git). Tout commit doit être orchestré depuis la racine afin d\'indexer tous les sous-dossiers.');
  drawBulletPoint('Projets Vercel Découplés', 'Deux projets Vercel distincts exploitent le dépôt : `cauzon-app` (Root Directory: `cauZon__utulisateur/frontend`) servant `app.cauzon.ci`, et `cauzon` (Root Directory: `administrateur_cauZon`). Un commit ciblant le front utilisateur déclenche automatiquement le build de app.cauzon.ci.');
  drawBulletPoint('cauZon__utulisateur/frontend', 'Application principale hybride (Expo React Native 51 / Web PWA). Espace Lambda à jour (200 F acte, 1 000 F / 10 cours, quota 21 docs) et Espace Posteur TikTok complet (bouton sous-page accueil, modale publication, jauge Mo).');
  drawBulletPoint('administrateur_cauZon', 'Dashboard web autonome (Vite + React 18 + Supabase). Supervision du catalogue, validation des documents, diffusion de notifications push Expo et suivi financier. Fichier vercel.json réparé (sans BOM) avec routage SPA index.html.');
  drawBulletPoint('Supabase & PostgreSQL', 'Brique BaaS centrale : Tables documents, profiles, acquisitions, posteurs_wallets, abonnements_etudiants, demandes_retrait_posteurs, ledger_transactions. RLS activé et publication Realtime.');
  drawBulletPoint('Passerelle FeexPay', 'Intégration Mobile Money multi-opérateurs (Wave CI/SN, Orange CI/SN, MTN CI/BJ, Moov). Webhook étanche v3 configuré via l\'Edge Function Supabase `feexpay-webhook`.');

  drawHeaderFooter();

  // ==========================================
  // PAGE 2 : MODÈLE ÉCONOMIQUE & FINTECH
  // ==========================================
  checkNewPage(40);
  drawSectionTitle('3', 'Spécifications Économiques & Règles Tarifaires');

  drawSubSectionTitle('3.1. Structure Tarifaire Validée');
  drawBulletPoint('Achat à l\'acte (200 FCFA)', 'Débloque définitivement le document ciblé dans la bibliothèque personnelle permanente de l\'étudiant sans expiration temporelle (is_vip_consultation: false). Intégré dans ModaleAchat.');
  drawBulletPoint('Abonnement Étudiant (1 000 FCFA / mois)', 'Donne droit au déblocage de 10 documents au choix sur une période de 30 jours calendaires. Intègre un sélecteur d\'utilisation de crédit direct au catalogue sans ressaisir de paiement.');
  drawBulletPoint('Bouton « Acquérir » & Quota 10 cours', 'Pour tout utilisateur abonné, les cartes de lecture et le paywall affichent instantanément le bouton « Acquérir » et le décompte en temps réel (ex. 1 sur 10 cours acquis, 9 restants). Dès les 10 cours atteints, l\'étudiant est invité à renouveler ou acheter à vie.');
  drawBulletPoint('Activation atomique & RPC sécurisée', 'L\'activation de l\'abonnement s\'exécute via la fonction SQL sécurisée (SECURITY DEFINER) activer_abonnement_etudiant(), et le déblocage via debloquer_document_via_abonnement(), synchronisant abonnements_etudiants, profiles.has_vip_pass et le solde temps réel.');
  drawBulletPoint('Règle d\'Expiration Ciblée (Garantie)', 'À la fin des 30 jours, SEULS les documents acquis via le pass abonnement (is_vip_consultation: true) se re-verrouillent automatiquement. Les documents achetés à l\'acte (200 F) restent acquis définitivement.');
  drawBulletPoint('Part Posteur (50 FCFA / acquisition)', 'Créditée au créateur du document à chaque acquisition validée (achat à l\'acte ou sélection via abonnement mensuel). Sur 1 000 FCFA d\'abonnement, jusqu\'à 500 FCFA sont alloués aux créateurs des 10 documents.');
  drawBulletPoint('Seuil de Retrait Créateur (5 000 FCFA)', 'Le créateur peut ordonner un virement Mobile Money dès que son solde retirable atteint 5 000 FCFA (soit 100 acquisitions cumulées). En deçà, le bouton de demande de retrait est désactivé.');

  drawSubSectionTitle('3.2. Architecture FinTech & Sécurité Financière (3 Piliers)');
  drawBulletPoint('Pilier 1 : Délégation Monétaire FeexPay & Idempotence', 'Aucune manipulation directe de numéros bancaires. Clés d\'idempotence systématiques (`idempotency_key`, `reference_feexpay`) pour interdire les doubles débits ou doubles crédits.');
  drawBulletPoint('Pilier 2 : Séparation Profils & Registre Ledger', 'Cloisonnement strict entre les profils applicatifs et la table `ledger_transactions`. Vue comptable `vue_comptable_cauzon` ventilant Chiffre d\'Affaires Net cauZon et Cumul Dû / Versé aux Posteurs.');
  drawBulletPoint('Pilier 3 : Anti-Fraude & Règle d\'Auto-Achat', 'Interdiction mathématique et serveur via trigger PostgreSQL (`verifier_anti_auto_achat`), contrôle Edge Function et blocage visuel côté client si `document.author_id === currentUser.id`.');
  drawBulletPoint('Minimisation des Données (Téléphone)', 'Zéro stockage permanent de numéros de téléphone en clair dans la base. Le numéro est saisi uniquement à l\'instant du paiement ou du retrait et non persisté.');

  drawHeaderFooter();

  // ==========================================
  // PAGE 3 : DOUBLE STATUT & DEUX ESPACES DISTINCTS
  // ==========================================
  checkNewPage(40);
  drawSectionTitle('4', 'Double Statut & Deux Espaces Front-End Dédiés');

  drawParagraph(
    'Tout utilisateur est utilisateur lambda par défaut à l\'inscription. Il peut activer le statut posteur (étudiant d\'élite, enseignant, club, institut) sans perdre son compte lambda. Dans le front-end, deux espaces totalement distincts cohabiteront :'
  );

  drawSubSectionTitle('4.1. Espace Utilisateur Lambda (Consommation & Lecture) [TERMINÉ]');
  drawBulletPoint('Catalogue & Achat 200 F', 'Parcours du catalogue, achat unitaire à 200 FCFA par FeexPay, ou souscription abonnement 10 cours à 1 000 FCFA.');
  drawBulletPoint('Sélecteur Crédit d\'Abonnement', 'L\'étudiant abonné peut débloquer le cours directement via "Utiliser 1 crédit (Abonnement)" sans paiement externe supplémentaire.');
  drawBulletPoint('Bibliothèque Lambda & Quota 21', 'Jauge calibrée sur le quota initial de 21 documents offerts (remplace les anciens 75 docs). Extension de quota à 1 500 FCFA pour +21 documents supplémentaires cumulables (21 -> 42 -> 63...).');
  drawBulletPoint('Import Documents Personnels Débloqué', 'Tout utilisateur peut importer ses propres cours et fiches (PDF <= 100 Mo) dans son espace personnel pour les ranger et les consulter hors-ligne sans encombrer son téléphone, dans la limite de son quota de 21 documents (extensible à 42, 63...).');
  drawBulletPoint('Chiffrement & Hors-Ligne', 'Consultation sécurisée hors-ligne isolée dans le bac à sable local (IndexedDB/FileSystem), sans option d\'extraction ni de téléchargement externe.');

  drawSubSectionTitle('4.2. Espace Utilisateur Posteur (Profil Créateur Style TikTok) [ÉTAPE 4 : VALIDÉE]');
  drawBulletPoint('Navigation (sous-page)', 'Barre du bas strictement limitée à 2 onglets : Accueil et Bibliothèque. L\'Espace Posteur est accessible via le raccourci circulaire supérieur gauche.');
  drawBulletPoint('Layout compact style profil TikTok', 'Suppression complète du bloc portefeuille central et de la grande jauge de stockage. La grille des cours publiés remonte immédiatement sous l\'en-tête de profil pour une expérience visuelle fluide.');
  drawBulletPoint('Affichage financier unique (Gains cumulés)', 'L\'unique mention financière sur le profil créateur est "Gains cumulés", positionnée directement dans le trio de statistiques sous la bio (Documents, Acquisitions, Gains cumulés).');
  drawBulletPoint('Pastille de stockage compacte (+400 Mo)', 'Indicateur discret de stockage en Mo placé à côté du bouton "Modifier le profil" (ex: 12.4 / 400 Mo · +400 Mo), ouvrant en 1 clic la modale d\'extension (+400 Mo pour 1 500 FCFA).');
  drawBulletPoint('Formulaire de publication complet', 'Modale dédiée (ModalePublicationPosteur) : sélection PDF (100 Mo max), titre, domaine/matière, hashtags, description détaillée (5-10 lignes), photo de profil/vignette et publication directe.');
  drawBulletPoint('Sélecteur de pages gratuites (Aperçu)', 'Le posteur choisit librement le nombre de pages accessibles gratuitement en lecture (par ex. 1, 2 ou plus, borné au total du PDF). Enregistré dans pages_gratuites / limite_apercu_pages.');
  drawBulletPoint('Robustesse téléversement & Fix _extends', 'Comptage binaire des pages par expression régulière native (/Type /Page) et alias de résolution tslib dans Metro, éliminant tout blocage ou TypeError Cannot destructure _extends.');
  drawBulletPoint('Contrôle de taille & quota en Mo', 'Plafond strict de 100 Mo/PDF et calcul de l\'espace restant en Mo sur le quota créateur (base 400 Mo) avec proposition d\'extension immédiate (+400 Mo pour 1 500 FCFA).');
  drawBulletPoint('Optimisation & Remontée temps réel', 'Compression turbo in-memory via pdf-lib (< 250ms), téléversement chiffré vers Supabase Storage, et remontée instantanée sur l\'accueil et le profil créateur via Supabase Realtime.');
  drawBulletPoint('Provenance Cartes Document', 'Sur les cartes du catalogue : affichage du badge officiel "cauZon Certifié" si publié par la plateforme, ou de la photo de profil personnalisée + pseudo du posteur s\'il s\'agit d\'un cours indépendant.');
  drawBulletPoint('Prix verrouillé & Exclusivité cauZon', 'Le posteur n\'a AUCUN pouvoir sur le prix de vente : tarif fixé à 200 FCFA sous maîtrise exclusive de l\'administrateur cauZon. Triggers SQL (trg_lock_posteur_doc_price) bloquant toute altération.');
  drawBulletPoint('Masquage des tarifs côté posteur', 'L\'interface posteur masque totalement le prix de vente public du document et communique uniquement sur la rémunération créateur : +50 FCFA crédités par acquisition/déblocage.');
  drawBulletPoint('Rétribution & Anti-auto-achat', 'Retrait direct dès 5 000 FCFA sans stockage permanent de numéro de téléphone. Interdiction absolue d\'auto-achat verrouillée au niveau UI, RPC et trigger SQL.');
  drawBulletPoint('Durcissement sécurité & RLS', 'Table posteurs_wallets isolée, RPC activer_espace_posteur sans erreur 42P13 et rechargement dynamique du cache PostgREST (NOTIFY pgrst).');

  drawHeaderFooter();

  // ==========================================
  // PAGE 4 : TRAITEMENT PDF & TEMPS RÉEL
  // ==========================================
  checkNewPage(40);
  drawSectionTitle('5', 'Sécurité du Rendu PDF & Protection de Bande Passante');

  drawParagraph(
    'Pour protéger les droits d\'auteur universitaires et soulager les forfaits data mobiles des étudiants, la plateforme élimine la distribution directe de fichiers PDF bruts au client final.'
  );

  drawBulletPoint('Plafond de Téléversement', 'Taille maximale autorisée fixée à 100 Mo par fichier PDF déposé par l\'administrateur ou les posteurs (contrôlé par contrainte SQL `chk_documents_max_taille_100mo`).');
  drawBulletPoint('Blocage Physique Paywall (Web/PWA & Mobile)', 'Seules les N premières pages configurées par le créateur sont rendues. Dès la page N+1, le défilement et le rendu des pages suivantes sont strictement bloqués avec insertion d\'une carte paywall incitative (achat unitaire à 200 F ou abonnement 1 000 F).');
  drawBulletPoint('Optimisation & Rendus Rasterisés', 'Les PDF sont convertis ou délivrés par tranches de pages optimisées au format WebP léger, maintenant une netteté vectorielle optimale tout en diminuant de 70% le poids de transfert.');
  drawBulletPoint('Absence Totale de Bouton Télécharger', 'Désactivation des barres d\'outils natives du navigateur, neutralisation des iframes non maîtrisées et blocage des raccourcis d\'impression ou d\'enregistrement externe.');
  drawBulletPoint('Streaming Sécurisé & Cache Chiffré', 'L\'affichage se fait page par page avec libération mémoire sur les terminaux à ressources limitées (Safari iOS et Android d\'entrée de gamme).');

  drawSectionTitle('6', 'Temps Réel & Notification Push (Effet WhatsApp)');
  drawBulletPoint('WebSockets Supabase Realtime', 'Publication configurée sur `documents`, `acquisitions`, `posteurs_wallets`, `abonnements_etudiants`, `demandes_retrait_posteurs` et `ledger_transactions`. Zéro rechargement manuel.');
  drawBulletPoint('Notifications Push Expo', 'Alerte immédiate sur l\'appareil lors de la publication d\'un nouveau document pertinent, du crédit de 50 FCFA sur un compte créateur ou de l\'imminence de fin d\'abonnement.');

  drawHeaderFooter();

  // ==========================================
  // PAGE 5 : MATRICE DE SUIVI & PLAN D'IMPLÉMENTATION
  // ==========================================
  checkNewPage(40);
  drawSectionTitle('7', 'Matrice de Suivi & Plan d\'Implémentation Détaillé');

  drawStatusBox(
    'Étape 1 : Fondations SQL, RLS, Quotas & Ledger',
    'fait',
    'Migration SQL prête (20261121_fondations_fintech_quotas_et_roles.sql). Quotas 21 docs / 400 Mo, tables wallets, abonnements, ledger et RLS anti-auto-achat.'
  );

  drawStatusBox(
    'Étape 2 : Webhook FeexPay & Idempotence Serveur',
    'fait',
    'Edge Function `feexpay-webhook` mise à jour : gestion 200 F acte, 1 000 F abonnement (10 docs), 1 500 F extensions (+21 docs / +400 Mo), crédit +50 F posteur et ledger.'
  );

  drawStatusBox(
    'Étape 3 : Application Client — Espace Lambda',
    'fait',
    'Modale d\'achat 200 F, abonnement 1 000 F (10 cours), extension +21 docs à 1 500 F, jauge calibrée sur 21 docs, sélecteur crédit abonnement et anti-auto-achat UI.'
  );

  drawStatusBox(
    'Étape 4 : Application Client — Espace & Publication Posteur',
    'fait',
    'Profil TikTok, jauge Mo, retraits >= 5 000 F, sélection photo profil galerie, badges cartes, formulaire complet de publication posteur (ModalePublicationPosteur) et remontée temps réel sur l\'accueil.'
  );

  drawStatusBox(
    'Correctifs Critiques : Paywall, Pages Gratuites & Abonnement',
    'fait',
    'Sélecteur de pages gratuites (1 à N), contournement _extends tslib, paywall bloquant réel post-page N sur PWA/mobile, et activation atomique de l\'abonnement 10 docs via RPC.'
  );

  drawStatusBox(
    'Correctif État Abonné (« Acquérir » / 10 docs) & Import Personnel',
    'fait',
    'Remplacement des boutons d\'achat par « Acquérir » avec suivi du quota 10 docs, étanchéité de re-verrouillage 30j et import de documents personnels débloqué avec quota 21 docs.'
  );

  drawStatusBox(
    'Acquisition Effective Téléphone & PWA (Double Sécurité)',
    'fait',
    'Suppression des faux succès : validation stricte RPC serveur + repli direct vérifié dans acquisitions, quota 10 docs effectif et bascule automatique dans le dossier VIP.'
  );

  drawStatusBox(
    'Publication Posteur Résiliente & Colonne created_at',
    'fait',
    'Insertion sécurisée sans dépendance stricte au cache schema PostgREST + script SQL ajoutant created_at/updated_at et author_id sur documents.'
  );

  drawStatusBox(
    'Feuilletage Complet & Déblocage Réel Abonné (PWA & Mobile)',
    'fait',
    'Feuilletage 100% libre de tout le catalogue pour l\'abonné actif sans paywall bloquant. Bouton Acquérir fonctionnel avec auto-guérison sur profil VIP et quota 10 docs.'
  );

  drawStatusBox(
    'Étape 5 : Dashboard Administrateur & Supervision',
    'encours',
    'Tableau de bord financier temps réel : ventilation CA net cauZon vs Cumul posteurs via vue comptable, et approbation des retraits.'
  );

  drawStatusBox(
    'Étape 6 : Rendu PDF & Protection Bande Passante',
    'fait',
    'Lecteur mobile Canvas/WebP double-buffering actif. Suppression complète des boutons de téléchargement externe.'
  );

  drawHeaderFooter();

  // Enregistrement final du fichier à la racine du projet
  const outputPath = path.resolve(__dirname, '../Cahier_des_Charges_Technique_cauZon.pdf');
  const pdfBytes = doc.output('arraybuffer');
  fs.writeFileSync(outputPath, Buffer.from(pdfBytes));
  console.log(`✅ Cahier des charges PDF actualisé avec succès dans : ${outputPath} (${fs.statSync(outputPath).size} octets)`);
}

genererCahierDesChargesPdf();
