import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  (import.meta as any).env?.VITE_SUPABASE_URL || 'https://wdipnxewpmhdksrlisix.supabase.co';
const supabaseAnonKey =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_oD0zi8_KXt6grTq5PX0jiA_hYTJyZQ6';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
