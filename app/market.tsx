// app/market.tsx (fix: double-purchase guard)
'use client';

import { supabase } from '@/lib/supabaseClient';
import { useXp } from '@/src/contexts/XpProvider';
import { buyItem, type PurchaseContact } from '@/src/contexts/services/purchaseService';
import type { RealtimePostgresUpdatePayload } from '@supabase/supabase-js';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Category = { id: string; name: string };
type Reward = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  int_price: number;
  stock: number;
  category_id: string | null;
};

const { width, height } = Dimensions.get('window');
const base = 375;
const s = (n: number) => Math.round((n * width) / base);
const ORANGE = '#FF6B00';
const MUTED = '#6B7280';

export default function Market() {
  const ins = useSafeAreaInsets();
  const topPad =
    Platform.OS === 'ios' ? s(6) : (ins.top || StatusBar.currentHeight || 0) + s(6);

  const [loading, setLoading] = useState(true);
  const [cats, setCats] = useState<Category[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [active, setActive] = useState<string>('all');

  // Detay + Satın alma formu
  const [detail, setDetail] = useState<Reward | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [contact, setContact] = useState<PurchaseContact>({
    full_name: '',
    email: '',
    phone: '',
    address: '',
    note: '',
  });

  // XP
  const { xp, loading: xpLoading, refresh } = useXp();

  // satın alma bekleme/spinner
  const [pendingId, setPendingId] = useState<string | null>(null);
  // **kritik**: hızlı çift basışa karşı kilit (render beklemeden anında çalışır)
  const purchasingRef = useRef(false);

  // header progress bar için 3 sn'lik sayaç
  const [cool, setCool] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [cRes, rRes] = await Promise.all([
        supabase.from('reward_categories').select('id,name').order('name'),
        supabase.from('rewards').select('*').order('int_price', { ascending: false }),
      ]);
      setCats([{ id: 'all', name: 'Tümü' }, ...((cRes.data ?? []) as Category[])] as Category[]);
      setRewards((rRes.data ?? []) as Reward[]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  // Realtime: rewards stok güncelle
  useEffect(() => {
    const ch = supabase
      .channel('rt-rewards')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rewards' },
        (payload: RealtimePostgresUpdatePayload<Reward>) => {
          const n = payload.new;
          if (!n) return;
          setRewards(prev =>
            prev.map(r => (String(r.id) === String(n.id) ? { ...r, stock: n.stock } : r)),
          );
        },
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
    };
  }, []);

  // cooldown sayaç
  useEffect(() => {
    if (cool <= 0) return;
    const t = setInterval(() => setCool(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [cool]);

  type ShelfType =
    | 'podium'
    | 'hanger'
    | 'aluminum'
    | 'glass'
    | 'mini_podiums'
    | 'holo'
    | 'xppacks';

  function detectShelfType(catName: string): ShelfType {
    const n = (catName || '').toLowerCase();
    if (n === 'büyük ödül') return 'podium';
    if (/(giyim|tişört|tshirt|hoodie|şapka|kıyafet|merch)/i.test(n)) return 'hanger';
    if (/(beyaz eşya|beyazesya|çamaşır|bulaşık|buzdolabı)/i.test(n)) return 'aluminum';
    if (/(ev aleti|elektronik|kulaklık|tablet|tv|monitor|kahve)/i.test(n)) return 'glass';
    if (/(aksesuar|koleksiyon|sticker|kupa|anahtarlık|pin|rozet)/i.test(n)) return 'mini_podiums';
    if (/(dijital|gift|kart|abonelik|subscription|oyun içi|in-game)/i.test(n)) return 'holo';
    if (/(xp|boost|paket|paketi)/i.test(n)) return 'xppacks';
    return 'aluminum';
  }

  type Shelf = { key: string; type: ShelfType; label: string; items: Reward[] };
  const shelves: Shelf[] = useMemo(() => {
    if (active !== 'all') {
      const cat = cats.find(c => c.id === active);
      const t = detectShelfType(cat?.name ?? 'Kategori');
      const items = rewards.filter(r => r.category_id === active);
      return [{ key: `cat-${active}`, type: t, label: cat?.name ?? 'Kategori', items }];
    }

    const list: Shelf[] = [];
    const grandPrizeIds = cats
      .filter(c => (c.name || '').trim().toLowerCase() === 'büyük ödül')
      .map(c => c.id);

    const big = rewards.filter(r => r.category_id && grandPrizeIds.includes(r.category_id));
    if (big.length) list.push({ key: 'podium', type: 'podium', label: 'Büyük Ödül', items: big });

    cats
      .filter(c => c.id !== 'all' && !grandPrizeIds.includes(c.id))
      .forEach(c => {
        const items = rewards.filter(r => r.category_id === c.id);
        if (!items.length) return;
        list.push({ key: c.id, type: detectShelfType(c.name), label: c.name, items });
      });

    const none = rewards.filter(r => !r.category_id);
    if (none.length) list.push({ key: 'others', type: 'aluminum', label: 'Diğer', items: none });

    return list;
  }, [rewards, cats, active]);

  // Satın al butonu -> form aç
  const openBuyForm = (item: Reward) => {
    if (purchasingRef.current) return; // satın alma sırasında form açtırma
    setDetail(item);
    setContact({ full_name: '', email: '', phone: '', address: '', note: '' });
    setFormOpen(true);
  };

  // Satın alma isteği (form gönder)
  const submitPurchase = async () => {
    if (!detail) return;

    // *** KİLİT: ÇİFT ÇAĞRILMAYI KES ***
    if (purchasingRef.current) return;
    purchasingRef.current = true;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Hata', 'Giriş yapmanız gerekiyor!');
        return;
      }
      if ((detail.stock ?? 0) < 1) {
        Alert.alert('Hata', 'Stok tükenmiş.');
        return;
      }
      if (!contact.full_name || !contact.phone || !contact.address) {
        Alert.alert('Eksik bilgi', 'Ad Soyad, Telefon ve Adres zorunludur.');
        return;
      }

      // state tabanlı guard (UI disable) – ama asıl koruma purchasingRef
      if (pendingId) return;

      setPendingId(detail.id);
      setCool(3);

      // iyimser: UI’da stok düş (tek kez)
      setRewards(prev =>
        prev.map(r => (r.id === detail.id ? { ...r, stock: Math.max(0, (r.stock ?? 0) - 1) } : r)),
      );

      // *** TEK RPC ÇAĞRISI ***
      await buyItem(user.id, detail.id, detail.int_price, contact);

      await refresh();

      setFormOpen(false);
      setDetail(null);
      Alert.alert('Tamamlandı', 'Satın alma oluşturuldu. Ekibimiz sizinle iletişime geçecek.');
    } catch (err: any) {
      // iyimser stok geri al
      if (detail) {
        setRewards(prev =>
          prev.map(r => (r.id === detail.id ? { ...r, stock: (r.stock ?? 0) + 1 } : r)),
        );
      }
      Alert.alert('Satın alma başarısız', err?.message ?? 'Bilinmeyen hata');
    } finally {
      setPendingId(null);
      purchasingRef.current = false;
    }
  };

  // ortak: tükendi rozeti
  const SoldOut = () => (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: s(10),
        right: s(10),
        backgroundColor: '#111827',
        paddingHorizontal: s(10),
        paddingVertical: s(6),
        borderRadius: s(10),
        opacity: 0.85,
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '900' }}>Tükendi</Text>
    </View>
  );

  // ---------- Header ----------
  const Header = () => (
    <View
      style={{
        backgroundColor: '#fff',
        paddingTop: topPad,
        paddingBottom: s(10),
        paddingHorizontal: s(16),
        zIndex: 2,
      }}
    >
      {cool > 0 && (
        <View
          style={{
            height: 3,
            backgroundColor: '#FFE8D8',
            borderRadius: 999,
            overflow: 'hidden',
            marginBottom: s(8),
          }}
        >
          <View
            style={{
              width: `${((3 - cool) / 3) * 100}%`,
              height: '100%',
              backgroundColor: ORANGE,
            }}
          />
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: s(10) }}>
        <Text style={{ fontSize: s(30), fontWeight: '900', color: ORANGE, includeFontPadding: false }}>
          Market
        </Text>
        <View
          style={{
            marginLeft: 'auto',
            backgroundColor: '#FFF2E8',
            borderWidth: 1,
            borderColor: ORANGE,
            paddingVertical: s(6),
            paddingHorizontal: s(10),
            borderRadius: s(20),
          }}
        >
          <Text style={{ color: ORANGE, fontWeight: '800', includeFontPadding: false }}>
            {xpLoading ? '...' : xp.toLocaleString('tr-TR')} XP
          </Text>
        </View>
      </View>

      <FlatList
        data={cats}
        keyExtractor={i => i.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: s(6) }}
        renderItem={({ item }) => {
          const selected = active === item.id;
          return (
            <Pressable
              onPress={() => {
                if (purchasingRef.current) return;
                setActive(item.id);
              }}
              style={{
                marginRight: s(10),
                paddingVertical: s(10),
                paddingHorizontal: s(16),
                borderRadius: s(22),
                borderWidth: 1.5,
                borderColor: selected ? ORANGE : '#eee',
                backgroundColor: selected ? '#FFE8D8' : '#fff',
              }}
            >
              <Text
                style={{
                  fontWeight: '800',
                  color: selected ? ORANGE : '#333',
                  fontSize: s(14),
                  includeFontPadding: false,
                }}
              >
                {item.name}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );

  // ---------- Common atoms ----------
  const Space = ({ w = 0, h = 0 }: { w?: number; h?: number }) => <View style={{ width: s(w), height: s(h) }} />;
  const RowWrap = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={{ paddingHorizontal: s(16), marginTop: s(18) }}>
      <Text style={{ fontSize: s(18), fontWeight: '900', marginBottom: s(8) }}>{title}</Text>
      {children}
    </View>
  );
  const Img = ({ uri }: { uri: string | null }) =>
    uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} /> : null;

  // ---------- PODIUM ----------
  const PodiumRow = ({ items }: { items: Reward[] }) => (
    <RowWrap title="Büyük Ödül">
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={items}
        keyExtractor={i => i.id}
        ItemSeparatorComponent={() => <Space w={12} />}
        renderItem={({ item }) => <PedestalCard item={item} />}
      />
    </RowWrap>
  );

  const PedestalCard = ({ item }: { item: Reward }) => {
    const bob = useRef(new Animated.Value(0)).current;
    useEffect(() => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(bob, { toValue: 1, duration: 1200, useNativeDriver: true }),
          Animated.timing(bob, { toValue: 0, duration: 1200, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }, [bob]);
    const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });

    const W = s(220);
    const sold = (item.stock ?? 0) < 1;

    return (
      <Pressable onPress={() => openBuyForm(item)} style={{ width: W }}>
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: s(18),
            padding: s(12),
            borderWidth: 1,
            borderColor: '#F2D9C8',
            shadowColor: '#000',
            shadowOpacity: 0.06,
            shadowRadius: 6,
            elevation: 2,
            overflow: 'hidden',
            opacity: purchasingRef.current ? 0.7 : 1,
          }}
          pointerEvents={purchasingRef.current ? 'none' : 'auto'}
        >
          <Animated.View style={{ transform: [{ translateY }] }}>
            <View
              style={{
                width: '100%',
                height: s(130),
                borderRadius: s(14),
                overflow: 'hidden',
                backgroundColor: '#F3F4F6',
              }}
            >
              <Img uri={item.image_url} />
              {sold && <SoldOut />}
            </View>
          </Animated.View>

          <View
            style={{
              height: s(18),
              borderRadius: s(10),
              marginTop: s(10),
              backgroundColor: ORANGE,
              opacity: 0.9,
            }}
          />

          <Text numberOfLines={1} style={{ fontWeight: '900', textAlign: 'center', marginTop: s(8) }}>
            {item.name}
          </Text>
          <Text style={{ color: ORANGE, fontWeight: '900', textAlign: 'center' }}>
            {item.int_price.toLocaleString('tr-TR')} XP
          </Text>

          <TouchableOpacity
            disabled={sold || pendingId === item.id || purchasingRef.current}
            onPress={() => openBuyForm(item)}
            style={{
              marginTop: s(8),
              backgroundColor: sold ? '#E5E7EB' : ORANGE,
              paddingVertical: s(8),
              borderRadius: s(10),
            }}
          >
            <Text style={{ color: sold ? '#9CA3AF' : '#fff', fontWeight: '900', textAlign: 'center' }}>
              {sold ? 'Tükendi' : pendingId === item.id || purchasingRef.current ? '...' : 'Satın Al'}
            </Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    );
  };

  // ---------- HANGER ----------
  const HangerRow = ({ title, items }: { title: string; items: Reward[] }) => (
    <RowWrap title={title}>
      <View style={{ height: s(12), borderRadius: s(8), backgroundColor: '#E6E7EB', marginBottom: s(10) }} />
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={items}
        keyExtractor={i => i.id}
        ItemSeparatorComponent={() => <Space w={10} />}
        renderItem={({ item }) => <HangerThumb item={item} />}
      />
    </RowWrap>
  );

  const HangerThumb = ({ item }: { item: Reward }) => {
    const scale = useRef(new Animated.Value(1)).current;
    const onPressIn = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true }).start();
    const onPressOut = () => Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }).start();
    const W = s(96);
    const sold = (item.stock ?? 0) < 1;

    return (
      <Pressable onPress={() => openBuyForm(item)} onPressIn={onPressIn} onPressOut={onPressOut} style={{ alignItems: 'center' }}>
        <View
          style={{
            width: s(10),
            height: s(18),
            borderTopLeftRadius: s(10),
            borderTopRightRadius: s(10),
            borderWidth: 2,
            borderColor: '#B0B3BA',
            marginBottom: s(4),
          }}
        />
        <Animated.View style={{ transform: [{ scale }], opacity: purchasingRef.current ? 0.7 : 1 }} pointerEvents={purchasingRef.current ? 'none' : 'auto'}>
          <View
            style={{
              width: W,
              height: W,
              borderRadius: s(14),
              backgroundColor: '#F3F4F6',
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: '#EEE',
            }}
          >
            <Img uri={item.image_url} />
            {sold && <SoldOut />}
            <View
              style={{
                position: 'absolute',
                left: 4,
                right: 4,
                bottom: 4,
                backgroundColor: 'rgba(0,0,0,0.55)',
                paddingVertical: 3,
                borderRadius: 8,
              }}
            >
              <Text numberOfLines={1} style={{ color: '#fff', textAlign: 'center', fontWeight: '800', fontSize: s(10) }}>
                {item.name}
              </Text>
              <Text style={{ color: ORANGE, textAlign: 'center', fontWeight: '900', fontSize: s(10) }}>
                {item.int_price.toLocaleString('tr-TR')} XP
              </Text>
            </View>
          </View>
        </Animated.View>
        {!sold && (
          <TouchableOpacity
            disabled={pendingId === item.id || purchasingRef.current}
            onPress={() => openBuyForm(item)}
            style={{ marginTop: s(6), backgroundColor: ORANGE, paddingVertical: s(6), paddingHorizontal: s(10), borderRadius: s(10) }}
          >
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: s(10) }}>
              {pendingId === item.id || purchasingRef.current ? '...' : 'Satın Al'}
            </Text>
          </TouchableOpacity>
        )}
      </Pressable>
    );
  };

  // ---------- ALUMINUM ----------
  const AluminumRow = ({ title, items }: { title: string; items: Reward[] }) => (
    <RowWrap title={title}>
      <View style={{ height: s(10), borderRadius: s(8), backgroundColor: '#E8ECF2', marginBottom: s(12) }} />
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={items}
        keyExtractor={i => i.id}
        ItemSeparatorComponent={() => <Space w={10} />}
        renderItem={({ item }) => {
          const sold = (item.stock ?? 0) < 1;
          return (
            <Pressable onPress={() => openBuyForm(item)}>
              <View
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: s(16),
                  borderWidth: 1,
                  borderColor: '#E7EAF0',
                  padding: s(10),
                  shadowColor: '#000',
                  shadowOpacity: 0.04,
                  shadowRadius: 6,
                  elevation: 2,
                  overflow: 'hidden',
                  opacity: purchasingRef.current ? 0.7 : 1,
                }}
                pointerEvents={purchasingRef.current ? 'none' : 'auto'}
              >
                <View
                  style={{
                    width: s(120),
                    height: s(86),
                    borderRadius: s(12),
                    overflow: 'hidden',
                    backgroundColor: '#F5F7FA',
                  }}
                >
                  <Img uri={item.image_url} />
                  {sold && <SoldOut />}
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: s(22), backgroundColor: '#ffffff55' }} />
                </View>
                <Text numberOfLines={1} style={{ fontSize: s(12), fontWeight: '800', marginTop: s(6), textAlign: 'center' }}>
                  {item.name}
                </Text>
                <Text style={{ fontSize: s(12), color: ORANGE, fontWeight: '900', textAlign: 'center' }}>
                  {item.int_price.toLocaleString('tr-TR')} XP
                </Text>
                <TouchableOpacity
                  disabled={sold || pendingId === item.id || purchasingRef.current}
                  onPress={() => openBuyForm(item)}
                  style={{
                    marginTop: s(6),
                    backgroundColor: sold ? '#E5E7EB' : ORANGE,
                    paddingVertical: s(6),
                    borderRadius: s(10),
                  }}
                >
                  <Text style={{ color: sold ? '#9CA3AF' : '#fff', fontWeight: '900', textAlign: 'center', fontSize: s(12) }}>
                    {sold ? 'Tükendi' : pendingId === item.id || purchasingRef.current ? '...' : 'Satın Al'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          );
        }}
      />
    </RowWrap>
  );

  // ---------- GLASS ----------
  const GlassRow = ({ title, items }: { title: string; items: Reward[] }) => (
    <RowWrap title={title}>
      <View style={{ height: s(10), borderRadius: s(8), backgroundColor: '#DBEEFF', opacity: 0.7, marginBottom: s(10) }} />
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={items}
        keyExtractor={i => i.id}
        ItemSeparatorComponent={() => <Space w={10} />}
        renderItem={({ item }) => <GlassThumb item={item} />}
      />
    </RowWrap>
  );

  const GlassThumb = ({ item }: { item: Reward }) => {
    const glow = useRef(new Animated.Value(0)).current;
    useEffect(() => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: 1400, useNativeDriver: false }),
          Animated.timing(glow, { toValue: 0, duration: 1400, useNativeDriver: false }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }, [glow]);
    const border = glow.interpolate({
      inputRange: [0, 1],
      outputRange: ['#DDF2FF', '#AEE1FF'],
    });

    const sold = (item.stock ?? 0) < 1;

    return (
      <Animated.View
        style={{
          padding: s(8),
          borderRadius: s(14),
          borderWidth: 1,
          backgroundColor: '#ECF8FF',
          borderColor: border as unknown as string,
          overflow: 'hidden',
          opacity: purchasingRef.current ? 0.7 : 1,
        }}
        pointerEvents={purchasingRef.current ? 'none' : 'auto'}
      >
        <View
          style={{
            width: s(120),
            height: s(86),
            borderRadius: s(12),
            overflow: 'hidden',
            backgroundColor: '#F2F6FA',
          }}
        >
          <Img uri={item.image_url} />
          {sold && <SoldOut />}
        </View>
        <Text numberOfLines={1} style={{ fontSize: s(12), fontWeight: '800', marginTop: s(6), textAlign: 'center' }}>
          {item.name}
        </Text>
        <Text style={{ fontSize: s(12), color: ORANGE, fontWeight: '900', textAlign: 'center' }}>
          {item.int_price.toLocaleString('tr-TR')} XP
        </Text>
        <TouchableOpacity
          disabled={sold || pendingId === item.id || purchasingRef.current}
          onPress={() => openBuyForm(item)}
          style={{
            marginTop: s(6),
            backgroundColor: sold ? '#E5E7EB' : ORANGE,
            paddingVertical: s(6),
            borderRadius: s(10),
          }}
        >
          <Text style={{ color: sold ? '#9CA3AF' : '#fff', fontWeight: '900', textAlign: 'center', fontSize: s(12) }}>
            {sold ? 'Tükendi' : pendingId === item.id || purchasingRef.current ? '...' : 'Satın Al'}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // ---------- MINI PODIUMS ----------
  const MiniPodiumsRow = ({ title, items }: { title: string; items: Reward[] }) => (
    <RowWrap title={title}>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={items}
        keyExtractor={i => i.id}
        ItemSeparatorComponent={() => <Space w={10} />}
        renderItem={({ item }) => (
          <Pressable onPress={() => openBuyForm(item)}>
            <View style={{ width: s(110), alignItems: 'center', opacity: purchasingRef.current ? 0.7 : 1 }} pointerEvents={purchasingRef.current ? 'none' : 'auto'}>
              <View
                style={{
                  width: s(96),
                  height: s(96),
                  borderRadius: s(16),
                  overflow: 'hidden',
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#EDEDED',
                  shadowColor: '#000',
                  shadowOpacity: 0.06,
                  shadowRadius: 6,
                  elevation: 2,
                }}
              >
                <Img uri={item.image_url} />
                {(item.stock ?? 0) < 1 && <SoldOut />}
                <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: s(22), backgroundColor: '#00000025' }} />
              </View>
              <View style={{ height: s(8), width: s(70), backgroundColor: '#F6E9DB', borderRadius: s(8), marginTop: s(6) }} />
              <Text numberOfLines={1} style={{ fontSize: s(12), fontWeight: '800', marginTop: s(4), textAlign: 'center' }}>
                {item.name}
              </Text>
              <Text style={{ fontSize: s(12), color: ORANGE, fontWeight: '900', textAlign: 'center' }}>
                {item.int_price.toLocaleString('tr-TR')} XP
              </Text>
              <TouchableOpacity
                disabled={(item.stock ?? 0) < 1 || pendingId === item.id || purchasingRef.current}
                onPress={() => openBuyForm(item)}
                style={{
                  marginTop: s(6),
                  backgroundColor: (item.stock ?? 0) < 1 ? '#E5E7EB' : ORANGE,
                  paddingVertical: s(6),
                  borderRadius: s(10),
                  width: s(96),
                }}
              >
                <Text style={{ color: (item.stock ?? 0) < 1 ? '#9CA3AF' : '#fff', fontWeight: '900', textAlign: 'center', fontSize: s(12) }}>
                  {(item.stock ?? 0) < 1 ? 'Tükendi' : pendingId === item.id || purchasingRef.current ? '...' : 'Satın Al'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        )}
      />
    </RowWrap>
  );

  // ---------- HOLOGRAM ----------
  const HoloRow = ({ title, items }: { title: string; items: Reward[] }) => (
    <RowWrap title={title}>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={items}
        keyExtractor={i => i.id}
        ItemSeparatorComponent={() => <Space w={12} />}
        renderItem={({ item }) => <HoloCard item={item} />}
      />
    </RowWrap>
  );

  const HoloCard = ({ item }: { item: Reward }) => {
    const pulse = useRef(new Animated.Value(0)).current;
    useEffect(() => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: false }),
          Animated.timing(pulse, { toValue: 0, duration: 1200, useNativeDriver: false }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }, [pulse]);
    const border = pulse.interpolate({
      inputRange: [0, 1],
      outputRange: ['#7C3AED55', '#22D3EEaa'],
    });

    const sold = (item.stock ?? 0) < 1;

    return (
      <Pressable onPress={() => openBuyForm(item)}>
        <Animated.View
          style={{
            width: s(200),
            padding: s(12),
            borderRadius: s(16),
            backgroundColor: '#0b1020',
            borderWidth: 2,
            borderColor: border as unknown as string,
            overflow: 'hidden',
            opacity: purchasingRef.current ? 0.7 : 1,
          }}
          pointerEvents={purchasingRef.current ? 'none' : 'auto'}
        >
          <View style={{ height: s(100), borderRadius: s(12), overflow: 'hidden', backgroundColor: '#111827' }}>
            <Img uri={item.image_url} />
            {sold && <SoldOut />}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: s(50), backgroundColor: '#22D3EE22' }} />
          </View>
          <Text numberOfLines={1} style={{ color: '#E5E7EB', fontWeight: '900', marginTop: s(8) }}>
            {item.name}
          </Text>
          <Text style={{ color: '#A78BFA', fontWeight: '900' }}>
            {item.int_price.toLocaleString('tr-TR')} XP
          </Text>
          <TouchableOpacity
            disabled={sold || pendingId === item.id || purchasingRef.current}
            onPress={() => openBuyForm(item)}
            style={{
              marginTop: s(8),
              backgroundColor: sold ? '#E5E7EB' : ORANGE,
              paddingVertical: s(8),
              borderRadius: s(10),
            }}
          >
            <Text style={{ color: sold ? '#9CA3AF' : '#fff', fontWeight: '900', textAlign: 'center' }}>
              {sold ? 'Tükendi' : pendingId === item.id || purchasingRef.current ? '...' : 'Satın Al'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </Pressable>
    );
  };

  // ---------- XP PACKS ----------
  const XPPacksRow = ({ title, items }: { title: string; items: Reward[] }) => (
    <RowWrap title={title}>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={items}
        keyExtractor={i => i.id}
        ItemSeparatorComponent={() => <Space w={12} />}
        renderItem={({ item }) => <XPBox item={item} />}
      />
    </RowWrap>
  );

  const XPBox = ({ item }: { item: Reward }) => {
    const jiggle = useRef(new Animated.Value(0)).current;
    useEffect(() => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(jiggle, { toValue: 1, duration: 1200, useNativeDriver: true }),
          Animated.timing(jiggle, { toValue: -1, duration: 1200, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }, [jiggle]);
    const rotate = jiggle.interpolate({
      inputRange: [-1, 1],
      outputRange: ['-1.5deg', '1.5deg'],
    });

    const sold = (item.stock ?? 0) < 1;

    return (
      <Pressable onPress={() => openBuyForm(item)}>
        <Animated.View
          style={{
            transform: [{ rotate }],
            backgroundColor: '#FFF2E8',
            borderWidth: 2,
            borderColor: ORANGE,
            borderRadius: s(16),
            padding: s(14),
            overflow: 'hidden',
            opacity: purchasingRef.current ? 0.7 : 1,
          }}
          pointerEvents={purchasingRef.current ? 'none' : 'auto'}
        >
          <Text style={{ color: ORANGE, fontWeight: '900', textAlign: 'center' }}>+XP</Text>
          <View
            style={{
              width: s(110),
              height: s(76),
              borderRadius: s(12),
              overflow: 'hidden',
              backgroundColor: '#F9E4D6',
              marginTop: s(6),
            }}
          >
            <Img uri={item.image_url} />
            {sold && <SoldOut />}
          </View>
          <Text numberOfLines={1} style={{ fontWeight: '900', marginTop: s(6), textAlign: 'center' }}>
            {item.name}
          </Text>
          <Text style={{ color: ORANGE, fontWeight: '900', textAlign: 'center' }}>
            {item.int_price.toLocaleString('tr-TR')} XP
          </Text>
          <TouchableOpacity
            disabled={sold || pendingId === item.id || purchasingRef.current}
            onPress={() => openBuyForm(item)}
            style={{
              marginTop: s(8),
              backgroundColor: sold ? '#E5E7EB' : ORANGE,
              paddingVertical: s(8),
              borderRadius: s(10),
            }}
          >
            <Text style={{ color: sold ? '#9CA3AF' : '#fff', fontWeight: '900', textAlign: 'center' }}>
              {sold ? 'Tükendi' : pendingId === item.id || purchasingRef.current ? '...' : 'Satın Al'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <FlatList
        data={shelves}
        keyExtractor={i => i.key}
        ListHeaderComponent={Header}
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: s(32) }}
        renderItem={({ item }) => {
          switch (item.type) {
            case 'podium':
              return <PodiumRow items={item.items} />;
            case 'hanger':
              return <HangerRow title={item.label} items={item.items} />;
            case 'aluminum':
              return <AluminumRow title={item.label} items={item.items} />;
            case 'glass':
              return <GlassRow title={item.label} items={item.items} />;
            case 'mini_podiums':
              return <MiniPodiumsRow title={item.label} items={item.items} />;
            case 'holo':
              return <HoloRow title={item.label} items={item.items} />;
            case 'xppacks':
              return <XPPacksRow title={item.label} items={item.items} />;
            default:
              return <AluminumRow title={item.label} items={item.items} />;
          }
        }}
      />

      {/* ÜRÜN DETAY (opsiyonel modal) */}
      <Modal visible={!!detail && !formOpen} transparent animationType="fade" onRequestClose={() => setDetail(null)}>
        <Pressable
          onPress={() => (purchasingRef.current ? null : setDetail(null))}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}
        >
          {detail && (
            <Pressable
              onPress={e => e.stopPropagation()}
              style={{
                width: width - 28,
                maxHeight: height - 120,
                backgroundColor: '#fff',
                borderRadius: 18,
                overflow: 'hidden',
                borderWidth: 2,
                borderColor: ORANGE,
                opacity: purchasingRef.current ? 0.8 : 1,
              }}
              pointerEvents={purchasingRef.current ? 'none' : 'auto'}
            >
              <View style={{ height: 260, backgroundColor: '#F3F4F6' }}>
                <Img uri={detail.image_url} />
                {(detail.stock ?? 0) < 1 && <SoldOut />}
              </View>
              <View style={{ padding: 14 }}>
                <Text style={{ fontSize: 18, fontWeight: '900', textAlign: 'center' }}>{detail.name}</Text>
                {!!detail.description && (
                  <Text style={{ marginTop: 6, color: MUTED, textAlign: 'center' }}>{detail.description}</Text>
                )}
                <View
                  style={{
                    marginTop: 12,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: MUTED }}>Fiyat</Text>
                  <Text style={{ fontWeight: '900', color: ORANGE }}>
                    {detail.int_price.toLocaleString('tr-TR')} XP
                  </Text>
                  <Text style={{ marginTop: 2, color: MUTED }}>Stok: {detail.stock}</Text>

                  <TouchableOpacity
                    disabled={(detail.stock ?? 0) < 1 || pendingId === detail.id || purchasingRef.current}
                    onPress={() => setFormOpen(true)}
                    activeOpacity={0.9}
                    style={{
                      marginTop: 12,
                      backgroundColor: (detail.stock ?? 0) < 1 ? '#E5E7EB' : ORANGE,
                      paddingHorizontal: 18,
                      paddingVertical: 12,
                      borderRadius: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Text style={{ color: (detail.stock ?? 0) < 1 ? '#9CA3AF' : '#fff', fontWeight: '900' }}>
                      {(detail.stock ?? 0) < 1 ? 'Tükendi' : 'Satın Al'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          )}
        </Pressable>
      </Modal>

      {/* SATIN ALMA FORMU */}
      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => (purchasingRef.current ? null : setFormOpen(false))}>
        
        <Pressable
          onPress={() => (purchasingRef.current ? null : setFormOpen(false))}
          
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}
          
        >
          <Pressable
            onPress={e => e.stopPropagation()}
            style={{
              width: width - 28,
              backgroundColor: '#fff',
              borderRadius: 18,
              overflow: 'hidden',
              borderWidth: 2,
              borderColor: ORANGE,
              opacity: purchasingRef.current ? 0.8 : 1,
            }}
            pointerEvents={purchasingRef.current ? 'none' : 'auto'}
          >
            <View style={{ padding: 14 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', textAlign: 'center' }}>İletişim & Adres</Text>

              <TextInput
                placeholder="Ad Soyad *"
                value={contact.full_name}
                onChangeText={t => setContact(c => ({ ...c, full_name: t }))}
                style={{ borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 10, marginTop: 10 }}
              />
              <TextInput
                placeholder="E-posta"
                value={contact.email}
                onChangeText={t => setContact(c => ({ ...c, email: t }))}
                autoCapitalize="none"
                keyboardType="email-address"
                style={{ borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 10, marginTop: 10 }}
              />
              <TextInput
                placeholder="Telefon *"
                value={contact.phone}
                onChangeText={t => setContact(c => ({ ...c, phone: t }))}
                keyboardType="phone-pad"
                style={{ borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 10, marginTop: 10 }}
              />
              <TextInput
                placeholder="Adres *"
                value={contact.address}
                onChangeText={t => setContact(c => ({ ...c, address: t }))}
                multiline
                style={{
                  borderWidth: 1,
                  borderColor: '#eee',
                  borderRadius: 10,
                  padding: 10,
                  marginTop: 10,
                  minHeight: 80,
                  textAlignVertical: 'top',
                }}
              />
              <TextInput
                placeholder="Not (opsiyonel)"
                value={contact.note}
                onChangeText={t => setContact(c => ({ ...c, note: t }))}
                style={{ borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 10, marginTop: 10 }}
              />

              <TouchableOpacity
                onPress={submitPurchase}
                disabled={pendingId === detail?.id || purchasingRef.current}
                style={{
                  marginTop: 12,
                  backgroundColor: ORANGE,
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: 'center',
                }}
              >
                {pendingId === detail?.id || purchasingRef.current ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '900' }}>Onayla ve Satın Al</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
