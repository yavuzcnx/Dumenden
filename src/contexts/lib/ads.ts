// src/lib/ads.ts
import mobileAds from 'react-native-google-mobile-ads';

let _inited = false;
const _listeners: Array<() => void> = [];

export async function initAds() {
  if (_inited) return;
  try {
    // İsteğe bağlı kısıtlar (çocuk içeriği, rating vs.)
    await mobileAds().setRequestConfiguration({
      // maxAdContentRating: MaxAdContentRating.T,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });
    await mobileAds().initialize();
    _inited = true;
    // bekleyen dinleyicileri tetikle
    _listeners.splice(0).forEach((fn) => {
      try { fn(); } catch {}
    });
  } catch (e) {
    console.warn('Ads init failed', e);
  }
}

export function adsReady() {
  return _inited;
}

/** Ads hazır olduğunda bir kez çağrılır */
export function onAdsReady(cb: () => void) {
  if (_inited) cb();
  else _listeners.push(cb);
}
