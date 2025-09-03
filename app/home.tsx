'use client';
import CartRibbon from '@/components/CartRibbon';
import MarketCard, { type Market } from '@/components/MarketCard';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'expo-router';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Dimensions, FlatList, Image, Keyboard, KeyboardAvoidingView, Modal,
  Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity,
  TouchableWithoutFeedback, View,
} from 'react-native';

const CATS = ['Tümü', 'Gündem', 'Spor', 'Magazin', 'Politika', 'Absürt'];
const PAGE = 12;

/* -------- countdown helper -------- */
const timeLeft = (iso?: string) => {
  if (!iso) return { expired: false, label: '--:--:--', seconds: 0 };
  const ms = new Date(iso).getTime() - Date.now();
  const expired = ms <= 0;
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (x: number) => String(x).padStart(2, '0');
  return { expired, label: `${pad(h)}:${pad(m)}:${pad(ss)}`, seconds: s };
};

/* ----- Storage URL helper (liste görselleri için) ----- */
const MEDIA_BUCKET = 'media';
async function resolveStorageUrl(raw?: string | null): Promise<string | null> {
  if (!raw) return null;
  if (String(raw).startsWith('http')) return String(raw);
  const pub = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(String(raw)).data?.publicUrl;
  if (pub) return pub;
  const { data: signed } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(String(raw), 60 * 60 * 6);
  return signed?.signedUrl ?? null;
}

/* ---- Market tipini genişlet: image sahası eklendi ---- */
type MarketRow = Market & { image?: string | null };

/* profil satırını garanti altına al */
async function ensureUserProfile() {
  const { data: auth } = await supabase.auth.getUser();
  const u = auth?.user;
  if (!u) return;
  const full_name =
    (u.user_metadata?.full_name as string) ||
    (u.email ? u.email.split('@')[0] : 'Kullanıcı');
  const avatar_url = (u.user_metadata?.avatar_url as string) || null;
  await supabase
    .from('users')
    .upsert({ id: u.id, full_name, avatar_url }, { onConflict: 'id' });
}

export default function HomeScreen() {
  const router = useRouter();

  /* -------- USER (fallback: email @ öncesi) -------- */
  const [user, setUser] = useState<{ name: string; xp: number; avatar: string | null }>({
    name: 'Kullanıcı',
    xp: 0,
    avatar: null,
  });

  useEffect(() => {
    (async () => {
      await ensureUserProfile();
      const { data: auth } = await supabase.auth.getUser();
      const au = auth?.user;
      if (!au) return;
      const { data } = await supabase
        .from('users')
        .select('full_name, xp, avatar_url')
        .eq('id', au.id)
        .single();
      const fallbackName =
        (data?.full_name && data.full_name.trim()) ||
        ((au.user_metadata?.full_name as string) || '') ||
        (au.email ? au.email.split('@')[0] : 'Kullanıcı');

      setUser({
        name: fallbackName || 'Kullanıcı',
        xp: data?.xp ?? 0,
        avatar: data?.avatar_url ?? null,
      });
    })();
  }, []);

  /* -------- MARKETS + PAGING -------- */
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [category, setCategory] = useState('Tümü');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchMore = useCallback(
    async (reset = false) => {
      if (!hasMore && !reset) return;
      setLoadingMore(true);

   let q = supabase
  .from('coupons')
  .select('id,title,category,closing_date,yes_price,no_price,image_url')
  .eq('is_open', true)
  .eq('is_user_generated', false) // <<< user-generated kuponları Home’dan çıkar
  .order('created_at', { ascending: false })
  .limit(50);

if (category !== 'Tümü') q = q.eq('category', category);
      const from = reset ? 0 : page * PAGE;
      const to = from + PAGE - 1;
      const { data, error } = await q.range(from, to);

      if (!error) {
        // 🔧 DB -> UI normalizasyonu
        const normalized: MarketRow[] = (data ?? []).map((m: any) => ({
          ...m,
          // MarketCard image alanını garanti et
          image: m.image ?? m.image_url ?? null,
        }));

        // storage path → gerçek URL (batch)
        await Promise.all(
          normalized.map(async (it) => {
            if (it.image && !String(it.image).startsWith('http')) {
              it.image = await resolveStorageUrl(String(it.image));
            }
          })
        );

        const merged = reset ? normalized : [...markets, ...normalized];
        const map = new Map<string | number, MarketRow>();
        merged.forEach((m) => map.set(m.id, m));
        const unique = Array.from(map.values());
        setMarkets(unique);
        setPage((p) => (reset ? 1 : p + 1));
        setHasMore((normalized.length ?? 0) === PAGE);
      }
      setLoadingMore(false);
    },
    [category, page, hasMore, markets],
  );

  useEffect(() => {
    setMarkets([]);
    setPage(0);
    setHasMore(true);
    fetchMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  /* -------- GLOBAL TICK (geri sayım) -------- */
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  /* -------- REALTIME: kupon ekle/güncelle/sil → listeyi yenile -------- */
  useEffect(() => {
    const ch = supabase
      .channel('rt-coupons')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coupons' }, () => {
        fetchMore(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [category, fetchMore]);

  /* -------- BASKET -------- */
  type BasketItem = {
    coupon_id: string | number;
    title: string;
    label: string;
    side: 'YES' | 'NO';
    price: number; // odds
    stake: number;
  };
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [basketOpen, setBasketOpen] = useState(false);

  const calcPayout = (stake: number, odds: number) => stake * Math.max(1, odds);
  const totals = useMemo(() => {
    const totalStake = basket.reduce((a, it) => a + it.stake, 0);
    const totalPayout = basket.reduce((a, it) => a + calcPayout(it.stake, it.price), 0);
    return { totalStake, totalPayout, totalProfit: totalPayout - totalStake };
  }, [basket]);

  const updateBasketStake = (idx: number, val: string) =>
    setBasket((b) => b.map((it, i) => (i === idx ? { ...it, stake: Math.max(0, Number(val || '0')) } : it)));
  const removeBasketItem = (idx: number) => setBasket((b) => b.filter((_, i) => i !== idx));
  const clearBasket = () => setBasket([]);
  const confirmPlayAll = () => {
    if (basket.length === 0) return;
    Alert.alert('Onay', 'Toplu oynama gönderildi (mock).');
    setBasketOpen(false);
    clearBasket();
  };

  /* -------- TRADE MODAL -------- */
  const [modal, setModal] = useState<{ market: MarketRow; label: string; side: 'YES' | 'NO'; price: number } | null>(null);
  const [stake, setStake] = useState('100');
  const openPill = (market: MarketRow, label: string, side: 'YES' | 'NO', price: number) => {
    setStake('100');
    setModal({ market, label, side, price });
  };
  const addToBasket = () => {
    if (!modal) return;
    const s = Math.max(0, Number(stake || '0'));
    if (!s) return;
    setBasket((b) => [
      ...b,
      { coupon_id: modal.market.id, title: modal.market.title, label: modal.label, side: modal.side, price: modal.price, stake: s },
    ]);
    setModal(null);
    setBasketOpen(true);
  };

  /* -------- SLIDER (başlıkta) -------- */
  const { width } = Dimensions.get('window');
  const SLIDER_W = Math.round(width * 0.78);
  const [sliderIdx, setSliderIdx] = useState(0);
  const sliderData = useMemo(() => {
    const arr = [...markets];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, 5);
  }, [markets]);

  const marketState = (m: MarketRow) => {
    const t = timeLeft(m.closing_date);
    const disabled = t.expired || m.is_open === false;
    const urgent = !t.expired && t.seconds <= 600;
    return { ...t, disabled, urgent };
  };

  const SliderHeader = (
    <>
      <FlatList
        horizontal
        data={sliderData}
        keyExtractor={(it) => `slider-${String(it.id)}`}
        showsHorizontalScrollIndicator={false}
        snapToInterval={SLIDER_W + 12}
        decelerationRate="fast"
        pagingEnabled
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 6 }}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / (SLIDER_W + 12));
          setSliderIdx(i);
        }}
        renderItem={({ item }) => {
          const st = marketState(item);
          return (
            <View style={{ width: SLIDER_W, marginRight: 12 }}>
              <MarketCard
                compact
                item={item}
                onPress={() => router.push(`/CouponDetail?id=${item.id}`)}
                onTapYes={(m, label, price) => openPill(m as MarketRow, label, 'YES', price)}
                onTapNo={(m, label, price) => openPill(m as MarketRow, label, 'NO', price)}
                timeLeftLabel={st.label}
                urgent={st.urgent}
                disabled={st.disabled}
              />
            </View>
          );
        }}
      />
      {sliderData.length > 1 && (
        <View style={styles.dotsRow}>
          {sliderData.map((_, i) => (
            <View key={`dot-${i}-${sliderData.length}`} style={[styles.dot, i === sliderIdx && styles.dotActive]} />
          ))}
        </View>
      )}
    </>
  );

  /* -------- UI -------- */
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Header */}
      <View style={styles.appHeader}>
        <View>
          <Text style={styles.brand}>Dümenden</Text>
          <Text style={styles.welcome}>{user.name}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.xpPill}><Text style={styles.xpPillTxt}>{user.xp.toLocaleString('tr-TR')} XP</Text></View>
          <TouchableOpacity onPress={() => router.push('/profile')}>
            {user.avatar
              ? <Image source={{ uri: user.avatar }} style={styles.avatarMini} />
              : <View style={[styles.avatarMini,{ backgroundColor:'#eee', alignItems:'center', justifyContent:'center' }]}><Text style={{ fontWeight:'900', color:'#999' }}>{user.name[0]?.toUpperCase()||'K'}</Text></View>}
          </TouchableOpacity>
        </View>
      </View>

      {/* Kategori bar */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8, paddingHorizontal: 16 }}>
        {CATS.map((c) => (
          <TouchableOpacity
            key={c}
            onPress={() => setCategory(c)}
            style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, backgroundColor: category === c ? '#FF6B00' : '#eee' }}>
            <Text style={{ color: category === c ? '#fff' : '#333', fontWeight:'700' }}>{c}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Liste */}
      <FlatList
        data={markets}
        keyExtractor={(it) => String(it.id)}
        ListHeaderComponent={SliderHeader}
        contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
        onEndReachedThreshold={0.4}
        onEndReached={() => fetchMore()}
        ListFooterComponent={loadingMore ? <Text style={{ textAlign:'center', color:'#888', padding:10 }}>Yükleniyor…</Text> : null}
        renderItem={({ item }) => {
          const st = marketState(item);
          return (
            <View style={{ marginBottom: 12 }}>
              <MarketCard
                item={item}
                onPress={() => router.push(`/CouponDetail?id=${item.id}`)}
                onTapYes={(m, label, price) => openPill(m as MarketRow, label, 'YES', price)}
                onTapNo={(m, label, price) => openPill(m as MarketRow, label, 'NO', price)}
                timeLeftLabel={st.label}
                urgent={st.urgent}
                disabled={st.disabled}
              />
            </View>
          );
        }}
      />

      {/* Trade Modal */}
      <Modal visible={!!modal} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalWrap}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
              style={{ width: '100%' }}>
              <View style={styles.modalCard}>
                {modal && (
                  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
                    <Text style={styles.modalTitle}>{modal.market.title}</Text>
                    <Text style={styles.modalSub}>{modal.label} • {modal.side}</Text>
                    <TextInput
                      value={stake}
                      onChangeText={setStake}
                      keyboardType="numeric"
                      placeholder="XP"
                      style={styles.stakeInput}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={() => { Keyboard.dismiss(); addToBasket(); }}
                    />
                    <View style={styles.quickRow}>
                      {[25, 50, 100, 250, 500].map((q) => (
                        <TouchableOpacity key={`q-${q}`} style={styles.quickBtn} onPress={() => setStake(String(q))}>
                          <Text style={{ fontWeight: '700' }}>{q}×</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TouchableOpacity style={styles.tradeBtn} onPress={() => { Keyboard.dismiss(); addToBasket(); }}>
                      <Text style={{ color:'#fff', fontWeight:'bold' }}>Sepete Ekle</Text>
                    </TouchableOpacity>
                    <Pressable onPress={() => { Keyboard.dismiss(); setModal(null); }} style={styles.closeBtn}>
                      <Text style={{ fontWeight:'bold' }}>Kapat</Text>
                    </Pressable>
                  </ScrollView>
                )}
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Sepet Bar */}
<CartRibbon
  count={basket.length}
  totalXp={totals.totalStake}
  onPress={() => setBasketOpen(true)}
  fabDiameter={84}   // turuncu halkalı görünüm için bırakabilirsin
/>

      {/* Sepet Modal */}
      <Modal visible={basketOpen} transparent animationType="slide">
        <View style={styles.modalWrap}>
          <View style={[styles.modalCard, { maxHeight: '72%' }]}>
            <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom: 8 }}>
              <Text style={styles.modalTitle}>Sepet</Text>
              <Pressable onPress={() => setBasketOpen(false)}><Text style={{ fontWeight:'bold' }}>Kapat</Text></Pressable>
            </View>

            {basket.map((it, i) => (
              <View key={`${it.coupon_id}-${i}`} style={styles.basketItem}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight:'700' }}>{it.title}</Text>
                  <Text style={{ color:'#666' }}>{it.label} • {it.side} • Fiyat: {it.price.toFixed(2)}</Text>
                </View>
                <TextInput
                  value={String(it.stake)}
                  onChangeText={(v) => updateBasketStake(i, v)}
                  keyboardType="numeric"
                  style={styles.basketStakeInput}
                />
                <TouchableOpacity onPress={() => removeBasketItem(i)} style={styles.trashBtn}>
                  <Text style={{ color:'#fff', fontWeight:'700' }}>Sil</Text>
                </TouchableOpacity>
              </View>
            ))}

            <View style={{ marginTop:10, borderTopWidth:1, borderTopColor:'#eee', paddingTop:10 }}>
              <Text style={{ fontWeight:'700' }}>
                Toplam Stake: {totals.totalStake} XP • Payout: {Math.round(totals.totalPayout)} XP • Kâr: {Math.round(totals.totalProfit)} XP
              </Text>
            </View>

            <View style={{ flexDirection:'row', gap:8, marginTop:12 }}>
              <TouchableOpacity style={[styles.tradeBtn, { flex:1, backgroundColor:'#FF6B00' }]} onPress={confirmPlayAll}>
                <Text style={{ color:'#fff', fontWeight:'bold', textAlign:'center' }}>Onayla / Oyna</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tradeBtn, { flex:1, backgroundColor:'#757575' }]} onPress={clearBasket}>
                <Text style={{ color:'#fff', fontWeight:'bold', textAlign:'center' }}>Sepeti Temizle</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  appHeader:{ paddingTop:56, paddingBottom:12, paddingHorizontal:16, flexDirection:'row', justifyContent:'space-between', alignItems:'center', backgroundColor:'#fff' },
  brand:{ fontSize:22, fontWeight:'900', color:'#FF6B00' },
  welcome:{ fontSize:14, color:'#666' },
  xpPill:{ backgroundColor:'#FFE0B2', paddingHorizontal:10, paddingVertical:6, borderRadius:12 },
  xpPillTxt:{ color:'#FF6B00', fontWeight:'800' },
  avatarMini:{ width:36, height:36, borderRadius:18 },

  dotsRow:{ flexDirection:'row', justifyContent:'center', alignItems:'center', gap:6, marginTop:6, marginBottom:6 },
  dot:{ width:6, height:6, borderRadius:3, backgroundColor:'#ddd' },
  dotActive:{ backgroundColor:'#999' },

  modalWrap:{ flex:1, backgroundColor:'rgba(0,0,0,0.3)', justifyContent:'flex-end' },
  modalCard:{ backgroundColor:'#fff', padding:16, borderTopLeftRadius:16, borderTopRightRadius:16 },
  modalTitle:{ fontSize:16, fontWeight:'700' },
  modalSub:{ color:'#666', marginBottom:8 },
  stakeInput:{ borderWidth:1, borderColor:'#FF6B00', borderRadius:10, padding:10, marginTop:8, marginBottom:6 },
  quickRow:{ flexDirection:'row', gap:8, marginTop:10, marginBottom:6 },
  quickBtn:{ backgroundColor:'#f0f0f0', paddingVertical:8, paddingHorizontal:12, borderRadius:10 },
  tradeBtn:{ backgroundColor:'#FF6B00', padding:12, alignItems:'center', borderRadius:10, marginTop:4 },
  closeBtn:{ alignItems:'center', padding:10, marginTop:8 },

  basketBar:{ position:'absolute', bottom:0, left:0, right:0, backgroundColor:'#fff', borderTopWidth:1, borderTopColor:'#ddd', padding:12, alignItems:'center' },
  basketText:{ color:'#333', fontWeight:'bold', fontSize:13, textAlign:'center', marginBottom:8 },
  basketBtn:{ paddingHorizontal:16, paddingVertical:10, borderRadius:10 },
  basketBtnTxt:{ color:'#fff', fontWeight:'bold' },

  basketItem:{ flexDirection:'row', alignItems:'center', gap:10, paddingVertical:8 },
  basketStakeInput:{ borderWidth:1, borderColor:'#ddd', borderRadius:8, paddingHorizontal:10, paddingVertical:6, width:80, textAlign:'center' },
  trashBtn:{ backgroundColor:'#E53935', paddingHorizontal:10, paddingVertical:10, borderRadius:10 },
});
