import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import NavigateurApp from './src/navigation/NavigateurApp';
import { FournisseurApp } from './src/store/ContexteApp';
import SplashScreenCauzon from './src/components/SplashScreenCauzon';

export default function App() {
  const [splashVisible, setSplashVisible] = useState(true);

  return (
    <SafeAreaProvider>
      <FournisseurApp>
        <NavigationContainer>
          <NavigateurApp />
          <StatusBar style={splashVisible ? "light" : "dark"} />
        </NavigationContainer>
        {splashVisible && (
          <SplashScreenCauzon onFinish={() => setSplashVisible(false)} />
        )}
      </FournisseurApp>
    </SafeAreaProvider>
  );
}

