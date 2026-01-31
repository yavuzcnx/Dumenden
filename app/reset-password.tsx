'use client';

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
    const hasUseful = !!(p.code || (p.access_token && p.refresh_token));
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

      setErr('Link içinden doğrulama bilgisi alınamadı.');
      setStage('error');
    } catch (e: any) {
      console.log('❌ Verify error:', e?.message || e);
      setErr(e?.message || 'Link doğrulanamadı.');
      setStage('error');
    }
  };

  useEffect(() => {
    let alive = true;

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
        setErr('Reset linki uygulamaya ulaşmadı. Mail içindeki linki Safari/Apple Mail ile açmayı dene.');
        setStage('error');
      }
    }, 7000);

    return () => {
      alive = false;
      clearTimeout(t);
      // @ts-ignore
      sub?.remove?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmit = useMemo(() => pw1.length >= 8 && pw1 === pw2, [pw1, pw2]);

  const submitNewPassword = async () => {
    if (pw1.length < 8) {
      Alert.alert('Uyarı', 'Şifre en az 8 karakter olmalı.');
      return;
    }
    if (pw1 !== pw2) {
      Alert.alert('Uyarı', 'Şifreler uyuşmuyor.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;

      Alert.alert('Başarılı', 'Yeni şifren kaydedildi. Giriş ekranına yönlendiriliyorsun.');
      await supabase.auth.signOut().catch(() => {});
      router.replace('/login');
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Şifre değiştirilemedi.');
    } finally {
      setSaving(false);
    }
  };

  if (stage === 'verifying') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={ORANGE} />
        <Text style={styles.title}>Link doğrulanıyor…</Text>
        <Text style={styles.sub}>Lütfen bekle</Text>
      </View>
    );
  }

  if (stage === 'error') {
    return (
      <View style={styles.center}>
        <Text style={[styles.title, { color: '#D32F2F' }]}>Doğrulama Hatası</Text>
        <Text style={styles.sub}>{err || 'Bir hata oluştu.'}</Text>

        <TouchableOpacity style={[styles.btn, { marginTop: 16 }]} onPress={() => router.replace('/login')}>
          <Text style={styles.btnTxt}>Girişe Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ready
  return (
    <View style={styles.wrap}>
      <Text style={styles.h1}>Yeni Şifre Belirle</Text>

      <TextInput
        value={pw1}
        onChangeText={setPw1}
        placeholder="Yeni şifre (min 8)"
        placeholderTextColor={MUTED}
        secureTextEntry
        style={styles.input}
      />
      <TextInput
        value={pw2}
        onChangeText={setPw2}
        placeholder="Yeni şifre (tekrar)"
        placeholderTextColor={MUTED}
        secureTextEntry
        style={styles.input}
      />

      <TouchableOpacity
        style={[styles.btn, (!canSubmit || saving) && { opacity: 0.6 }]}
        disabled={!canSubmit || saving}
        onPress={submitNewPassword}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTxt}>Kaydet</Text>}
      </TouchableOpacity>

      <Text style={styles.tip}>
        Not: Maili Gmail içinden açınca bazen app’e düşmüyor. Safari/Apple Mail ile açmayı dene.
      </Text>
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
