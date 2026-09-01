import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TextInput,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Platform,
  StatusBar,
  useWindowDimensions,
  ActivityIndicator,
  Image,
  Modal,
  RefreshControl,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutAnimation,
  UIManager,
  Animated,
  Easing,
  PanResponder,
  Alert,
} from 'react-native';


if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}


import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Document } from '../types';
import { RootStackParamList } from '../navigation/NavigateurApp';
import { useApp } from '../store/ContexteApp';
import CarteDocument from '../components/CarteDocument';
import SkeletonCarte from '../components/SkeletonCarte';
import AvatarDynamique from '../components/AvatarDynamique';
import ModaleParametres from '../components/ModaleParametres';
import { fetchCatalogueDocuments, souscrireChangementsDocuments } from '../services/serviceDocument';
import { supabase } from '../lib/supabase';



type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function EcranAccueil() {
  const navigation = useNavigation<NavigationProp>();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tout');
  const { 
    docsDebloquesIds, 
    debloquerDocument, 
    consommerOffreBienvenueLocal,
    couleurs, 
    photoProfil, 
    aReponseNonLue, 
    estVip,
    estSuspendu,
    dateFinSuspension,
    motifSuspension
  } = useApp();

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [categories, setCategories] = useState<string[]>(['Tout']);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [promoConfig, setPromoConfig] = useState<any>(null);

  // États pour les bannières d'annonces dynamiques (Système de Pile / Swipe Stack)
  const [annonces, setAnnonces] = useState<any[]>([]);
  const [selectedAnnonce, setSelectedAnnonce] = useState<any | null>(null);
  const [annonceModalVisible, setAnnonceModalVisible] = useState(false);
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);
  const bannerPanX = useRef(new Animated.Value(0)).current;

  // 🔄 Header dynamique au scroll One UI (Physique de Ressort / Spring & Positionnement Absolu)
  const headerAnim = useRef(new Animated.Value(0)).current; // 0 = visible, 1 = masqué
  const estMasqueRef = useRef<boolean>(false);
  const [barreFiltresVisible, setBarreFiltresVisible] = useState<boolean>(true);
  const dernierScrollY = useRef<number>(0);

  const animerHeader = useCallback((masquer: boolean) => {
    if (estMasqueRef.current === masquer) return;
    estMasqueRef.current = masquer;
    setBarreFiltresVisible(!masquer);

    if (masquer) {
      // Glissement net et rapide vers le haut lors de la descente
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    } else {
      // Réapparition instantanée avec physique de ressort One UI (Spring)
      Animated.spring(headerAnim, {
        toValue: 0,
        friction: 8,
        tension: 85,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    }
  }, [headerAnim]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const currentY = event.nativeEvent.contentOffset.y;

    // 1. En haut de l'écran ou rebond élastique : toujours visible
    if (currentY <= 10) {
      animerHeader(false);
      dernierScrollY.current = Math.max(0, currentY);
      return;
    }

    const diff = currentY - dernierScrollY.current;

    // 2. Déclenchement réactif One UI :
    if (diff > 8 && currentY > 40) {
      // Scroll vers le bas : masquer le header flottant
      animerHeader(true);
    } else if (diff < -3) {
      // Dès qu'on amorce la remontée d'un seul pixel : réapparition immédiate One UI
      animerHeader(false);
    }

    dernierScrollY.current = currentY;
  };

  // Interpolations visuelles One UI Compact
  const headerTranslateY = headerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -102],
  });

  const headerOpacity = headerAnim.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [1, 0.4, 0],
  });






  // Dimensions dynamiques pour le rendu Web plein écran
  const { width } = useWindowDimensions();
  const nombreColonnes = width > 1200 ? 5 : width > 900 ? 4 : width > 600 ? 3 : 2;
  const paddingGlobal = 40;
  const margeCartes = 16;
  const largeurCarte = (width - paddingGlobal - (nombreColonnes - 1) * margeCartes) / nombreColonnes;

  const styles = getStyles(couleurs);
  const { getEmojiAvatar } = require('../components/ModaleParametres');

  useEffect(() => {
    loadDocuments();
    loadPromoConfig();
    loadAnnonces();

    // 📡 SYNCHRONISATION EN TEMPS RÉEL (Supabase Realtime)
    // Se déclenche instantanément dès que l'admin ajoute, modifie ou supprime un cours
    const unsubscribe = souscrireChangementsDocuments(() => {
      console.log('⚡ Mise à jour instantanée du feed suite à un changement admin.');
      loadDocuments();
      loadAnnonces();
    });

    return () => {
      unsubscribe();
    };
  }, [docsDebloquesIds]);

  useFocusEffect(
    useCallback(() => {
      loadDocuments();
      loadAnnonces();
      loadPromoConfig();
    }, [docsDebloquesIds])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadDocuments(), loadPromoConfig(), loadAnnonces()]);
    setRefreshing(false);
  }, [docsDebloquesIds]);


  // Si le compte est suspendu par l'administrateur
  if (estSuspendu) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <StatusBar barStyle="light-content" backgroundColor="#DC2626" />
        <View style={{
          backgroundColor: couleurs.blanc,
          borderRadius: 24,
          padding: 28,
          alignItems: 'center',
          borderWidth: 2,
          borderColor: '#EF4444',
          shadowColor: '#EF4444',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.15,
          shadowRadius: 16,
          elevation: 6,
          width: '100%',
          maxWidth: 420,
        }}>
          <View style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 16,
          }}>
            <Ionicons name="shield-outline" size={40} color="#DC2626" />
          </View>

          <Text style={{ fontSize: 20, fontWeight: '900', color: '#DC2626', textAlign: 'center', marginBottom: 8 }}>
            Accès Temporairement Suspendu
          </Text>

          <Text style={{ fontSize: 13.5, color: couleurs.texteSecondaire, textAlign: 'center', lineHeight: 20, marginBottom: 20 }}>
            Votre compte cauZon a été suspendu par l'équipe de modération suite à un signalement ou un non-respect des conditions d'utilisation.
          </Text>

          {/* Boîte Motif */}
          <View style={{
            width: '100%',
            backgroundColor: couleurs.estSombre ? 'rgba(255,255,255,0.05)' : '#F9FAFB',
            borderRadius: 14,
            padding: 16,
            borderWidth: 1,
            borderColor: couleurs.bordure,
            marginBottom: 16,
          }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              Motif de la suspension
            </Text>
            <Text style={{ fontSize: 13, color: couleurs.texte, fontWeight: '600', fontStyle: 'italic' }}>
              « {motifSuspension || "Non-respect des règles de partage"} »
            </Text>
          </View>

          {/* Boîte Date de fin */}
          <View style={{
            width: '100%',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            borderRadius: 14,
            padding: 16,
            borderWidth: 1,
            borderColor: 'rgba(239, 68, 68, 0.2)',
            marginBottom: 24,
            alignItems: 'center',
          }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              Rétablissement de l'accès
            </Text>
            <Text style={{ fontSize: 14, color: '#DC2626', fontWeight: '800' }}>
              {dateFinSuspension ? `Le ${dateFinSuspension}` : 'Suspension Définitive'}
            </Text>
          </View>

          <Text style={{ fontSize: 11.5, color: couleurs.texteSecondaire, textAlign: 'center', fontStyle: 'italic' }}>
            La levée de la suspension s'effectuera automatiquement à l'issue de cette période.
          </Text>
        </View>
      </View>
    );
  }


  const loadPromoConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'global_config')
        .maybeSingle();
      
      if (!error && data && data.value) {
        setPromoConfig(data.value);
      }
    } catch (err) {
      console.log('Erreur chargement bannière promo :', err);
    }
  };

  const loadAnnonces = async () => {
    try {
      const { fetchAnnoncesActives } = require('../services/serviceDocument');
      const data = await fetchAnnoncesActives();
      setAnnonces(data || []);
    } catch (err) {
      console.log('Erreur chargement des bannières d\'annonces :', err);
    }
  };

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError(null);

      // Timeout de 5 secondes pour les réseaux instables
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), 5000);
      });

      // Chargement réel
      const fetchPromise = fetchCatalogueDocuments();

      // Course contre la montre (timeout de 5 secondes)
      const data = await Promise.race([fetchPromise, timeoutPromise]);

      if (data && data.length > 0) {
        // Mapper les documents Supabase (snake_case) vers le modèle frontend (camelCase)
        const mapped = data.map((dbDoc: any) => {
          const rawType = (dbDoc.limite_apercu_type || 'pourcentage').toLowerCase().trim();
          let parsedType: 'page' | 'pourcentage' | 'fluide' | 'neutre' = 'pourcentage';
          let parsedVal = dbDoc.limite_apercu_valeur ?? 30;

          if (rawType.startsWith('fluide:') || rawType.startsWith('neutre:')) {
            parsedType = 'fluide';
            const dec = parseFloat(rawType.split(':')[1]);
            if (!isNaN(dec)) parsedVal = dec;
          } else if (rawType === 'fluide' || rawType === 'neutre') {
            parsedType = 'fluide';
          } else if (rawType === 'page') {
            parsedType = 'page';
          }

          return {
            id: dbDoc.id,
            titre: dbDoc.titre,
            categorie: dbDoc.categorie,
            estCertifie: dbDoc.est_certifie ?? false,
            estPretHorsLigne: dbDoc.est_pret_hors_ligne ?? false,
            prix: dbDoc.prix ?? 100,
            estVerrouille: dbDoc.est_verrouille ?? true,
            nombrePages: dbDoc.total_pages || dbDoc.page_count || dbDoc.nombre_pages || dbDoc.pages || dbDoc.nombrePages || 1,
            tailleMo: dbDoc.taille_mo ?? 1.5,
            limiteApercuPages: dbDoc.limite_apercu_pages ?? 2,
            limiteApercuType: parsedType,
            limiteApercuValeur: parsedVal,
            description: dbDoc.description ?? '',
            tags: dbDoc.tags ?? '',
            cheminLocal: dbDoc.file_path ?? '',
            coverUrl: dbDoc.cover_url ?? '',
            statut: dbDoc.status === 'inactif' || dbDoc.status === 'archived' ? 'inactif' : 'actif',
          };
        });
        setDocuments(mapped);
        
        // Extraire dynamiquement les matières uniques
        const matieresUnique = Array.from(new Set(mapped.map((d: any) => d.categorie).filter(Boolean))) as string[];
        setCategories(['Tout', ...matieresUnique]);
      } else {
        setDocuments([]);
        setCategories(['Tout']);
      }
    } catch (err: any) {
      console.error('Erreur Supabase, chargement des documents réels :', err);
      if (err.message === 'TIMEOUT_EXCEEDED') {
        setError("La connexion réseau a expiré (5s). Veuillez réessayer.");
      } else {
        setError("Impossible de charger les cours. Vérifiez votre connexion.");
      }
      setDocuments([]);
      setCategories(['Tout']);
    } finally {
      setLoading(false);
    }
  };

  // 📚 Système de Pile de Notifications : Tri par urgence + expiration + rôle
  const IMPORTANCE_WEIGHT: Record<string, number> = { urgent: 3, promo: 2, info: 1 };
  const annoncesFiltrees = useMemo(() => {
    const now = Date.now();
    return annonces
      .filter((annonce) => {
        if (annonce.statut === 'inactif') return false;
        if (annonce.date_fin) {
          const expTime = new Date(annonce.date_fin).getTime();
          if (!isNaN(expTime) && expTime < now) return false;
        }
        if (annonce.ciblage_role === 'non_abonnes' && estVip) return false;
        if (annonce.ciblage_role === 'abonnes' && !estVip) return false;
        return true;
      })
      .sort((a, b) => {
        const weightA = IMPORTANCE_WEIGHT[a.type_importance] || 0;
        const weightB = IMPORTANCE_WEIGHT[b.type_importance] || 0;
        if (weightA !== weightB) return weightB - weightA;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
  }, [annonces, estVip]);

  const totalBanners = annoncesFiltrees.length;
  const currBannerIdx = totalBanners > 0 ? ((activeBannerIndex % totalBanners) + totalBanners) % totalBanners : 0;
  const currentAnnonce = totalBanners > 0 ? annoncesFiltrees[currBannerIdx] : null;
  const nextAnnonce = totalBanners > 1 ? annoncesFiltrees[(currBannerIdx + 1) % totalBanners] : null;

  const rotateToNextBanner = useCallback(() => {
    if (annoncesFiltrees.length <= 1) return;
    Animated.timing(bannerPanX, {
      toValue: -260,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => {
      bannerPanX.setValue(260);
      setActiveBannerIndex((prev) => (prev + 1) % annoncesFiltrees.length);
      Animated.spring(bannerPanX, {
        toValue: 0,
        friction: 8,
        tension: 80,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    });
  }, [annoncesFiltrees.length, bannerPanX]);

  const rotateToPrevBanner = useCallback(() => {
    if (annoncesFiltrees.length <= 1) return;
    Animated.timing(bannerPanX, {
      toValue: 260,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => {
      bannerPanX.setValue(-260);
      setActiveBannerIndex((prev) => (prev - 1 + annoncesFiltrees.length) % annoncesFiltrees.length);
      Animated.spring(bannerPanX, {
        toValue: 0,
        friction: 8,
        tension: 80,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    });
  }, [annoncesFiltrees.length, bannerPanX]);

  const bannerPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return annoncesFiltrees.length > 1 && Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        },
        onPanResponderMove: (_, gestureState) => {
          bannerPanX.setValue(gestureState.dx);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -45 || gestureState.vx < -0.35) {
            rotateToNextBanner();
          } else if (gestureState.dx > 45 || gestureState.vx > 0.35) {
            rotateToPrevBanner();
          } else {
            Animated.spring(bannerPanX, {
              toValue: 0,
              friction: 7,
              tension: 85,
              useNativeDriver: Platform.OS !== 'web',
            }).start();
          }
        },
      }),
    [annoncesFiltrees.length, rotateToNextBanner, rotateToPrevBanner, bannerPanX]
  );

  // Filtrer les documents par catégorie, recherche intelligente (Titre, Description, Tags, Catégorie) et état d'acquisition
  const filteredDocuments = documents.filter((doc) => {
    const matchesCategory =
      selectedCategory === 'Tout' || doc.categorie === selectedCategory;

    // Normalisation d'un texte pour recherche tolérante (retrait de '#', minuscules, suppression accents)
    const normaliserTexte = (texte: string = '') =>
      texte
        .replace(/#/g, '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const queryNormalisee = normaliserTexte(searchQuery);

    let matchesSearch = true;
    if (queryNormalisee.length > 0) {
      const titreNorm = normaliserTexte(doc.titre);
      const descNorm = normaliserTexte(doc.description);
      const tagsNorm = normaliserTexte(doc.tags);
      const catNorm = normaliserTexte(doc.categorie);

      matchesSearch =
        titreNorm.includes(queryNormalisee) ||
        descNorm.includes(queryNormalisee) ||
        tagsNorm.includes(queryNormalisee) ||
        catNorm.includes(queryNormalisee);
    }
    
    // Règle de filtrage : document actif et non encore débloqué par cet utilisateur
    const matchesFilter = doc.statut === 'actif' && !docsDebloquesIds.includes(doc.id);
    
    return matchesCategory && matchesSearch && matchesFilter;
  });


  const handleUnlock = async (docId: string, docPrix: number) => {
    // Si l'utilisateur est abonné VIP : acquisition gratuite directe dans l'espace VIP
    if (estVip) {
      const { acquerirDocumentVIP } = require('../services/serviceDocument');
      const result = await acquerirDocumentVIP(docId);
      if (result.success) {
        debloquerDocument(docId);
        if (Platform.OS === 'web') {
          window.alert(result.message || 'Cours ajouté avec succès à votre dossier VIP 👑 !');
        } else {
          Alert.alert('Accès VIP 👑', result.message || 'Cours ajouté avec succès à votre dossier VIP !');
        }
      } else {
        if (Platform.OS === 'web') {
          window.alert(result.message);
        } else {
          Alert.alert('Erreur ❌', result.message);
        }
      }
      return;
    }

    const { debloquerDocument: supabaseUnlock } = require('../services/serviceDocument');
    const result = await supabaseUnlock(docId, docPrix);
    if (result.success) {
      consommerOffreBienvenueLocal();
      debloquerDocument(docId);
      if (Platform.OS === 'web') {
        window.alert(result.message);
      } else {
        alert(result.message);
      }
    } else {
      if (Platform.OS === 'web') {
        window.alert(result.message);
      } else {
        alert(result.message);
      }
    }
  };


  const renderDocumentCard = ({ item }: { item: Document }) => (
    <CarteDocument
      document={item}
      largeur={largeurCarte}
      onPress={() =>
        navigation.navigate('DocumentViewer', {
          document: item,
          onUnlock: (id) => {
            debloquerDocument(id);
          },
        })
      }
      onUnlockPress={() => handleUnlock(item.id, item.prix)}
    />
  );

  const docAssocie = selectedAnnonce?.document_id_associe
    ? documents.find((d) => d.id === selectedAnnonce.document_id_associe)
    : null;

  const naviguerVersDocAssocie = () => {
    if (!docAssocie) return;
    setAnnonceModalVisible(false);
    navigation.navigate('DocumentViewer', {
      document: docAssocie,
      onUnlock: (id) => {
        debloquerDocument(id);
      },
    });
  };



  const RenderSkeletonCard = () => (
    <View style={[styles.skeletonCard, { backgroundColor: couleurs.blanc, borderColor: couleurs.bordure }]}>
      <View style={[styles.skeletonCover, { backgroundColor: couleurs.estSombre ? '#2A2A2E' : '#E8ECEF' }]} />
      <View style={styles.skeletonContent}>
        <View style={[styles.skeletonLineShort, { backgroundColor: couleurs.estSombre ? '#3A3A3F' : '#DFE4E8' }]} />
        <View style={[styles.skeletonLineLong, { backgroundColor: couleurs.estSombre ? '#3A3A3F' : '#DFE4E8' }]} />
        <View style={[styles.skeletonLineMedium, { backgroundColor: couleurs.estSombre ? '#3A3A3F' : '#DFE4E8' }]} />
        <View style={styles.skeletonRow}>
          <View style={[styles.skeletonBadge, { backgroundColor: couleurs.estSombre ? '#3A3A3F' : '#DFE4E8' }]} />
          <View style={[styles.skeletonPrice, { backgroundColor: couleurs.estSombre ? '#3A3A3F' : '#DFE4E8' }]} />
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar 
        barStyle="light-content" 
        backgroundColor={couleurs.fondEntete} 
      />
      {/* 1. Entête supérieur fixe (cauZon + profil) */}
      <View style={[styles.header, { zIndex: 30 }]}>
        <Text style={styles.appName}>cauZon</Text>
        <TouchableOpacity onPress={() => setSettingsVisible(true)} style={styles.profileBtn} activeOpacity={0.8}>
          <AvatarDynamique 
            taille={34} 
            aNotification={aReponseNonLue} 
            estVip={estVip} 
          />
          <View style={styles.profileSettingsGearBadge}>
            <Ionicons name="settings-sharp" size={10} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      </View>

      {/* 2. Zone principale avec Header Flottant One UI et ScrollView stable */}
      <View style={{ flex: 1, position: 'relative' }}>
        {/* Barre de Recherche et Matières Flottante One UI (Superposition absolue sans Layout Shift) */}
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 20,
            backgroundColor: couleurs.fond,
            transform: [{ translateY: headerTranslateY }],
            opacity: headerOpacity,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.08,
            shadowRadius: 5,
            elevation: 4,
          }}
          pointerEvents={barreFiltresVisible ? 'auto' : 'none'}
        >
          <View style={{ paddingTop: 4, paddingBottom: 4 }}>
            {/* 1. Barre de Recherche Dynamique Compacte */}
            <View style={styles.searchContainer}>
              <View style={styles.searchBar}>
                <Ionicons name="search-outline" size={18} color={couleurs.texteSecondaire} />
                <TextInput
                  placeholder="Rechercher des cours, annales..."
                  placeholderTextColor={couleurs.texteSecondaire}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  style={styles.searchInput}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={16} color={couleurs.texteSecondaire} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* 2. Catégories Horizontales Dynamiques Compactes */}
            <View style={styles.categoriesContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoriesList}
              >
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryBtn,
                      selectedCategory === cat && styles.categoryBtnActive,
                    ]}
                    onPress={() => setSelectedCategory(cat)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.categoryBtnText,
                        selectedCategory === cat && styles.categoryBtnTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Animated.View>

        {/* 3. Liste Défilante 100% Native & Fluide (Zéro Layout Shift, paddingTop calibré) */}
        <ScrollView 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={[styles.scrollContent, { paddingTop: 96 }]}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          bounces={true}
          overScrollMode="never"
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh} 
              colors={[couleurs.primaire]} 
              tintColor={couleurs.primaire}
              progressViewOffset={90}
            />
          }
        >


        {/* Pile de Bannières d'Annonces (Stack / Swipe Carousel) — Signature cauZon */}
        {annoncesFiltrees.length > 0 && currentAnnonce && (() => {
          const isUrgent = currentAnnonce.type_importance === 'urgent';
          const isPromo = currentAnnonce.type_importance === 'promo';
          const isDark = couleurs.estSombre;

          const bandBg = isUrgent
            ? '#8B0000'
            : isPromo
            ? '#065F46'
            : (isDark ? '#2D0A14' : '#6B1124');

          const borderColor = isUrgent
            ? 'rgba(231, 76, 60, 0.6)'
            : isPromo
            ? 'rgba(16, 185, 129, 0.5)'
            : (isDark ? 'rgba(245, 235, 208, 0.25)' : 'rgba(245, 235, 208, 0.4)');

          const badgeBg = isUrgent
            ? 'rgba(231, 76, 60, 0.35)'
            : isPromo
            ? 'rgba(16, 185, 129, 0.3)'
            : 'rgba(255, 255, 255, 0.18)';

          const badgeText = isUrgent ? 'URGENT' : isPromo ? 'PROMO' : 'ANNONCE';
          const iconName = isUrgent ? 'alert-circle' : isPromo ? 'gift' : 'megaphone';

          // Couleur de la carte arrière-plan pour l'effet empilé
          let nextCardBg = '#4A0D1A';
          if (nextAnnonce) {
            nextCardBg = nextAnnonce.type_importance === 'urgent'
              ? '#6B0000'
              : nextAnnonce.type_importance === 'promo'
              ? '#044A36'
              : (isDark ? '#21060E' : '#4E0C1B');
          }

          const rotateInterpolate = bannerPanX.interpolate({
            inputRange: [-200, 0, 200],
            outputRange: ['-5deg', '0deg', '5deg'],
            extrapolate: 'clamp',
          });

          const opacityInterpolate = bannerPanX.interpolate({
            inputRange: [-220, 0, 220],
            outputRange: [0.75, 1, 0.75],
            extrapolate: 'clamp',
          });

          // Extraction et parsing du média attaché s'il existe
          const mediaMatch = currentAnnonce.contenu_detaille?.match(/\[MEDIA:(image|video):([^\]]+)\]/);
          const mediaType = mediaMatch ? (mediaMatch[1] as 'image' | 'video') : null;
          const mediaUrl = mediaMatch ? mediaMatch[2] : null;
          const cleanDesc = currentAnnonce.contenu_detaille?.replace(/\[MEDIA:(image|video):([^\]]+)\]/, '').trim();

          return (
            <View style={styles.bannerStackContainer}>
              {/* Carte d'arrière-plan simulant l'effet d'empilement / Stack (Widget iOS/Samsung) */}
              {totalBanners > 1 && (
                <View
                  style={[
                    styles.bannerStackedBackCard,
                    {
                      backgroundColor: nextCardBg,
                      borderColor: 'rgba(245, 235, 208, 0.18)',
                    },
                  ]}
                />
              )}

              {/* Carte Supérieure Active / Déplaçable au Swipe Tactile */}
              <Animated.View
                style={[
                  styles.announcementBand,
                  {
                    backgroundColor: bandBg,
                    borderColor: borderColor,
                    transform: [{ translateX: bannerPanX }, { rotate: rotateInterpolate }],
                    opacity: opacityInterpolate,
                  },
                ]}
                {...bannerPanResponder.panHandlers}
              >
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => {
                    setSelectedAnnonce(currentAnnonce);
                    setAnnonceModalVisible(true);
                  }}
                  style={styles.announcementBandContent}
                >
                  {/* Pastille Icône & Badge */}
                  <View style={[styles.announcementIconBadge, { backgroundColor: badgeBg }]}>
                    <Ionicons name={iconName} size={15} color="#FAF6EB" />
                    <Text style={styles.announcementBadgeLabel}>{badgeText}</Text>
                  </View>

                  {/* Vignette miniature du média si présent */}
                  {mediaUrl && (
                    <View style={styles.bannerThumbnailWrapper}>
                      {mediaType === 'video' ? (
                        <View style={styles.bannerVideoThumbnailPlaceholder}>
                          <Ionicons name="play" size={13} color="#FAF6EB" />
                        </View>
                      ) : (
                        <Image source={{ uri: mediaUrl }} style={styles.bannerImageThumbnail} resizeMode="cover" />
                      )}
                    </View>
                  )}

                  {/* Titre & Aperçu enveloppant nettoyé */}
                  <View style={{ flex: 1, marginHorizontal: 10 }}>
                    <Text style={styles.announcementBandText} numberOfLines={2}>
                      {currentAnnonce.titre_bande}
                    </Text>
                    {cleanDesc ? (
                      <Text style={styles.announcementBandSubText} numberOfLines={2}>
                        {cleanDesc}
                      </Text>
                    ) : null}
                  </View>

                  {/* Compteur de Pile / Navigation interactive si > 1 */}
                  {totalBanners > 1 ? (
                    <View style={styles.stackIndicatorPill}>
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          rotateToPrevBanner();
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="chevron-back" size={13} color="#FAF6EB" />
                      </TouchableOpacity>
                      <Text style={styles.stackCountText}>
                        {currBannerIdx + 1}/{totalBanners}
                      </Text>
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          rotateToNextBanner();
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="chevron-forward" size={13} color="#FAF6EB" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.announcementChevronCircle}>
                      <Ionicons name="chevron-forward" size={14} color="#FAF6EB" />
                    </View>
                  )}
                </TouchableOpacity>
              </Animated.View>
            </View>
          );
        })()}

        {/* 4. Grille de Documents / Skeletons / Erreur */}
        <View style={styles.gridHeader}>
          <Text style={styles.sectionTitle}>Documents disponibles</Text>
          <Text style={styles.resultCount}>
            {loading ? '...' : `${filteredDocuments.length} document${filteredDocuments.length > 1 ? 's' : ''}`}
          </Text>
        </View>

        {loading ? (
          <View style={styles.gridContainer}>
            <View style={styles.columnWrapper}>
              <SkeletonCarte largeur={largeurCarte} />
              <SkeletonCarte largeur={largeurCarte} />
            </View>
            <View style={styles.columnWrapper}>
              <SkeletonCarte largeur={largeurCarte} />
              <SkeletonCarte largeur={largeurCarte} />
            </View>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="cloud-offline-outline" size={48} color="#E74C3C" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadDocuments}>
              <Text style={styles.retryBtnText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        ) : filteredDocuments.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={48} color={couleurs.texteSecondaire} />
            <Text style={styles.emptyText}>Aucun document disponible pour le moment</Text>
          </View>
        ) : (
          <View style={styles.gridContainer}>
            <FlatList
              key={nombreColonnes}
              data={filteredDocuments}
              renderItem={renderDocumentCard}
              keyExtractor={(item) => item.id}
              numColumns={nombreColonnes}
              scrollEnabled={false}
              columnWrapperStyle={styles.columnWrapper}
            />
          </View>
        )}

        <View style={styles.spacer} />
      </ScrollView>
    </View>


      <ModaleParametres
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
      />

      {/* Modale Lecteur de Notification (Annonce Signature cauZon) */}
      <Modal
        visible={annonceModalVisible}
        transparent={true}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setAnnonceModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: couleurs.blanc, borderColor: couleurs.bordure }]}>
            {/* Header Bordeaux Signature cauZon */}
            <View style={[styles.modalHeader, { backgroundColor: '#6B1124' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons
                    name={
                      selectedAnnonce?.type_importance === 'urgent'
                        ? 'alert-circle'
                        : selectedAnnonce?.type_importance === 'promo'
                        ? 'gift'
                        : 'megaphone'
                    }
                    size={18}
                    color="#FAF6EB"
                  />
                </View>
                <View>
                  <Text style={[styles.modalHeaderTitle, { color: '#FAF6EB' }]}>
                    {selectedAnnonce?.type_importance === 'urgent'
                      ? 'Alerte Urgente'
                      : selectedAnnonce?.type_importance === 'promo'
                      ? 'Offre Spéciale'
                      : 'Annonce Officielle'}
                  </Text>
                  <Text style={{ fontSize: 11, color: 'rgba(250,246,235,0.7)', fontWeight: '600' }}>
                    Université cauZon
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setAnnonceModalVisible(false)} style={styles.closeModalBtn}>
                <Ionicons name="close" size={20} color="#FAF6EB" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              {(() => {
                const selectedMediaMatch = selectedAnnonce?.contenu_detaille?.match(/\[MEDIA:(image|video):([^\]]+)\]/);
                const selectedMediaType = selectedMediaMatch ? (selectedMediaMatch[1] as 'image' | 'video') : null;
                const selectedMediaUrl = selectedMediaMatch ? selectedMediaMatch[2] : null;
                const selectedCleanDesc = selectedAnnonce?.contenu_detaille?.replace(/\[MEDIA:(image|video):([^\]]+)\]/, '').trim();

                return (
                  <>
                    <Text style={[styles.annonceTitre, { color: couleurs.texte }]}>
                      {selectedAnnonce?.titre_bande}
                    </Text>

                    {/* Média visuel attaché (Photo promotionnelle ou Vidéo marketing) */}
                    {selectedMediaUrl && (
                      <View style={styles.modalMediaContainer}>
                        {selectedMediaType === 'video' ? (
                          Platform.OS === 'web' ? (
                            <video
                              src={selectedMediaUrl}
                              controls
                              autoPlay
                              muted
                              style={{ width: '100%', maxHeight: 240, borderRadius: 12, backgroundColor: '#000', outline: 'none' }}
                            />
                          ) : (
                            <View style={{ width: '100%', height: 180, backgroundColor: '#000', borderRadius: 12, justifyContent: 'center', alignItems: 'center' }}>
                              <Ionicons name="play-circle" size={54} color="#FAF6EB" />
                              <Text style={{ color: '#FAF6EB', fontSize: 12, fontWeight: '700', marginTop: 6 }}>Vidéo Marketing</Text>
                            </View>
                          )
                        ) : (
                          <Image
                            source={{ uri: selectedMediaUrl }}
                            style={styles.modalBannerImage}
                            resizeMode="cover"
                          />
                        )}
                      </View>
                    )}
                    
                    <Text style={[styles.annonceContenu, { color: couleurs.texteSecondaire }]}>
                      {selectedCleanDesc || selectedAnnonce?.contenu_detaille}
                    </Text>
                  </>
                );
              })()}

              {docAssocie && (
                <View style={[styles.promotedDocCard, { backgroundColor: couleurs.fond, borderColor: '#6B1124' }]}>
                  <Text style={styles.promotedLabel}>📘 Document Associé</Text>
                  <View style={styles.promotedDocInfo}>
                    <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(107,17,36,0.1)', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name="document-text" size={26} color="#6B1124" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.promotedDocTitle, { color: couleurs.texte }]} numberOfLines={1}>
                        {docAssocie.titre}
                      </Text>
                      <Text style={styles.promotedDocMeta}>
                        {docAssocie.categorie} • {(docAssocie.nombrePages || (docAssocie as any).total_pages || (docAssocie as any).page_count || (docAssocie as any).nombre_pages || 0) > 0 ? `${docAssocie.nombrePages || (docAssocie as any).total_pages || (docAssocie as any).page_count || (docAssocie as any).nombre_pages} pages` : 'Document complet'}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.promotedActionBtn, { backgroundColor: '#6B1124' }]}
                    onPress={naviguerVersDocAssocie}
                  >
                    <Text style={[styles.promotedActionText, { color: '#FAF6EB' }]}>
                      Accéder au cours
                    </Text>
                    <Ionicons name="arrow-forward" size={16} color="#FAF6EB" style={{ marginLeft: 6 }} />
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalCloseFooterBtn, { backgroundColor: '#6B1124' }]}
                onPress={() => setAnnonceModalVisible(false)}
              >
                <Text style={[styles.modalCloseFooterText, { color: '#FAF6EB' }]}>J'ai compris</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (couleurs: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: couleurs.fond,
    width: '100%',
  },
  header: {
    backgroundColor: couleurs.fondEntete,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight ? StatusBar.currentHeight + 8 : 32),
    paddingBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
  },
  profileBtn: {
    position: 'absolute',
    right: 20,
    top: Platform.OS === 'ios' ? 56 : (StatusBar.currentHeight ? StatusBar.currentHeight + 10 : 34),
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: couleurs.estSombre ? 'rgba(255, 255, 255, 0.08)' : 'rgba(245, 235, 208, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: couleurs.accent,
  },
  profileEmoji: {
    fontSize: 22,
  },
  profileSettingsGearBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: couleurs.primaire,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: couleurs.blanc,
  },
  appName: {
    fontSize: 48,
    fontWeight: '900',
    color: couleurs.texteEntete,
    letterSpacing: 1,
    textAlign: 'center',
    lineHeight: Platform.OS === 'ios' ? 56 : 52,
  },
  searchContainer: {
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: couleurs.blanc,
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 38,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    color: couleurs.texte,
    fontSize: 13,
    fontWeight: '500',
  },
  scrollContent: {
    paddingTop: 10,
  },
  categoriesContainer: {
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: couleurs.primaire,
    marginHorizontal: 20,
    marginBottom: 10,
  },
  categoriesList: {
    paddingHorizontal: 12,
  },
  categoryBtn: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 15,
    backgroundColor: couleurs.blanc,
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  categoryBtnActive: {
    backgroundColor: couleurs.primaire,
    borderColor: couleurs.primaire,
  },
  categoryBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: couleurs.texte,
  },
  categoryBtnTextActive: {
    color: couleurs.accent,
  },

  gridHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  resultCount: {
    fontSize: 12,
    color: couleurs.texteSecondaire,
    fontWeight: '600',
  },
  gridContainer: {
    paddingHorizontal: 12,
  },
  columnWrapper: {
    justifyContent: 'flex-start',
    gap: 16,
    paddingHorizontal: 8,
    flexDirection: 'row',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    marginTop: 10,
    fontSize: 14,
    color: couleurs.texteSecondaire,
  },
  spacer: {
    height: 40,
  },
  skeletonCard: {
    flex: 1,
    margin: 8,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    height: 230,
  },
  skeletonCover: {
    width: '100%',
    height: 110,
  },
  skeletonContent: {
    padding: 12,
    gap: 8,
  },
  skeletonLineShort: {
    height: 10,
    width: '40%',
    borderRadius: 4,
  },
  skeletonLineLong: {
    height: 12,
    width: '90%',
    borderRadius: 4,
  },
  skeletonLineMedium: {
    height: 10,
    width: '70%',
    borderRadius: 4,
  },
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  skeletonBadge: {
    height: 16,
    width: 50,
    borderRadius: 8,
  },
  skeletonPrice: {
    height: 16,
    width: 40,
    borderRadius: 4,
  },
  errorContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: couleurs.texte,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  retryBtn: {
    backgroundColor: couleurs.primaire,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },

  // Styles de la bande d'annonce dynamiques — Format Large, Enveloppant & Signature cauZon
  bannerStackContainer: {
    position: 'relative',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 16,
  },
  bannerStackedBackCard: {
    position: 'absolute',
    top: 6,
    left: 10,
    right: 10,
    bottom: -6,
    borderRadius: 18,
    borderWidth: 1,
    opacity: 0.6,
    transform: [{ scaleX: 0.96 }],
  },
  announcementBand: {
    borderRadius: 18,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#6B1124',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 6,
  },
  stackIndicatorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  stackCountText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FAF6EB',
    letterSpacing: 0.5,
  },
  announcementBandContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  announcementIconBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  announcementBadgeLabel: {
    color: '#FAF6EB',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  announcementBandText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FAF6EB',
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  announcementBandSubText: {
    fontSize: 12.5,
    color: 'rgba(250, 246, 235, 0.88)',
    marginTop: 3,
    lineHeight: 17,
    fontWeight: '500',
  },
  announcementChevronCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  bannerThumbnailWrapper: {
    width: 36,
    height: 36,
    borderRadius: 9,
    overflow: 'hidden',
    marginLeft: 6,
    borderWidth: 1,
    borderColor: 'rgba(250, 246, 235, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerImageThumbnail: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  bannerVideoThumbnailPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalMediaContainer: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: couleurs.bordure,
    marginBottom: 16,
    backgroundColor: '#000',
  },
  modalBannerImage: {
    width: '100%',
    height: 200,
    borderRadius: 14,
  },

  // Modale Notification/Lecteur d'annonce — Signature cauZon
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '85%',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#6B1124',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 18,
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  closeModalBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: {
    padding: 24,
  },
  annonceTitre: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 14,
    lineHeight: 26,
    fontFamily: 'Outfit, sans-serif',
  },
  annonceContenu: {
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 24,
  },
  promotedDocCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    marginTop: 8,
  },
  promotedLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B1124',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  promotedDocInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  promotedDocTitle: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  promotedDocMeta: {
    fontSize: 12,
    color: '#7D6B6E',
    marginTop: 3,
  },
  promotedActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#6B1124',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  promotedActionText: {
    fontSize: 13.5,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
  modalFooter: {
    padding: 18,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.06)',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalCloseFooterBtn: {
    paddingVertical: 11,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  modalCloseFooterText: {
    fontSize: 13.5,
    fontWeight: '800',
  },
});
