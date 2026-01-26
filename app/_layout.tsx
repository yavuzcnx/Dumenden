'use client';


import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import BottomBar from '@/components/BottomBar';
import { supabase } from '@/lib/supabaseClient';
import { XpProvider } from '@/src/contexts/XpProvider';
import { Stack, usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, StatusBar, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

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
    
    // 1. İLK OTURUM KONTROLÜ
    (async () => {
      if (didInit.current) return;
      didInit.current = true;
      try {
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

    // 🔥 2. MERKEZİ YÖNLENDİRME SİSTEMİ
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

  if (!adsInitDone) {
    return <View style={{ flex: 1, backgroundColor: 'white' }} />;
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
        } catch {}
      })();
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
      showIfEligible("home_enter");
    }, 240000); 

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return null;
}