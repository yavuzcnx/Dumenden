'use client';
import { supabase } from '@/lib/supabaseClient';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type SetLike = number | ((prev: number) => number);

type Ctx = {
  xp: number;
  loading: boolean;
  /** sunucudan yeniden oku */
  refresh: () => Promise<void>;
  /** ekranda anında güncellemek için (optimistik de kullanılabilir) */
  setXp: (next: SetLike) => void;
  uid?: string;
  lastError?: string;
};

const XpCtx = createContext<Ctx>({
  xp: 0,
  loading: true,
  refresh: async () => {},
  setXp: () => {},
});

export function XpProvider({ children }: { children: React.ReactNode }) {
  const [xp, _setXp] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | undefined>(undefined);
  const [lastError, setLastError] = useState<string | undefined>(undefined);

  const setXp = (next: SetLike) => {
    _setXp((prev) => (typeof next === 'function' ? (next as any)(prev) : next));
  };

  const refresh = async () => {
    try {
      setLastError(undefined);

      const { data: auth } = await supabase.auth.getUser();
      const u = auth?.user;
      if (!u) {
        setUid(undefined);
        _setXp(0);
        return;
      }
      setUid(u.id);

      // ---- 1) Öncelik: get_user_xp RPC (varsa) ----
      let rpcXp: number | null = null;
      const r1 = await supabase.rpc('get_user_xp', { uid: u.id as any });
      if (!r1.error && r1.data != null) {
        rpcXp = Number(r1.data);
      } else {
        const r2 = await supabase.rpc('get_user_xp');
        if (!r2.error && r2.data != null) rpcXp = Number(r2.data);
      }
      if (rpcXp !== null && !Number.isNaN(rpcXp)) {
        _setXp(rpcXp);
        return;
      }

      // ---- 2) Wallet ----
      const wres = await supabase
        .from('xp_wallets')
        .select('balance')
        .eq('user_id', u.id)
        .single();

      if (!wres.error && wres.data) {
        _setXp(Number(wres.data.balance ?? 0));
        return;
      }

      // ---- 3) Fallback: users.xp (eski alan) ----
      const ures = await supabase.from('users').select('xp').eq('id', u.id).single();
      if (!ures.error && ures.data) {
        const ux = Number(ures.data?.xp ?? 0);
        _setXp(Number.isNaN(ux) ? 0 : ux);
      } else {
        _setXp(0);
        if (wres.error) setLastError(wres.error.message);
        if (ures.error) setLastError((prev) => prev ?? ures.error.message);
      }
    } catch (e: any) {
      setLastError(e?.message || String(e));
      _setXp(0);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      await refresh();
      setLoading(false);

      const { data: auth } = await supabase.auth.getUser();
      const me = auth?.user?.id;

      // Realtime: önce wallet, sonra users (xp değişirse otomatik yansısın)
      const ch = supabase
        .channel('rt-users-xp')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'xp_wallets', filter: me ? `user_id=eq.${me}` : undefined },
          () => {
            if (mounted) refresh();
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'users', filter: me ? `id=eq.${me}` : undefined },
          () => {
            if (mounted) refresh();
          },
        )
        .subscribe();

      const { data: authSub } = supabase.auth.onAuthStateChange((_e, session) => {
        if (!mounted) return;
        if (!session?.user) {
          setUid(undefined);
          _setXp(0);
        } else {
          refresh();
        }
      });

      return () => {
        mounted = false;
        try {
          supabase.removeChannel(ch);
        } catch {}
        try {
          authSub?.subscription?.unsubscribe?.();
        } catch {}
      };
    })();
  }, []);

  const value = useMemo(
    () => ({ xp, loading, refresh, setXp, uid, lastError }),
    [xp, loading, uid, lastError],
  );

  return <XpCtx.Provider value={value}>{children}</XpCtx.Provider>;
}

export const useXp = () => useContext(XpCtx);
