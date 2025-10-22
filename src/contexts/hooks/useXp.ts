import { supabase } from '@/lib/supabaseClient';
import { useCallback, useEffect, useState } from 'react';

export function useXp() {
  const [xp, setXp] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) { setXp(0); setLoading(false); return; }

    // RPC varsa kullan
    const rpc = await supabase.rpc('get_user_xp', { uid });
    if (!rpc.error) {
      setXp(Number(rpc.data ?? 0));
      setLoading(false);
      return;
    }

    // Fallback: xp_wallets
    const { data } = await supabase
      .from('xp_wallets')
      .select('balance')
      .eq('user_id', uid)
      .single();
    setXp(Number(data?.balance ?? 0));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime: xp_wallets & xp_ledger değişince tazele
  useEffect(() => {
    const channel = supabase
      .channel('rt-xp')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'xp_wallets' }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'xp_ledger' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { xp, loading, refreshXp: load };
}
