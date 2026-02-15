'use client';

import CartRibbon from '@/components/CartRibbon';
import CountryPickerModal from '@/components/CountryPickerModal';
import MarketCard, { type Market } from '@/components/MarketCard';
import { flagEmoji, useCountry } from '@/lib/countries';
import { useI18n } from '@/lib/i18n';
import { resolveStorageUrlSmart } from '@/lib/resolveStorageUrlSmart';
import { supabase } from '@/lib/supabaseClient';
import { useInterstitial } from '@/src/contexts/ads/interstitial';
import { usePlus } from '@/src/contexts/hooks/usePlus';
import { useXp } from '@/src/contexts/XpProvider';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

// 🔽 REKLAM KÜTÜPHANESİ
import {
  AdEventType,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from '@/src/contexts/ads/googleMobileAds';

const CATS = [
  { value: 'all', labelKey: 'categories.all' },
  { value: 'Gündem', labelKey: 'categories.agenda' },
  { value: 'Spor', labelKey: 'categories.sports' },
  { value: 'Magazin', labelKey: 'categories.entertainment' },
  { value: 'Politika', labelKey: 'categories.politics' },
  { value: 'Absürt', labelKey: 'categories.absurd' },
];
const PAGE = 12;
const ONBOARDING_KEY = 'onboarding_home_v1';

type Rect = { x: number; y: number; w: number; h: number };

// 🔥 REKLAM ID'LERİ (SABİT)
const AD_UNIT_ID = Platform.select({
  ios: 'ca-app-pub-3837426346942059/1363478394',
  android: 'ca-app-pub-3837426346942059/6751536443',
  default: TestIds.REWARDED,
});

const FINAL_AD_UNIT_ID = __DEV__ ? TestIds.REWARDED : AD_UNIT_ID;

// 🔥 GÜÇLENDİRİLMİŞ REKLAM HOOK'U (SENİN İÇİN EKLENDİ)
function useRewardedAd() {
  const [loaded, setLoaded] = useState(false);
  const adRef = useRef<RewardedAd | null>(null);

  const loadAd = useCallback(() => {
    setLoaded(false);
    const ad = RewardedAd.createForAdRequest(FINAL_AD_UNIT_ID, {
      requestNonPersonalizedAdsOnly: false,
    });

    ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      console.log("Ad Loaded!");
      setLoaded(true);
    });

    ad.addAdEventListener(AdEventType.ERROR, (err) => {
      console.log('Ad Failed to load', err);
      setLoaded(false);
    });

    ad.load();
    adRef.current = ad;
  }, []);

  useEffect(() => {
    loadAd();
    return () => {
      adRef.current = null;
    };
  }, [loadAd]);

  const showAd = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!loaded || !adRef.current) {
        console.log("Ad not ready, reloading...");
        loadAd(); 
        resolve(false);
        return;
      }

      const ad = adRef.current;
      let earned = false;

      const unsubEarned = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
        console.log("User earned reward!");
        earned = true;
      });

      const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
        console.log("Ad closed");
        resolve(earned);
        loadAd(); // Hemen yenisini yükle
        unsubEarned();
        unsubClosed();
      });

      ad.show().catch((e) => {
        console.log("Ad show error", e);
        resolve(false);
        loadAd();
      });
    });
  }, [loaded, loadAd]);

  return { isLoaded: loaded, showAd };
}

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
const timeLeft = (iso?: string, nowMs?: number) => {
  if (!iso) return { expired: false, label: '--:--:--', seconds: 0 };
  const ms = new Date(iso).getTime() - (typeof nowMs === 'number' ? nowMs : Date.now());
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
  result?: string | null;
  paid_out_at?: string | null;
};

/* profil satırını garanti altına al */
async function ensureUserProfile(fallbackName: string) {
  const { data: auth } = await supabase.auth.getUser();
  const u = auth?.user;
  if (!u) return;
  const full_name =
    (u.user_metadata?.full_name as string) || (u.email ? u.email.split('@')[0] : fallbackName);
await supabase.from('users').upsert(
  { id: u.id, full_name },
  { onConflict: 'id' }
);}

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

export default function HomeScreen() {
  const router = useRouter();
  const { t, numberLocale } = useI18n();
  const {
    country: selectedCountry,
    setCountry,
    ready: countryReady,
    option: countryOption,
  } = useCountry();
  const { xp, loading: xpLoading, refresh } = useXp();
  const { isPlus } = usePlus();
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Onboarding refs & state
  const xpRef = useRef<View>(null);
  const countryRef = useRef<View>(null);
  const avatarRef = useRef<View>(null);
  const firstCardRef = useRef<View>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [tourTargets, setTourTargets] = useState<{
    xp?: Rect;
    country?: Rect;
    avatar?: Rect;
    card?: Rect;
  }>({});

  // 🔥 YENİ REKLAM HOOK'U KULLANIMI
  const { isLoaded: adLoaded, showAd } = useRewardedAd();

  // 🔸 Interstitial
  const {
    loaded: interLoaded,
    show: showInter,
    showIfEligible,
    registerNavTransition,
  } = useInterstitial();
  const interShownOnce = useRef(false);

  useEffect(() => {
    (async () => {
      if (!isPlus && interLoaded && !interShownOnce.current) {
        interShownOnce.current = true;
        await showIfEligible('home_enter');
      }
    })();
  }, [isPlus, interLoaded, showIfEligible]);

  const measureTargets = useCallback(() => {
    const measure = (ref: any, key: keyof typeof tourTargets) => {
      ref.current?.measureInWindow((x, y, w, h) => {
        if (!w || !h) return;
        setTourTargets((prev) => ({ ...prev, [key]: { x, y, w, h } }));
      });
    };
    measure(xpRef, 'xp');
    measure(countryRef, 'country');
    measure(avatarRef, 'avatar');
    measure(firstCardRef, 'card');
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const seen = await AsyncStorage.getItem(ONBOARDING_KEY);
        if (!seen && alive) setTourOpen(true);
      })();
      return () => {
        alive = false;
      };
    }, [])
  );

  useEffect(() => {
    if (tourOpen) setTourStep(0);
  }, [tourOpen]);

  useEffect(() => {
    if (!tourOpen) return;
    const t = setTimeout(measureTargets, 80);
    return () => clearTimeout(t);
  }, [tourOpen, measureTargets, markets, selectedCountry, xpLoading]);

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', () => {
      if (!tourOpen) return;
      setTimeout(measureTargets, 60);
    });
    return () => {
      try {
        sub?.remove();
      } catch {}
    };
  }, [tourOpen, measureTargets]);

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
    return t('home.xpCooldownShort', { hours: h, minutes: mm });
  })();

  const tourSteps = useMemo(() => {
    const steps: Array<{ key: string; title: string; body: string; target: Rect }> = [];
    if (tourTargets.xp) {
      steps.push({
        key: 'xp',
        title: t('onboarding.xpTitle'),
        body: t('onboarding.xpBody'),
        target: tourTargets.xp,
      });
    }
    if (tourTargets.country) {
      steps.push({
        key: 'country',
        title: t('onboarding.countryTitle'),
        body: t('onboarding.countryBody'),
        target: tourTargets.country,
      });
    }
    if (tourTargets.avatar) {
      steps.push({
        key: 'profile',
        title: t('onboarding.profileTitle'),
        body: t('onboarding.profileBody'),
        target: tourTargets.avatar,
      });
    }
    if (tourTargets.card) {
      steps.push({
        key: 'card',
        title: t('onboarding.cardTitle'),
        body: t('onboarding.cardBody'),
        target: tourTargets.card,
      });
    }
    return steps;
  }, [tourTargets, t]);

  const currentTour = tourSteps[tourStep];

  const closeTour = useCallback(
    async (markSeen = true) => {
      if (markSeen) await AsyncStorage.setItem(ONBOARDING_KEY, '1');
      setTourOpen(false);
    },
    [],
  );

  const nextTour = useCallback(async () => {
    if (tourStep + 1 >= tourSteps.length) {
      await closeTour(true);
    } else {
      setTourStep((s) => s + 1);
    }
  }, [tourStep, tourSteps.length, closeTour]);

  useEffect(() => {
    if (!tourOpen) return;
    if (tourSteps.length === 0) return;
    if (tourStep >= tourSteps.length) setTourStep(0);
  }, [tourOpen, tourSteps.length, tourStep]);

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

  // 🔥 GÜNCELLENMİŞ XP TOPLA BUTONU (REKLAM FİX)
  const handleXpToplaPress = useCallback(async () => {
    if (busyTopla) return;

    if (!toplaReady && cooldownEnd) {
      const ms = cooldownEnd.getTime() - Date.now();
      const mins = Math.max(0, Math.ceil(ms / 60000));
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      Alert.alert(
        t('home.xpWaitTitle'),
        t('home.xpWaitBody', { hours: h, minutes: m })
      );
      return;
    }

    setBusyTopla(true);
    try {
      // 1) Reklam Hazır mı?
      if (!adLoaded) {
        Alert.alert(t('home.adLoadingTitle'), t('home.adLoadingBody'));
        return; // Fonksiyondan çık
      }

      // 2) Göster ve Sonucu Al
      const earned = await showAd();
      
      if (!earned) {
        Alert.alert(t('home.rewardNotEarnedTitle'), t('home.rewardNotEarnedBody'));
        return;
      }

      // 3) Ödülü Ver (Supabase)
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        Alert.alert(t('common.error'), t('home.noSession'));
        return;
      }

      const { data, error } = await supabase.rpc('claim_ad_bonus', { p_user: uid });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      const granted = !!row?.granted;
      const remaining = Number(row?.remaining_seconds ?? 0);

      if (granted) {
        await refresh();
        Alert.alert(t('home.xpCongratsTitle'), t('home.xpCongratsBody'));
        const end = remaining > 0 ? new Date(Date.now() + remaining * 1000) : new Date(Date.now() + 3 * 60 * 60 * 1000);
        setCooldownEnd(end);
      } else {
        const mins = Math.max(0, Math.ceil(remaining / 60));
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        if (remaining > 0) setCooldownEnd(new Date(Date.now() + remaining * 1000));
        Alert.alert(
          t('home.xpWaitTitle'),
          t('home.xpCooldownBody', { hours: h, minutes: m })
        );
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? t('common.unknownError'));
    } finally {
      setBusyTopla(false);
    }
  }, [busyTopla, toplaReady, cooldownEnd, refresh, adLoaded, showAd, t]);

  /* -------- USER (ad + avatar) -------- */
  const [user, setUser] = useState<{ name: string; avatar: string | null }>({
    name: t('common.user'),
    avatar: null,
  });

  useEffect(() => {
    (async () => {
      await ensureUserProfile(t('common.user'));
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
          (au.email ? au.email.split('@')[0] : t('common.user')),
        avatar: profile?.avatar_url ?? null,
      });
    })();
  }, []);

  /* -------- MARKETS + PAGING -------- */
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [category, setCategory] = useState('all');
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
          result, paid_out_at,
          yes_liquidity, no_liquidity, liquidity
        `
          )
          .eq('is_open', true)
          .eq('is_user_generated', false)
          .eq('country_code', selectedCountry)
          .gt('closing_date', new Date().toISOString())
          .is('result', null)
          .is('paid_out_at', null)
          .order('created_at', { ascending: false });

        if (category !== 'all') q = q.eq('category', category);

        const from = reset ? 0 : page * PAGE;
        const to = from + PAGE - 1;
        const { data, error } = await q.range(from, to);
        if (error) throw error;

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
        if (reset) setInitialLoading(false);
      } catch (e) {
        console.log('fetchMore error:', e);
        if (reset) setInitialLoading(false);
      } finally {
        setLoadingMore(false);
      }
    },
    [hasMore, category, page, markets, selectedCountry]
  );
  const didInitFetch = useRef(false);
  useEffect(() => {
    if (didInitFetch.current) return;
    didInitFetch.current = true;
    fetchMore(true);
  }, [fetchMore]);

  useEffect(() => {
    if (!countryReady) return;
    setPage(0);
    setHasMore(true);
    fetchMore(true);
  }, [countryReady, selectedCountry, fetchMore]);

  /* -------- GLOBAL TICK (throttled) -------- */
  const [nowTs, setNowTs] = useState(() => Date.now());
  useFocusEffect(
    useCallback(() => {
      const t = setInterval(() => setNowTs(Date.now()), 10000);
      return () => clearInterval(t);
    }, [])
  );

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
      Alert.alert(t('home.couponClosedTitle'), t('home.couponClosedBody'));
      await fetchMore(true);
      return false;
    }
    return true;
  };

  const confirmPlaySingles = async () => {
    if (basket.length === 0 || submitting) return;
    const bad = basket.find((it) => !it.stake || it.stake <= 0);
    if (bad) {
      Alert.alert(t('common.error'), t('home.invalidStake'));
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
      const ok = await ensureBasketOpen();
      if (!ok) return;
      setSubmitting(true);
      const newBal = await playBasket(basket);

      await notifyNow('bet_place', t('home.notifyBetTitle'), t('home.notifyBetBody'), {
        legs: basket.length,
        totalStake: totals.totalStake,
      });

      await refresh();
      await fetchMore(true);

      setBasketOpen(false);
      clearBasket();
      const balanceLabel =
        typeof newBal === 'number'
          ? ` • ${t('home.newBalance', { balance: newBal.toLocaleString(numberLocale) })}`
          : '';
      Alert.alert(t('common.ok'), `${t('home.played')}${balanceLabel}`);
    } catch (e: any) {
      await fetchMore(true);
      Alert.alert(t('common.error'), e?.message ?? t('home.playFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmPlayParlay = async () => {
    if (basket.length < 2) {
      Alert.alert(t('common.error'), t('home.parlayNeedTwo'));
      return;
    }
    const s = Math.max(0, Number(parlayStake || '0'));
    if (!s) {
      Alert.alert(t('common.error'), t('home.parlayNeedStake'));
      return;
    }

    try {
      const ok = await ensureBasketOpen();
      if (!ok) return;
      setSubmitting(true);
      const newBal = await playParlay(basket, s);

      await notifyNow('parlay_place', t('home.notifyParlayTitle'), t('home.notifyParlayBody'), {
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
      const balanceLabel =
        typeof newBal === 'number'
          ? ` • ${t('home.newBalance', { balance: newBal.toLocaleString(numberLocale) })}`
          : '';
      Alert.alert(t('common.ok'), `${t('home.parlayPlayed')}${balanceLabel}`);
    } catch (e: any) {
      await fetchMore(true);
      Alert.alert(t('common.error'), e?.message ?? t('home.parlayFailed'));
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
    const t = timeLeft(m.closing_date, nowTs);
    const disabled = t.expired || m.is_open === false || !!m.result || !!m.paid_out_at;
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

  const emptyState = (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>
        {t('home.emptyTitle', { country: t(countryOption.nameKey) })}
      </Text>
      <Text style={styles.emptySub}>{t('home.emptySubtitle')}</Text>
      <TouchableOpacity
        onPress={() => setCountryPickerOpen(true)}
        activeOpacity={0.85}
        style={styles.emptyCta}
      >
        <Text style={styles.emptyCtaText}>{t('home.emptyCta')}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderTour = () => {
    if (!tourOpen || !currentTour) return null;
    const { width, height } = Dimensions.get('window');
    const target = currentTour.target;
    const calloutW = Math.min(320, width - 32);
    const margin = 12;
    const estimateH = 170;
    const placeBelow = target.y + target.h + margin + estimateH <= height - 20;
    let top = placeBelow ? target.y + target.h + margin : Math.max(16, target.y - estimateH - margin);
    let left = target.x + target.w / 2 - calloutW / 2;
    left = Math.max(16, Math.min(left, width - calloutW - 16));
    const arrowSize = 12;
    const arrowLeft = Math.max(
      16,
      Math.min(target.x + target.w / 2 - left - arrowSize / 2, calloutW - arrowSize - 16)
    );

    const radius = Math.max(12, Math.min(target.h / 2 + 6, 26));

    return (
      <Modal visible transparent animationType="fade">
        <View style={styles.tourOverlay}>
          <Pressable style={styles.tourBackdrop} onPress={() => {}} />

          <View
            pointerEvents="none"
            style={[
              styles.tourHighlight,
              {
                left: target.x - 8,
                top: target.y - 8,
                width: target.w + 16,
                height: target.h + 16,
                borderRadius: radius,
              },
            ]}
          />

          <View style={[styles.tourCallout, { top, left, width: calloutW }]}>
            <View
              pointerEvents="none"
              style={[
                styles.tourArrow,
                placeBelow ? styles.tourArrowTop : styles.tourArrowBottom,
                { left: arrowLeft },
              ]}
            />
            <Text style={styles.tourTitle}>{currentTour.title}</Text>
            <Text style={styles.tourBody}>{currentTour.body}</Text>

            <View style={styles.tourDots}>
              {tourSteps.map((_, i) => (
                <View key={`dot-${i}`} style={[styles.tourDot, i === tourStep && styles.tourDotActive]} />
              ))}
            </View>

            <View style={styles.tourActions}>
              <TouchableOpacity onPress={() => closeTour(true)} style={styles.tourBtnGhost}>
                <Text style={styles.tourBtnGhostText}>{t('onboarding.skip')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={nextTour} style={styles.tourBtnPrimary}>
                <Text style={styles.tourBtnPrimaryText}>
                  {tourStep + 1 >= tourSteps.length ? t('onboarding.done') : t('onboarding.next')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  /* -------- UI -------- */
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <SafeAreaView
        style={[styles.safe, Platform.OS === 'android' && { paddingTop: StatusBar.currentHeight || 0 }]}
      >
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          {/* HEADER */}
          <View style={styles.appHeader}>
            <View style={styles.headerLeft}>
              <Text style={styles.brand}>{t('app.name')}</Text>
            </View>

            <View style={styles.headerCenter} ref={xpRef} collapsable={false}>
              <TouchableOpacity
                onPress={handleXpToplaPress}
                disabled={busyTopla}
                activeOpacity={0.9}
                style={{ borderRadius: 14 }}
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
                      {busyTopla ? t('common.loading') : toplaReady ? t('home.collectXp') : remainLabel}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.headerRight}>
              <View ref={countryRef} collapsable={false}>
                <TouchableOpacity
                  onPress={() => setCountryPickerOpen(true)}
                  activeOpacity={0.85}
                  accessibilityLabel={t('home.countryPickerLabel')}
                  style={styles.countryBtn}
                >
                  <Ionicons name="globe-outline" size={18} color="#FF6B00" />
                  <Text style={styles.countryFlag}>{flagEmoji(selectedCountry)}</Text>
                </TouchableOpacity>
              </View>

              <View ref={avatarRef} collapsable={false} style={styles.avatarUnder}>
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
                        {user.name[0]?.toUpperCase() || t('common.userInitial')}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* XP ROZETİ */}
          <View style={{ paddingHorizontal: 16, marginTop: 6 }}>
            <View style={styles.xpPill}>
              <Text style={styles.xpPillTxt}>
                {xpLoading ? t('common.loadingShort') : xp.toLocaleString(numberLocale)} XP
              </Text>
            </View>
          </View>

          {/* KATEGORİ BAR */}
          <View style={styles.catBarWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, alignItems: 'center' }}
              bounces={false}
            >
              {CATS.map((c) => {
                const active = c.value === category;
                return (
                  <TouchableOpacity
                    key={c.value}
                    onPress={() => {
                      setCategory(c.value);
                      setPage(0);
                      setHasMore(true);
                      fetchMore(true);
                    }}
                    style={[styles.catPill, active && styles.catPillActive]}
                  >
                    <Text style={[styles.catTxt, active && styles.catTxtActive]}>{t(c.labelKey)}</Text>
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
            ListEmptyComponent={
              initialLoading ? (
                <View style={styles.emptyWrap}>
                  <ActivityIndicator color="#FF6B00" size="large" />
                </View>
              ) : (
                emptyState
              )
            }
            contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
            onEndReachedThreshold={0.4}
            onEndReached={() => fetchMore()}
            removeClippedSubviews
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={5}
            updateCellsBatchingPeriod={50}
            renderItem={({ item, index }) => {
              const st = marketState(item);
              const isFirst = index === 0;
              return (
                <View ref={isFirst ? firstCardRef : null} collapsable={false} style={{ marginBottom: 12 }}>
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
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={{ flex: 1 }}
              keyboardVerticalOffset={Platform.OS === 'ios' ? -10 : 0}
            >
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={[styles.modalWrap, { justifyContent: 'flex-end' }]}>
                  <View style={[styles.modalCard, { paddingBottom: Platform.OS === 'ios' ? 30 : 16 }]}>
                    {modal && (
                      <>
                        <Text style={styles.modalTitle}>{modal.market.title}</Text>
                        <Text style={styles.modalSub}>{modal.label} • {modal.side}</Text>
                        <TextInput
                          value={stake}
                          onChangeText={setStake}
                          keyboardType="numeric"
                          style={styles.stakeInput}
                          autoFocus
                        />
                        <View style={styles.quickRow}>
                          {[25, 50, 100, 250, 500].map((q) => (
                            <TouchableOpacity key={q} style={styles.quickBtn} onPress={() => setStake(String(q))}>
                              <Text style={{ fontWeight: '700' }}>{q}×</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <TouchableOpacity style={styles.tradeBtn} onPress={addToBasket}>
                          <Text style={{ color: '#fff', fontWeight: 'bold' }}>{t('home.addToBasket')}</Text>
                        </TouchableOpacity>
                        <Pressable onPress={() => setModal(null)} style={styles.closeBtn}>
                          <Text style={{ fontWeight: 'bold' }}>{t('common.close')}</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </Modal>

          {/* Sepet Modal */}
          <Modal visible={basketOpen} transparent animationType="slide">
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{ flex: 1 }}
            >
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.modalWrap}>
                  <View
                    style={[
                      styles.modalCard,
                      {
                        maxHeight: '80%',
                        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
                      },
                    ]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text style={styles.modalTitle}>{t('home.basketTitle')}</Text>
                      <Pressable onPress={() => setBasketOpen(false)}>
                        <Text style={{ fontWeight: 'bold' }}>{t('common.close')}</Text>
                      </Pressable>
                    </View>

                    <ScrollView style={{ flexShrink: 1 }}>
                      {basket.map((it, i) => (
                        <View key={`${it.coupon_id}-${i}`} style={styles.basketItem}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontWeight: '700' }}>{it.title}</Text>
                            <Text style={{ color: '#666' }}>
                              {it.label} • {it.side} • {t('home.priceLabel', { price: it.price.toFixed(2) })}
                            </Text>
                          </View>
                          <TextInput
                            value={String(it.stake)}
                            onChangeText={(v) => updateBasketStake(i, v)}
                            keyboardType="numeric"
                            style={styles.basketStakeInput}
                          />
                          <TouchableOpacity onPress={() => removeBasketItem(i)} style={styles.trashBtn}>
                            <Text style={{ color: '#fff', fontWeight: '700' }}>{t('common.delete')}</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </ScrollView>

                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                      <TouchableOpacity
                        style={[styles.tradeBtn, { flex: 1 }]}
                        onPress={parlayMode ? confirmPlayParlay : confirmPlaySingles}
                        disabled={submitting}
                      >
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>
                          {submitting ? t('common.sending') : t('home.confirmPlay')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.tradeBtn, { flex: 1, backgroundColor: '#757575' }]}
                        onPress={clearBasket}
                      >
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>{t('common.clear')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </Modal>

          <CountryPickerModal
            visible={countryPickerOpen}
            value={selectedCountry}
            onClose={() => setCountryPickerOpen(false)}
            onSelect={(code) => {
              setCountryPickerOpen(false);
              void setCountry(code);
            }}
          />
          {renderTour()}
        </View>
      </SafeAreaView>

      {/* 🔥 KUSURSUZ YAPIŞIK SEPET BAR (En dışta ve bağımsız) 🔥 */}
      <View 
        pointerEvents="box-none" 
        style={{ 
          position: 'absolute', 
          left: 0, 
          right: 0, 
          // 👇 BURASI KRİTİK: Senin orijinal kodundaki ayara geri döndük (0px = BottomBar'ın üzeri)
          bottom: 0, 
          zIndex: 99
        }}
      >
        <CartRibbon
          count={basket.length}
          totalXp={parlayMode ? parlayNumbers.stake : totals.totalStake}
          onPress={() => setBasketOpen(true)}
          fabDiameter={84}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  appHeader: {
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  headerLeft: { minWidth: 120 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerRight: { width: 64, alignItems: 'center', justifyContent: 'center', gap: 4 },
  brand: { fontSize: 24, fontWeight: '900', color: '#FF6B00' },

  xpPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFE0B2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  xpPillTxt: { color: '#FF6B00', fontWeight: '800' },

  avatarMini: { width: 34, height: 34, borderRadius: 17 },
  avatarUnder: { marginTop: 4 },

  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#FFF2E8',
    borderWidth: 1,
    borderColor: '#FFD6B8',
    minHeight: 30,
  },
  countryFlag: { fontSize: 16 },

  // Onboarding Tour
  tourOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 999 },
  tourBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  tourHighlight: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#FF6B00',
    backgroundColor: 'rgba(255,107,0,0.12)',
    shadowColor: '#FF6B00',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  tourCallout: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FFE1C7',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  tourArrow: {
    position: 'absolute',
    width: 12,
    height: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#FFE1C7',
    transform: [{ rotate: '45deg' }],
  },
  tourArrowTop: { top: -6 },
  tourArrowBottom: { bottom: -6 },
  tourTitle: { fontWeight: '900', fontSize: 16, color: '#111' },
  tourBody: { marginTop: 6, color: '#555', fontSize: 13, lineHeight: 18 },
  tourActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tourBtnGhost: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  tourBtnGhostText: { color: '#111', fontWeight: '800' },
  tourBtnPrimary: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FF6B00',
    alignItems: 'center',
  },
  tourBtnPrimaryText: { color: '#fff', fontWeight: '900' },
  tourDots: { flexDirection: 'row', gap: 6, marginTop: 10 },
  tourDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E5E7EB' },
  tourDotActive: { backgroundColor: '#FF6B00' },

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

  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: '#111' },
  emptySub: { color: '#6B7280', textAlign: 'center', paddingHorizontal: 24 },
  emptyCta: {
    marginTop: 6,
    backgroundColor: '#FF6B00',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  emptyCtaText: { color: '#fff', fontWeight: '900' },

  modalWrap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    // 🔥 iOS çentikli telefonlarda alttaki o sarı çizgili boşluğu kapatır
    paddingBottom: Platform.OS === 'ios' ? 38 : 20, 
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5
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
