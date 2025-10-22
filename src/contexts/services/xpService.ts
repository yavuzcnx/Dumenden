import { supabase } from '@/lib/supabaseClient';

type Json = Record<string, any> | null;

async function getUid(explicit?: string) {
  if (explicit) return explicit;
  const { data } = await supabase.auth.getUser();
  const uid = data?.user?.id;
  if (!uid) throw new Error('Oturum bulunamadı');
  return uid;
}

/** Kullanıcının XP bakiyesini çek */
export async function fetchUserXp(userId?: string) {
  const uid = await getUid(userId);

  // 1) Parametreli RPC (get_user_xp(uid))
  let { data, error } = await supabase.rpc('get_user_xp', { uid });

  // 2) Parametresiz RPC (get_user_xp() -> auth.uid())
  if (error) {
    const res = await supabase.rpc('get_user_xp');
    data = res.data as any;
    error = res.error;
  }

  if (error) {
    console.warn('fetchUserXp fallbacka düştü:', error.message);
    // 3) Doğrudan tablo
    const r = await supabase.from('xp_wallets').select('balance').eq('user_id', uid).single();
    if (r.error) return 0;
    return Number(r.data?.balance ?? 0);
  }

  return Number(data ?? 0);
}

/** XP EKLE (grant) */
export async function addXP(userId: string, amount: number, reason = 'grant', meta: Json = null) {
  const uid = await getUid(userId);
  if (amount <= 0) return;

  // 1) RPC xp_credit(uid, amount, reason, meta)
  let { error } = await supabase.rpc('xp_credit', { uid, amount, reason, meta });

  // 2) Alternatif RPC adı: grant_xp / add_xp
  if (error) {
    const try2 = await supabase.rpc('grant_xp', { uid, amount, reason, meta });
    error = try2.error;
  }

  // 3) Fallback: manuel ledger + wallet
  if (error) {
    const w = await supabase.from('xp_wallets').select('balance').eq('user_id', uid).single();
    if (w.error) throw w.error;
    const newBal = Number(w.data?.balance ?? 0) + amount;

    const up = await supabase.from('xp_wallets').update({ balance: newBal }).eq('user_id', uid);
    if (up.error) throw up.error;

    const lg = await supabase.from('xp_ledger').insert({ user_id: uid, delta: amount, reason, meta });
    if (lg.error) throw lg.error;
  }
}

/** XP DÜŞ (spend) */
export async function removeXP(userId: string, amount: number, reason = 'market_purchase', meta: Json = null) {
  const uid = await getUid(userId);
  if (amount <= 0) return;

  // 1) RPC xp_debit(uid, amount, reason, meta)
  let { error } = await supabase.rpc('xp_debit', { uid, amount, reason, meta });

  // 2) Alternatif RPC adı: spend_xp
  if (error) {
    const try2 = await supabase.rpc('spend_xp', { uid, amount, reason, meta });
    error = try2.error;
  }

  // 3) Fallback: manuel ledger + wallet
  if (error) {
    const w = await supabase.from('xp_wallets').select('balance').eq('user_id', uid).single();
    if (w.error) throw w.error;

    const bal = Number(w.data?.balance ?? 0);
    if (bal < amount) throw new Error('Yetersiz XP');

    const up = await supabase.from('xp_wallets').update({ balance: bal - amount }).eq('user_id', uid);
    if (up.error) throw up.error;

    const lg = await supabase.from('xp_ledger').insert({ user_id: uid, delta: -amount, reason, meta });
    if (lg.error) throw lg.error;
  }
}
