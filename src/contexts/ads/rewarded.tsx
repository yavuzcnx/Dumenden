import { useEffect, useRef, useState } from 'react';
import {
  AdEventType,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

// PROD'da kendi Rewarded ad unit ID'ni yaz
const PROD_REWARDED = 'ca-app-pub-3837426346942059/XXXXXXXXXX';
// DEV'de Google test ID'si
const TEST_REWARDED = TestIds.REWARDED;

export function useRewardedAd(onReward?: () => void) {
  const adUnitId = __DEV__ ? TEST_REWARDED : PROD_REWARDED;

  const adRef = useRef<RewardedAd | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    const ad = RewardedAd.createForAdRequest(adUnitId);
    adRef.current = ad;

    const unsubLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
      setLoaded(true);
    });

    const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      setShowing(false);
      setLoaded(false);
      ad.load(); // bir sonrakini hazırlıyoruz
    });

    const unsubEarned = ad.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      () => {
        onReward?.(); // XP, coin vs. ver
      }
    );

    ad.load();

    return () => {
      unsubLoaded();
      unsubClosed();
      unsubEarned();
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
