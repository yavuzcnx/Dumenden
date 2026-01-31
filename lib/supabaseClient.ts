// lib/supabaseClient.ts
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hgvvrrkeljasjwdoajtw.supabase.co';
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhndnZycmtlbGphc2p3ZG9hanR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIyMzQyNjMsImV4cCI6MjA2NzgxMDI2M30.F7o5jWKglt8eRyTf5xnpKVdNt4Rpb_R9CarArze_QcA';

// ✅ Global singleton (duplicate client sorununu bitirir)
const g = globalThis as any;

export const supabase =
  g.__dumenden_supabase ??
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage, // cihazda kalıcı sakla
      persistSession: true, // app kapansa bile session dursun
      autoRefreshToken: true, // token süresi bitince otomatik yenile
      detectSessionInUrl: false, // RN'de kullanılmıyor
      flowType: 'pkce',
    },
  });

if (!g.__dumenden_supabase) {
  g.__dumenden_supabase = supabase;
}
