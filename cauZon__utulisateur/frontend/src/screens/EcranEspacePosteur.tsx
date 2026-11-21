import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  Platform,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '../components/AppIcon';
import { useApp } from '../store/ContexteApp';
import { supabase } from '../lib/supabase';
import TransitionPage from '../components/TransitionPage';
import ModaleExtensionPosteur from '../components/ModaleExtensionPosteur';
import ModalePublicationPosteur from '../components/ModalePublicationPosteur';
import {
  EspacePosteur,
  chargerEspacePosteur,
  activerEspacePosteur,
  mettreAJourProfilPosteur,
  SEUIL_RETRAIT_FCFA,
  GAIN_PAR_ACQUISITION_FCFA,
  QUOTA_POSTEUR_BASE_MO,
  EXTENSION_POSTEUR_MO,
  PRIX_EXTENSION_POSTEUR_FCFA,
  TAILLE_MAX_PDF_MO,
} from '../services/serviceEspacePosteur';

const fcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;

const extraireHashtags = (tags?: string | null): string[] =>
  (tags || '')
    .split(/[,\s#]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 3);

/**
 * Espace Posteur — profil créateur inspiré d'une page profil TikTok.
 * Cumulatif avec le statut lambda : cet écran s'ajoute, il ne remplace rien.
 */
export default function EcranEspacePosteur() {
  const { couleurs, utilisateur, estConnecteGoogle, nomUtilisateur, photoProfil, afficherToast } = useApp();
  const styles = getStyles(couleurs);
  const navigation = useNavigation<any>();
  const retour = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('MainTabs');
  }, [navigation]);

  const [espace, setEspace] = useState<EspacePosteur | null>(null);
  const [chargement, setChargement] = useState(true);
  const [rafraichissement, setRafraichissement] = useState(false);
  const [modaleExtension, setModaleExtension] = useState(false);
  const [modalePublication, setModalePublication] = useState(false);

  // Activation / édition du profil créateur
  const [pseudo, setPseudo] = useState('');
  const [bio, setBio] = useState('');
  const [avatarPerso, setAvatarPerso] = useState<string | null>(null);
  const [activationEnCours, setActivationEnCours] = useState(false);
  const [edition, setEdition] = useState(false);

  const userId: string | undefined = utilisateur?.id;

  const charger = useCallback(
    async (silencieux = false) => {
      if (!userId) {
        setChargement(false);
        return;
      }
      if (!silencieux) setChargement(true);
      try {
        const data = await chargerEspacePosteur(userId);
        setEspace(data);
        if (data.wallet?.avatar_url) {
          setAvatarPerso(data.wallet.avatar_url);
        }
      } catch (_) {
        afficherToast('Impossible de charger votre espace posteur.', 'Erreur', 'erreur');
      } finally {
        setChargement(false);
        setRafraichissement(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    charger();
  }, [charger]);

  // 📡 Temps réel : gains, quota, publications et retraits se mettent à jour sans rafraîchir
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`espace-posteur-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posteurs_wallets', filter: `user_id=eq.${userId}` }, () => charger(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents', filter: `author_id=eq.${userId}` }, () => charger(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'demandes_retrait_posteurs', filter: `posteur_id=eq.${userId}` }, () => charger(true))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, charger]);

  const wallet = espace?.wallet ?? null;
  const posteurActif = Boolean(wallet?.est_posteur_actif);

  /**
   * Sélecteur de photo de profil depuis la galerie de l'appareil
   */
  const choisirPhotoProfil = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status === 'denied') {
          afficherToast('Activez l\'accès aux photos dans les réglages de votre appareil.', 'Galerie Photos', 'erreur');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setAvatarPerso(result.assets[0].uri);
        afficherToast('Photo de profil sélectionnée.', 'Photo 📸', 'succes');
      }
    } catch (err: any) {
      console.warn('Erreur choix image galerie :', err);
      afficherToast('Impossible d\'ouvrir la galerie photos.', 'Erreur', 'erreur');
    }
  };

  const activer = async () => {
    setActivationEnCours(true);
    const photoAEnvoyer = avatarPerso || photoProfil || null;
    const res = await activerEspacePosteur(pseudo || nomUtilisateur, bio, photoAEnvoyer);
    setActivationEnCours(false);
    if (res.success) {
      afficherToast('Votre espace posteur est activé ! Vos droits d\'étudiant lambda restent intacts.', 'Bienvenue créateur 🎬', 'succes');
      charger(true);
    } else {
      afficherToast(res.message || "Activation impossible.", 'Erreur', 'erreur');
    }
  };

  const sauverProfil = async () => {
    if (!userId) return;
    const res = await mettreAJourProfilPosteur(userId, pseudo, bio, avatarPerso);
    afficherToast(res.message, res.success ? 'Profil' : 'Erreur', res.success ? 'succes' : 'erreur');
    if (res.success) {
      setEdition(false);
      charger(true);
    }
  };

  // ───────────── Non connecté ─────────────
  if (!userId || !estConnecteGoogle) {
    return (
      <TransitionPage>
        <SafeAreaView style={styles.container}>
          <EnteteSousPage styles={styles} couleurs={couleurs} onRetour={retour} />
          <View style={styles.centre}>
            <Ionicons name="person-circle-outline" size={64} color={couleurs.texteSecondaire} />
            <Text style={styles.centreTitre}>Connectez-vous pour accéder à l'espace posteur</Text>
            <Text style={styles.centreTexte}>Votre compte Google suffit : vous restez lecteur lambda et pouvez aussi publier.</Text>
          </View>
        </SafeAreaView>
      </TransitionPage>
    );
  }

  if (chargement) {
    return (
      <TransitionPage>
        <SafeAreaView style={styles.container}>
          <EnteteSousPage styles={styles} couleurs={couleurs} onRetour={retour} />
          <View style={styles.centre}>
            <ActivityIndicator size="large" color={couleurs.primaire} />
          </View>
        </SafeAreaView>
      </TransitionPage>
    );
  }

  // ───────────── Activation de l'espace posteur ─────────────
  if (!posteurActif) {
    const avatarApercu = avatarPerso || photoProfil;
    return (
      <TransitionPage>
        <SafeAreaView style={styles.container}>
          <EnteteSousPage styles={styles} couleurs={couleurs} onRetour={retour} />
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
            <View style={styles.activationCarte}>
              {/* Photo de profil personnalisée */}
              <TouchableOpacity onPress={choisirPhotoProfil} style={styles.avatarPickerWrap} activeOpacity={0.8}>
                {avatarApercu ? (
                  <Image source={{ uri: avatarApercu }} style={styles.avatarGrand} />
                ) : (
                  <View style={[styles.avatarGrand, styles.avatarVide]}>
                    <Ionicons name="person" size={44} color={couleurs.texteSecondaire} />
                  </View>
                )}
                <View style={styles.cameraBadge}>
                  <Ionicons name="camera" size={16} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
              <Text style={styles.avatarPickerLabel}>Appuyez pour choisir votre photo de profil</Text>

              <Text style={styles.centreTitre}>Devenez posteur cauZon</Text>
              <Text style={styles.centreTexte}>
                Publiez vos cours en PDF et gagnez {GAIN_PAR_ACQUISITION_FCFA} FCFA à chaque acquisition. Votre statut de lecteur lambda
                reste actif : vous pouvez acheter les documents des autres (jamais les vôtres).
              </Text>

              <TextInput
                style={styles.input}
                value={pseudo}
                onChangeText={setPseudo}
                placeholder={`Nom de créateur ou d'organisation (${nomUtilisateur})`}
                placeholderTextColor={couleurs.texteSecondaire}
                maxLength={40}
              />
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                value={bio}
                onChangeText={setBio}
                placeholder="Bio : école, filière, spécialités, niveau…"
                placeholderTextColor={couleurs.texteSecondaire}
                multiline
                maxLength={160}
              />

              {activationEnCours ? (
                <ActivityIndicator color={couleurs.primaire} />
              ) : (
                <TouchableOpacity style={styles.boutonPrimaire} onPress={activer} activeOpacity={0.85}>
                  <Text style={styles.boutonPrimaireTxt}>Activer mon espace posteur</Text>
                </TouchableOpacity>
              )}
            </View>

            <ReglesPublication styles={styles} couleurs={couleurs} />
          </ScrollView>
        </SafeAreaView>
      </TransitionPage>
    );
  }

  // ───────────── Espace posteur actif ─────────────
  const quota = Number(wallet?.quota_stockage_mo) || QUOTA_POSTEUR_BASE_MO;
  const utilise = espace?.espaceUtiliseMo || 0;
  const pctEspace = Math.min(100, (utilise / quota) * 100);
  const espacePlein = utilise >= quota;
  const solde = Number(wallet?.solde_retirable) || 0;
  const manque = Math.max(0, SEUIL_RETRAIT_FCFA - solde);
  const retraitPossible = solde >= SEUIL_RETRAIT_FCFA;
  const pctSeuil = Math.min(100, (solde / SEUIL_RETRAIT_FCFA) * 100);
  const nomAffiche = wallet?.pseudo_createur || nomUtilisateur;
  const avatar = avatarPerso || wallet?.avatar_url || photoProfil;
  const publications = espace?.publications ?? [];

  return (
    <TransitionPage>
      <SafeAreaView style={styles.container}>
        <EnteteSousPage styles={styles} couleurs={couleurs} onRetour={retour} />
        <ScrollView
          contentContainerStyle={{ paddingBottom: 140 }}
          refreshControl={
            <RefreshControl
              refreshing={rafraichissement}
              onRefresh={() => {
                setRafraichissement(true);
                charger(true);
              }}
              tintColor={couleurs.primaire}
            />
          }
        >
          {/* ═════════════════════════════════════════════════════════ */}
          {/* 1. EN HAUT AU CENTRE : Profil créateur façon TikTok       */}
          {/* ═════════════════════════════════════════════════════════ */}
          <View style={styles.profilEntete}>
            <TouchableOpacity onPress={choisirPhotoProfil} style={styles.avatarPickerWrap} activeOpacity={0.85}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.avatarGrand} />
              ) : (
                <View style={[styles.avatarGrand, styles.avatarVide]}>
                  <Ionicons name="person" size={44} color={couleurs.texteSecondaire} />
                </View>
              )}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={14} color="#FFFFFF" />
              </View>
            </TouchableOpacity>

            <Text style={styles.profilNom}>{nomAffiche}</Text>
            <Text style={styles.profilBio}>
              {wallet?.bio_createur || 'Ajoutez une bio pour présenter votre école, filière et vos cours.'}
            </Text>

            {/* Statistiques en ligne */}
            <View style={styles.statsLigne}>
              <View style={styles.stat}>
                <Text style={styles.statValeur}>{publications.length}</Text>
                <Text style={styles.statLabel}>Documents</Text>
              </View>
              <View style={styles.statSep} />
              <View style={styles.stat}>
                <Text style={styles.statValeur}>{wallet?.total_acquisitions_recues ?? 0}</Text>
                <Text style={styles.statLabel}>Acquisitions</Text>
              </View>
              <View style={styles.statSep} />
              <View style={styles.stat}>
                <Text style={styles.statValeur}>{fcfa(Number(wallet?.cumul_gains_historique) || 0)}</Text>
                <Text style={styles.statLabel}>Gains cumulés</Text>
              </View>
            </View>

            {/* Boutons d'action compacts style profil TikTok */}
            <View style={styles.actionsProfilLigne}>
              <TouchableOpacity
                style={styles.boutonSecondaire}
                onPress={() => {
                  setPseudo(wallet?.pseudo_createur || '');
                  setBio(wallet?.bio_createur || '');
                  setEdition((e) => !e);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="pencil-outline" size={13} color={couleurs.texte} style={{ marginRight: 5 }} />
                <Text style={styles.boutonSecondaireTxt}>{edition ? 'Annuler' : 'Modifier le profil'}</Text>
              </TouchableOpacity>

              {/* Indicateur compact et discret de stockage en Mo (+400 Mo) */}
              <TouchableOpacity
                style={[styles.badgeStockageCompact, espacePlein && styles.badgeStockageCompactPlein]}
                onPress={() => setModaleExtension(true)}
                activeOpacity={0.75}
              >
                <Ionicons name="server-outline" size={13} color={espacePlein ? '#EF4444' : couleurs.primaire} style={{ marginRight: 5 }} />
                <Text style={[styles.badgeStockageCompactTxt, espacePlein && { color: '#EF4444' }]}>
                  {utilise.toFixed(1)} / {quota} Mo · +400 Mo
                </Text>
              </TouchableOpacity>
            </View>

            {edition && (
              <View style={{ width: '100%', gap: 8, marginTop: 12 }}>
                <TouchableOpacity onPress={choisirPhotoProfil} style={styles.boutonChangerPhoto}>
                  <Ionicons name="image-outline" size={16} color={couleurs.primaire} />
                  <Text style={[styles.boutonSecondaireTxt, { color: couleurs.primaire }]}>Changer la photo de profil</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.input}
                  value={pseudo}
                  onChangeText={setPseudo}
                  placeholder="Nom de créateur ou d'organisation"
                  placeholderTextColor={couleurs.texteSecondaire}
                  maxLength={40}
                />
                <TextInput
                  style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Bio : filière, spécialités, école…"
                  placeholderTextColor={couleurs.texteSecondaire}
                  multiline
                  maxLength={160}
                />
                <TouchableOpacity style={styles.boutonPrimaire} onPress={sauverProfil}>
                  <Text style={styles.boutonPrimaireTxt}>Enregistrer les modifications</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ═════════════════════════════════════════════════════════ */}
          {/* 2. GRILLE DES DOCUMENTS PUBLIÉS (STYLE PROFIL TIKTOK)     */}
          {/* ═════════════════════════════════════════════════════════ */}
          <View style={styles.sectionTitreLigne}>
            <Text style={styles.sectionTitre}>Mes documents publiés ({publications.length})</Text>
            <TouchableOpacity
              style={styles.boutonPublierEntete}
              onPress={() => setModalePublication(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="cloud-upload" size={14} color="#FFFFFF" style={{ marginRight: 5 }} />
              <Text style={styles.boutonPublierEnteteTxt}>Publier un cours</Text>
            </TouchableOpacity>
          </View>

          {publications.length === 0 ? (
            <View style={styles.vide}>
              <Ionicons name="document-text-outline" size={48} color={couleurs.texteSecondaire} />
              <Text style={styles.centreTitre}>Aucun document publié</Text>
              <Text style={styles.centreTexte}>
                Partagez vos cours et recevez {GAIN_PAR_ACQUISITION_FCFA} FCFA à chaque acquisition. Vos cours apparaîtront sur l'accueil avec votre badge de créateur.
              </Text>
              <TouchableOpacity
                style={styles.boutonPublierPremier}
                onPress={() => setModalePublication(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.boutonPublierPremierTxt}>Publier mon premier cours</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.grille}>
              {publications.map((doc) => (
                <View key={doc.id} style={styles.carteDoc}>
                  <View style={styles.couverture}>
                    {doc.cover_url ? (
                      <Image source={{ uri: doc.cover_url }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
                    ) : (
                      <Ionicons name="document-text" size={36} color={couleurs.primaire} />
                    )}
                    {/* Badge photo de profil du posteur sur la miniature */}
                    <View style={styles.avatarMiniWrap}>
                      {avatar ? (
                        <Image source={{ uri: avatar }} style={styles.avatarMini} resizeMode="cover" />
                      ) : (
                        <View style={[styles.avatarMini, styles.avatarVide]} />
                      )}
                    </View>
                  </View>

                  <Text style={styles.docTitre} numberOfLines={2}>{doc.titre}</Text>

                  <View style={styles.hashtags}>
                    {extraireHashtags(doc.tags).map((t) => (
                      <Text key={t} style={styles.hashtag}>#{t}</Text>
                    ))}
                  </View>

                  <Text style={styles.docMeta}>
                    {(Number(doc.taille_mo) || 0).toFixed(1)} Mo · {doc.status === 'published' ? 'En ligne' : doc.status === 'scheduled' ? 'Planifié' : 'Inactif'}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <ReglesPublication styles={styles} couleurs={couleurs} />
        </ScrollView>

        <ModalePublicationPosteur
          visible={modalePublication}
          onClose={() => setModalePublication(false)}
          onSuccess={() => charger(true)}
          quotaActuelMo={quota}
          espaceUtiliseMo={utilise}
          authorPseudo={nomAffiche}
          authorAvatarUrl={avatar}
          onDemanderExtension={() => setModaleExtension(true)}
        />
        <ModaleExtensionPosteur
          visible={modaleExtension}
          quotaActuelMo={quota}
          onClose={() => setModaleExtension(false)}
          onPaiementTermine={() => setTimeout(() => charger(true), 2500)}
        />
      </SafeAreaView>
    </TransitionPage>
  );
}

function EnteteSousPage({ styles, couleurs, onRetour }: { styles: any; couleurs: any; onRetour: () => void }) {
  return (
    <View style={styles.enteteSousPage}>
      <TouchableOpacity onPress={onRetour} style={styles.boutonRetour} activeOpacity={0.8} accessibilityLabel="Retour">
        <Ionicons name="arrow-back" size={22} color={couleurs.texte} />
      </TouchableOpacity>
      <Text style={styles.enteteSousPageTitre}>Espace Posteur</Text>
      <View style={styles.boutonRetour} />
    </View>
  );
}

function ReglesPublication({ styles, couleurs }: { styles: any; couleurs: any }) {
  const regles = [
    `Fichier PDF uniquement, ${TAILLE_MAX_PDF_MO} Mo maximum par document.`,
    'Titre et hashtags obligatoires ; votre photo de profil apparaît sur chaque carte.',
    'Rendu optimisé côté serveur (pages vectorielles) : le PDF brut n’est jamais distribué.',
    'Anti-fraude absolue : vous ne pouvez jamais acquérir vos propres documents.',
    `${GAIN_PAR_ACQUISITION_FCFA} FCFA par acquisition · retrait direct dès ${SEUIL_RETRAIT_FCFA.toLocaleString('fr-FR')} FCFA.`,
  ];
  return (
    <View style={styles.carte}>
      <Text style={styles.carteLabel}>Règles de publication & Sécurité</Text>
      {regles.map((r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
          <Text style={{ flex: 1, fontSize: 12.5, color: couleurs.texteSecondaire, lineHeight: 18 }}>{r}</Text>
        </View>
      ))}
    </View>
  );
}

const getStyles = (c: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.fond },
    enteteSousPage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: Platform.OS === 'android' ? 36 : 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: c.bordure, backgroundColor: c.fond },
    boutonRetour: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    enteteSousPageTitre: { fontSize: 17, fontWeight: '800', color: c.texte },
    centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
    centreTitre: { fontSize: 18, fontWeight: '800', color: c.texte, textAlign: 'center' },
    centreTexte: { fontSize: 13, color: c.texteSecondaire, textAlign: 'center', lineHeight: 19 },
    activationCarte: { backgroundColor: c.fondCarte, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: c.bordure, alignItems: 'center', gap: 12, marginBottom: 14 },
    avatarPickerWrap: { position: 'relative', marginVertical: 6 },
    avatarPickerLabel: { fontSize: 12, fontWeight: '700', color: c.primaire, textAlign: 'center', marginBottom: 6 },
    cameraBadge: { position: 'absolute', right: 2, bottom: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: c.primaire, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
    profilEntete: { alignItems: 'center', paddingTop: 20, paddingHorizontal: 20, paddingBottom: 18 },
    avatarGrand: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: c.primaire },
    avatarVide: { backgroundColor: c.fondCarte, alignItems: 'center', justifyContent: 'center' },
    profilNom: { fontSize: 20, fontWeight: '900', color: c.texte, marginTop: 10 },
    profilBio: { fontSize: 13, color: c.texteSecondaire, textAlign: 'center', marginTop: 4, lineHeight: 18 },
    statsLigne: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 14 },
    stat: { alignItems: 'center', minWidth: 80 },
    statValeur: { fontSize: 15, fontWeight: '900', color: c.texte },
    statLabel: { fontSize: 11, color: c.texteSecondaire, marginTop: 2 },
    statSep: { width: 1, height: 26, backgroundColor: c.bordure },
    input: { width: '100%', borderWidth: 1.5, borderColor: c.bordure, borderRadius: 14, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 12 : 8, fontSize: 14, color: c.texte, backgroundColor: c.fond },
    actionsProfilLigne: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      marginTop: 14,
      flexWrap: 'wrap',
    },
    boutonPrimaire: { flexDirection: 'row', width: '100%', backgroundColor: c.primaire, borderRadius: 16, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
    boutonPrimaireTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
    boutonSecondaire: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8.5, borderRadius: 12, borderWidth: 1.5, borderColor: c.bordure, backgroundColor: c.fond },
    boutonSecondaireTxt: { fontSize: 12.5, fontWeight: '700', color: c.texte },
    badgeStockageCompact: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8.5,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.bordure,
      backgroundColor: c.fondCarte,
    },
    badgeStockageCompactPlein: {
      borderColor: '#EF4444',
      backgroundColor: 'rgba(239, 68, 68, 0.08)',
    },
    badgeStockageCompactTxt: {
      fontSize: 12,
      fontWeight: '800',
      color: c.primaire,
    },
    boutonChangerPhoto: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderWidth: 1, borderColor: c.bordure, borderRadius: 10 },
    boutonDesactive: { flexDirection: 'row', width: '100%', borderRadius: 16, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', marginTop: 10, backgroundColor: c.fond, borderWidth: 1, borderColor: c.bordure },
    boutonDesactiveTxt: { fontSize: 13, fontWeight: '700', color: c.texteSecondaire },
    carte: { backgroundColor: c.fondCarte, borderRadius: 20, padding: 16, marginHorizontal: 16, marginBottom: 14, borderWidth: 1, borderColor: c.bordure },
    carteLigne: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    carteLabel: { fontSize: 12, fontWeight: '700', color: c.texteSecondaire },
    mentionRegleGain: { fontSize: 11, color: '#10B981', fontWeight: '700', marginTop: 2 },
    soldeValeur: { fontSize: 22, fontWeight: '900', color: c.texte, marginTop: 2 },
    barreFond: { height: 8, borderRadius: 4, backgroundColor: c.bordure, overflow: 'hidden' },
    barreRemplie: { height: 8, borderRadius: 4 },
    alerteEspace: { fontSize: 12, fontWeight: '700', color: '#EF4444', marginTop: 8 },
    retraitLigne: { flexDirection: 'row', justifyContent: 'space-between' },
    retraitTxt: { fontSize: 12.5, color: c.texte },
    badgeStatut: { fontSize: 12, fontWeight: '800' },
    sectionTitreLigne: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginHorizontal: 16,
      marginTop: 6,
      marginBottom: 10,
    },
    sectionTitre: { fontSize: 16, fontWeight: '800', color: c.texte },
    boutonPublierEntete: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.primaire,
      borderRadius: 14,
      paddingVertical: 6,
      paddingHorizontal: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 4,
      elevation: 2,
    },
    boutonPublierEnteteTxt: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
    boutonPublierPremier: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.primaire,
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 20,
      marginTop: 8,
    },
    boutonPublierPremierTxt: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '800' },
    vide: { alignItems: 'center', gap: 8, paddingVertical: 32, marginHorizontal: 20 },
    grille: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 10, marginBottom: 14 },
    carteDoc: { width: '47.5%', backgroundColor: c.fondCarte, borderRadius: 16, padding: 10, borderWidth: 1, borderColor: c.bordure },
    couverture: { height: 110, borderRadius: 12, backgroundColor: c.fond, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 8 },
    avatarMiniWrap: { position: 'absolute', left: 6, bottom: 6 },
    avatarMini: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#FFFFFF' },
    docTitre: { fontSize: 13, fontWeight: '800', color: c.texte },
    hashtags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
    hashtag: { fontSize: 11, fontWeight: '700', color: c.primaire },
    docMeta: { fontSize: 11, color: c.texteSecondaire, marginTop: 4 },
  });
