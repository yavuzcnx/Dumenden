// lib/bootstrap.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';

function sOrNull(v: any) {
  const s = (v ?? '').toString().trim();
  return s ? s : null;
}
function normalizeBirthDate(v?: string | null) {
  if (!v) return null;
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(v)) return v.replace(/\./g, '-');
  return v;
}

/**
 * Girişten hemen sonra çağır:
 *  - users: yoksa INSERT, varsa KESİNLİKLE ezme (yalnızca dolu gelen alanları patch)
 *  - xp_wallets: yoksa INSERT(balance=0), varsa DOKUNMA
 *  - registerDraft temizliği
 */
export async function ensureBootstrapAndProfile() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return;

  // metadata + draft
  const md = user.user_metadata ?? {};
  let full_name    = sOrNull(md.full_name);
  let phone_number = sOrNull(md.phone_number);
  let birth_date   = normalizeBirthDate(md.birth_date);

  if (!full_name && !phone_number && !birth_date && user.email) {
    try {
      const raw = await AsyncStorage.getItem(`registerDraft:${user.email.toLowerCase()}`);
      if (raw) {
        const p = JSON.parse(raw);
        full_name    = sOrNull(p.full_name);
        phone_number = sOrNull(p.phone_number);
        birth_date   = normalizeBirthDate(p.birth_date);
      }
    } catch {}
  }

  // users -> SELECT var mı?
  const { data: uRow } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (!uRow) {
    await supabase.from('users').insert([{
      id: user.id,
      full_name,
      phone_number,
      birth_date,
      // DİKKAT: xp / is_plus burada asla set edilmez
    }]);
  } else {
    const patch: Record<string, any> = {};
    if (full_name)    patch.full_name    = full_name;
    if (phone_number) patch.phone_number = phone_number;
    if (birth_date)   patch.birth_date   = birth_date;
    if (Object.keys(patch).length) {
      await supabase.from('users').update(patch).eq('id', user.id);
    }
  }

  // xp_wallets -> SELECT var mı?
  const { data: wRow } = await supabase
    .from('xp_wallets')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!wRow) {
    // ilk kurulum: 0 ile oluştur
    await supabase.from('xp_wallets').insert([{ user_id: user.id, balance: 0 }]);
  }
  // varsa DOKUNMA! (upsert yok)

  // draft temizle
  if (user.email) {
    try { await AsyncStorage.removeItem(`registerDraft:${user.email.toLowerCase()}`); } catch {}
  }
}
