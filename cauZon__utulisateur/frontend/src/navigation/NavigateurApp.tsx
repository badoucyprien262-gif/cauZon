import React from 'react';
import { Alert, View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import EcranAccueil from '../screens/EcranAccueil';
import EcranBibliotheque from '../screens/EcranBibliotheque';
import EcranLecteurDocument from '../screens/EcranLecteurDocument';
import PdfViewerScreen from '../screens/PdfViewerScreen';
import { useApp } from '../store/ContexteApp';
import { Document } from '../types';
import { fetchCatalogueDocuments } from '../services/serviceDocument';

export type RootStackParamList = {
  MainTabs: undefined;
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

function NavigateurTabsPrincipales() {
  const { couleurs } = useApp();
  const [estConnecte, setEstConnecte] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    NetInfo.fetch().then((state) => {
      setEstConnecte(state.isConnected);
    });

    const unsubscribe = NetInfo.addEventListener((state) => {
      setEstConnecte(state.isConnected);
    });

    return () => unsubscribe();
  }, []);

  if (estConnecte === null) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: couleurs.fond,
        }}
      >
        <ActivityIndicator size="large" color={couleurs.primaire} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: couleurs.fond }}>
      {!estConnecte && (
        <View
          style={{
            backgroundColor: couleurs.estSombre
              ? 'rgba(231, 76, 60, 0.2)'
              : 'rgba(231, 76, 60, 0.1)',
            paddingVertical: 8,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(231, 76, 60, 0.3)',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Ionicons name="cloud-offline-outline" size={14} color="#E74C3C" />
          <Text
            style={{
              color: '#E74C3C',
              fontSize: 11.5,
              fontWeight: 'bold',
            }}
          >
            Mode Hors-ligne (Connexion Internet absente)
          </Text>
        </View>
      )}

      <Tab.Navigator
        initialRouteName={estConnecte ? 'Accueil' : 'Bibliothèque'}
        screenOptions={({ route }) => ({
          animation: 'fade',
          tabBarIcon: ({ focused, color }) => {
            let iconName: keyof typeof Ionicons.glyphMap;

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
