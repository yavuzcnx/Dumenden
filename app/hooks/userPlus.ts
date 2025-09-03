// hooks/usePlus.ts
import { supabase } from '@/lib/supabaseClient';
import { useEffect, useState } from 'react';

export function usePlus() {
  const [isPlus, setIsPlus] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id;
      if (!uid) { if (alive) { setIsPlus(false); setLoading(false); } return; }

      const { data } = await supabase
        .from('users')
        .select('is_plus')
        .eq('id', uid)
        .single();

      if (alive) {
        setIsPlus(!!data?.is_plus);
        setLoading(false);
      }
    }

    load();
    const sub = supabase.auth.onAuthStateChange(() => load());
    return () => { alive = false; sub.data.subscription.unsubscribe(); };
  }, []);

  return { isPlus, loading };
}
