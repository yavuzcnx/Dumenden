'use client';
// 1. BU SATIR EN ÜSTTE OLMAK ZORUNDA
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen'; // YENİ: İndirdiğin kütüphane
import { useEffect, useRef, useState } from 'react';
import { Platform, StatusBar, View } from 'react-native'; // ActivityIndicator sildik çünkü Native Splash kullanacağız
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import BottomBar from '@/components/BottomBar';
import { ensureBootstrapAndProfile } from '@/lib/bootstrap';
import { supabase } from '@/lib/supabaseClient';
import { useInterstitial } from '@/src/contexts/ads/interstitial';
import { initAds } from '@/src/contexts/lib/ads';
import { XpProvider } from '@/src/contexts/XpProvider';

// iOS'a "Biz hazır diyene kadar yükleme ekranını (Logoyu) kapatma" diyoruz.
// Bu sayede uygulama donmuş gibi gözükmüyor.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // BURASI ÇOK ÖNEMLİ: Promise.allSettled kullanıyoruz.
        // Reklam hata verse bile uygulama açılmaya devam eder.
        await Promise.allSettled([
          // Reklamları başlat (Hata olsa bile catch ile yakala, durdurma)
          initAds().catch((e) => console.warn('Ad Init Fail:', e)),

          // Session ve Bootstrap işlemleri
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
        // İşlemler bitince uygulamayı "Hazır" olarak işaretle
        setAppIsReady(true);
      }
    }

    prepare();
  }, []);

  // Uygulama hazır olduğunda Splash Screen'i yavaşça kaldır
  useEffect(() => {
    if (appIsReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [appIsReady]);

  // ✅ AUTH LISTENER (ÇAKIŞMASIZ - LOOP YOK + ADMIN YÖNLENDİRME VAR)
 useEffect(() => {
  const adminEmails = ['admin1@dumenden.com', 'admin2@dumenden.com', 'admin3@dumenden.com'];

  const isAuthRoute = (p: string) =>
    p.startsWith('/login') ||
    p.startsWith('/register') ||
    p.startsWith('/google-auth') ||
    p.startsWith('/splash');

  // ⚠️ reset-password’i auth route saymıyoruz, çünkü orada kalması lazım.
  const isResetRoute = (p: string) => p.startsWith('/reset-password');

  const getDestForUser = (email?: string) => {
    const e = (email || '').trim().toLowerCase();
    if (adminEmails.includes(e)) return '/admin/landing';
    return '/home';
  };

  const didNavRef = { current: false };

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    const u = session?.user;

    if (event === 'SIGNED_OUT') {
      didNavRef.current = false;
      // reset sayfasında da istersen login’e dönebilirsin; ben dokunmuyorum.
      if (!(pathname || '').startsWith('/login')) router.replace('/login');
      return;
    }

    // SIGNED_IN/INITIAL_SESSION -> SADECE login/register ekranındaysa yönlendir
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && u) {
      const current = pathname || '';

      // ✅ reset-password’teyken KESİNLİKLE yönlendirme yok
      if (isResetRoute(current)) return;

      // ✅ sadece login/register gibi auth sayfalarındayken yönlendir
      if (!isAuthRoute(current)) return;

      if (didNavRef.current) return;
      didNavRef.current = true;

      router.replace(getDestForUser(u.email));
    }
  });

  return () => subscription.unsubscribe();
}, [pathname]);

  // Eğer uygulama hazır değilse React tarafında boş dönüyoruz.
  // Çünkü zaten ekranda Native Splash (Senin Logon) var. Kullanıcı beyaz ekran görmüyor.
  if (!appIsReady) {
    return null;
  }

  const hideOn = ['/login', '/register', '/google-auth', '/splash', '/reset-password', '/admin'];
  const hide = hideOn.some((p) => pathname?.startsWith(p));

  return (
    <SafeAreaProvider>
      <XpProvider>
        <StatusBar barStyle="dark-content" backgroundColor="white" translucent />

        <View style={{ flex: 1, backgroundColor: 'white' }}>
          {/* SENİN BİLEŞENLERİN: NavigationWatcher ve Timer BURADA DURUYOR */}
          {/* Sadece appIsReady true olduğunda çalışıyorlar ki hata vermesinler */}
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

          {/* SENİN BİLEŞENİN: BottomBarWrapper BURADA DURUYOR */}
          {!hide && <BottomBarWrapper />}
        </View>
      </XpProvider>
    </SafeAreaProvider>
  );
}

// --- AŞAĞIDAKİ YARDIMCI FONKSİYONLARIN HEPSİ SENİN KODUNLA AYNIDIR ---

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
  // TypeScript hatasını önlemek için tip ekledik
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
