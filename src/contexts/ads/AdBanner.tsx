// src/components/AdBanner.tsx
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { onAdsReady } from '@/src/contexts/lib/ads';

// PROD Banner ID → gerçek birimini yaz
const PROD_BANNER = 'ca-app-pub-3837426346942059/XXXXXXXXXX';

type AdsMod = typeof import('./googleMobileAds');

export default function AdBanner({ unitId }: { unitId?: string }) {
  const [ads, setAds] = useState<AdsMod | null>(null);
  const [disabled, setDisabled] = useState(false);

  const adUnitId = useMemo(() => {
    // DEV/test ortamı → Google test ID (ads mod geldikten sonra kullanacağız)
    return __DEV__ ? 'TEST' : unitId ?? PROD_BANNER;
  }, [unitId]);

  useEffect(() => {
    let mounted = true;
    let offReady: (() => void) | null = null;

    offReady = onAdsReady(() => {
      (async () => {
        try {
          const mod = await import('./googleMobileAds');
          if (!mounted) return;
          setAds(mod);
        } catch (e) {
          // ✅ modül yoksa crash değil, banner kapanır
          if (!mounted) return;
          console.warn('[ADS] banner disabled', e);
          setDisabled(true);
        }
      })();
    });

    return () => {
      mounted = false;
      try {
        offReady?.();
      } catch {}
    };
  }, []);

  // ✅ ads yoksa ya da disabled ise hiçbir şey çizme
  if (disabled || !ads) return null;

  const { BannerAd, BannerAdSize, TestIds } = ads;
  const finalUnitId = __DEV__ ? TestIds.BANNER : adUnitId;

  return (
    <View style={styles.wrap}>
      <BannerAd
        unitId={finalUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
});
