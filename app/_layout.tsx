'use client';
// 1. BU SATIR EN ÜSTTE OLMAK ZORUNDA
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { Platform, StatusBar, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import BottomBar from '@/components/BottomBar';
import { ensureBootstrapAndProfile } from '@/lib/bootstrap';
import { supabase } from '@/lib/supabaseClient';
import { useInterstitial } from '@/src/contexts/ads/interstitial';
import { initAds } from '@/src/contexts/lib/ads';
import { XpProvider } from '@/src/contexts/XpProvider';

// iOS’a “ben hazır diyene kadar splash kapanma” diyoruz.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const [appIsReady, setAppIsReady] = useState(false);

  // ✅ tek sefer yönlendirme kilidi
  const didNavRef = useRef(false);

  useEffect(() => {
    async function prepare() {
      try {
        await Promise.allSettled([
          initAds().catch((e) => console.warn('Ad Init Fail:', e)),
          (async () => {
            const {
              data: { session },
            } = await supabase.auth.getSession();
            if (session?.user) {
              await ensureBootstrapAndProfile().catch(() => {});
            }
          })(),
        ]);
      } catch (e) {
        console.warn('Global Init Error:', e);
      } finally {
        setAppIsReady(true);
      }
    }

    prepare();
  }, []);

  useEffect(() => {
    if (appIsReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [appIsReady]);

  useEffect(() => {
  const adminEmails = ['admin1@dumenden.com', 'admin2@dumenden.com', 'admin3@dumenden.com'];

  // ✅ login benzeri ekranlar (signed-in olunca /home'a atılabilir)
  const isLoginLikeRoute = (p: string) =>
    p.startsWith('/login') ||
    p.startsWith('/register') ||
    p.startsWith('/google-auth') ||
    p.startsWith('/splash');

  // ✅ auth ekranları (signed-out olunca login'e atmak için)
  const isAuthRoute = (p: string) => isLoginLikeRoute(p) || p.startsWith('/reset-password');

  const getDestForUser = (email?: string) => {
    const e = (email || '').trim().toLowerCase();
    if (adminEmails.includes(e)) return '/admin/landing';
    return '/home';
  };

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    const current = pathname || '';
    const u = session?.user;

    // SIGNED_OUT: auth route’ta değilsek login’e bas
    if (event === 'SIGNED_OUT') {
      didNavRef.current = false;
      if (!isAuthRoute(current)) router.replace('/login');
      return;
    }

    // ✅ reset akışı: bu event gelince ASLA yönlendirme yapma
    if (event === 'PASSWORD_RECOVERY') {
      return;
    }

    // SIGNED_IN / INITIAL_SESSION: sadece login ekranlarındayken yönlendir
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && u) {
      // ❗ reset-password ekranındayken dokunma
      if (!isLoginLikeRoute(current)) return;

      if (didNavRef.current) return;
      didNavRef.current = true;

      void ensureBootstrapAndProfile().catch(() => {});
      router.replace(getDestForUser(u.email));
    }
  });

  return () => {
    try { subscription.unsubscribe(); } catch {}
  };
}, [pathname, router]);

  // Uygulama hazır değilse zaten Native Splash görünüyor -> boş dön
  if (!appIsReady) {
    return null;
  }

  const hideOn = ['/login', '/register', '/google-auth', '/splash', '/reset-password', '/admin'];
  const hide = hideOn.some((p) => (pathname || '').startsWith(p));

  return (
    <SafeAreaProvider>
      <XpProvider>
        <StatusBar barStyle="dark-content" backgroundColor="white" translucent />

        <View style={{ flex: 1, backgroundColor: 'white' }}>
          {appIsReady && (
            <>
              <NavigationWatcher />
              <GlobalAdTimer />
            </>
          )}

          <Stack
            screenOptions={{
              headerShown: false,
              gestureEnabled: true,
              fullScreenGestureEnabled: Platform.OS === 'ios',
              animation: Platform.OS === 'ios' ? 'slide_from_right' : 'fade_from_bottom',
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(modals)" options={{ presentation: 'modal' }} />
          </Stack>

          {!hide && <BottomBarWrapper />}
        </View>
      </XpProvider>
    </SafeAreaProvider>
  );
}

function BottomBarWrapper() {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: 'white',
        paddingBottom: Platform.OS === 'ios' ? 0 : 0,
      }}
    >
      <BottomBar />
    </View>
  );
}

function NavigationWatcher() {
  const pathname = usePathname();
  const prevPathRef = useRef<string | null>(null);
  const { registerNavTransition, showIfEligible } = useInterstitial();

  useEffect(() => {
    if (prevPathRef.current !== null && prevPathRef.current !== pathname) {
      registerNavTransition()
        .then(() => showIfEligible('nav'))
        .catch(() => {});
    }
    prevPathRef.current = pathname || null;
  }, [pathname]);

  return null;
}

function GlobalAdTimer() {
  const { showIfEligible } = useInterstitial();
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      showIfEligible('home_enter');
    }, 240000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return null;
}