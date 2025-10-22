// lib/isAdmin.ts
import { supabase } from '@/lib/supabaseClient';

export async function fetchIsAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return false;
  return !!data;
}
