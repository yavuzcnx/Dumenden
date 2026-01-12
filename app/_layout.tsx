if (__DEV__) {
  require('@/lib/dev/noRawTextGuard');
}

import BottomBar from '@/components/BottomBar';
import { supabase } from '@/lib/supabaseClient';
import { XpProvider } from '@/src/contexts/XpProvider';
import { Stack, usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ensureBootstrapAndProfile } from '@/lib/bootstrap';
import { useInterstitial } from '@/src/contexts/ads/interstitial';
import { initAds } from '@/src/contexts/lib/ads';

export default function RootLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const didInit = useRef(false);
  const [adsInitDone, setAdsInitDone] = useState(false);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try { 
        // Reklam başlatma hataya düşse bile devam etmeli
        await initAds().catch(() => {}); 
      } catch (err) {
        console.warn("Ads Init Error:", err);
      } finally {
        if (isMounted) setAdsInitDone(true);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (didInit.current) return;
      didInit.current = true;

      try {
        // iOS Keychain bazen ilk açılışta kilitli olur, try-catch şart
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        
        if (!mounted) return;

        if (session?.user) {
          await ensureBootstrapAndProfile().catch(console.warn);
        }
      } catch (e) {
        console.warn("Initial Auth Check Failed:", e);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN') {
        if (session?.user) {
          await ensureBootstrapAndProfile().catch(console.warn);
          if (pathname === '/login' || pathname === '/') {
             router.replace('/home');
          }
        }
      }

      if (event === 'SIGNED_OUT') {
        router.replace('/login');
      }
    });

    return () => {
      if (sub?.subscription) sub.subscription.unsubscribe();
      mounted = false;
    };
  }, [pathname]);

  const hideOn = [
    '/login',
    '/register',
    '/google-auth',
    '/splash',
    '/reset-password',
    '/admin',
  ];

  const hide = hideOn.some((p) => pathname?.startsWith(p));

  // 🔥 KATİL HATA BURADAYDI: null yerine View döndürüyoruz
  if (!adsInitDone) {
    return (
      <View style={{ flex: 1, backgroundColor: 'white' }} />
    );
  }

  return (
    <SafeAreaProvider>
      <XpProvider>
        <View style={{ flex: 1 }}>
          <NavigationWatcher />
          <GlobalAdTimer />

          <Stack
            screenOptions={{
              headerShown: false,
              gestureEnabled: true,
              fullScreenGestureEnabled: Platform.OS === 'ios',
              gestureDirection: 'horizontal',
              animation: Platform.OS === 'ios' ? 'slide_from_right' : 'fade_from_bottom',
            }}
          >
            <Stack.Screen
              name="(modals)"
              options={{ presentation: 'modal', animation: 'fade_from_bottom' }}
            />
          </Stack>

          {!hide && <BottomBar />}
        </View>
      </XpProvider>
    </SafeAreaProvider>
  );
}

function NavigationWatcher() {
  const pathname = usePathname();
  const prevPathRef = useRef<any>(null);
  const { registerNavTransition, showIfEligible } = useInterstitial();

  useEffect(() => {
    if (prevPathRef.current !== null && prevPathRef.current !== pathname) {
      (async () => {
        try {
          await registerNavTransition();
          await showIfEligible("nav");
          await showIfEligible("home_enter");
        } catch {}
      })();
    }
    prevPathRef.current = pathname || null;
  }, [pathname]);

  return null;
}

function GlobalAdTimer() {
  const { showIfEligible } = useInterstitial();
  // 🔥 DÜZELTME: Timeout hatası için 'any' kullandık
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      showIfEligible("home_enter");
    }, 15000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return null;
}