import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { AdEventType, InterstitialAd, TestIds } from 'react-native-google-mobile-ads';

const PROD_INTERSTITIAL = 'ca-app-pub-3837426346942059/8002763076';

const FOUR_MIN_MS = 4 * 60 * 1000;
const NAV_PER_AD  = 10;
const MIN_COOLDOWN = 30 * 1000;

const K_LAST = 'ads:lastShownAt';
const K_NAV  = 'ads:navCount';

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
  await AsyncStorage.setItem(key, String(n));
}

export function useInterstitial() {
  const [loaded, setLoaded] = useState(false);

  const adRef = useRef<InterstitialAd | null>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    const adUnitId = __DEV__ ? TestIds.INTERSTITIAL : PROD_INTERSTITIAL;
    const ad = InterstitialAd.createForAdRequest(adUnitId);

    adRef.current = ad;

    const l1 = ad.addAdEventListener(AdEventType.LOADED, () => {
      loadingRef.current = false;
      setLoaded(true);
    });

    const l2 = ad.addAdEventListener(AdEventType.CLOSED, () => {
      setLoaded(false);
      loadingRef.current = true;
      ad.load();
    });

    const l3 = ad.addAdEventListener(AdEventType.ERROR, () => {
      setLoaded(false);
      if (!loadingRef.current) {
        loadingRef.current = true;
        setTimeout(() => ad.load(), 1500);
      }
    });

    loadingRef.current = true;
    ad.load();

    return () => {
      l1();
      l2();
      l3();
    };
  }, []);

  const show = async () => {
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
