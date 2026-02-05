// src/contexts/lib/ads.ts
import { Platform } from 'react-native';

let _inited = false;
let _initPromise: Promise<void> | null = null;
const _listeners: Array<() => void> = [];

async function loadAdsModule() {
  // ✅ Modül yoksa burada patlamasın diye try/catch
  try {
    const mod = await import('react-native-google-mobile-ads');
    return mod;
  } catch (e) {
    console.warn('[ADS] module load failed (ads disabled)', e);
    return null;
  }
}

export async function initAds() {
  if (_inited) return;

  // ✅ aynı anda birden fazla init çağrılırsa tek promise kullanalım
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    // İstersen admin panel vs. için Android’de kapat vs. gibi koşullar ekleyebilirsin
    // Şimdilik her platformda deniyoruz, yoksa no-op.

    const mod = await loadAdsModule();
    if (!mod) return; // ✅ ads yoksa app devam

    try {
      const mobileAds = mod.default;

      if (Platform.OS === 'ios') {
        try {
          const tt = await import('expo-tracking-transparency');
          const { status } = await tt.getTrackingPermissionsAsync();
          if (status === tt.PermissionStatus.UNDETERMINED) {
            const req = await tt.requestTrackingPermissionsAsync();
            console.log('[ADS] ATT status:', req.status);
          } else {
            console.log('[ADS] ATT status:', status);
          }
        } catch (e) {
          console.warn('[ADS] ATT request failed', e);
        }
      }

      await mobileAds().setRequestConfiguration({
        tagForChildDirectedTreatment: false,
        tagForUnderAgeOfConsent: false,
      });

      await mobileAds().initialize();

      _inited = true;

      // bekleyen dinleyicileri tetikle
      _listeners.splice(0).forEach((fn) => {
        try {
          fn();
        } catch {}
      });
    } catch (e) {
      console.warn('[ADS] init failed (ads disabled)', e);
    }
  })();

  return _initPromise;
}

export function adsReady() {
  return _inited;
}

/** Ads hazır olduğunda bir kez çağrılır */
export function onAdsReady(cb: () => void) {
  if (_inited) cb();
  else _listeners.push(cb);
}
