import React from 'react';
import { StyleSheet, Text, View, Dimensions, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../store/ContexteApp';
import { Document } from '../types';

interface FolderListProps {
  documents: Document[];
  surClicDossier: (categorie: string) => void;
}

export default function ListeDossiers({ documents, surClicDossier }: FolderListProps) {
  const { couleurs } = useApp();
  const { width } = useWindowDimensions();
  
  // Calculer le nombre de colonnes et la largeur dynamique pour les dossiers
  const nombreColonnes = width > 1200 ? 5 : width > 900 ? 4 : width > 600 ? 3 : 2;
  const margeGrille = 12; // gap
  const paddingEcran = 52; // marge totale (26 de chaque côté)
  const largeurCarte = (width - paddingEcran - (nombreColonnes - 1) * margeGrille) / nombreColonnes;
  const styles = getStyles(couleurs);

  // Regrouper les documents par catégorie
  const compteursCategories = documents.reduce((accumulateur, doc) => {
    accumulateur[doc.categorie] = (accumulateur[doc.categorie] || 0) + 1;
    return accumulateur;
  }, {} as Record<string, number>);

  const categories = Object.keys(compteursCategories);

  if (categories.length === 0) {
    return (
      <View style={styles.conteneurVide}>
        <Ionicons name="folder-open-outline" size={32} color={couleurs.texteSecondaire} />
        <Text style={styles.texteVide}>Aucun dossier thématique</Text>
      </View>
    );
  }

  return (
    <View style={styles.grilleDossiers}>
      {categories.map((categorie) => (
        <TouchableOpacity 
          key={categorie} 
          style={[styles.carteDossier, { width: largeurCarte }]}
          activeOpacity={0.8}
          onPress={() => surClicDossier(categorie)}
        >
          <Ionicons name="folder" size={40} color={couleurs.primaire} />
          <Text style={styles.nomDossier} numberOfLines={1}>
            {categorie}
          </Text>
          <Text style={styles.nombreFichiers}>
            ({compteursCategories[categorie]}) document{compteursCategories[categorie] > 1 ? 's' : ''}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const getStyles = (couleurs: any) => StyleSheet.create({
  grilleDossiers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  carteDossier: {
    width: (Dimensions.get('window').width - 52) / 2, // 2 colonnes avec marges
    backgroundColor: couleurs.blanc,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  nomDossier: {
    fontSize: 14,
    fontWeight: 'bold',
    color: couleurs.texte,
    marginTop: 10,
    marginBottom: 2,
  },
  nombreFichiers: {
    fontSize: 11,
    color: couleurs.texteSecondaire,
    fontWeight: '600',
  },
  conteneurVide: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: couleurs.blanc,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderStyle: 'dashed',
  },
  texteVide: {
    fontSize: 12,
    color: couleurs.texteSecondaire,
    marginTop: 8,
    fontWeight: '500',
  },
});
