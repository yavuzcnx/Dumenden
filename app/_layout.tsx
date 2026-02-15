'use client';
// 1. BU SATIR EN ÜSTTE OLMAK ZORUNDA
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import BottomBar from '@/components/BottomBar';
import { ensureBootstrapAndProfile } from '@/lib/bootstrap';
import { I18nProvider } from '@/lib/i18n';
import { BlockProvider } from '@/lib/blocks';
import { supabase } from '@/lib/supabaseClient';
import { useInterstitial } from '@/src/contexts/ads/interstitial';
import { requestATTOnce } from '@/src/contexts/lib/att';
import { initAds } from '@/src/contexts/lib/ads';
import { XpProvider } from '@/src/contexts/XpProvider';
import { TERMS_VERSION } from '@/lib/terms';
import { useI18n } from '@/lib/i18n';

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
          (async () => {
            // ✅ BOZUK SESSION FIX: Invalid Refresh Token -> local temizle
            const { data, error } = await supabase.auth.getSession();

            if (
              error?.message?.toLowerCase().includes('invalid refresh token') ||
              error?.message?.toLowerCase().includes('refresh token not found')
            ) {
              await supabase.auth.signOut({ scope: 'local' } as any).catch(() => {});
              return;
            }

            const session = data?.session;
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
    if (!appIsReady) return;
    (async () => {
      // ✅ splash kapandıktan sonra ATT iste, sonra ads'i başlat
      await SplashScreen.hideAsync().catch(() => {});
      await requestATTOnce().catch((e) => console.warn('ATT request failed:', e));
      await initAds().catch((e) => console.warn('Ad Init Fail:', e));
    })();
  }, [appIsReady]);

  // ✅ AUTH LISTENER (reset-password akışı bozulmasın diye özel kurallar)
  useEffect(() => {
    const adminEmails = ['admin1@dumenden.com', 'admin2@dumenden.com', 'admin3@dumenden.com'];

    const isResetRoute = (p: string) => (p || '').startsWith('/reset-password');

    // sadece "login gibi" ekranlar: signed-in olunca /home'a atılabilir
    const isLoginLikeRoute = (p: string) =>
      (p || '').startsWith('/login') ||
      (p || '').startsWith('/register') ||
      (p || '').startsWith('/google-auth') ||
      (p || '').startsWith('/splash');

    // signed-out olunca login'e atmak için auth route'lar
    const isAuthRoute = (p: string) => isLoginLikeRoute(p) || isResetRoute(p);

    const getDestForUser = (email?: string) => {
      const e = (email || '').trim().toLowerCase();
      if (adminEmails.includes(e)) return '/admin/landing';
      return '/home';
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const current = pathname || '';
      const u = session?.user;

      // ✅ PASSWORD RECOVERY: reset ekranında kal / reset'e yönlendir
      if (event === 'PASSWORD_RECOVERY') {
        didNavRef.current = false;
        if (!isResetRoute(current)) {
          router.replace('/reset-password');
        }
        return;
      }

      // SIGNED_OUT: auth route'ta değilsek login’e bas
      if (event === 'SIGNED_OUT') {
        didNavRef.current = false;
        if (!isAuthRoute(current)) {
          router.replace('/login');
        }
        return;
      }

      // SIGNED_IN / INITIAL_SESSION:
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && u) {
        // ❗ reset-password ekranındayken ASLA /home’a atma
        if (isResetRoute(current)) return;

        // sadece login benzeri ekranlardayken yönlendir
        if (!isLoginLikeRoute(current)) return;

        if (didNavRef.current) return;
        didNavRef.current = true;

        // bootstrap arkaplanda
        void ensureBootstrapAndProfile().catch(() => {});
        router.replace(getDestForUser(u.email));
      }
    });

    return () => {
      try {
        subscription.unsubscribe();
      } catch {}
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
      <I18nProvider>
        <BlockProvider>
          <XpProvider>
          <StatusBar barStyle="dark-content" backgroundColor="white" translucent />

          <View style={{ flex: 1, backgroundColor: 'white' }}>
            {appIsReady && (
              <>
                <NavigationWatcher />
                <GlobalAdTimer />
              </>
            )}

            <TermsGate appReady={appIsReady} />

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
        </BlockProvider>
      </I18nProvider>
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

function TermsGate({ appReady }: { appReady: boolean }) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    if (!appReady) return;
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user?.id) {
      setVisible(false);
      return;
    }
    const { data: row } = await supabase
      .from('users')
      .select('terms_accepted, terms_version')
      .eq('id', user.id)
      .maybeSingle();
    const needs = !row?.terms_accepted || row?.terms_version !== TERMS_VERSION;
    setVisible(needs);
  }, [appReady]);

  useEffect(() => {
    check().catch(() => {});
  }, [check]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      check().catch(() => {});
    });
    return () => {
      try {
        subscription.unsubscribe();
      } catch {}
    };
  }, [check]);

  const accept = async () => {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user?.id) return;
    setBusy(true);
    try {
      await supabase
        .from('users')
        .update({
          terms_accepted: true,
          terms_version: TERMS_VERSION,
          terms_accepted_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      setVisible(false);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            width: '90%',
            maxHeight: '80%',
            backgroundColor: '#fff',
            borderRadius: 16,
            padding: 16,
          }}
        >
          <Text style={{ fontWeight: '900', fontSize: 18, color: '#111' }}>
            {t('terms.title')}
          </Text>
          <ScrollView style={{ marginTop: 10 }} showsVerticalScrollIndicator={false}>
            <Text style={{ color: '#444', lineHeight: 20 }}>{t('terms.body')}</Text>
          </ScrollView>

          <TouchableOpacity
            onPress={accept}
            disabled={busy}
            style={{
              marginTop: 14,
              backgroundColor: '#FF6B00',
              paddingVertical: 12,
              borderRadius: 12,
              alignItems: 'center',
              opacity: busy ? 0.7 : 1,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '900' }}>{t('terms.accept')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={logout}
            disabled={busy}
            style={{
              marginTop: 8,
              backgroundColor: '#F3F4F6',
              paddingVertical: 12,
              borderRadius: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#111', fontWeight: '800' }}>{t('terms.logout')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
