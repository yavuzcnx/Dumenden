'use client';

import CartRibbon from '@/components/CartRibbon';
import { supabase } from '@/lib/supabaseClient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

const STORAGE_BUCKET = 'Media';
const CATS = ['Tümü', 'Gündem', 'Spor', 'Magazin', 'Politika', 'Absürt'];

type Row = {
  id: string | number;
  title: string;
  description: string | null;
  category: string | null;
  created_at: string;
  closing_date: string;
  yes_price: number | null;
  no_price: number | null;
  image_url: string | null;
  users?: { full_name: string | null; avatar_url: string | null } | null;
  coupon_proofs?: { count: number }[];
  coupon_submissions?: { image_path: string | null }[];
};

type Proof = {
  id: string;
  title: string | null;
  image_url: string | null;
  created_at: string;
};

const { width, height } = Dimensions.get('window');
const H_PADDING = 16;
const CARD_W = Math.round((width - H_PADDING * 2 - 12) / 2);
const CARD_H = Math.round(CARD_W * 1.25);

const resolveUrl = (raw?: string | null) => {
  if (!raw) return null;
  if (String(raw).startsWith('http')) return String(raw);
  const clean = String(raw).replace(/^\/+/, '');
  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(clean).data.publicUrl;
};

/* ---------------- Emoji Confetti (depsiz) ---------------- */
const EmojiBurst = ({ onDone }: { onDone?: () => void }) => {
  const EMOJIS = ['🎉', '✨', '🎊', '💥', '🌟'];
  const items = new Array(12).fill(0).map((_, i) => ({
    id: i,
    x: Math.random() * (width - 40) + 20,
    delay: Math.random() * 200,
    emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
  }));
  useEffect(() => {
    const t = setTimeout(() => onDone?.(), 1300);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
      {items.map(({ id, x, delay, emoji }) => {
        const translateY = useRef(new Animated.Value(0)).current;
        const opacity = useRef(new Animated.Value(1)).current;
        useEffect(() => {
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: height * 0.55,
              duration: 1200,
              delay,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 1200,
              delay: delay + 300,
              useNativeDriver: true,
            }),
          ]).start();
        }, [delay]);
        return (
          <Animated.Text
            key={id}
            style={{
              position: 'absolute',
              top: height * 0.25,
              left: x,
              fontSize: 18 + Math.random() * 10,
              transform: [{ translateY }],
              opacity,
            }}
          >
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
  const [xp, setXp] = useState(0);
  const [cat, setCat] = useState('Tümü');
  const [rows, setRows] = useState<Row[]>([]);

  // Sepet
  type BasketItem = {
    coupon_id: string | number;
    title: string;
    side: 'YES' | 'NO';
    price: number;
    stake: number;
  };
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [showBasket, setShowBasket] = useState(false);
  const totalStake = useMemo(() => basket.reduce((a, b) => a + b.stake, 0), [basket]);

  // Proof bottom sheet
  const [proofSheet, setProofSheet] = useState<{ couponId: string | number; title: string } | null>(null);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loadingProofs, setLoadingProofs] = useState(false);

  // Focused big card (long press)
  const [focusCard, setFocusCard] = useState<Row | null>(null);

  // Confetti
  const [boom, setBoom] = useState(0);

  const load = async () => {
    setLoading(true);

    let q = supabase
      .from('coupons')
      .select(
        `
        id, title, description, category, created_at, closing_date, yes_price, no_price, image_url,
        users:created_by(full_name,avatar_url),
        coupon_proofs(count),
        coupon_submissions!coupon_submissions_approved_coupon_id_fkey(image_path)
      `
      )
      .eq('is_user_generated', true)
      .eq('is_open', true)
      .order('created_at', { ascending: false })
      .limit(120);

    if (cat !== 'Tümü') q = q.eq('category', cat);

    const [r, x] = await Promise.all([q, supabase.rpc('get_user_xp')]);
    const list: Row[] = (r.data ?? []) as any;

    // fotoğraf düzelt
    list.forEach((it) => {
      if (!it.image_url) {
        const p = it.coupon_submissions?.[0]?.image_path || null;
        it.image_url = resolveUrl(p);
      } else if (!String(it.image_url).startsWith('http')) {
        it.image_url = resolveUrl(it.image_url);
      }
    });

    setRows(list);
    setXp(Number(x.data ?? 0));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [cat]);

  const openProofs = async (coupon: Row) => {
    setProofSheet({ couponId: coupon.id, title: coupon.title });
    setLoadingProofs(true);
    const { data } = await supabase
      .from('coupon_proofs')
      .select('id, title, media_url, created_at')
      .eq('coupon_id', coupon.id)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(30);

    const arr: Proof[] = ((data ?? []) as any).map((p: any) => ({
      id: p.id,
      title: p.title ?? null,
      created_at: p.created_at,
      image_url: resolveUrl(p.media_url),
    }));
    setProofs(arr);
    setLoadingProofs(false);
  };

  const goDetail = (id: string | number) => {
    router.push({ pathname: '/CouponDetail', params: { id: String(id) } });
  };

  /* --------- Basket helpers --------- */
  const addOnceToBasket = (row: Row, side: 'YES' | 'NO') => {
    if (!row.yes_price && side === 'YES') return;
    if (!row.no_price && side === 'NO') return;

    // aynı kupondan zaten varsa engelle
    const exists = basket.some((b) => b.coupon_id === row.id);
    if (exists) {
      // ufak uyarı haptik
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    const price = side === 'YES' ? row.yes_price! : row.no_price!;
    setBasket((b) => [...b, { coupon_id: row.id, title: row.title, side, price, stake: 100 }]);
    setShowBasket(true);
    setBoom((k) => k + 1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const removeFromBasket = (couponId: string | number) => {
    setBasket((b) => b.filter((x) => x.coupon_id !== couponId));
  };

  /* ----------------- UI bits ----------------- */
  const Pill = ({ children }: { children: React.ReactNode }) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 14,
        backgroundColor: '#F6F7FB',
        borderWidth: 1,
        borderColor: '#E7E9F2',
      }}
    >
      {children}
    </View>
  );

  /* --------- Card --------- */
  const Card = ({ item }: { item: Row }) => {
    const proofCount = item.coupon_proofs?.[0]?.count ?? 0;
    const hasProof = proofCount > 0;
    const locked = basket.some((b) => b.coupon_id === item.id);

    // press animasyonu
    const scale = useRef(new Animated.Value(1)).current;
    const pressIn = () =>
      Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, friction: 6 }).start();
    const pressOut = () =>
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6 }).start();

    return (
      <Animated.View
        style={{
          width: CARD_W,
          marginBottom: 20,
          backgroundColor: '#fff',
          borderRadius: 16,
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },
          elevation: 3,
          overflow: 'hidden',
          transform: [{ scale }],
        }}
      >
        {/* Foto → kısa bas: detay, uzun bas: büyüt */}
        <Pressable
          onPress={() => goDetail(item.id)}
          onLongPress={() => setFocusCard(item)}
          onPressIn={pressIn}
          onPressOut={pressOut}
          android_ripple={{ color: '#00000010' }}
          style={{ width: '100%', height: CARD_H, backgroundColor: '#f2f2f2' }}
        >
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} />
          ) : null}
        </Pressable>

        {/* Kanıt sticker (buton) */}
        {hasProof && (
          <TouchableOpacity
            onPress={() => openProofs(item)}
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              backgroundColor: '#16a34a',
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 12,
              transform: [{ rotate: '-5deg' }],
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>📎 Kanıt ({proofCount})</Text>
          </TouchableOpacity>
        )}

        {/* Alt içerik */}
        <View style={{ padding: 12, gap: 8 }}>
          <Text numberOfLines={2} style={{ fontWeight: '900', fontSize: 16 }}>
            {item.title}
          </Text>

          {/* Kategori + tarih + saat */}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {!!item.category && (
              <Pill>
                <Text style={{ color: '#FF6B00', fontWeight: '900' }}>{item.category}</Text>
              </Pill>
            )}
            <Pill>
              <Ionicons name="calendar-outline" size={14} color="#6B7280" style={{ marginRight: 6 }} />
              <Text style={{ color: '#6B7280', fontWeight: '700' }}>
                {new Date(item.closing_date).toLocaleDateString()}
              </Text>
            </Pill>
            <Pill>
              <Ionicons name="time-outline" size={14} color="#6B7280" style={{ marginRight: 6 }} />
              <Text style={{ color: '#6B7280', fontWeight: '700' }}>
                {new Date(item.closing_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </Pill>
          </View>

          {/* Yes / No */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              disabled={locked || !item.yes_price}
              onPress={() => addOnceToBasket(item, 'YES')}
              style={{
                flex: 1,
                backgroundColor: '#E8F1FF',
                borderWidth: 1,
                borderColor: '#C9E0FF',
                paddingVertical: 10,
                borderRadius: 14,
                alignItems: 'center',
                opacity: locked ? 0.45 : 1,
              }}
            >
              <Text style={{ color: '#1B66FF', fontWeight: '900' }}>Yes</Text>
              <Text style={{ fontWeight: '900' }}>{item.yes_price?.toFixed(2) ?? '-'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              disabled={locked || !item.no_price}
              onPress={() => addOnceToBasket(item, 'NO')}
              style={{
                flex: 1,
                backgroundColor: '#FFE6EF',
                borderWidth: 1,
                borderColor: '#FFC7DA',
                paddingVertical: 10,
                borderRadius: 14,
                alignItems: 'center',
                opacity: locked ? 0.45 : 1,
              }}
            >
              <Text style={{ color: '#D61C7B', fontWeight: '900' }}>No</Text>
              <Text style={{ fontWeight: '900' }}>{item.no_price?.toFixed(2) ?? '-'}</Text>
            </TouchableOpacity>
          </View>

          {/* Sepete eklendi etiketi */}
          {locked && (
            <View
              style={{
                marginTop: 6,
                alignSelf: 'flex-start',
                backgroundColor: '#E8FFF2',
                borderColor: '#BDEED0',
                borderWidth: 1,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 12,
              }}
            >
              <Text style={{ color: '#0E9F6E', fontWeight: '800' }}>Sepete eklendi ✓</Text>
            </View>
          )}
        </View>
      </Animated.View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  /* ============================ RENDER ============================ */
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 28, fontWeight: '900', color: '#FF6B00' }}>Keşfet</Text>
          <View
            style={{
              marginLeft: 'auto',
              backgroundColor: '#FFF2E8',
              borderWidth: 1,
              borderColor: '#FF6B00',
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 20,
            }}
          >
            <Text style={{ color: '#FF6B00', fontWeight: '800' }}>{xp.toLocaleString()} XP</Text>
          </View>
        </View>
        <Text style={{ color: '#6B7280', marginTop: 4 }}>Plus kullanıcılarının en iyi kuponları</Text>

        {/* Kategoriler */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {CATS.map((c) => (
            <TouchableOpacity
              key={c}
              onPress={() => setCat(c)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 12,
                backgroundColor: cat === c ? '#FF6B00' : '#eee',
              }}
            >
              <Text style={{ color: cat === c ? '#fff' : '#333', fontWeight: '700' }}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Grid */}
      <FlatList
        data={rows}
        keyExtractor={(i) => String(i.id)}
        numColumns={2}
        columnWrapperStyle={{ paddingHorizontal: H_PADDING, gap: 12 }}
        contentContainerStyle={{ paddingBottom: 140, paddingTop: 8 }}
        renderItem={({ item }) => <Card item={item} />}
        showsVerticalScrollIndicator={false}
      />

      {/* Confetti (emoji) */}
      {boom > 0 && <EmojiBurst onDone={() => setBoom(0)} />}

      {/* Sepet bottom sheet */}
      <Modal visible={showBasket} transparent animationType="fade" onRequestClose={() => setShowBasket(false)}>
        <View style={{ flex: 1 }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowBasket(false)}>
            <BlurView intensity={35} tint="light" style={{ position: 'absolute', inset: 0 }} />
          </Pressable>

          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              padding: 16,
              paddingBottom: 24,
              backgroundColor: '#fff',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              shadowColor: '#000',
              shadowOpacity: 0.15,
              shadowRadius: 10,
              elevation: 8,
            }}
          >
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
                  <View
                    key={`${b.coupon_id}`}
                    style={{
                      borderWidth: 1,
                      borderColor: '#eee',
                      borderRadius: 14,
                      padding: 12,
                      marginBottom: 10,
                      backgroundColor: '#FAFAFB',
                    }}
                  >
                    <Text style={{ fontWeight: '800' }}>{b.title}</Text>
                    <Text style={{ color: '#666', marginTop: 4 }}>
                      {b.side} • Fiyat: {b.price.toFixed(2)} • XP: {b.stake}
                    </Text>

                    <TouchableOpacity
                      onPress={() => removeFromBasket(b.coupon_id)}
                      style={{
                        position: 'absolute',
                        right: 12,
                        top: 12,
                        backgroundColor: '#ef4444',
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                      }}
                    >
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
              <TouchableOpacity
                disabled={basket.length === 0}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  // TODO: ödeme/oyna akışı
                }}
                style={{
                  flex: 1,
                  backgroundColor: basket.length ? '#FF6B00' : '#f3a774',
                  padding: 14,
                  borderRadius: 14,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '900' }}>Onayla / Oyna</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={basket.length === 0}
                onPress={() => setBasket([])}
                style={{
                  flex: 1,
                  backgroundColor: '#F0F1F4',
                  padding: 14,
                  borderRadius: 14,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontWeight: '900' }}>Sepeti Temizle</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Kanıt bottom sheet */}
      <Modal visible={!!proofSheet} transparent animationType="fade" onRequestClose={() => setProofSheet(null)}>
        <View style={{ flex: 1 }}>
          <Pressable style={{ flex: 1 }} onPress={() => setProofSheet(null)}>
            <BlurView intensity={35} tint="light" style={{ position: 'absolute', inset: 0 }} />
          </Pressable>

          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: height * 0.75,
              backgroundColor: '#fff',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 16,
            }}
          >
            <Text style={{ fontWeight: '900', fontSize: 18, marginBottom: 8 }}>
              Kanıtlar • {proofSheet?.title ?? ''}
            </Text>

            {loadingProofs ? (
              <ActivityIndicator />
            ) : proofs.length === 0 ? (
              <Text style={{ color: '#666' }}>Bu kupona henüz kanıt eklenmemiş.</Text>
            ) : (
              <ScrollView>
                {proofs.map((p) => (
                  <View
                    key={p.id}
                    style={{
                      borderWidth: 1,
                      borderColor: '#eee',
                      backgroundColor: '#FAFAFB',
                      borderRadius: 14,
                      padding: 10,
                      marginBottom: 10,
                    }}
                  >
                    {p.image_url ? (
                      <Image source={{ uri: p.image_url }} style={{ width: '100%', height: 180, borderRadius: 10 }} />
                    ) : null}
                    {!!p.title && <Text style={{ fontWeight: '800', marginTop: 8 }}>{p.title}</Text>}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Kartı büyüt (uzun bas) */}
      <Modal visible={!!focusCard} transparent animationType="fade" onRequestClose={() => setFocusCard(null)}>
        <View style={{ flex: 1 }}>
          <Pressable style={{ flex: 1 }} onPress={() => setFocusCard(null)}>
            <BlurView intensity={40} tint="light" style={{ position: 'absolute', inset: 0 }} />
          </Pressable>

          {focusCard && (
            <View
              style={{
                position: 'absolute',
                left: 16,
                right: 16,
                top: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 24 : 24,
                bottom: 24,
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  borderRadius: 20,
                  backgroundColor: '#fff',
                  overflow: 'hidden',
                  shadowColor: '#000',
                  shadowOpacity: 0.15,
                  shadowRadius: 12,
                  elevation: 8,
                }}
              >
                {focusCard.image_url ? (
                  <Image
                    source={{ uri: focusCard.image_url }}
                    style={{ width: '100%', height: Math.min(height * 0.45, 420) }}
                  />
                ) : null}

                <View style={{ padding: 16, gap: 10 }}>
                  <Text style={{ fontWeight: '900', fontSize: 20 }}>{focusCard.title}</Text>

                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {!!focusCard.category && (
                      <Pill>
                        <Text style={{ color: '#FF6B00', fontWeight: '900' }}>{focusCard.category}</Text>
                      </Pill>
                    )}
                    <Pill>
                      <Ionicons name="calendar-outline" size={16} color="#6B7280" style={{ marginRight: 6 }} />
                      <Text style={{ color: '#6B7280', fontWeight: '700' }}>
                        {new Date(focusCard.closing_date).toLocaleDateString()}
                      </Text>
                    </Pill>
                    <Pill>
                      <Ionicons name="alarm-outline" size={16} color="#6B7280" style={{ marginRight: 6 }} />
                      <Text style={{ color: '#6B7280', fontWeight: '700' }}>
                        {new Date(focusCard.closing_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </Pill>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      disabled={basket.some((b) => b.coupon_id === focusCard.id) || !focusCard.yes_price}
                      onPress={() => addOnceToBasket(focusCard, 'YES')}
                      style={{
                        flex: 1,
                        backgroundColor: '#E8F1FF',
                        borderWidth: 1,
                        borderColor: '#C9E0FF',
                        paddingVertical: 12,
                        borderRadius: 14,
                        alignItems: 'center',
                        opacity: basket.some((b) => b.coupon_id === focusCard.id) ? 0.45 : 1,
                      }}
                    >
                      <Text style={{ color: '#1B66FF', fontWeight: '900' }}>Yes</Text>
                      <Text style={{ fontWeight: '900' }}>{focusCard.yes_price?.toFixed(2) ?? '-'}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      disabled={basket.some((b) => b.coupon_id === focusCard.id) || !focusCard.no_price}
                      onPress={() => addOnceToBasket(focusCard, 'NO')}
                      style={{
                        flex: 1,
                        backgroundColor: '#FFE6EF',
                        borderWidth: 1,
                        borderColor: '#FFC7DA',
                        paddingVertical: 12,
                        borderRadius: 14,
                        alignItems: 'center',
                        opacity: basket.some((b) => b.coupon_id === focusCard.id) ? 0.45 : 1,
                      }}
                    >
                      <Text style={{ color: '#D61C7B', fontWeight: '900' }}>No</Text>
                      <Text style={{ fontWeight: '900' }}>{focusCard.no_price?.toFixed(2) ?? '-'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Sepet floating ribbon */}
     <CartRibbon
  count={basket.length}
  totalXp={totalStake}
  onPress={() => setShowBasket(true)}
  fabDiameter={84}
/>
    </SafeAreaView>
  );
}
