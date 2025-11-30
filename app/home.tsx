'use client';

import CartRibbon from '@/components/CartRibbon';
import MarketCard, { type Market } from '@/components/MarketCard';
import { resolveStorageUrlSmart } from '@/lib/resolveStorageUrlSmart';
import { supabase } from '@/lib/supabaseClient';
import { useInterstitial } from '@/src/contexts/ads/interstitial';
import { usePlus } from '@/src/contexts/hooks/usePlus';
import { useXp } from '@/src/contexts/XpProvider';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

// 🔽 Daily-entry mantığı için eklenen importlar
import { adsReady, onAdsReady } from '@/src/contexts/lib/ads';
import {
  AdEventType,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

const CATS = ['Tümü', 'Gündem', 'Spor', 'Magazin', 'Politika', 'Absürt'];
const PAGE = 12;

/* -------------------- Bildirim Helper -------------------- */
async function notifyNow(
  type: 'bet_place' | 'parlay_place',
  title: string,
  body: string,
  payload?: Record<string, any>
) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return;

    const { error } = await supabase.rpc('notify_text', {
      p_user_id: uid,
      p_type_txt: type,
      p_title: title,
      p_body: body,
      p_extra: {},
      p_image: null,
      p_payload: payload ?? {},
    });
    if (error) console.log('notify error', error);
  } catch (e) {
    console.log('notify exception', e);
  }
}

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

/* ---- Market tipini genişlet ---- */
type MarketRow = Market & {
  image?: string | null;
  yes_liquidity?: number | null;
  no_liquidity?: number | null;
  liquidity?: number | null;
};

/* profil satırını garanti altına al */
async function ensureUserProfile() {
  const { data: auth } = await supabase.auth.getUser();
  const u = auth?.user;
  if (!u) return;
  const full_name =
    (u.user_metadata?.full_name as string) || (u.email ? u.email.split('@')[0] : 'Kullanıcı');
  const avatar_url = (u.user_metadata?.avatar_url as string) || null;
  await supabase.from('users').upsert({ id: u.id, full_name, avatar_url }, { onConflict: 'id' });
}

/* ===================== OYNA (RPC çağrıları) ===================== */
type BasketItem = {
  coupon_id: string | number;
  title: string;
  label: string;
  side: 'YES' | 'NO';
  price: number;
  stake: number;
};

async function playBasket(items: BasketItem[]) {
  const payload = items.map((it) => ({
    coupon_id: it.coupon_id,
    side: it.side,
    price: it.price,
    stake: it.stake,
  }));
  const { data, error } = await supabase.rpc('play_coupons', { p_items: payload });
  if (error) throw error;
  const newBal =
    Array.isArray(data) && data.length ? ((data[0] as any).new_balance as number) : undefined;
  return typeof newBal === 'number' ? (newBal as number) : undefined;
}

/* PARLAY: tek stake + çok bacak */
async function playParlay(items: BasketItem[], stake: number) {
  const legs = items.map((it) => ({
    coupon_id: String(it.coupon_id),
    side: it.side,
    price: it.price,
  }));
  const { data, error } = await supabase.rpc('play_parlay', {
    p_items: legs,
    p_stake: stake,
  });
  if (error) throw error;
  const newBal =
    Array.isArray(data) && data.length ? ((data[0] as any).new_balance as number) : undefined;
  return typeof newBal === 'number' ? (newBal as number) : undefined;
}

/* ===================== DAILY ENTRY (REKLAM) HELPER ===================== */

const PROD_REWARDED = 'ca-app-pub-3837426346942059/6751536443';
const TEST_REWARDED = TestIds.REWARDED;

function createRewarded() {
  const adUnitId = __DEV__ ? TEST_REWARDED : PROD_REWARDED;
  return RewardedAd.createForAdRequest(adUnitId, {
    requestNonPersonalizedAdsOnly: false,
  });
}

async function showRewarded(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!adsReady()) {
      onAdsReady(() => showRewarded().then(resolve));
      return;
    }

    const ad = createRewarded();
    let earned = false;
    let finished = false;

    const clean = () => {
      try {
        u1();
        u2();
        u3();
        u4();
      } catch {}
    };

    const timeout = setTimeout(() => {
      if (!finished) {
        finished = true;
        clean();
        resolve(false);
      }
    }, 20000);

    const u1 = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      ad.show().catch(() => {
        if (!finished) {
          finished = true;
          clean();
          clearTimeout(timeout);
          resolve(false);
        }
      });
    });

    const u2 = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      earned = true;
    });

    const u3 = ad.addAdEventListener(AdEventType.CLOSED, () => {
      if (!finished) {
        finished = true;
        clean();
        clearTimeout(timeout);
        resolve(earned);
      }
    });

    const u4 = ad.addAdEventListener(AdEventType.ERROR, () => {
      if (!finished) {
        finished = true;
        clean();
        clearTimeout(timeout);
        resolve(false);
      }
    });

    ad.load();
  });
}

export default function HomeScreen() {
  const router = useRouter();
  const { xp, loading: xpLoading, refresh } = useXp();
  const { isPlus } = usePlus();

  // 🔸 Interstitial: hazırla
  const {
    loaded: interLoaded,
    show: showInter,
    showIfEligible,
    registerNavTransition,
  } = useInterstitial();
  const interShownOnce = useRef(false);

  // Home açılınca (Plus değilse) 4dk kuralına göre uygun ise göster
  useEffect(() => {
    (async () => {
      if (!isPlus && interLoaded && !interShownOnce.current) {
        interShownOnce.current = true;
        await showIfEligible('home_enter');
      }
    })();
  }, [isPlus, interLoaded, showIfEligible]);

  /* -------- XP Topla cooldown + shimmer -------- */
  const [cooldownEnd, setCooldownEnd] = useState<Date | null>(null);
  const [busyTopla, setBusyTopla] = useState(false);
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id;
      if (!uid) {
        setCooldownEnd(null);
        return;
      }

      const { data } = await supabase
        .from('xp_ad_grants')
        .select('created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(1);

      const last = data?.[0]?.created_at ? new Date(data[0].created_at) : null;
      setCooldownEnd(last ? new Date(last.getTime() + 3 * 60 * 60 * 1000) : null);
    })();
  }, []);

  const toplaReady = !cooldownEnd || Date.now() >= cooldownEnd.getTime();
  const remainLabel = (() => {
    if (toplaReady || !cooldownEnd) return '';
    const ms = cooldownEnd.getTime() - Date.now();
    const m = Math.ceil(ms / 60000);
    const h = Math.floor(m / 60),
      mm = m % 60;
    return `${h}s ${mm}dk`;
  })();

  useEffect(() => {
    if (!toplaReady) return;
    Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1600,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [toplaReady, shimmer]);

  // 🔥 XP TOPLA BUTONU CLICK — artık burada reklam + RPC
  const handleXpToplaPress = useCallback(async () => {
    if (busyTopla) return;

    if (!toplaReady && cooldownEnd) {
      const ms = cooldownEnd.getTime() - Date.now();
      const mins = Math.max(0, Math.ceil(ms / 60000));
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      Alert.alert('Üzgünüz 😔', `Yeni XP alımı için ${h} saat ${m} dakika daha bekle.`);
      return;
    }

    setBusyTopla(true);
    try {
      // 1) Reklam
      const ok = await showRewarded();
      if (!ok) {
        Alert.alert('Hata', 'Reklam ödülü alınamadı. Biraz sonra tekrar dene.');
        return;
      }

      // 2) Kullanıcı
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        Alert.alert('Hata', 'Oturum bulunamadı.');
        return;
      }

      // 3) Supabase RPC (claim_ad_bonus)
      const { data, error } = await supabase.rpc('claim_ad_bonus', { p_user: uid });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      const granted = !!row?.granted;
      const remaining = Number(row?.remaining_seconds ?? 0);

      if (granted) {
        await refresh(); // XP’yi yenile
        Alert.alert('Tebrikler 🎉', '100 XP kazandın!');

        // server remaining_seconds dönüyorsa ona göre, yoksa direkt 3 saat
        const end =
          remaining > 0
            ? new Date(Date.now() + remaining * 1000)
            : new Date(Date.now() + 3 * 60 * 60 * 1000);
        setCooldownEnd(end);
      } else {
        const mins = Math.max(0, Math.ceil(remaining / 60));
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        if (remaining > 0) {
          setCooldownEnd(new Date(Date.now() + remaining * 1000));
        }
        Alert.alert('Üzgünüz 😔', `Yeni XP alımı için ${h} saat ${m} dakika kaldı.`);
      }
    } catch (e: any) {
      Alert.alert('Hata', e?.message ?? 'Bilinmeyen hata.');
    } finally {
      setBusyTopla(false);
    }
  }, [busyTopla, toplaReady, cooldownEnd, refresh]);

  /* -------- USER (ad + avatar) -------- */
  const [user, setUser] = useState<{ name: string; avatar: string | null }>({
    name: 'Kullanıcı',
    avatar: null,
  });

  useEffect(() => {
    (async () => {
      await ensureUserProfile();
      const { data: auth } = await supabase.auth.getUser();
      const au = auth?.user;
      if (!au) return;

      const { data: profile } = await supabase
        .from('users')
        .select('full_name, avatar_url')
        .eq('id', au.id)
        .single();

      setUser({
        name:
          profile?.full_name?.trim() ||
          (au.user_metadata?.full_name as string) ||
          (au.email ? au.email.split('@')[0] : 'Kullanıcı'),
        avatar: profile?.avatar_url ?? null,
      });
    })();
  }, []);

  /* -------- MARKETS + PAGING -------- */
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [category, setCategory] = useState('Tümü');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const toNum = (v: any) =>
    typeof v === 'number' ? v : v == null ? undefined : parseFloat(String(v).replace(',', '.'));

  const fetchMore = useCallback(
    async (reset: boolean = false) => {
      if (!hasMore && !reset) return;
      setLoadingMore(true);
      try {
        let q = supabase
          .from('coupons')
          .select(
            `
          id, title, description, category, closing_date,
          market_type, lines,
          yes_price, no_price, image_url,
          is_open, is_user_generated, created_at,
          yes_liquidity, no_liquidity, liquidity
        `
          )
          .eq('is_open', true)
          .eq('is_user_generated', false)
          .gt('closing_date', new Date().toISOString())
          .order('created_at', { ascending: false });

        if (category !== 'Tümü') q = q.eq('category', category);

        const from = reset ? 0 : page * PAGE;
        const to = from + PAGE - 1;
        const { data, error } = await q.range(from, to);
        if (error) throw error;

        // normalize + url resolve
        const normalized: MarketRow[] = (data ?? []).map((m: any) => ({
          ...m,
          image: m.image ?? m.image_url ?? null,
          yes_liquidity: m.yes_liquidity ?? 0,
          no_liquidity: m.no_liquidity ?? 0,
          liquidity: m.liquidity ?? 0,
          lines: Array.isArray(m.lines)
            ? m.lines.map((ln: any) => ({
                name: String(ln.name ?? ''),
                yesPrice: toNum(ln.yesPrice ?? ln.yes_price ?? ln.y ?? ln.yes),
                noPrice: toNum(ln.noPrice ?? ln.no_price ?? ln.no),
                imageUrl: ln.imageUrl ?? ln.image_url ?? ln.image ?? null,
              }))
            : [],
        }));

        await Promise.all(
          normalized.map(async (it) => {
            it.image = await resolveStorageUrlSmart(it.image ?? it.image_url ?? null);
            it.image_url = it.image;
            if (Array.isArray(it.lines)) {
              it.lines = await Promise.all(
                it.lines.map(async (ln: any) => ({
                  ...ln,
                  imageUrl: await resolveStorageUrlSmart(ln.imageUrl ?? null),
                }))
              );
            }
          })
        );

        const merged = reset ? normalized : [...markets, ...normalized];
        const unique = Array.from(new Map(merged.map((m) => [m.id, m])).values()) as MarketRow[];

        setMarkets(unique);
        setPage((p) => (reset ? 1 : p + 1));
        setHasMore((data?.length ?? 0) === PAGE);
      } catch (e) {
        console.log('fetchMore error:', e);
      } finally {
        setLoadingMore(false);
      }
    },
    [hasMore, category, page, markets]
  );

  /* -------- GLOBAL TICK -------- */
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  /* -------- REALTIME coupons -------- */
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

  // expire kapatma (best-effort)
  const closeExpired = async () => {
    try {
      await supabase.rpc('close_expired_coupons');
    } catch {}
  };
  useEffect(() => {
    closeExpired();
    const t = setInterval(closeExpired, 60_000);
    return () => clearInterval(t);
  }, []);

  /* -------- BASKET -------- */
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [basketOpen, setBasketOpen] = useState(false);

  const calcPayout = (stake: number, odds: number) => stake * Math.max(1, odds);
  const totals = useMemo(() => {
    const totalStake = basket.reduce((a, it) => a + it.stake, 0);
    const totalPayout = basket.reduce((a, it) => a + calcPayout(it.stake, it.price), 0);
    return { totalStake, totalPayout, totalProfit: totalPayout - totalStake };
  }, [basket]);

  const updateBasketStake = (idx: number, val: string) =>
    setBasket((b) =>
      b.map((it, i) => (i === idx ? { ...it, stake: Math.max(0, Number(val || '0')) } : it))
    );
  const removeBasketItem = (idx: number) => setBasket((b) => b.filter((_, i) => i !== idx));
  const clearBasket = () => setBasket([]);

  /* ====== PARLAY state ====== */
  const [parlayMode, setParlayMode] = useState(false);
  const [parlayStake, setParlayStake] = useState('100');

  const parlayProduct = useMemo(
    () => basket.reduce((mul, it) => mul * Math.max(1, it.price), 1),
    [basket]
  );
  const parlayNumbers = useMemo(() => {
    const s = Math.max(0, Number(parlayStake || '0'));
    const payout = Math.round(s * parlayProduct);
    return { stake: s, payout, profit: payout - s };
  }, [parlayStake, parlayProduct]);

  /* ===== GERÇEK OYNAMA ===== */
  const [submitting, setSubmitting] = useState(false);

  const confirmPlaySingles = async () => {
    if (basket.length === 0 || submitting) return;
    const bad = basket.find((it) => !it.stake || it.stake <= 0);
    if (bad) {
      Alert.alert('Hata', 'Geçersiz stake var.');
      return;
    }

    // optimistic UI
    setMarkets((prev) => {
      const copy = prev.map((m) => ({ ...m }));
      for (const it of basket) {
        const idx = copy.findIndex((m) => String(m.id) === String(it.coupon_id));
        if (idx === -1) continue;
        const m = copy[idx];
        const delta = Number(it.stake) || 0;
        if (it.side === 'YES') m.yes_liquidity = (m.yes_liquidity ?? 0) + delta;
        else m.no_liquidity = (m.no_liquidity ?? 0) + delta;
        m.liquidity = (m.liquidity ?? 0) + delta;
        copy[idx] = m;
      }
      return copy;
    });

    try {
      setSubmitting(true);
      const newBal = await playBasket(basket);

      await notifyNow('bet_place', 'Kupon oynandı', 'Sepetten tek tek oynandı', {
        legs: basket.length,
        totalStake: totals.totalStake,
      });

      await refresh();
      await fetchMore(true);

      setBasketOpen(false);
      clearBasket();
      Alert.alert(
        'Tamam',
        `Oynandı${
          typeof newBal === 'number' ? ` • Yeni bakiye: ${newBal.toLocaleString('tr-TR')} XP` : ''
        }`
      );
    } catch (e: any) {
      await fetchMore(true);
      Alert.alert('Hata', e?.message ?? 'Oynama başarısız');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmPlayParlay = async () => {
    if (basket.length < 2) {
      Alert.alert('Hata', 'Parlay için en az 2 seçim gerekli.');
      return;
    }
    const s = Math.max(0, Number(parlayStake || '0'));
    if (!s) {
      Alert.alert('Hata', 'Parlay stake gir.');
      return;
    }

    try {
      setSubmitting(true);
      const newBal = await playParlay(basket, s);

      await notifyNow('parlay_place', 'Parlay oynandı', 'Sepetten parlay oynandı', {
        legs: basket.length,
        stake: s,
        multiplier: parlayProduct,
      });

      await refresh();
      await fetchMore(true);

      setBasketOpen(false);
      clearBasket();
      setParlayStake('100');
      setParlayMode(false);
      Alert.alert(
        'Tamam',
        `Parlay oynandı${
          typeof newBal === 'number' ? ` • Yeni bakiye: ${newBal.toLocaleString('tr-TR')} XP` : ''
        }`
      );
    } catch (e: any) {
      await fetchMore(true);
      Alert.alert('Hata', e?.message ?? 'Parlay başarısız');
    } finally {
      setSubmitting(false);
    }
  };

  /* -------- TRADE MODAL -------- */
  const [modal, setModal] = useState<{
    market: MarketRow;
    label: string;
    side: 'YES' | 'NO';
    price: number;
  } | null>(null);
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
      {
        coupon_id: modal.market.id,
        title: modal.market.title,
        label: modal.label,
        side: modal.side,
        price: modal.price,
        stake: s,
      },
    ]);
    setModal(null);
    setBasketOpen(true);
  };

  /* -------- SLIDER -------- */
  const { width } = Dimensions.get('window');
  const SLIDER_W = Math.round(width * 0.78);
  const [sliderIdx, setSliderIdx] = useState(0);

  const sliderData = useMemo(() => markets.slice(0, 5), [markets]);

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
           onPress={() => {
  if (!isPlus) {
    (async () => {
      await registerNavTransition();
      const shown = await showIfEligible('nav');
      if (!shown) router.push(`/CouponDetail?id=${item.id}`);
    })();
  } else {
    router.push(`/CouponDetail?id=${item.id}`);
  }
}}
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
            <View
              key={`dot-${i}-${sliderData.length}`}
              style={[styles.dot, i === sliderIdx && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </>
  );

  /* -------- UI -------- */
  return (
    <SafeAreaView
      style={[styles.safe, Platform.OS === 'android' && { paddingTop: StatusBar.currentHeight || 0 }]}
    >
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        {/* HEADER */}
        <View style={styles.appHeader}>
          <Text style={styles.brand}>Dümenden</Text>

          {/* XP Topla */}
          <TouchableOpacity
            onPress={handleXpToplaPress}
            disabled={busyTopla}
            activeOpacity={0.9}
            style={{ borderRadius: 14, flexShrink: 1, marginHorizontal: 8 }}
          >
            <View style={{ padding: 2, borderRadius: 14, overflow: 'hidden' }}>
              <Animated.View
                pointerEvents="none"
                style={{
                  transform: [
                    {
                      translateX: shimmer.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-18, 18],
                      }),
                    },
                  ],
                  opacity: toplaReady ? 1 : 0.3,
                }}
              >
                <LinearGradient
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  colors={toplaReady ? ['#FFAA66', '#FF6B00', '#FFAA66'] : ['#ddd', '#ccc', '#ddd']}
                  style={{ height: 30, width: 120, borderRadius: 14 }}
                />
              </Animated.View>

              <View
                style={{
                  position: 'absolute',
                  left: 2,
                  right: 2,
                  top: 2,
                  bottom: 2,
                  backgroundColor: '#FFF2E8',
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#FF6B00', fontWeight: '900' }}>
                  {busyTopla ? 'Yükleniyor…' : toplaReady ? 'XP Topla' : remainLabel}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Avatar */}
          <TouchableOpacity onPress={() => router.push('/profile')}>
            {user.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.avatarMini} />
            ) : (
              <View
                style={[
                  styles.avatarMini,
                  { backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' },
                ]}
              >
                <Text style={{ fontWeight: '900', color: '#999' }}>
                  {user.name[0]?.toUpperCase() || 'K'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* XP ROZETİ */}
        <View style={{ paddingHorizontal: 16, marginTop: 6 }}>
          <View style={styles.xpPill}>
            <Text style={styles.xpPillTxt}>
              {xpLoading ? '...' : xp.toLocaleString('tr-TR')} XP
            </Text>
          </View>
        </View>

        {/* KATEGORİ BAR */}
        <View className="catBarWrap" style={styles.catBarWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, alignItems: 'center' }}
            bounces={false}
          >
            {CATS.map((c) => {
              const active = c === category;
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => {
                    setCategory(c);
                    setPage(0);
                    setHasMore(true);
                    fetchMore(true);
                  }}
                  style={[styles.catPill, active && styles.catPillActive]}
                >
                  <Text style={[styles.catTxt, active && styles.catTxtActive]}>{c}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Liste */}
        <FlatList
          data={markets}
          keyExtractor={(it) => String(it.id)}
          ListHeaderComponent={SliderHeader}
          contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
          onEndReachedThreshold={0.4}
          onEndReached={() => fetchMore()}
          ListFooterComponent={
            loadingMore ? (
              <Text style={{ textAlign: 'center', color: '#888', padding: 10 }}>Yükleniyor…</Text>
            ) : null
          }
          renderItem={({ item }) => {
            const st = marketState(item);
            return (
              <View style={{ marginBottom: 12 }}>
                <MarketCard
                  item={item}
                 onPress={() => {
  if (!isPlus) {
    (async () => {
      await registerNavTransition();
      const shown = await showIfEligible('nav');
      if (!shown) router.push(`/CouponDetail?id=${item.id}`);
    })();
  } else {
    router.push(`/CouponDetail?id=${item.id}`);
  }
}}
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
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
                style={{ width: '100%' }}
              >
                <View style={styles.modalCard}>
                  {modal && (
                    <ScrollView
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={{ paddingBottom: 8 }}
                      showsVerticalScrollIndicator={false}
                    >
                      <Text style={styles.modalTitle}>{modal.market.title}</Text>
                      <Text style={styles.modalSub}>
                        {modal.label} • {modal.side}
                      </Text>
                      <TextInput
                        value={stake}
                        onChangeText={setStake}
                        keyboardType="numeric"
                        placeholder="XP"
                        style={styles.stakeInput}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={() => {
                          Keyboard.dismiss();
                          addToBasket();
                        }}
                      />
                      <View style={styles.quickRow}>
                        {[25, 50, 100, 250, 500].map((q) => (
                          <TouchableOpacity
                            key={`q-${q}`}
                            style={styles.quickBtn}
                            onPress={() => setStake(String(q))}
                          >
                            <Text style={{ fontWeight: '700' }}>{q}×</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TouchableOpacity
                        style={styles.tradeBtn}
                        onPress={() => {
                          Keyboard.dismiss();
                          addToBasket();
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>Sepete Ekle</Text>
                      </TouchableOpacity>
                      <Pressable
                        onPress={() => {
                          Keyboard.dismiss();
                          setModal(null);
                        }}
                        style={styles.closeBtn}
                      >
                        <Text style={{ fontWeight: 'bold' }}>Kapat</Text>
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
          totalXp={parlayMode ? parlayNumbers.stake : totals.totalStake}
          onPress={() => setBasketOpen(true)}
          fabDiameter={84}
        />

        {/* Sepet Modal – KLAVYE FIXLİ */}
        <Modal visible={basketOpen} transparent animationType="slide">
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalWrap}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
                style={{ flex: 1, justifyContent: 'flex-end' }}
              >
                <View
                  style={[
                    styles.modalCard,
                    {
                      maxHeight: '72%',
                      paddingBottom: 16 + (Platform.OS === 'android' ? 24 : 0), // 🔥 alt boşluk
                    },
                  ]}
                >
                  <View
                    style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}
                  >
                    <Text style={styles.modalTitle}>Sepet</Text>
                    <Pressable onPress={() => setBasketOpen(false)}>
                      <Text style={{ fontWeight: 'bold' }}>Kapat</Text>
                    </Pressable>
                  </View>

                  {basket.map((it, i) => (
                    <View key={`${it.coupon_id}-${i}`} style={styles.basketItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '700' }}>{it.title}</Text>
                        <Text style={{ color: '#666' }}>
                          {it.label} • {it.side} • Fiyat: {it.price.toFixed(2)}
                        </Text>
                      </View>
                      {!parlayMode && (
                        <>
                          <TextInput
                            value={String(it.stake)}
                            onChangeText={(v) => updateBasketStake(i, v)}
                            keyboardType="numeric"
                            style={styles.basketStakeInput}
                          />
                          <TouchableOpacity onPress={() => removeBasketItem(i)} style={styles.trashBtn}>
                            <Text style={{ color: '#fff', fontWeight: '700' }}>Sil</Text>
                          </TouchableOpacity>
                        </>
                      )}
                      {parlayMode && (
                        <TouchableOpacity onPress={() => removeBasketItem(i)} style={styles.trashBtn}>
                          <Text style={{ color: '#fff', fontWeight: '700' }}>Sil</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    <TouchableOpacity
                      style={[
                        styles.tradeBtn,
                        { flex: 1, backgroundColor: '#FF6B00', opacity: submitting ? 0.7 : 1 },
                      ]}
                      onPress={parlayMode ? confirmPlayParlay : confirmPlaySingles}
                      disabled={submitting}
                    >
                      <Text
                        style={{ color: '#fff', fontWeight: 'bold', textAlign: 'center' }}
                      >
                        {submitting ? 'Gönderiliyor…' : parlayMode ? 'Parlay Oyna' : 'Onayla / Oyna'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.tradeBtn, { flex: 1, backgroundColor: '#757575' }]}
                      onPress={clearBasket}
                      disabled={submitting}
                    >
                      <Text
                        style={{ color: '#fff', fontWeight: 'bold', textAlign: 'center' }}
                      >
                        Sepeti Temizle
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </KeyboardAvoidingView>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  appHeader: {
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: '#fff',
  },
  brand: { fontSize: 24, fontWeight: '900', color: '#FF6B00' },

  xpPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFE0B2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  xpPillTxt: { color: '#FF6B00', fontWeight: '800' },

  avatarMini: { width: 36, height: 36, borderRadius: 18 },

  catBarWrap: { height: 48, marginTop: 8, marginBottom: 8 },
  catPill: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#eee',
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catPillActive: { backgroundColor: '#FF6B00' },
  catTxt: { color: '#333', fontWeight: '700' },
  catTxtActive: { color: '#fff' },

  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    marginBottom: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ddd' },
  dotActive: { backgroundColor: '#999' },

  modalWrap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: '700' },
  modalSub: { color: '#666', marginBottom: 8 },
  stakeInput: {
    borderWidth: 1,
    borderColor: '#FF6B00',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    marginBottom: 6,
  },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 6 },
  quickBtn: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  tradeBtn: {
    backgroundColor: '#FF6B00',
    padding: 12,
    alignItems: 'center',
    borderRadius: 10,
    marginTop: 4,
  },
  closeBtn: { alignItems: 'center', padding: 10, marginTop: 8 },

  basketItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  basketStakeInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    width: 110,
    textAlign: 'center',
  },
  trashBtn: {
    backgroundColor: '#E53935',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
  },
});
