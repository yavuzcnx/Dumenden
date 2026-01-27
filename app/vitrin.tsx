'use client';

import { resolveStorageUrlSmart } from '@/lib/resolveStorageUrlSmart';
import { supabase } from '@/lib/supabaseClient';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type EmojiKey = 'like' | 'dislike' | 'wow';
type Counts = Record<EmojiKey, number>;
type Proof = {
  id: string;
  title: string | null;
  media_url: string | null;
  status: 'approved' | 'pending' | null;
  created_at: string;
  coupon_id: string;
  coupons?: { title?: string | null } | null;
  counts: Counts;
  my?: EmojiKey | null;
};

const { width, height } = Dimensions.get('window');
const base = 375;
const s = (n: number) => Math.round((n * width) / base);
const ORANGE = '#FF6B00';

const EMOJIS: Array<{ key: EmojiKey; label: string }> = [
  { key: 'like', label: '👍' },
  { key: 'dislike', label: '👎' },
  { key: 'wow', label: '😮' },
];
const emptyCounts = (): Counts => ({ like: 0, dislike: 0, wow: 0 });

export default function Vitrin() {
  const ins = useSafeAreaInsets();
  
  // 🔥 FİX BURADA: ins.top değerini iOS için kaldırdık. 
  // Çünkü SafeAreaView zaten bunu yapıyor. Sadece Android için StatusBar ekledik.
  const topPad = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + s(6) : s(0);

  const [loading, setLoading] = useState(true);
  const [xp, setXp] = useState<number>(0);
  const [rows, setRows] = useState<Proof[]>([]);
  const [selected, setSelected] = useState<Proof | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());

  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const openAnim = () => Animated.parallel([Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }), Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 6 })]).start();
  const closeAnim = (cb?: () => void) => Animated.parallel([Animated.timing(opacity, { toValue: 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }), Animated.timing(scale, { toValue: 0.95, duration: 160, useNativeDriver: true })]).start(() => cb?.());

  const load = async () => {
    setLoading(true);

    const { data: proofs, error: pErr } = await supabase
      .from('coupon_proofs')
      .select(`
        id, title, media_url, status, created_at, coupon_id,
        coupons:coupons!coupon_proofs_coupon_id_fkey ( title ),
        proof_reactions ( emoji )
      `)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(200);

    if (pErr) { console.error('proofs err', pErr); setRows([]); setLoading(false); return; }

    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id ?? null;

    const { data: mine } = uid
      ? await supabase.from('proof_reactions').select('proof_id,emoji').eq('user_id', uid)
      : { data: [] as any[] };

    const mineMap: Map<string, EmojiKey> = new Map((mine ?? []).map((m: any) => [String(m.proof_id), m.emoji as EmojiKey] as const));

    const withCounts: Proof[] = await Promise.all(
      (proofs ?? []).map(async (p: any) => {
        const counts = emptyCounts();
        (p.proof_reactions ?? []).forEach((r: any) => {
          const e = r?.emoji as EmojiKey;
          if (e === 'like' || e === 'dislike' || e === 'wow') {
            counts[e] = (counts[e] ?? 0) + 1;
          }
        });

        return {
          id: p.id,
          title: p.title,
          media_url: await resolveStorageUrlSmart(p.media_url),
          status: p.status,
          created_at: p.created_at,
          coupon_id: p.coupon_id,
          coupons: p.coupons ?? null,
          counts,
          my: mineMap.get(p.id) ?? null,
        };
      })
    );

    if (uid) {
      const { data: wrow } = await supabase.from('xp_wallets').select('balance').eq('user_id', uid).maybeSingle();
      setXp(Number(wrow?.balance ?? 0));
    } else {
      setXp(0);
    }

    setRows(withCounts);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const react = async (proof: Proof, next: EmojiKey) => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return;
    if (pending.has(proof.id) || proof.my === next) return;

    setPending(prev => new Set(prev).add(proof.id));
    const prevEmoji = proof.my ?? null;

    setRows(prev => prev.map(p => p.id !== proof.id ? p : { ...p, my: next, counts: { ...p.counts, ...(prevEmoji ? { [prevEmoji]: Math.max(0, (p.counts[prevEmoji] ?? 1) - 1) } : {}), [next]: (p.counts[next] ?? 0) + 1 } }));
    setSelected(sel => sel && sel.id === proof.id ? { ...sel, my: next, counts: { ...sel.counts, ...(prevEmoji ? { [prevEmoji]: Math.max(0, (sel.counts[prevEmoji] ?? 1) - 1) } : {}), [next]: (sel.counts[next] ?? 0) + 1 } } : sel);

    const { error } = await supabase.from('proof_reactions').upsert({ proof_id: proof.id, user_id: uid, emoji: next }, { onConflict: 'proof_id,user_id' });

    if (error) {
      setRows(prev => prev.map(p => p.id !== proof.id ? p : { ...p, my: prevEmoji, counts: { ...p.counts, [next]: Math.max(0, (p.counts[next] ?? 1) - 1), ...(prevEmoji ? { [prevEmoji]: (p.counts[prevEmoji] ?? 0) + 1 } : {}) } }));
    }
    setPending(prev => { const s2 = new Set(prev); s2.delete(proof.id); return s2; });
  };

  const Header = useMemo(() => (
    <View style={{ 
      backgroundColor: '#fff', 
      paddingHorizontal: s(16), 
      paddingBottom: s(10), 
      // 🔥 Padding top artık sadece Android için veya 0. iOS Safe Area otomatik halledecek.
      paddingTop: topPad, 
      borderBottomWidth: Platform.OS === 'android' ? 0.5 : 0, 
      borderBottomColor: '#00000010', 
      zIndex: 2 
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ fontSize: s(28), fontWeight: '900', color: ORANGE, includeFontPadding: false }}>Kanıt Vitrini</Text>
        <View style={{ marginLeft: 'auto', backgroundColor: '#FFF2E8', borderWidth: 1, borderColor: ORANGE, paddingVertical: s(6), paddingHorizontal: s(10), borderRadius: s(20) }}>
          <Text style={{ color: ORANGE, fontWeight: '800', includeFontPadding: false }}>{xp.toLocaleString('tr-TR')} XP</Text>
        </View>
      </View>
      <Text style={{ marginTop: s(6), color: '#6B7280', includeFontPadding: false }}>Onaylı kanıtlar</Text>
    </View>
  ), [xp, topPad]);

  const Card = ({ item }: { item: Proof }) => (
    <Pressable onPress={() => { setSelected(item); scale.setValue(0.85); opacity.setValue(0); setTimeout(openAnim, 0); }} style={{ width: (width - s(16) * 2 - s(10)) / 2, backgroundColor: '#fff', borderRadius: s(16), borderWidth: 1, borderColor: '#FFCCAA', padding: s(10), marginBottom: s(12) }}>
      {!!item.coupons?.title && (
        <View style={{ alignSelf: 'flex-start', paddingHorizontal: s(8), paddingVertical: s(4), borderRadius: s(10), backgroundColor: '#FFF7F1', borderWidth: 1, borderColor: '#FFD5B8', marginBottom: s(6) }}>
          <Text style={{ color: ORANGE, fontWeight: '800', includeFontPadding: false }} numberOfLines={1}>Kupon: {item.coupons.title}</Text>
        </View>
      )}
      {!!item.title && <Text style={{ fontWeight: '900', marginBottom: s(6), textAlign: 'center', includeFontPadding: false }} numberOfLines={2}>{item.title}</Text>}
      <View style={{ height: s(110), backgroundColor: '#F6F6F6', borderRadius: s(12), overflow: 'hidden', marginBottom: s(10) }}>
        {item.media_url ? <Image source={{ uri: item.media_url }} style={{ width: '100%', height: '100%' }} /> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: s(6) }}>
        {EMOJIS.map(e => (
          <TouchableOpacity key={e.key} onPress={() => react(item, e.key)} disabled={pending.has(item.id)} style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: s(6), borderRadius: s(10), backgroundColor: item.my === e.key ? '#FFEEE2' : '#FFF8F3', borderWidth: 1, borderColor: item.my === e.key ? '#FF9F66' : '#FFE0CC', opacity: pending.has(item.id) ? 0.6 : 1 }}>
            <Text style={{ fontSize: s(16) }}>{e.label}</Text>
            <Text style={{ marginLeft: 6, color: '#444', fontWeight: '700' }}>{(item.counts[e.key] ?? 0).toString()}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Pressable>
  );

  if (loading) return (<SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}><ActivityIndicator /></SafeAreaView>);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <FlatList
        data={rows}
        keyExtractor={i => i.id}
        numColumns={2}
        columnWrapperStyle={{ gap: s(10), paddingHorizontal: s(16) }}
        contentContainerStyle={{ paddingBottom: ins.bottom + s(60) }}
        scrollIndicatorInsets={{ bottom: ins.bottom + s(30) }}
        renderItem={Card}
        ListHeaderComponent={Header}
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<View style={{ alignItems: 'center', marginTop: s(40) }}><Text style={{ color: '#6B7280' }}>Henüz kanıt yok.</Text></View>}
      />
      <Modal visible={!!selected} transparent animationType="none" onRequestClose={() => closeAnim(() => setSelected(null))}>
        <Pressable onPress={() => closeAnim(() => setSelected(null))} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
          {selected && (
            <Animated.View style={{ width: width - s(24), maxHeight: height - s(120), borderRadius: s(16), backgroundColor: '#fff', overflow: 'hidden', transform: [{ scale }], opacity, borderWidth: 2, borderColor: ORANGE }}>
              <View style={{ padding: s(12) }}>
                {!!selected.coupons?.title && <View style={{ alignSelf: 'flex-start', paddingHorizontal: s(8), paddingVertical: s(4), borderRadius: s(10), backgroundColor: '#FFF7F1', borderWidth: 1, borderColor: '#FFD5B8', marginBottom: s(6) }}><Text style={{ color: ORANGE, fontWeight: '800' }}>Kupon: {selected.coupons.title}</Text></View>}
                {!!selected.title && <Text style={{ fontSize: s(18), fontWeight: '900', textAlign: 'center', marginBottom: s(8) }}>{selected.title}</Text>}
              </View>
              <View style={{ height: s(280), backgroundColor: '#F2F3F5' }}>
                {selected.media_url ? <Image source={{ uri: selected.media_url }} style={{ width: '100%', height: '100%' }} /> : null}
              </View>
              <View style={{ padding: s(14) }}>
                <Text style={{ color: '#6B7280' }}>{new Date(selected.created_at).toLocaleString('tr-TR')}</Text>
                <View style={{ flexDirection: 'row', gap: s(8), marginTop: s(12) }}>
                  {EMOJIS.map(e => (
                    <TouchableOpacity key={e.key} onPress={() => react(selected, e.key)} disabled={pending.has(selected.id)} style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: s(8), borderRadius: s(12), backgroundColor: selected.my === e.key ? '#FFEEE2' : '#FFF8F3', borderWidth: 1, borderColor: selected.my === e.key ? '#FF9F66' : '#FFE0CC', opacity: pending.has(selected.id) ? 0.6 : 1 }}>
                      <Text style={{ fontSize: s(18) }}>{e.label}</Text>
                      <Text style={{ marginLeft: 6, color: '#444', fontWeight: '700' }}>{(selected.counts[e.key] ?? 0).toString()}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </Animated.View>
          )}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}