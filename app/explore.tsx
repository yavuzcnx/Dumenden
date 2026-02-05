'use client';

import CartRibbon from '@/components/CartRibbon';
import { resolveStorageUrlSmart } from '@/lib/resolveStorageUrlSmart';
import { supabase } from '@/lib/supabaseClient';
import { useXp } from '@/src/contexts/XpProvider';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Dimensions, Easing, FlatList, Image, Modal,
  Platform, Pressable, SafeAreaView, ScrollView, StatusBar, Text, TouchableOpacity, View,
} from 'react-native';

const CATS = ['Tümü', 'Gündem', 'Spor', 'Magazin', 'Politika', 'Absürt'];

type Row = {
  id: string | number;
  title: string;
  description: string | null;
  category: string | null;
  created_at: string;
  created_by: string | null;
  closing_date: string;
  yes_price: number | null;
  no_price: number | null;
  image_url: string | null;
  is_open?: boolean;
  result?: string | null;
  paid_out_at?: string | null;
  users?: { full_name: string | null; avatar_url: string | null } | null;
  coupon_proofs?: { count: number }[];
  coupon_submissions?: { image_path: string | null }[];
};
type Proof = { id: string; title: string | null; image_url: string | null; created_at: string };

const { width, height } = Dimensions.get('window');
const H_PADDING = 16;
const CARD_W = Math.round((width - H_PADDING * 2 - 12) / 2);
const CARD_H = Math.round(CARD_W * 1.25);

/* ---------------- Emoji Confetti ---------------- */
const EmojiBurst = ({ onDone }: { onDone?: () => void }) => {
  const EMOJIS = ['🎉', '✨', '🎊', '💥', '🌟'];
  const items = new Array(12).fill(0).map((_, i) => ({
    id: i, x: Math.random() * (width - 40) + 20, delay: Math.random() * 200,
    emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
  }));
  useEffect(() => { const t = setTimeout(() => onDone?.(), 1300); return () => clearTimeout(t); }, [onDone]);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
      {items.map(({ id, x, delay, emoji }) => {
        const translateY = useRef(new Animated.Value(0)).current;
        const opacity = useRef(new Animated.Value(1)).current;
        useEffect(() => {
          Animated.parallel([
            Animated.timing(translateY, { toValue: height * 0.55, duration: 1200, delay, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 1200, delay: delay + 300, useNativeDriver: true }),
          ]).start();
        }, [delay]);
        return (
          <Animated.Text key={id} style={{ position: 'absolute', top: height * 0.25, left: x, fontSize: 18 + Math.random() * 10, transform: [{ translateY }], opacity }}>
            {emoji}
          </Animated.Text>
        );
      })}
    </View>
  );
};

/* ============================ Component ============================ */
export default function Explore() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const { xp, loading: xpLoading, refresh } = useXp();
  const [xpLocal, setXpLocal] = useState<number | null>(null);
  useEffect(() => { setXpLocal(xp); }, [xp]);

  const [cat, setCat] = useState('Tümü');
  const [rows, setRows] = useState<Row[]>([]);
  const [myId, setMyId] = useState<string | null>(null);

  // Sepet
  type BasketItem = { coupon_id: string | number; title: string; side: 'YES' | 'NO'; price: number; stake: number; };
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [showBasket, setShowBasket] = useState(false);
  const totalStake = useMemo(() => basket.reduce((a, b) => a + b.stake, 0), [basket]);
  const [busy, setBusy] = useState(false);

  // Kanıt
  const [proofSheet, setProofSheet] = useState<{ couponId: string | number; title: string } | null>(null);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loadingProofs, setLoadingProofs] = useState(false);

  // Focused big card
  const [focusCard, setFocusCard] = useState<Row | null>(null);

  // Confetti
  const [boom, setBoom] = useState(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
        if(data?.user) setMyId(data.user.id);
    });
  }, []);

  const load = async () => {
    setLoading(true);

    let q = supabase
      .from('coupons')
      .select(`
        id, title, description, category, created_at, created_by, closing_date, yes_price, no_price, image_url, is_open, result, paid_out_at,
        users:created_by(full_name,avatar_url),
        coupon_proofs:coupon_proofs!coupon_proofs_coupon_id_fkey(count),
        coupon_submissions:coupon_submissions!coupon_submissions_approved_coupon_id_fkey(image_path)
      `)
      .eq('is_user_generated', true)
      .eq('is_open', true)
      .gt('closing_date', new Date().toISOString())
      .is('result', null)
      .is('paid_out_at', null)
      .order('created_at', { ascending: false })
      .limit(120);

    if (cat !== 'Tümü') q = q.eq('category', cat);

    const r = await q;
    if (r.error) { console.log('EXPLORE load error:', r.error); setRows([]); setLoading(false); return; }

    const list: Row[] = (r.data ?? []) as any;

    await Promise.all(
      list.map(async (it) => {
        const candidate =
          it?.image_url && !String(it.image_url).startsWith('http')
            ? it.image_url
            : it?.coupon_submissions?.[0]?.image_path || it?.image_url || null;
        it.image_url = await resolveStorageUrlSmart(candidate);
      })
    );

    setRows(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, [cat]);
  useEffect(() => { refresh().catch(() => {}); }, []);

  useEffect(() => {
    const channel = supabase
      .channel('explore-coupons')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coupons' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [cat]);

  useEffect(() => {
    const tick = () => {
      setRows(prev => {
        const next = prev.filter(r =>
          new Date(r.closing_date).getTime() > Date.now() &&
          r.is_open !== false &&
          !r.result &&
          !r.paid_out_at
        );
        if (next.length !== prev.length) return next;
        return prev;
      });
    };
    tick();
    const t = setInterval(tick, 20_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const closeExpired = async () => { try { await supabase.rpc('close_expired_coupons'); } catch {} };
    closeExpired();
    const t = setInterval(closeExpired, 60_000);
    return () => clearInterval(t);
  }, []);

  const openProofs = async (coupon: Row) => {
    setProofSheet({ couponId: coupon.id, title: coupon.title });
    setLoadingProofs(true);
    const { data, error } = await supabase
      .from('coupon_proofs')
      .select('id, title, media_url, created_at')
      .eq('coupon_id', coupon.id)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) { console.log('proofs err', error); setProofs([]); setLoadingProofs(false); return; }

    const arr: Proof[] = ((data ?? []) as any).map((p: any) => ({
      id: p.id, title: p.title ?? null, created_at: p.created_at, image_url: null,
    }));
    await Promise.all(
      arr.map(async (a, i) => {
        const raw = (data as any[])[i]?.media_url;
        a.image_url = await resolveStorageUrlSmart(raw);
      })
    );
    setProofs(arr);
    setLoadingProofs(false);
  };

  const goDetail = (id: string | number) => { router.push({ pathname: '/CouponDetail', params: { id: String(id) } }); };

  const addOnceToBasket = (row: Row, side: 'YES' | 'NO') => {
    if (!row.yes_price && side === 'YES') return;
    if (!row.no_price && side === 'NO') return;

    const isClosed =
      row.is_open === false ||
      !!row.result ||
      !!row.paid_out_at ||
      new Date(row.closing_date).getTime() <= Date.now();
    if (isClosed) {
      Alert.alert('Kupon kapandi', 'Bu kupon sonuclandigi icin oynanamaz.');
      return;
    }
    
    if (myId && row.created_by === myId) {
        Alert.alert("Hata", "Kendi oluşturduğun kupona bahis oynayamazsın.");
        return;
    }

    const exists = basket.some((b) => b.coupon_id === row.id);
    if (exists) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); return; }
    const price = side === 'YES' ? row.yes_price! : row.no_price!;
    setBasket((b) => [...b, { coupon_id: row.id, title: row.title, side, price, stake: 100 }]);
    setShowBasket(true);
    setBoom((k) => k + 1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const removeFromBasket = (couponId: string | number) => { setBasket((b) => b.filter((x) => x.coupon_id !== couponId)); };
  const ensureBasketOpen = async () => {
    const ids = Array.from(new Set(basket.map((b) => String(b.coupon_id))));
    if (ids.length === 0) return true;
    const { data, error } = await supabase
      .from('coupons')
      .select('id,is_open,result,paid_out_at,closing_date')
      .in('id', ids);
    if (error) throw error;
    const closedIds = (data ?? [])
      .filter((c: any) => {
        const expired = c?.closing_date
          ? new Date(c.closing_date).getTime() <= Date.now()
          : false;
        return c?.is_open === false || !!c?.result || !!c?.paid_out_at || expired;
      })
      .map((c: any) => String(c.id));
    if (closedIds.length > 0) {
      setBasket((prev) => prev.filter((b) => !closedIds.includes(String(b.coupon_id))));
      Alert.alert('Kupon kapandi', 'Bazi kuponlar sonuclandigi icin sepetten kaldirildi.');
      await refresh().catch(() => {});
      return false;
    }
    return true;
  };

  const confirmBasket = async () => {
    if (basket.length === 0 || busy) return;
    try {
      setBusy(true);
      await Promise.all(
        basket.map((b) =>
          supabase.rpc('place_bet', {
            p_coupon_id: b.coupon_id, p_side: b.side, p_price: Number(b.price), p_stake: Number(b.stake),
          })
        )
      );
      setXpLocal((prev) => Math.max(0, (prev ?? xp) - totalStake));
      Alert.alert('Tamam', 'Bahis(ler) oynandı.');
      setBasket([]); setShowBasket(false);
      await refresh().catch(() => {});
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'İşlem başarısız');
    } finally { setBusy(false); }
  };

  const Pill = ({ children }: { children: React.ReactNode }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#F6F7FB', borderWidth: 1, borderColor: '#E7E9F2' }}>
      {children}
    </View>
  );

  const Card = ({ item }: { item: Row }) => {
    const proofCount = item.coupon_proofs?.[0]?.count ?? 0;
    const hasProof = proofCount > 0;
    const locked = basket.some((b) => b.coupon_id === item.id);
    const isMine = myId && item.created_by === myId;

    const scale = useRef(new Animated.Value(1)).current;
    const pressIn = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, friction: 6 }).start();
    const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6 }).start();

    return (
      <Animated.View
        style={{ 
          width: CARD_W, 
          marginBottom: 20, 
          backgroundColor: '#fff', 
          borderRadius: 16, 
          borderWidth: 1,
          borderColor: '#F0F0F0',
          shadowColor: '#000', 
          shadowOpacity: 0.1, 
          shadowRadius: 8, 
          shadowOffset: { width: 0, height: 4 }, 
          elevation: 4, 
          overflow: Platform.OS === 'ios' ? 'visible' : 'hidden', 
          transform: [{ scale }] 
        }}
      >
        <Pressable 
          onPress={() => goDetail(item.id)} 
          onLongPress={() => setFocusCard(item)} 
          onPressIn={pressIn} 
          onPressOut={pressOut}
          android_ripple={{ color: '#00000010' }} 
          style={{ 
            width: '100%', 
            height: CARD_H, 
            backgroundColor: '#f2f2f2',
            borderTopLeftRadius: 15,
            borderTopRightRadius: 15,
            overflow: 'hidden' 
          }}
        >
          {item.image_url ? <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} /> : null}
        </Pressable>

        {hasProof && (
          <TouchableOpacity onPress={() => openProofs(item)}
            style={{ position: 'absolute', top: 10, left: 10, backgroundColor: '#16a34a', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, transform: [{ rotate: '-5deg' }], zIndex: 10 }}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>📎 Kanıt ({proofCount})</Text>
          </TouchableOpacity>
        )}

        <View style={{ padding: 12, gap: 8 }}>
          <Text numberOfLines={2} style={{ fontWeight: '900', fontSize: 16, color: '#1A1A1A' }}>{item.title}</Text>

          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {!!item.category && <Pill><Text style={{ color: '#FF6B00', fontWeight: '900', fontSize: 11 }}>{item.category}</Text></Pill>}
            <Pill><Ionicons name="time-outline" size={13} color="#6B7280" style={{ marginRight: 4 }} /><Text style={{ color: '#6B7280', fontWeight: '700', fontSize: 11 }}>{new Date(item.closing_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text></Pill>
          </View>

          {!isMine ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <TouchableOpacity disabled={locked || !item.yes_price} onPress={() => addOnceToBasket(item, 'YES')}
                  style={{ flex: 1, backgroundColor: '#E8F1FF', borderWidth: 1, borderColor: '#C9E0FF', paddingVertical: 8, borderRadius: 12, alignItems: 'center', opacity: locked ? 0.45 : 1 }}>
                  <Text style={{ color: '#1B66FF', fontWeight: '900', fontSize: 12 }}>Yes</Text>
                  <Text style={{ fontWeight: '900', fontSize: 13 }}>{item.yes_price?.toFixed(2) ?? '-'}</Text>
                </TouchableOpacity>

                <TouchableOpacity disabled={locked || !item.no_price} onPress={() => addOnceToBasket(item, 'NO')}
                  style={{ flex: 1, backgroundColor: '#FFE6EF', borderWidth: 1, borderColor: '#FFC7DA', paddingVertical: 8, borderRadius: 12, alignItems: 'center', opacity: locked ? 0.45 : 1 }}>
                  <Text style={{ color: '#D61C7B', fontWeight: '900', fontSize: 12 }}>No</Text>
                  <Text style={{ fontWeight: '900', fontSize: 13 }}>{item.no_price?.toFixed(2) ?? '-'}</Text>
                </TouchableOpacity>
              </View>
          ) : (
              <View style={{ padding: 8, backgroundColor: '#FFF3E0', borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#FFE0B2', marginTop: 4 }}>
                  <Text style={{ color: '#E65100', fontWeight: '800', fontSize: 11 }}>Kendi kuponuna oynayamazsın</Text>
              </View>
          )}
        </View>
      </Animated.View>
    );
  };

  if (loading) {
    return (<SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></SafeAreaView>);
  }

  // 🔴 İŞTE BURASI: HOME SAYFASINDAN BİREBİR KOPYALANAN RETURN BLOĞU
  // SafeAreaView içinde Header ve Grid var.
  // Sepet Barı ise SafeAreaView'ın DIŞINDA ve bottom: 0 ile en alta sabitlendi.
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* HEADER */}
        <View style={{ paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 28, fontWeight: '900', color: '#FF6B00' }}>Keşfet</Text>
            <View style={{ marginLeft: 'auto', backgroundColor: '#FFF2E8', borderWidth: 1, borderColor: '#FF6B00', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 20 }}>
              <Text style={{ color: '#FF6B00', fontWeight: '800' }}>
                {xpLoading ? '...' : (xpLocal ?? xp).toLocaleString('tr-TR')} XP
              </Text>
            </View>
          </View>
          <Text style={{ color: '#6B7280', marginTop: 4 }}>Plus kullanıcılarının en iyi kuponları</Text>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {CATS.map((c) => (
              <TouchableOpacity key={c} onPress={() => setCat(c)} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, backgroundColor: cat === c ? '#FF6B00' : '#eee' }}>
                <Text style={{ color: cat === c ? '#fff' : '#333', fontWeight: '700' }}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* GRID */}
        <FlatList
          data={rows}
          keyExtractor={(i) => String(i.id)}
          numColumns={2}
          columnWrapperStyle={{ paddingHorizontal: H_PADDING, gap: 12 }}
          contentContainerStyle={{ paddingBottom: 140, paddingTop: 8 }}
          renderItem={({ item }) => <Card item={item} />}
          showsVerticalScrollIndicator={false}
        />

        {boom > 0 && <EmojiBurst onDone={() => setBoom(0)} />}

        {/* ====== SEPET MODAL ====== */}
        <Modal visible={showBasket} transparent animationType="fade" onRequestClose={() => setShowBasket(false)}>
          <View style={{ flex: 1 }}>
            <Pressable style={{ flex: 1 }} onPress={() => setShowBasket(false)}>
              <BlurView intensity={35} tint="light" style={{ position: 'absolute', inset: 0 }} />
            </Pressable>

            <View style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              padding: 16, paddingBottom: 24, backgroundColor: '#fff',
              borderTopLeftRadius: 20, borderTopRightRadius: 20,
              shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, elevation: 8
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontWeight: '900', fontSize: 18 }}>Sepet</Text>
                <TouchableOpacity onPress={() => setShowBasket(false)} style={{ marginLeft: 'auto' }}>
                  <Text style={{ fontWeight: '800' }}>Kapat</Text>
                </TouchableOpacity>
              </View>

              {basket.length === 0 ? (
                <Text style={{ color: '#666' }}>Sepet boş.</Text>
              ) : (
                <ScrollView style={{ maxHeight: height * 0.45 }}>
                  {basket.map((b) => (
                    <View key={`${b.coupon_id}`} style={{ borderWidth: 1, borderColor: '#eee', borderRadius: 14, padding: 12, marginBottom: 10, backgroundColor: '#FAFAFB' }}>
                      <Text style={{ fontWeight: '800' }}>{b.title}</Text>
                      <Text style={{ color: '#666', marginTop: 4 }}>{b.side} • Fiyat: {b.price.toFixed(2)} • XP: {b.stake}</Text>
                      <TouchableOpacity onPress={() => removeFromBasket(b.coupon_id)} style={{ position: 'absolute', right: 12, top: 12, backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 }}>
                        <Text style={{ color: '#fff', fontWeight: '800' }}>Sil</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}

              <View style={{ marginTop: 8 }}>
                <Text style={{ fontWeight: '900' }}>Toplam Stake: {totalStake} XP</Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <TouchableOpacity disabled={basket.length === 0 || busy} onPress={confirmBasket}
                  style={{ flex: 1, backgroundColor: (basket.length === 0 || busy) ? '#f3a774' : '#FF6B00', padding: 14, borderRadius: 14, alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '900' }}>{busy ? 'İşleniyor…' : 'Onayla / Oyna'}</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={basket.length === 0 || busy} onPress={() => setBasket([])}
                  style={{ flex: 1, backgroundColor: '#F0F1F4', padding: 14, borderRadius: 14, alignItems: 'center', opacity: (basket.length === 0 || busy) ? 0.6 : 1 }}>
                  <Text style={{ fontWeight: '900' }}>Sepeti Temizle</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ====== KANIT MODAL ====== */}
        <Modal
          transparent
          visible={!!proofSheet}
          animationType="slide"
          onRequestClose={() => setProofSheet(null)}
        >
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <Pressable style={{ flex: 1 }} onPress={() => setProofSheet(null)}>
              <BlurView intensity={40} tint="light" style={{ position: 'absolute', inset: 0 }} />
            </Pressable>

            <View
              style={{
                backgroundColor: '#fff',
                borderTopLeftRadius: 22,
                borderTopRightRadius: 22,
                paddingTop: 10,
                paddingHorizontal: 0,
                paddingBottom: 24,
                maxHeight: height * 0.90,
                shadowColor: '#000',
                shadowOpacity: 0.2,
                shadowRadius: 12,
                elevation: 12,
              }}
            >
              <View style={{ alignItems: 'center', marginBottom: 10, marginTop: 6 }}>
                <View style={{ width: 48, height: 5, borderRadius: 3, backgroundColor: '#E5E7EB' }} />
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 16 }}>
                <Text style={{ fontWeight: '900', fontSize: 18 }} numberOfLines={1}>
                 {proofSheet?.title}
                </Text>
                <TouchableOpacity onPress={() => setProofSheet(null)} style={{ marginLeft: 'auto' }}>
                  <Text style={{ fontWeight: '800', color: '#666' }}>Kapat</Text>
                </TouchableOpacity>
              </View>

              {loadingProofs ? (
                <ActivityIndicator style={{ marginVertical: 40 }} color="#FF6B00" />
              ) : proofs.length === 0 ? (
                <Text style={{ color: '#666', paddingHorizontal: 16 }}>Onaylı kanıt yok.</Text>
              ) : (
                <ScrollView contentContainerStyle={{ paddingHorizontal: 16 }}>
                  <View style={{ gap: 16, paddingBottom: 20 }}>
                    {proofs.map((p) => (
                      <View
                        key={p.id}
                        style={{
                          borderRadius: 16,
                          overflow: 'hidden',
                          backgroundColor: '#000',
                        }}
                      >
                        {!!p.image_url && (
                          <Image
                            source={{ uri: p.image_url }}
                            style={{
                              width: '100%',
                              height: Math.min(height * 0.55, 450),
                              backgroundColor: '#000'
                            }}
                            resizeMode="contain"
                          />
                        )}
                        {!!p.title && (
                          <View style={{ backgroundColor: '#fff', padding: 12 }}>
                              <Text style={{ fontWeight: '800', color: '#333' }} numberOfLines={2}>
                              {p.title}
                              </Text>
                              <Text style={{ color: '#666', fontSize: 11, marginTop: 4 }}>
                                  {new Date(p.created_at).toLocaleDateString()} tarihinde eklendi
                              </Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

        {/* Focus card */}
        <Modal visible={!!focusCard} transparent animationType="fade" onRequestClose={() => setFocusCard(null)}>
           <View style={{ flex: 1 }}>
            <Pressable style={{ flex: 1 }} onPress={() => setFocusCard(null)}>
              <BlurView intensity={40} tint="light" style={{ position: 'absolute', inset: 0 }} />
            </Pressable>
            {focusCard && (
              <View style={{ position: 'absolute', left: 16, right: 16, top: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 24 : 24, bottom: 24, justifyContent: 'center' }}>
                <View style={{ borderRadius: 20, backgroundColor: '#fff', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 }}>
                  {focusCard.image_url ? (<Image source={{ uri: focusCard.image_url }} style={{ width: '100%', height: Math.min(height * 0.45, 420) }} />) : null}
                  <View style={{ padding: 16, gap: 10 }}>
                    <Text style={{ fontWeight: '900', fontSize: 20 }}>{focusCard.title}</Text>
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      {!!focusCard.category && <Pill><Text style={{ color: '#FF6B00', fontWeight: '900' }}>{focusCard.category}</Text></Pill>}
                      <Pill><Ionicons name="calendar-outline" size={16} color="#6B7280" style={{ marginRight: 6 }} /><Text style={{ color: '#6B7280', fontWeight: '700' }}>{new Date(focusCard.closing_date).toLocaleDateString()}</Text></Pill>
                      <Pill><Ionicons name="alarm-outline"  size={16} color="#6B7280" style={{ marginRight: 6 }} /><Text style={{ color: '#6B7280', fontWeight: '700' }}>{new Date(focusCard.closing_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text></Pill>
                    </View>
                    
                    {myId && focusCard.created_by === myId ? (
                        <View style={{ padding: 12, backgroundColor: '#FFF3E0', borderRadius: 12, alignItems: 'center', marginTop:12, borderWidth: 1, borderColor: '#FFE0B2' }}>
                            <Text style={{ color: '#E65100', fontWeight: '800', fontSize: 14 }}>Sana ait kupon (Bahis Kapalı)</Text>
                        </View>
                    ) : (
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                          <TouchableOpacity disabled={basket.length === 0 || busy} onPress={confirmBasket}
                            style={{ flex: 1, backgroundColor: (basket.length === 0 || busy) ? '#f3a774' : '#FF6B00', padding: 14, borderRadius: 14, alignItems: 'center' }}>
                            <Text style={{ color: '#fff', fontWeight: '900' }}>{busy ? 'İşleniyor…' : 'Onayla / Oyna'}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity disabled={basket.length === 0 || busy} onPress={() => setBasket([])}
                            style={{ flex: 1, backgroundColor: '#F0F1F4', padding: 14, borderRadius: 14, alignItems: 'center', opacity: (basket.length === 0 || busy) ? 0.6 : 1 }}>
                            <Text style={{ fontWeight: '900' }}>Sepeti Temizle</Text>
                          </TouchableOpacity>
                        </View>
                    )}
                  </View>
                </View>
              </View>
            )}
          </View>
        </Modal>

      </SafeAreaView>

      {/* 🔥 HOME İLE AYNI: EN ALTA YAPIŞIK, SAFE AREA DIŞINDA */}
      <View 
        pointerEvents="box-none" 
        style={{ 
          position: 'absolute', 
          left: 0, 
          right: 0, 
          bottom: 0, 
          zIndex: 99
        }}
      >
        <CartRibbon
          count={basket.length}
          totalXp={totalStake} 
          onPress={() => setShowBasket(true)} 
          fabDiameter={84}
        />
      </View>
    </View>
  );
}
