import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { onAdsReady } from '@/src/contexts/lib/ads';

const PROD_INTERSTITIAL_ANDROID = 'ca-app-pub-3837426346942059/8002763076';
const PROD_INTERSTITIAL_IOS = 'ca-app-pub-3837426346942059/7530153923';

const FOUR_MIN_MS = 4 * 60 * 1000;
const NAV_PER_AD = 10;
const MIN_COOLDOWN = 30 * 1000;

const K_LAST = 'ads:lastShownAt';
const K_NAV = 'ads:navCount';

async function getNumber(key: string, fallback = 0) {
  try {
    const v = await AsyncStorage.getItem(key);
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

async function setNumber(key: string, n: number) {
  try {
    await AsyncStorage.setItem(key, String(n));
  } catch {}
}

export function useInterstitial() {
  const [loaded, setLoaded] = useState(false);

  // NOTE: type'lar runtime import yapmasın diye any kullandım (safe)
  const adRef = useRef<any>(null);
  const loadingRef = useRef(false);
  const disabledRef = useRef(false);

  useEffect(() => {
    let unsubscribers: Array<() => void> = [];
    let mounted = true;
    let offReady: (() => void) | null = null;

    offReady = onAdsReady(() => {
      (async () => {
        try {
          const mod = await import('./googleMobileAds');
          const { AdEventType, InterstitialAd, TestIds } = mod;

          const adUnitId =
            Platform.OS === 'ios'
              ? TestIds.INTERSTITIAL
              : (__DEV__ ? TestIds.INTERSTITIAL : PROD_INTERSTITIAL_ANDROID);

          const ad = InterstitialAd.createForAdRequest(adUnitId);
          adRef.current = ad;

          const l1 = ad.addAdEventListener(AdEventType.LOADED, () => {
            if (!mounted) return;
            loadingRef.current = false;
            setLoaded(true);
          });

          const l2 = ad.addAdEventListener(AdEventType.CLOSED, () => {
            if (!mounted) return;
            setLoaded(false);
            loadingRef.current = true;
            try {
              ad.load();
            } catch {}
          });

          const l3 = ad.addAdEventListener(AdEventType.ERROR, () => {
            if (!mounted) return;
            setLoaded(false);
            if (!loadingRef.current) {
              loadingRef.current = true;
              setTimeout(() => {
                try {
                  ad.load();
                } catch {}
              }, 1500);
            }
          });

          unsubscribers = [l1, l2, l3];

          loadingRef.current = true;
          ad.load();
        } catch (e) {
          // ✅ modül yoksa crash değil, ads kapanır
          disabledRef.current = true;
          console.warn('[ADS] interstitial disabled', e);
        }
      })();
    });

    return () => {
      mounted = false;
      try {
        offReady?.();
      } catch {}
      try {
        unsubscribers.forEach((u) => u());
      } catch {}
    };
  }, []);

  const show = async () => {
    if (disabledRef.current) return false;
    if (!adRef.current) return false;
    if (!loaded) return false;

    try {
      await adRef.current.show();
      await setNumber(K_LAST, Date.now());
      return true;
    } catch {
      return false;
    }
  };

  const isEligible = async (reason: 'home_enter' | 'nav') => {
    const last = await getNumber(K_LAST, 0);
    const diff = Date.now() - last;

    if (diff < MIN_COOLDOWN) return false;

    if (reason === 'home_enter') return diff >= FOUR_MIN_MS;

    if (reason === 'nav') {
      const cnt = await getNumber(K_NAV, 0);
      return cnt >= NAV_PER_AD;
    }

    return false;
  };

  const registerNavTransition = async () => {
    const cnt = await getNumber(K_NAV, 0);
    await setNumber(K_NAV, cnt + 1);
  };

  const resetNavCounter = async () => {
    await setNumber(K_NAV, 0);
  };

  const showIfEligible = async (reason: 'home_enter' | 'nav') => {
    if (disabledRef.current) return false;

    const ok = await isEligible(reason);
    if (!ok) return false;

    if (reason === 'nav') await resetNavCounter();

    return await show();
  };

  return {
    loaded,
    show,
    showIfEligible,
    registerNavTransition,
    resetNavCounter,
  };
}
