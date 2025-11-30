'use client';
import { supabase } from '@/lib/supabaseClient';
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type XpContextType = {
  xp: number;
  loading: boolean;
  refresh: () => Promise<void>;
  setXp: (v: number | ((p: number) => number)) => void;
  uid?: string;
};

const XpCtx = createContext<XpContextType>({
  xp: 0,
  loading: true,
  refresh: async () => {},
  setXp: () => {},
  uid: undefined,
});

export function XpProvider({ children }: { children: React.ReactNode }) {
  const [xp, _setXp] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [uid, setUid] = useState<string | undefined>(undefined);

  const setXp = (v: number | ((p: number) => number)) => {
    _setXp((prev) => (typeof v === 'function' ? (v as any)(prev) : v));
  };

  // XP çekme işlemi
  const refresh = async () => {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;

    if (!user) {
      setUid(undefined);
      _setXp(0);
      return;
    }

    setUid(user.id);

    const { data } = await supabase
      .from('xp_wallets')
      .select('balance')
      .eq('user_id', user.id)
      .maybeSingle();

    _setXp(Number(data?.balance ?? 0));
  };

  // İlk açılış
  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange(() => refresh());
    return () => listener.subscription.unsubscribe();
  }, []);

  // UID varsa realtime aç
useEffect(() => {
  if (!uid) return;

  const channel = supabase
    .channel('rt_xp_wallets')
    .on(
      'postgres_changes',
      { schema: 'public', table: 'xp_wallets', event: '*' },
      (payload: any) => {
        if (payload?.new?.user_id === uid) {
          _setXp(Number(payload.new.balance ?? 0));
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [uid]);
  const value = useMemo(
    () => ({
      xp,
      loading,
      refresh,
      setXp,
      uid,
    }),
    [xp, loading, uid]
  );

  return <XpCtx.Provider value={value}>{children}</XpCtx.Provider>;
}

export const useXp = () => useContext(XpCtx);
