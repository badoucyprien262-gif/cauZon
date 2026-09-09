import { registerRootComponent } from 'expo';

import { Platform } from 'react-native';

// 🛡️ Nettoyage instantané et invisible de l'URL lors du retour Google OAuth sur le Web
// Protégé contre tout crash runtime si window ou location est indéfini (safe check)
try {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window?.location) {
    const hash = window.location?.hash || '';
    const search = window.location?.search || '';
    if (hash.includes('access_token=') || search.includes('code=')) {
      try {
        if (typeof window.sessionStorage !== 'undefined') {
          window.sessionStorage?.setItem('cauzon_oauth_redirect_url', window.location?.href || '');
        }
        if (window?.history?.replaceState) {
          window.history.replaceState(null, (typeof document !== 'undefined' ? document.title : '') || '', window.location?.pathname || '/');
        }
      } catch (_) {}
    }
  }
} catch (_) {}

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
