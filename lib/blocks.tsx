import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';

type BlockContextValue = {
  blockedIds: string[];
  blockedSet: Set<string>;
  ready: boolean;
  selfBlocked: boolean;
  blockUser: (args: { blockedId: string; reason?: string | null; targetType?: string; targetId?: string | null }) => Promise<boolean>;
  unblockUser: (blockedId: string) => Promise<void>;
  isBlocked: (id?: string | null) => boolean;
  refresh: () => Promise<void>;
};

const BlockContext = createContext<BlockContextValue | null>(null);

export function BlockProvider({ children }: { children: React.ReactNode }) {
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [selfBlocked, setSelfBlocked] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      setUid(user?.id ?? null);
      if (!user?.id) {
        setBlockedIds([]);
        setSelfBlocked(false);
        setReady(true);
        return;
      }

      const { data: blocks } = await supabase
        .from('user_blocks')
        .select('blocked_id')
        .eq('blocker_id', user.id);

      setBlockedIds((blocks ?? []).map((b: any) => b.blocked_id));

      const { data: me } = await supabase
        .from('users')
        .select('is_blocked')
        .eq('id', user.id)
        .maybeSingle();
      setSelfBlocked(!!me?.is_blocked);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      refresh().catch(() => {});
    });
    return () => {
      try {
        subscription.unsubscribe();
      } catch {}
    };
  }, [refresh]);

  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel(`user-blocks-${uid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'user_blocks', filter: `blocker_id=eq.${uid}` },
        (payload: any) => {
          const blockedId = payload?.new?.blocked_id;
          if (!blockedId) return;
          setBlockedIds((prev) => (prev.includes(blockedId) ? prev : [...prev, blockedId]));
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'user_blocks', filter: `blocker_id=eq.${uid}` },
        (payload: any) => {
          const blockedId = payload?.old?.blocked_id;
          if (!blockedId) return;
          setBlockedIds((prev) => prev.filter((id) => id !== blockedId));
        },
      )
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
    };
  }, [uid]);

  const blockUser = useCallback(
    async (args: { blockedId: string; reason?: string | null; targetType?: string; targetId?: string | null }) => {
      const blockedId = args.blockedId;
      if (!uid || !blockedId || uid === blockedId) return false;

      // optimistic
      setBlockedIds((prev) => (prev.includes(blockedId) ? prev : [...prev, blockedId]));

      const { error } = await supabase.from('user_blocks').insert({
        blocker_id: uid,
        blocked_id: blockedId,
        reason: args.reason ?? null,
      });

      if (error && !/duplicate|unique/i.test(error.message)) {
        setBlockedIds((prev) => prev.filter((id) => id !== blockedId));
        return false;
      }

      // developer notify: create report entry
      try {
        await supabase.from('ugc_reports').insert({
          reporter_id: uid,
          target_user_id: blockedId,
          target_type: args.targetType ?? 'user',
          target_id: args.targetId ?? null,
          reason: args.reason ?? 'blocked_by_user',
          status: 'pending',
        });
      } catch {}

      return true;
    },
    [uid],
  );

  const unblockUser = useCallback(
    async (blockedId: string) => {
      if (!uid || !blockedId) return;
      setBlockedIds((prev) => prev.filter((id) => id !== blockedId));
      await supabase.from('user_blocks').delete().eq('blocker_id', uid).eq('blocked_id', blockedId);
    },
    [uid],
  );

  const blockedSet = useMemo(() => new Set(blockedIds), [blockedIds]);
  const isBlocked = useCallback((id?: string | null) => !!id && blockedSet.has(id), [blockedSet]);

  const value = useMemo<BlockContextValue>(
    () => ({ blockedIds, blockedSet, ready, selfBlocked, blockUser, unblockUser, isBlocked, refresh }),
    [blockedIds, blockedSet, ready, selfBlocked, blockUser, unblockUser, isBlocked, refresh],
  );

  return <BlockContext.Provider value={value}>{children}</BlockContext.Provider>;
}

export function useBlocks() {
  const ctx = useContext(BlockContext);
  if (!ctx) throw new Error('useBlocks must be used within BlockProvider');
  return ctx;
}
