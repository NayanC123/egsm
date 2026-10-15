/**
 * src/services/supabase.ts
 *
 * Initialises and exports the singleton Supabase client.
 * Guarded against missing / invalid environment variables so
 * the app never crashes at startup.
 */

import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const rawKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

const isValidUrl = Boolean(rawUrl && rawUrl.startsWith('https://'));
if (!isValidUrl) {
  console.warn(
    '[Supabase] Warning: EXPO_PUBLIC_SUPABASE_URL is missing or invalid. Falling back to default URL to prevent startup crash.',
  );
}

const SUPABASE_URL = isValidUrl
  ? (rawUrl as string)
  : 'https://llkxyzuigignxdstmyxd.supabase.co';

const SUPABASE_ANON =
  rawKey ||
  'sb_publishable_bydJi44VbEsIschzzvXnpA_qOZD5fP9';

/* ---------- Safe Singleton Creation ---------- */

let clientInstance: SupabaseClient;

try {
  clientInstance = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
} catch (error) {
  console.error('[Supabase] Failed to initialize Supabase client:', error);
  // Emergency fallback so the app continues booting to show the UI/ErrorBoundary
  clientInstance = createClient(
    'https://placeholder.supabase.co',
    'placeholder-key',
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

export const supabase = clientInstance;
