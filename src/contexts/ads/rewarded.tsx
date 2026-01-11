import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  AdEventType,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

// ANDROID daily_entry (zaten sende vardı)
const PROD_REWARDED_ANDROID = 'ca-app-pub-3837426346942059/XXXXXXXXXX';

// iOS daily_entry (senin attığın ekran)
const PROD_REWARDED_IOS = 'ca-app-pub-3837426346942059/1363478394';

export function useRewardedAd(onReward?: () => void) {
  const adUnitId = __DEV__
    ? TestIds.REWARDED
    : Platform.OS === 'ios'
      ? PROD_REWARDED_IOS
      : PROD_REWARDED_ANDROID;

  const adRef = useRef<RewardedAd | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    const ad = RewardedAd.createForAdRequest(adUnitId);
    adRef.current = ad;

    const l1 = ad.addAdEventListener(AdEventType.LOADED, () => {
      setLoaded(true);
    });

    const l2 = ad.addAdEventListener(AdEventType.CLOSED, () => {
      setShowing(false);
      setLoaded(false);
      ad.load();
    });

    const l3 = ad.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      () => {
        onReward?.(); // XP VER
      }
    );

    const l4 = ad.addAdEventListener(AdEventType.ERROR, () => {
      setShowing(false);
      setLoaded(false);
      setTimeout(() => ad.load(), 1500);
    });

    ad.load();

    return () => {
      l1();
      l2();
      l3();
      l4();
    };
  }, [adUnitId, onReward]);

  const show = () => {
    if (!loaded || !adRef.current) return false;
    setShowing(true);
    adRef.current.show().catch(() => {
      setShowing(false);
      setLoaded(false);
      adRef.current?.load();
    });
    return true;
  };

  return { loaded, showing, show };
}
