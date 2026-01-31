'use client';

import { supabase } from '@/lib/supabaseClient';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const COLORS = {
  bg: '#FFFFFF',
  text: '#111111',
  sub: '#666666',
  border: '#E0E0E0',
  primary: '#FF6B00',
  error: '#D32F2F',
};

function parseParamsFromUrl(rawUrl: string) {
  // Supabase bazen #access_token=... şeklinde döner.
  // URLSearchParams sadece ? ile daha rahat parse eder.
  let url = rawUrl;

  const hashIndex = url.indexOf('#');
  if (hashIndex !== -1) {
    url = url.slice(0, hashIndex) + '?' + url.slice(hashIndex + 1);
  }

  const qIndex = url.indexOf('?');
  const query = qIndex !== -1 ? url.slice(qIndex + 1) : '';
  const sp = new URLSearchParams(query);

  const obj: Record<string, string> = {};
  sp.forEach((v, k) => (obj[k] = v));
  return obj;
}

export default function ResetPasswordPage() {
  const router = useRouter();

  const [phase, setPhase] = useState<'checking' | 'ready' | 'error'>('checking');
  const [msg, setMsg] = useState('Link doğrulanıyor...');
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
  const [busy, setBusy] = useState(false);

  // iOS/Android initial URL + runtime URL yakalama
  useEffect(() => {
    let sub: any;

    const handle = async (url: string) => {
      try {
        setPhase('checking');
        setMsg('Link doğrulanıyor...');

        const p = parseParamsFromUrl(url);

        // Hata paramı gelirse göster
        if (p.error || p.error_description) {
          setPhase('error');
          setMsg(p.error_description || p.error || 'Link doğrulanamadı.');
          return;
        }

        // 1) access_token + refresh_token geldiyse: direkt session set et
        if (p.access_token && p.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: p.access_token,
            refresh_token: p.refresh_token,
          });
          if (error) throw error;

          setPhase('ready');
          setMsg('Yeni şifreyi belirle.');
          return;
        }

        // 2) code geldiyse (PKCE akışı): exchangeCodeForSession
        if (p.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(p.code);
          if (error) throw error;

          setPhase('ready');
          setMsg('Yeni şifreyi belirle.');
          return;
        }

        // 3) Hiçbir şey gelmediyse: belki session zaten var mı diye bak
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setPhase('ready');
          setMsg('Yeni şifreyi belirle.');
          return;
        }

        setPhase('error');
        setMsg('Token bulunamadı. Lütfen maildeki linki tekrar aç.');
      } catch (e: any) {
        setPhase('error');
        setMsg(e?.message || 'Doğrulama sırasında hata oluştu.');
      }
    };

    (async () => {
      const initial = await Linking.getInitialURL();
      if (initial) await handle(initial);

      sub = Linking.addEventListener('url', ({ url }) => {
        handle(url);
      });
    })();

    return () => {
      sub?.remove?.();
    };
  }, []);

  const submit = async () => {
    if (busy) return;

    if (!newPass || newPass.length < 6) {
      Alert.alert('Hata', 'Şifre en az 6 karakter olmalı.');
      return;
    }
    if (newPass !== newPass2) {
      Alert.alert('Hata', 'Şifreler aynı değil.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw error;

      Alert.alert('Başarılı', 'Şifren güncellendi. Lütfen tekrar giriş yap.');
      // Güvenli: reset sonrası signOut + login
      await supabase.auth.signOut().catch(() => {});
      router.replace('/login');
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Şifre güncellenemedi.');
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'checking') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.sub}>{msg}</Text>
        <TouchableOpacity onPress={() => router.replace('/login')} style={{ marginTop: 18 }}>
          <Text style={{ color: COLORS.primary, fontWeight: '800' }}>Giriş Ekranına Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={styles.center}>
        <Text style={[styles.sub, { color: COLORS.error, fontWeight: '700' }]}>{msg}</Text>
        <TouchableOpacity onPress={() => router.replace('/login')} style={{ marginTop: 18 }}>
          <Text style={{ color: COLORS.primary, fontWeight: '800' }}>Giriş Ekranına Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ready
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>Yeni Şifre Belirle</Text>
        <Text style={styles.sub}>Yeni şifreni gir ve kaydet.</Text>

        <TextInput
          value={newPass}
          onChangeText={setNewPass}
          placeholder="Yeni şifre"
          secureTextEntry
          style={styles.input}
          placeholderTextColor="#999"
        />
        <TextInput
          value={newPass2}
          onChangeText={setNewPass2}
          placeholder="Yeni şifre (tekrar)"
          secureTextEntry
          style={styles.input}
          placeholderTextColor="#999"
        />

        <TouchableOpacity style={[styles.btn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Kaydet</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.replace('/login')} style={{ marginTop: 14 }}>
          <Text style={{ textAlign: 'center', color: COLORS.primary, fontWeight: '800' }}>Giriş Ekranına Dön</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', padding: 20 },
  center: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.text, textAlign: 'center', marginBottom: 10 },
  sub: { fontSize: 14, color: COLORS.sub, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 12, marginTop: 12, height: 50, color: COLORS.text },
  btn: { backgroundColor: COLORS.primary, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 16 },
});
