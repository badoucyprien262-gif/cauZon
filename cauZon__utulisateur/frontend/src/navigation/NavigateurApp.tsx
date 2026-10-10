import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '../components/AppIcon';
import NetInfo from '@react-native-community/netinfo';
import EcranAccueil from '../screens/EcranAccueil';
import EcranBibliotheque from '../screens/EcranBibliotheque';
import EcranLecteurDocument from '../screens/EcranLecteurDocument';
import PdfViewerScreen from '../screens/PdfViewerScreen';
import EcranPolitiqueConfidentialite from '../screens/EcranPolitiqueConfidentialite';
import { useApp } from '../store/ContexteApp';
import { Document } from '../types';
import { fetchCatalogueDocuments } from '../services/serviceDocument';

export type RootStackParamList = {
  MainTabs: undefined;
  PolitiqueConfidentialite: undefined;
  DocumentViewer: {
    document: Document;
    onUnlock?: (id: string) => void;
  };
  PdfViewer: {
    titre: string;
    filePath: string;
    estDebloque: boolean;
    limiteApercuPages?: number;
    limiteApercuType?: 'page' | 'pourcentage';
    limiteApercuValeur?: number;
  };
};

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<RootStackParamList>();

import { verifierConnexionReseauRapide } from '../services/serviceReseau';

function NavigateurTabsPrincipales({ navigation }: any) {
  const { couleurs, estEnLigne } = useApp();
  const [estConnecte, setEstConnecte] = React.useState<boolean>(() => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine;
    }
    return estEnLigne ?? true;
  });

  React.useEffect(() => {
    // Si l'appareil est hors-ligne au démarrage sur le Web, basculer immédiatement sur l'onglet Bibliothèque
    const horsLigneInitial = Platform.OS === 'web' && typeof navigator !== 'undefined'
      ? !navigator.onLine
      : !estConnecte;

    if (horsLigneInitial) {
      console.log('⚡ [PWA Routeur] Démarrage hors-ligne détecté -> Basculement sur Bibliothèque');
      navigation?.navigate('Bibliothèque');
    }

    // Écouteurs Web standards online / offline
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleOnline = () => setEstConnecte(true);
      const handleOffline = () => {
        setEstConnecte(false);
        navigation?.navigate('Bibliothèque');
      };
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  React.useEffect(() => {
    // Vérification rapide non bloquante
    verifierConnexionReseauRapide().then((enLigne) => {
      setEstConnecte(enLigne);
      if (!enLigne) {
        navigation?.navigate('Bibliothèque');
      }
    });

    const unsubscribe = NetInfo.addEventListener((state) => {
      const enLigne = state.isConnected !== false && state.isInternetReachable !== false;
      setEstConnecte(enLigne);
      if (!enLigne) {
        navigation?.navigate('Bibliothèque');
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <View style={{ flex: 1, width: '100%', height: '100%', flexDirection: 'column', backgroundColor: couleurs.fond }}>
      {!estConnecte && (
        <View
          style={{
            backgroundColor: couleurs.estSombre
              ? 'rgba(127, 1, 31, 0.4)'
              : 'rgba(127, 1, 31, 0.08)',
            paddingVertical: 7,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: couleurs.estSombre
              ? 'rgba(249, 168, 184, 0.2)'
              : 'rgba(127, 1, 31, 0.15)',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Ionicons name="cloud-offline-outline" size={13.5} color={couleurs.primaire} />
          <Text
            style={{
              color: couleurs.primaire,
              fontSize: 12,
              fontWeight: '700',
              letterSpacing: 0.1,
            }}
          >
            Mode hors-ligne : Accès à vos documents enregistrés
          </Text>
        </View>
      )}

      <Tab.Navigator
        initialRouteName={estConnecte ? 'Accueil' : 'Bibliothèque'}
        screenOptions={({ route }) => ({
          tabBarPosition: 'bottom',
          animation: 'fade',
          tabBarIcon: ({ focused, color }) => {
            let iconName: string;

            if (route.name === 'Accueil') {
              iconName = focused ? 'compass' : 'compass-outline';
            } else {
              iconName = focused ? 'bookmarks' : 'bookmarks-outline';
            }

            return (
              <View
                style={[
                  styles.tabIconContainer,
                  focused && {
                    backgroundColor: couleurs.estSombre
                      ? 'rgba(249, 168, 184, 0.15)'
                      : 'rgba(127, 1, 31, 0.08)',
                  },
                ]}
              >
                <Ionicons name={iconName} size={22} color={color} />
              </View>
            );
          },
          tabBarActiveTintColor: couleurs.primaire,
          tabBarInactiveTintColor: couleurs.texteSecondaire,
          tabBarLabelStyle: {
            fontSize: 11.5,
            fontWeight: '700',
            letterSpacing: 0.2,
            marginTop: -4,
          },
          tabBarStyle: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            backgroundColor: couleurs.fondCarte,
            borderTopColor: couleurs.bordure,
            borderTopWidth: 1,
            height: Platform.OS === 'ios' ? 82 : 68,
            paddingBottom: Platform.OS === 'ios' ? 24 : 10,
            paddingTop: 8,
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: couleurs.estSombre ? 0.3 : 0.05,
            shadowRadius: 12,
            elevation: 8,
          },
          sceneStyle: {
            paddingBottom: Platform.OS === 'ios' ? 82 : 68,
          },
          headerShown: false,
        })}
      >
        <Tab.Screen name="Accueil" component={EcranAccueil} />
        <Tab.Screen name="Bibliothèque" component={EcranBibliotheque} />
      </Tab.Navigator>
    </View>
  );
}

export default function NavigateurApp() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="MainTabs" component={NavigateurTabsPrincipales} />
      <Stack.Screen name="PolitiqueConfidentialite" component={EcranPolitiqueConfidentialite} />
      <Stack.Screen name="DocumentViewer" component={EcranLecteurDocument} />
      <Stack.Screen name="PdfViewer" component={PdfViewerScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabIconContainer: {
    width: 40,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
});
