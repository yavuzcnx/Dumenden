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

  // Reklam başlangıç
  useEffect(() => {
    (async () => {
      try { await initAds(); } catch {}
      setAdsInitDone(true);
    })();
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (didInit.current) return;
      didInit.current = true;

      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      if (session?.user) {
        await ensureBootstrapAndProfile().catch(console.warn);
      }
    })();

    // Auth event listener
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      
      if (event === 'SIGNED_IN') {
        if (session?.user) {
          await ensureBootstrapAndProfile().catch(console.warn);
        }
        // Yönlendirmeyi burada yapmıyoruz, Login sayfası veya ilgili sayfa kendi karar versin.
        // Burası global state'i yönetir.
      }

      if (event === 'SIGNED_OUT') {
        router.replace('/login');
      }
    });

    return () => {
      try { sub.subscription.unsubscribe(); } catch {}
      mounted = false;
    };
  }, [pathname, router]);

  // Alt bar görünmez sayfalar
  // 🔥 DÜZELTME: /reset-password BURAYA EKLENDİ
  const hideOn = [
    '/login',
    '/register',
    '/google-auth',
    '/splash',
    '/reset-password', // <-- ARTIK ALT BAR BURADA ÇIKMAYACAK
    '/admin',
    
  ];
  const hide = hideOn.some((p) => pathname?.startsWith(p));

  if (!adsInitDone) return null;

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
              animation:
                Platform.OS === 'ios' ? 'slide_from_right' : 'fade_from_bottom',
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

// ⭐ NAVIGATION WATCHER
function NavigationWatcher() {
  const pathname = usePathname();
  const prevPathRef = useRef<string | null>(null);
  const { registerNavTransition, showIfEligible } = useInterstitial();

  useEffect(() => {
    if (prevPathRef.current !== null && prevPathRef.current !== pathname) {
      (async () => {
        await registerNavTransition();
        await showIfEligible("nav");
      })();

      (async () => {
        await showIfEligible("home_enter");
      })();
    }

    prevPathRef.current = pathname || null;
  }, [pathname]);

  return null;
}

// ⭐ GLOBAL TIMER
function GlobalAdTimer() {
  const { showIfEligible } = useInterstitial();
  const intervalRef = useRef<number | null>(null);

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