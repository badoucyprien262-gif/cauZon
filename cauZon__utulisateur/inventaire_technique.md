# Rapport d'Inventaire Technique - Front-End & Intégration Supabase (cauZon)

Ce document dresse l'état d'inventaire complet du projet React Native (Expo SDK 54) et de ses liaisons de données avec la base Supabase.

---

## 📂 1. Architecture & Arborescence

### A. Liste des fichiers clés du dossier `src/`

```text
c:\Users\badou\cauZon\frontend
├── .env
├── package.json
├── App.tsx
├── src/
│   ├── components/
│   │   ├── CarteDocument.tsx
│   │   ├── JaugeStockage.tsx
│   │   ├── ListeDossiers.tsx
│   │   ├── ModaleAchat.tsx
│   │   ├── ModaleParametres.tsx
│   │   ├── ModaleStockage.tsx
│   │   └── ModaleVip.tsx
│   ├── lib/
│   │   └── supabase.ts
│   ├── navigation/
│   │   └── NavigateurApp.tsx
│   ├── screens/
│   │   ├── EcranAccueil.tsx
│   │   ├── EcranBibliotheque.tsx
│   │   ├── EcranLecteurDocument.tsx
│   │   └── PdfViewerScreen.tsx
│   ├── services/
│   │   └── serviceDocument.ts
│   ├── store/
│   │   └── ContexteApp.tsx
│   ├── theme/
│   │   └── couleurs.ts
│   └── types/
│       └── index.ts
```

### B. Dépendances (`package.json`)
```json
{
  "name": "frontend",
  "version": "1.0.0",
  "main": "index.ts",
  "dependencies": {
    "@expo/vector-icons": "^15.0.3",
    "@react-native-async-storage/async-storage": "2.2.0",
    "@react-navigation/bottom-tabs": "^7.18.14",
    "@react-navigation/native": "^7.3.14",
    "@react-navigation/native-stack": "^7.18.6",
    "@supabase/supabase-js": "^2.112.0",
    "expo": "~54.0.0",
    "expo-application": "~7.0.8",
    "expo-status-bar": "~3.0.9",
    "pdf-lib": "^1.17.1",
    "pdfkit": "^0.19.1",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "react-native": "0.81.5",
    "react-native-safe-area-context": "~5.6.0",
    "react-native-screens": "~4.16.0",
    "react-native-url-polyfill": "^4.0.0",
    "react-native-web": "^0.21.0",
    "react-native-webview": "13.15.0"
  },
  "devDependencies": {
    "@types/react": "~19.1.10",
    "typescript": "~5.9.2"
  }
}
```

---

## ⚡ 2. Liaison Supabase & Services

### A. Initialisation du Client (`src/lib/supabase.ts`)
```typescript
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

### B. Service Document & Acquisitions (`src/services/serviceDocument.ts`)
```typescript
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { supabase } from '../lib/supabase';

export interface DocumentCourse {
  id: string;
  titre: string;
  categorie: string;
  description: string;
  prix: number;
  est_certifie: boolean;
  est_verrouille: boolean;
  nombre_pages: number;
  limite_apercu_pages: number;
  taille_mo: number;
  file_path: string;
}

/**
 * Récupère tous les documents du catalogue pour le Feed / Écran d'accueil
 */
export const fetchCatalogueDocuments = async (): Promise<DocumentCourse[]> => {
  const { data, error } = await supabase
    .from('documents')
    .select('*');

  if (error) {
    console.error('Erreur lors de la récupération des documents :', error.message);
    return [];
  }

  return data as DocumentCourse[];
};

/**
 * Récupère un identifiant unique pour le téléphone actuel
 */
export const getDeviceId = async (): Promise<string> => {
  if (Platform.OS === 'android') {
    return Application.getAndroidId() || 'android-unknown-device';
  } else if (Platform.OS === 'ios') {
    const iosId = await Application.getIosIdForVendorAsync();
    return iosId || 'ios-unknown-device';
  }
  return 'web-or-unknown-device';
};

/**
 * Tente de débloquer un document (Offre de bienvenue ou Achat)
 */
export const debloquerDocument = async (documentId: string, prixDocument: number) => {
  try {
    const deviceId = await getDeviceId();

    // 1. Récupérer l'utilisateur connecté s'il existe
    const { data: { user } } = await supabase.auth.getUser();

    // 2. Vérifier si cet appareil a déjà profité de l'offre de bienvenue
    const { data: offresExistantes, error: errOffre } = await supabase
      .from('acquisitions')
      .select('id')
      .eq('device_id', deviceId)
      .eq('is_welcome_offer', true);

    if (errOffre) throw errOffre;

    const estOffreDisponible = offresExistantes.length === 0;

    // 3. Déblocage gratuit pour le 1er document (Offre de bienvenue)
    if (estOffreDisponible) {
      // Préparation de l'objet à insérer
      const insertionData: any = {
        document_id: documentId,
        device_id: deviceId,
        is_welcome_offer: true,
      };

      // N'ajouter user_id que si l'utilisateur est réellement connecté (UUID valide)
      if (user) {
        insertionData.user_id = user.id;
      }

      const { data, error } = await supabase
        .from('acquisitions')
        .insert([insertionData])
        .select();

      if (error) throw error;
      return { success: true, message: 'Félicitations ! Votre 1er document offert a été débloqué 🎉', data };
    }

    // 4. Si l'offre est déjà consommée
    return { 
      success: false, 
      paywallRequired: true, 
      message: `Offre de bienvenue déjà utilisée. Déblocage pour ${prixDocument} FCFA.` 
    };

  } catch (error: any) {
    console.error('Erreur lors du déblocage :', error.message);
    return { success: false, message: error.message };
  }
};

/**
 * Récupère tous les documents débloqués par cet appareil / utilisateur
 */
export const fetchMesDocuments = async (): Promise<DocumentCourse[]> => {
  try {
    const deviceId = await getDeviceId();

    // Récupérer la liste des document_id débloqués pour cet appareil
    const { data: acquisitions, error: errAcq } = await supabase
      .from('acquisitions')
      .select('document_id')
      .eq('device_id', deviceId);

    if (errAcq) throw errAcq;

    if (!acquisitions || acquisitions.length === 0) {
      return [];
    }

    const documentIds = acquisitions.map((item) => item.document_id);

    // Récupérer les détails des documents correspondants
    const { data: docs, error: errDocs } = await supabase
      .from('documents')
      .select('*')
      .in('id', documentIds);

    if (errDocs) throw errDocs;

    return docs as DocumentCourse[];
  } catch (error: any) {
    console.error('Erreur lors du chargement de la bibliothèque :', error.message);
    return [];
  }
};

/**
 * Génère l'URL publique du fichier PDF depuis le bucket Supabase Storage
 */
export const getDocumentPdfUrl = (filePath: string): string => {
  const { data } = supabase.storage
    .from('cours-documents')
    .getPublicUrl(filePath);

  return data.publicUrl;
};
```

---

## 🧭 3. Écrans & Navigation

### A. Gestion de la Navigation
La navigation est gérée via **React Navigation** (sous forme classique de Stack + Bottom Tabs) déclarée dans [NavigateurApp.tsx](file:///c:/Users/badou/cauZon/frontend/src/navigation/NavigateurApp.tsx).
- **Navigateur principal (Tabs)** : `Accueil` et `Bibliothèque`.
- **Modales & Écrans flotants (Stack)** : `DocumentViewer` et `PdfViewer`.

---

### B. Écran du Catalogue / Accueil (`src/screens/EcranAccueil.tsx`)

```typescript
// (Lien vers le fichier physique : src/screens/EcranAccueil.tsx)
// Ce fichier gère la recherche, les filtres par catégorie, l'avatar interactif
// et charge les données depuis la fonction fetchCatalogueDocuments() de Supabase.
```

*Le code source complet et fonctionnel est éditable dans :* [EcranAccueil.tsx](file:///c:/Users/badou/cauZon/frontend/src/screens/EcranAccueil.tsx).

---

### C. Écran de la Bibliothèque (`src/screens/EcranBibliotheque.tsx`)

```typescript
// (Lien vers le fichier physique : src/screens/EcranBibliotheque.tsx)
// Ce fichier affiche la jauge d'espace de stockage cloud, regroupe virtuellement
// les fichiers débloqués par dossier thématique de matière, et appelle fetchMesDocuments().
```

*Le code source complet et fonctionnel est éditable dans :* [EcranBibliotheque.tsx](file:///c:/Users/badou/cauZon/frontend/src/screens/EcranBibliotheque.tsx).

---

### D. Écran du Lecteur PDF sécurisé (`src/screens/PdfViewerScreen.tsx`)

```typescript
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, StatusBar } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { getDocumentPdfUrl } from '../services/serviceDocument';
import { useApp } from '../store/ContexteApp';

interface PdfViewerProps {
  route?: {
    params: {
      titre: string;
      filePath: string;
      estDebloque: boolean;
      limiteApercuPages?: number;
    };
  };
  navigation?: any;
}

export default function PdfViewerScreen({ route, navigation }: PdfViewerProps) {
  const { couleurs } = useApp();
  const styles = getStyles(couleurs);

  const { titre, filePath, estDebloque, limiteApercuPages = 3 } = route?.params || {
    titre: 'Document',
    filePath: '',
    estDebloque: false,
    limiteApercuPages: 3,
  };

  const pdfUrl = getDocumentPdfUrl(filePath);
  console.log('📌 Chemin Fichier :', filePath);
  console.log('🔗 URL Supabase générée :', pdfUrl);

  // On ajoute ?v=timestamp pour forcer le rafraîchissement du cache Google
  const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(pdfUrl)}?v=${Date.now()}&embedded=true`;

  const handleBack = () => {
    if (navigation) {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar 
        barStyle="light-content" 
        backgroundColor={couleurs.fondEntete} 
      />
      {/* En-tête de lecture */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" style={{ color: '#FFFFFF' }} />
        </TouchableOpacity>
        
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>{titre}</Text>
          <Text style={styles.badge}>
            {estDebloque ? 'Document complet' : `Aperçu gratuit (${limiteApercuPages} p. max)`}
          </Text>
        </View>
      </View>

      {/* Lecteur PDF */}
      <View style={styles.pdfContainer}>
        {filePath ? (
          <WebView
            source={{ uri: viewerUrl }}
            style={{ flex: 1 }}
            startInLoadingState={true}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={48} color={couleurs.texteSecondaire} />
            <Text style={styles.emptyText}>Aucun fichier PDF disponible</Text>
          </View>
        )}
      </View>

      {/* Banner Paywall si le document n'est pas encore débloqué */}
      {!estDebloque && (
        <View style={styles.paywallBanner}>
          <Ionicons name="lock-closed" size={16} color="#856404" style={{ marginRight: 6 }} />
          <Text style={styles.paywallText}>
            Vous consultez un aperçu. Débloquez le document complet pour accéder à l'intégralité du cours.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const getStyles = (couleurs: any) => StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: couleurs.fond 
  },
  header: { 
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 12 : (StatusBar.currentHeight ? StatusBar.currentHeight + 12 : 36),
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: couleurs.fondEntete,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
  },
  backBtn: {
    padding: 6,
    marginRight: 10,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: { 
    color: '#FFFFFF', 
    fontSize: 16, 
    fontWeight: 'bold' 
  },
  badge: { 
    color: couleurs.accent, 
    fontSize: 12, 
    marginTop: 2 
  },
  pdfContainer: { 
    flex: 1,
    backgroundColor: couleurs.fond
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 8,
    color: couleurs.texteSecondaire,
    fontSize: 14,
  },
  paywallBanner: {
    flexDirection: 'row',
    padding: 14,
    backgroundColor: '#fff3cd',
    borderTopWidth: 1,
    borderColor: '#ffeeba',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paywallText: { 
    color: '#856404', 
    fontSize: 13, 
    textAlign: 'center',
    fontWeight: '600'
  },
});
```

---

## 💾 4. État des Types et TypeScript

### A. Modèles et interfaces dans `src/types/index.ts`
*   `Document` : Structure interne des documents utilisés par le State global de l'application (champs camelCase).
*   `Utilisateur` : Identité et statut VIP de l'abonné.
*   `Categorie` : Représente une matière scolaire ou universitaire.

### B. Modèles de la Base de Données dans `serviceDocument.ts`
*   `DocumentCourse` : Modèle de la table `documents` de Supabase (champs snake_case comme `nombre_pages`, `file_path`, etc.).

---

## 🔄 5. Flux et Logique Actuelle

1.  **Chemin d'accès au fichier PDF** :
    *   Chaque document récupéré contient un champ `file_path` (ex: `cours/math_bac_2025.pdf`).
2.  **Construction de l'URL Supabase Storage** :
    *   La fonction `getDocumentPdfUrl(filePath)` est appelée.
    *   Elle construit une URL de récupération publique depuis le bucket de stockage Supabase **`cours-documents`**.
    *   Pour forcer le rafraîchissement et bypasser le cache, un horodatage (`?v=${Date.now()}`) est injecté.
    *   Cette URL finale est passée à la `WebView` à travers le visualiseur embarqué Google Docs.
