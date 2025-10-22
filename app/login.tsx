// app/login.tsx
'use client';

import AnimatedLogo from '@/components/AnimatedLogo';
import { ensureBootstrapAndProfile } from '@/lib/bootstrap';
import { supabase } from '@/lib/supabaseClient';
import { AntDesign } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text,
  TextInput, TouchableOpacity, TouchableWithoutFeedback, View
} from 'react-native';

export default function LoginPage() {
  const router = useRouter();
  const logoRef = useRef<any>(null);

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);

  const adminEmails = ['admin1@dumenden.com', 'admin2@dumenden.com', 'admin3@dumenden.com'];

  const handleLogin = async () => {
    setError('');
    setBusy(true);

    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    if (loginError) {
      setError(loginError.message);
      setBusy(false);
      return;
    }

    // ✅ KESİN: users/xp_wallets kur → existing değerleri asla ezme
    try { await ensureBootstrapAndProfile(); } catch (e) { console.warn(e); }

    setBusy(false);

    const userEmail = data.session?.user?.email || '';
    if (adminEmails.includes(userEmail)) {
      router.replace('/admin/landing');
    } else {
      router.replace('/home');
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.wrapper}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          <AnimatedLogo ref={logoRef} />
          <Text style={styles.title}>Giriş Yap</Text>

          <TextInput
            placeholder="E-posta"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            placeholder="Şifre"
            value={password}
            onChangeText={setPassword}
            style={styles.input}
            secureTextEntry
          />

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity style={[styles.button, busy && { opacity: 0.6 }]} onPress={handleLogin} disabled={busy}>
            <Text style={styles.buttonText}>{busy ? 'Giriş yapılıyor…' : 'Giriş Yap'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.googleButton} onPress={() => { /* TODO */ }}>
            <AntDesign name="google" size={20} color="#444" style={{ marginRight: 8 }} />
            <Text style={styles.googleText}>Google ile Giriş Yap</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/register')}>
            <Text style={styles.link}>Hesabın yok mu? Kayıt Ol</Text>
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 16, backgroundColor: '#f9f9f9' },
  button: { backgroundColor: '#FF6B00', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  link: { marginTop: 20, textAlign: 'center', color: '#0066cc', fontSize: 14 },
  error: { color: 'red', textAlign: 'center', marginBottom: 10 },
  googleButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderColor: '#ccc', borderWidth: 1, padding: 12, borderRadius: 12, marginTop: 16 },
  googleText: { color: '#444', fontSize: 15, fontWeight: '500' },
});
