'use client';

import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabaseClient';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const ORANGE = '#FF6B00';
const BG = '#FFFFFF';
const TEXT = '#111111';
const MUTED = '#6B7280';
const BORDER = '#E9E9E9';

function parseParamsFromUrl(url: string) {
  const out: Record<string, string> = {};

  try {
    const u = new URL(url);
    u.searchParams.forEach((v, k) => (out[k] = v));

    if (u.hash && u.hash.startsWith('#')) {
      const hash = u.hash.slice(1);
      const sp = new URLSearchParams(hash);
      sp.forEach((v, k) => (out[k] = v));
    }
    return out;
  } catch {
    const [baseAndQuery, hashPart] = url.split('#');
    const queryPart = baseAndQuery.includes('?') ? baseAndQuery.split('?')[1] : '';
    const q = new URLSearchParams(queryPart || '');
    q.forEach((v, k) => (out[k] = v));

    if (hashPart) {
      const h = new URLSearchParams(hashPart);
      h.forEach((v, k) => (out[k] = v));
    }
    return out;
  }
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const { t } = useI18n();

  const [stage, setStage] = useState<'verifying' | 'ready' | 'error'>('verifying');
  const [err, setErr] = useState<string>('');

  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [saving, setSaving] = useState(false);

  const handledRef = useRef(false);

  const verifyFromUrl = async (url: string) => {
    console.log('🔗 Reset URL:', url);

    const p = parseParamsFromUrl(url);
    console.log('🧩 Parsed Params:', p);

    // ✅ Eğer gerekli param yoksa KİLİTLEME (yanlış/boş url gelebiliyor)
    const hasUseful = !!(
      p.code ||
      (p.access_token && p.refresh_token) ||
      p.token_hash ||
      p.token
    );
    if (!hasUseful) return;

    if (handledRef.current) return;
    handledRef.current = true;

    try {
      // 1) PKCE: ?code=...
      if (p.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(p.code);
        if (error) throw error;

        setStage('ready');
        return;
      }

      // 2) implicit: #access_token & #refresh_token
      if (p.access_token && p.refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token: p.access_token,
          refresh_token: p.refresh_token,
        });
        if (error) throw error;

        setStage('ready');
        return;
      }

      // 3) token_hash / token (custom email template -> deep link directly to app)
      if (p.token_hash || p.token) {
        const type = (p.type || 'recovery') as any;
        const payload = p.token_hash
          ? { token_hash: p.token_hash, type }
          : { token: p.token, type, email: p.email };

        const { error } = await supabase.auth.verifyOtp(payload as any);
        if (error) throw error;

        setStage('ready');
        return;
      }

      setErr(t('reset.linkInfoMissing'));
      setStage('error');
    } catch (e: any) {
      console.log('❌ Verify error:', e?.message || e);
      setErr(e?.message || t('reset.linkVerifyFail'));
      setStage('error');
    }
  };

  useEffect(() => {
    let alive = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === 'PASSWORD_RECOVERY' && session?.user) {
        handledRef.current = true;
        setStage('ready');
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (data.session?.user && stage === 'verifying') {
        handledRef.current = true;
        setStage('ready');
      }
    });

    // 1) initial url
    Linking.getInitialURL().then((url) => {
      if (!alive) return;
      if (url) verifyFromUrl(url);
    });

    // 2) runtime deep link
    const sub = Linking.addEventListener('url', (ev) => {
      if (!alive) return;
      if (ev?.url) verifyFromUrl(ev.url);
    });

    // ✅ 7sn sonra hâlâ handled olmadıysa hata ver (sonsuz spinner yok)
    const t = setTimeout(() => {
      if (!alive) return;
      if (!handledRef.current && stage === 'verifying') {
        setErr(t('reset.linkNotReached'));
        setStage('error');
      }
    }, 7000);

    return () => {
      alive = false;
      clearTimeout(t);
      try {
        subscription.unsubscribe();
      } catch {}
      // @ts-ignore
      sub?.remove?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmit = useMemo(() => pw1.length >= 8 && pw1 === pw2, [pw1, pw2]);

  const submitNewPassword = async () => {
    if (pw1.length < 8) {
      Alert.alert(t('common.warning'), t('profile.passwordTooShort'));
      return;
    }
    if (pw1 !== pw2) {
      Alert.alert(t('common.warning'), t('profile.passwordMismatch'));
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;

      Alert.alert(t('common.success'), t('reset.passwordSaved'));
      await supabase.auth.signOut().catch(() => {});
      router.replace('/login');
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('profile.passwordChangeFail'));
    } finally {
      setSaving(false);
    }
  };

  if (stage === 'verifying') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={ORANGE} />
        <Text style={styles.title}>{t('reset.verifyingTitle')}</Text>
        <Text style={styles.sub}>{t('common.pleaseWait')}</Text>
      </View>
    );
  }

  if (stage === 'error') {
    return (
      <View style={styles.center}>
        <Text style={[styles.title, { color: '#D32F2F' }]}>{t('reset.verifyErrorTitle')}</Text>
        <Text style={styles.sub}>{err || t('common.unknownError')}</Text>

        <TouchableOpacity style={[styles.btn, { marginTop: 16 }]} onPress={() => router.replace('/login')}>
          <Text style={styles.btnTxt}>{t('reset.backToLogin')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ready
  return (
    <View style={styles.wrap}>
      <Text style={styles.h1}>{t('reset.setNewPassword')}</Text>

      <TextInput
        value={pw1}
        onChangeText={setPw1}
        placeholder={t('profile.newPassword')}
        placeholderTextColor={MUTED}
        secureTextEntry
        style={styles.input}
      />
      <TextInput
        value={pw2}
        onChangeText={setPw2}
        placeholder={t('profile.newPasswordRepeat')}
        placeholderTextColor={MUTED}
        secureTextEntry
        style={styles.input}
      />

      <TouchableOpacity
        style={[styles.btn, (!canSubmit || saving) && { opacity: 0.6 }]}
        disabled={!canSubmit || saving}
        onPress={submitNewPassword}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTxt}>{t('common.save')}</Text>}
      </TouchableOpacity>

      <Text style={styles.tip}>{t('reset.tip')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', padding: 24 },
  wrap: { flex: 1, backgroundColor: BG, padding: 24, paddingTop: Platform.OS === 'ios' ? 80 : 60 },
  title: { marginTop: 14, fontSize: 18, fontWeight: '800', color: TEXT },
  sub: { marginTop: 6, fontSize: 13, color: MUTED, textAlign: 'center' },
  h1: { fontSize: 24, fontWeight: '900', color: TEXT, marginBottom: 18 },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    marginTop: 10,
    color: TEXT,
    backgroundColor: '#fff',
  },
  btn: { backgroundColor: ORANGE, borderRadius: 12, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  btnTxt: { color: '#fff', fontWeight: '900' },
  tip: { marginTop: 12, fontSize: 12, color: MUTED, lineHeight: 18 },
});
