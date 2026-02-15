// app/(modals)/daily-entry.tsx
'use client';

import { supabase } from '@/lib/supabaseClient';
import { useI18n } from '@/lib/i18n';
import { adsReady, onAdsReady } from '@/src/contexts/lib/ads';
import { useXp } from '@/src/contexts/XpProvider';
import { BlurView } from 'expo-blur';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AdEventType,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from '@/src/contexts/ads/googleMobileAds';

const BRAND = '#FF6B00';
const SOFT = '#FFF2E8';

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

export default function DailyEntryScreen() {
  const { xp, loading: xpLoading, refresh } = useXp();
  const { t, numberLocale } = useI18n();
  const [granting, setGranting] = useState(false);
  const [cooldownMinutes, setCooldownMinutes] = useState<number | null>(0);

  // cooldown sayacını azalt
  useEffect(() => {
    if (cooldownMinutes === null || cooldownMinutes <= 0) return;
    const t = setInterval(() => {
      setCooldownMinutes((prev) => (prev && prev > 0 ? prev - 1 : 0));
    }, 60000);
    return () => clearInterval(t);
  }, [cooldownMinutes]);

  const onPress = async () => {
    if (granting) return;

    if ((cooldownMinutes ?? 0) > 0) {
      const h = Math.floor((cooldownMinutes ?? 0) / 60);
      const m = (cooldownMinutes ?? 0) % 60;
      Alert.alert(t('home.xpWaitTitle'), t('home.xpWaitBody', { hours: h, minutes: m }));
      return;
    }

    setGranting(true);
    try {
      // 1) Reklamı izlet
      const ok = await showRewarded();
      if (!ok) {
        Alert.alert(t('common.error'), t('dailyentry.adRewardFail'));
        return;
      }

      // 2) Kullanıcı ID’sini al
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        Alert.alert(t('common.error'), t('home.noSession'));
        return;
      }

      // 3) Supabase tarafında 3 saatlik bonusu iste
      const { data, error } = await supabase.rpc('claim_ad_bonus', { p_user: uid });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      const granted = !!row?.granted;
      const remaining = Number(row?.remaining_seconds ?? 0);

      if (granted) {
        // XP verildi
        await refresh();
        Alert.alert(t('home.xpCongratsTitle'), t('home.xpCongratsBody'));
        // 3 saatlik local sayaç (server zaten saklıyor, biz sadece UI için tutuyoruz)
        setCooldownMinutes(Math.ceil(remaining / 60) || 180);
      } else {
        // Cooldown’da
        const mins = Math.max(0, Math.ceil(remaining / 60));
        setCooldownMinutes(mins);
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        Alert.alert(t('home.xpWaitTitle'), t('home.xpCooldownBody', { hours: h, minutes: m }));
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? t('common.unknownError'));
    } finally {
      setGranting(false);
    }
  };

  const title = useMemo(
    () => (xpLoading ? t('common.loadingShort') : `${xp.toLocaleString(numberLocale)} XP`),
    [xp, xpLoading, numberLocale, t],
  );
  const h = Math.floor((cooldownMinutes ?? 0) / 60);
  const m = (cooldownMinutes ?? 0) % 60;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
        <Text style={{ fontSize: 24, fontWeight: '900', color: BRAND }}>{t('dailyentry.title')}</Text>
        <View
          style={{
            marginLeft: 'auto',
            backgroundColor: SOFT,
            borderWidth: 1,
            borderColor: BRAND,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: BRAND, fontWeight: '800' }}>{title}</Text>
        </View>
      </View>

      <Text style={{ color: '#6B7280', marginBottom: 16 }}>
        {t('dailyentry.subtitle')}
      </Text>

      <TouchableOpacity
        onPress={onPress}
        disabled={granting}
        style={{
          backgroundColor: BRAND,
          paddingVertical: 14,
          borderRadius: 14,
          alignItems: 'center',
          opacity: granting ? 0.7 : 1,
        }}
      >
        {granting ? (
          <ActivityIndicator color="#fff" />
        ) : (cooldownMinutes ?? 0) > 0 ? (
          <Text style={{ color: '#fff', fontWeight: '900' }}>
            {t('dailyentry.tryAgainIn', { hours: h, minutes: m })}
          </Text>
        ) : (
          <Text style={{ color: '#fff', fontWeight: '900' }}>{t('dailyentry.cta')}</Text>
        )}
      </TouchableOpacity>

      {granting && (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
          <BlurView
            intensity={30}
            tint="light"
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <ActivityIndicator size="large" color={BRAND} />
            <Text style={{ marginTop: 10, fontWeight: '700' }}>{t('dailyentry.loading')}</Text>
          </BlurView>
        </View>
      )}
    </SafeAreaView>
  );
}
