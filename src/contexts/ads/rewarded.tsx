import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { onAdsReady } from '@/src/contexts/lib/ads';

// ANDROID ID (Gerçek)
const PROD_REWARDED_ANDROID = 'ca-app-pub-3837426346942059/6751536443';
// iOS ID (Gerçek)
const PROD_REWARDED_IOS = 'ca-app-pub-3837426346942059/1363478394';

export function useRewardedAd(onReward?: () => void) {
  const adRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [showing, setShowing] = useState(false);
  const disabledRef = useRef(false);

  useEffect(() => {
    let unsubscribers: Array<() => void> = [];
    let mounted = true;
    let offReady: (() => void) | null = null;

    offReady = onAdsReady(() => {
      (async () => {
        try {
          const mod = await import('./googleMobileAds');
          const {
            AdEventType,
            RewardedAd,
            RewardedAdEventType,
            TestIds,
          } = mod;

          const adUnitId =
            Platform.OS === 'ios'
              ? TestIds.REWARDED
              : (__DEV__ ? TestIds.REWARDED : PROD_REWARDED_ANDROID);

          const ad = RewardedAd.createForAdRequest(adUnitId);
          adRef.current = ad;

          const l1 = ad.addAdEventListener(AdEventType.LOADED, () => {
            if (!mounted) return;
            setLoaded(true);
          });

          const l2 = ad.addAdEventListener(AdEventType.CLOSED, () => {
            if (!mounted) return;
            setShowing(false);
            setLoaded(false);
            try {
              ad.load();
            } catch {}
          });

          const l3 = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
            try {
              onReward?.();
            } catch {}
          });

          const l4 = ad.addAdEventListener(AdEventType.ERROR, () => {
            if (!mounted) return;
            setShowing(false);
            setLoaded(false);
            setTimeout(() => {
              try {
                ad.load();
              } catch {}
            }, 1500);
          });

          unsubscribers = [l1, l2, l3, l4];

          ad.load();
        } catch (e) {
          disabledRef.current = true;
          console.warn('[ADS] rewarded disabled', e);
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
  }, [onReward]);

  const show = () => {
    if (disabledRef.current) return false;
    if (!loaded || !adRef.current) return false;

    setShowing(true);
    adRef.current
      .show()
      .catch(() => {
        setShowing(false);
        setLoaded(false);
        try {
          adRef.current?.load();
        } catch {}
      });

    return true;
  };

  return { loaded, showing, show };
}
