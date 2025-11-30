// src/components/AdBanner.tsx

import { StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

// PROD Banner ID → gerçek birimini yaz
const PROD_BANNER = 'ca-app-pub-3837426346942059/XXXXXXXXXX';

// DEV/test ortamı → Google test ID
const TEST_BANNER = TestIds.BANNER;

export default function AdBanner({ unitId }: { unitId?: string }) {
  // Artık PLUS kontrolü yok → herkes reklam görecek

  // Hangi ID kullanılacak
  const adUnitId = __DEV__ ? TEST_BANNER : unitId ?? PROD_BANNER;

  return (
    <View style={styles.wrap}>
      <BannerAd
        unitId={adUnitId}
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
