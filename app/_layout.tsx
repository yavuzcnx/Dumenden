'use client';

// 1. BU SATIR EN ÜSTTE OLMAK ZORUNDA - TestFlight çökmesini engeller
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import BottomBar from '@/components/BottomBar';
import { supabase } from '@/lib/supabaseClient';
import { XpProvider } from '@/src/contexts/XpProvider';
import { Stack, usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StatusBar, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ensureBootstrapAndProfile } from '@/lib/bootstrap';
import { useInterstitial } from '@/src/contexts/ads/interstitial';
import { initAds } from '@/src/contexts/lib/ads';

export default function RootLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const didInit = useRef(false);
  
  // Uygulamanın tamamen hazır olup olmadığını takip eder
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function initializeApp() {
      try {
        // 1. Reklamları başlat (Hata alsa bile devam etmesi için catch ekledik)
        await initAds().catch((err) => console.warn("Ads Init Error:", err));

        // 2. İlk Oturum Kontrolü (Sadece bir kez çalışır)
        if (!didInit.current) {
          didInit.current = true;
          const { data: { session }, error } = await supabase.auth.getSession();
          if (!error && session?.user) {
            await ensureBootstrapAndProfile().catch(console.warn);
          }
        }
      } catch (e) {
        console.warn("Global Init Error:", e);
      } finally {
        if (mounted) setIsReady(true);
      }
    }

    initializeApp();

    // 3. Merkezi Yönlendirme Sistemi (Auth Listener)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        router.replace('/login');
      } else if (event === 'SIGNED_IN' && session) {
        router.replace('/');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const hideOn = ['/login', '/register', '/google-auth', '/splash', '/reset-password', '/admin'];
  const hide = hideOn.some((p) => pathname?.startsWith(p));

  // ÖNEMLİ: Boş View yerine ActivityIndicator döndürüyoruz. 
  // iOS SpringBoard'un sahneyi "invalid" sayıp kapatmasını engeller.
  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <XpProvider>
        <StatusBar barStyle="dark-content" backgroundColor="white" translucent />
        
        <View style={{ flex: 1, backgroundColor: 'white' }}>
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
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="(modals)"
              options={{ presentation: 'modal', animation: 'fade_from_bottom' }}
            />
          </Stack>

          {!hide && (
            <BottomBarWrapper />
          )}
        </View>
      </XpProvider>
    </SafeAreaProvider>
  );
}

// Orijinal BottomBar Wrapper sistemin
function BottomBarWrapper() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ 
      backgroundColor: 'white', 
      paddingBottom: Platform.OS === 'ios' ? 0 : 0 
    }}>
      <BottomBar />
    </View>
  );
}

// Orijinal Reklam İzleyici sistemin
function NavigationWatcher() {
  const pathname = usePathname();
  // Tipini <string | null> olarak belirterek TS'yi sakinleştiriyoruz
  const prevPathRef = useRef<string | null>(null); 
  const { registerNavTransition, showIfEligible } = useInterstitial();

  useEffect(() => {
    if (prevPathRef.current !== null && prevPathRef.current !== pathname) {
      (async () => {
        try {
          await registerNavTransition();
          await showIfEligible("nav");
        } catch {}
      })();
    }
    prevPathRef.current = pathname || null;
  }, [pathname]);

  return null;
}

// Orijinal Global Reklam Zamanlayıcı sistemin
function GlobalAdTimer() {
  const { showIfEligible } = useInterstitial();
  // setInterval'ın döndürdüğü tipi (NodeJS.Timeout veya number) kabul etmesi için tip ekliyoruz
  const intervalRef = useRef<any>(null); 

  useEffect(() => {
    // Burada atama yaparken artık hata vermeyecek
    intervalRef.current = setInterval(() => {
      showIfEligible("home_enter");
    }, 240000); 

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return null;
}