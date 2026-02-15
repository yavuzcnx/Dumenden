import { ensureBootstrapAndProfile } from '@/lib/bootstrap';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

export default function GoogleAuthCallback() {
  const router = useRouter();
  const didNavigateRef = useRef(false);
  const { t } = useI18n();

  useEffect(() => {
    let mounted = true;

    const goHomeIfSession = async () => {
      if (!mounted || didNavigateRef.current) return;

      // 1) Session kontrol
      const { data } = await supabase.auth.getSession();
      const sess = data.session;

      // 2) getUser ile doğrula (stale olmasın)
      if (sess?.user) {
        const { data: u } = await supabase.auth.getUser();
        if (!u?.user?.id) return;

        // bootstrap
        await ensureBootstrapAndProfile().catch(() => {});

        if (!mounted || didNavigateRef.current) return;
        didNavigateRef.current = true;
        router.replace('/home');
      }
    };

    // 10 saniyeye kadar kısa aralıklarla dene
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      await goHomeIfSession();

      if (didNavigateRef.current || tries >= 20) {
        clearInterval(timer);
        if (!didNavigateRef.current) {
          // olmadıysa login’e dön (kullanıcı takılı kalmasın)
          router.replace('/login');
        }
      }
    }, 500);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
      <ActivityIndicator size="large" color="#FF6B00" />
      <Text style={{ marginTop: 20, color: '#444', fontWeight: '500' }}>{t('auth.googleConnecting')}</Text>
      <Text style={{ marginTop: 5, color: '#999', fontSize: 12 }}>{t('common.pleaseWait')}</Text>
    </View>
  );
}
