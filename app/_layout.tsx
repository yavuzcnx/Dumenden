// app/_layout.tsx
if (__DEV__) {
  require('@/lib/dev/noRawTextGuard');
}

import BottomBar from '@/components/BottomBar';
import { supabase } from '@/lib/supabaseClient';
import { XpProvider } from '@/src/contexts/XpProvider';
import { Stack, usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const didInit = useRef(false);

  // ——— auth guard ———
  useEffect(() => {
    let mounted = true;

    (async () => {
      if (didInit.current) return;
      didInit.current = true;

      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      const isAuthed = !!session?.user;
      const onAuthScreen =
        pathname?.startsWith('/login') || pathname?.startsWith('/register');

      if (isAuthed && onAuthScreen) router.replace('/home');
      else if (!isAuthed && !onAuthScreen) router.replace('/login');
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        if (!pathname?.startsWith('/home')) router.replace('/home');
      }
      if (event === 'SIGNED_OUT') {
        if (!pathname?.startsWith('/login')) router.replace('/login');
      }
    });

    return () => {
      try { sub.subscription.unsubscribe(); } catch {}
    };
  }, [pathname, router]);

  // BottomBar’ı gizleyeceğin rotalar
  const hideOn = [
    '/login','/register','/splash','/(modals)/create',
    '/(modals)/plus-paywall','/admin','/edit-coupons'
  ];
  const hide = hideOn.some((p) => pathname?.startsWith(p));

  return (
    <SafeAreaProvider>
      <XpProvider>
        <View style={{ flex: 1 }}>
          {/* ——— Native Stack: iOS swipe-back burada çalışır ——— */}
          <Stack
            screenOptions={{
              headerShown: false,
              gestureEnabled: true,
              // iOS: kenarın tamamından geri çek
              fullScreenGestureEnabled: Platform.OS === 'ios',
              // iOS yatay gesture, Android için hoş bir varsayılan animasyon
              gestureDirection: 'horizontal',
              animation:
                Platform.OS === 'ios' ? 'slide_from_right' : 'fade_from_bottom',
            }}
          >
            {/* Modalların iOS tarzı açılması için (grup adı klasörün) */}
            <Stack.Screen
              name="(modals)"
              options={{ presentation: 'modal', animation: 'fade_from_bottom' }}
            />
            {/* Diğer ekranlar otomatik olarak eklenecek; ekstra belirtmen gerekmiyor */}
          </Stack>

          {!hide && <BottomBar />}
        </View>
      </XpProvider>
    </SafeAreaProvider>
  );
}
