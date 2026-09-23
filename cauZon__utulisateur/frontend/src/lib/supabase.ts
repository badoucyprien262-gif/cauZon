import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Clés de production avec repli automatique (sécurise EAS Build natif si non injectées par env)
const DEFAULT_SUPABASE_URL = 'https://wdipnxewpmhdksrlisix.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_oD0zi8_KXt6grTq5PX0jiA_hYTJyZQ6';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("ERREUR CRITIQUE: Configuration Supabase incomplète (URL ou ANON KEY indéfinie).");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
  },
});
