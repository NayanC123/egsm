/**
 * src/services/supabase.ts
 *
 * Initialises and exports the singleton Supabase client.
 * - Uses expo-secure-store for secure token persistence on device.
 * - Imports react-native-url-polyfill so the URL global works correctly
 *   inside the React Native JS engine.
 */

import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

/* ---------- Env variables (set in .env / EAS secrets) ---------- */

const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL  ?? '';
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/* ---------- Secure-store backed storage adapter ---------- */

const ExpoSecureStoreAdapter = {
  getItem: (key: string): Promise<string | null> => {
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string): Promise<void> => {
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string): Promise<void> => {
    return SecureStore.deleteItemAsync(key);
  },
};

/* ---------- Client ---------- */

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // not applicable on native
  },
});
