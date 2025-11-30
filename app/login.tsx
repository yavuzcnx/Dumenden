'use client';

import AnimatedLogo from '@/components/AnimatedLogo';
import { ensureBootstrapAndProfile } from '@/lib/bootstrap';
import { supabase } from '@/lib/supabaseClient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';

const COLORS = {
  bg: '#FFFFFF',
  text: '#111111',
  sub: '#333333',
  inputBg: '#FFFFFF',
  border: '#E0E0E0',
  placeholder: '#9AA0A6',
  primary: '#FF6B00',
  link: '#0066CC',
  error: '#D32F2F',
};

export default function LoginPage() {
  const router = useRouter();
  const logoRef = useRef<any>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [checkingSession, setCheckingSession] = useState(true); // Başlangıçta true

  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const adminEmails = ['admin1@dumenden.com', 'admin2@dumenden.com', 'admin3@dumenden.com'];

  const navigateBasedOnUser = (userEmail: string | undefined) => {
      const e = (userEmail || '').trim().toLowerCase();
      if (adminEmails.includes(e)) {
          router.replace('/admin/landing');
      } else {
          router.replace('/home');
      }
  };

  // 🔥 LOOP ÇÖZÜMÜ: Ekran her odaklandığında kontrol et
  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      setCheckingSession(true);
      setError('');
      setBusy(false);

      const check = async () => {
        // 2 Saniye zaman aşımı (Takılmayı önler)
        const timer = setTimeout(() => {
            if(isActive) setCheckingSession(false);
        }, 2000);

        const { data } = await supabase.auth.getSession();
        clearTimeout(timer);
        
        if (!isActive) return;

        if (data.session) {
           navigateBasedOnUser(data.session.user.email);
        } else {
           setCheckingSession(false);
        }
      };
      
      check();
      return () => { isActive = false; };
    }, [])
  );

  const handleLogin = async () => {
    setError('');
    if (!email || !password) {
      setError('E-posta ve şifre gir.');
      return;
    }
    setBusy(true);
    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (loginError) {
      setError(loginError.message);
      setBusy(false);
      return;
    }

    if (data.session) {
        try { await ensureBootstrapAndProfile(); } catch {}
        navigateBasedOnUser(data.session.user.email);
    }
  };

  const handleResetPassword = async () => {
    if (!forgotEmail) {
      Alert.alert('Uyarı', 'Lütfen e-posta adresinizi girin.');
      return;
    }
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
         redirectTo: 'dumenden://reset-password',
      });

      if (error) throw error;
      Alert.alert('Başarılı', 'Şifre sıfırlama bağlantısı e-posta adresine gönderildi.');
      setForgotModalVisible(false);
      setForgotEmail('');
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Sıfırlama maili gönderilemedi.');
    } finally {
      setForgotLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

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
            placeholderTextColor={COLORS.placeholder}
          />

          <TextInput
            placeholder="Şifre"
            value={password}
            onChangeText={setPassword}
            style={styles.input}
            secureTextEntry={!showPassword}
            placeholderTextColor={COLORS.placeholder}
          />

          <View style={styles.topRow}>
            <TouchableOpacity onPress={() => setForgotModalVisible(true)}>
              <Text style={[styles.showPwdText, { color: '#666', fontWeight: '400' }]}>Şifremi Unuttum?</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)} activeOpacity={0.8}>
              <Text style={styles.showPwdText}>{showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}</Text>
            </TouchableOpacity>
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity style={[styles.button, busy && { opacity: 0.6 }]} onPress={handleLogin} disabled={busy}>
            <Text style={styles.buttonText}>{busy ? 'Giriş yapılıyor...' : 'Giriş Yap'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/register')}>
            <Text style={styles.link}>Hesabın yok mu? Kayıt Ol</Text>
          </TouchableOpacity>

          <Modal visible={forgotModalVisible} transparent animationType="fade" onRequestClose={() => setForgotModalVisible(false)}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Şifre Sıfırlama</Text>
                <Text style={styles.modalSub}>Kayıtlı e-posta adresini gir, sana sıfırlama bağlantısı gönderelim.</Text>
                <TextInput placeholder="E-posta adresi" value={forgotEmail} onChangeText={setForgotEmail} style={styles.input} keyboardType="email-address" autoCapitalize="none" placeholderTextColor={COLORS.placeholder} />
                <View style={styles.modalBtns}>
                  <TouchableOpacity onPress={() => setForgotModalVisible(false)} style={[styles.modalBtn, { backgroundColor: '#f3f4f6' }]}>
                    <Text style={[styles.modalBtnText, { color: '#333' }]}>İptal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleResetPassword} disabled={forgotLoading} style={[styles.modalBtn, { backgroundColor: COLORS.primary }]}>
                    {forgotLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[styles.modalBtnText, { color: '#fff' }]}>Gönder</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  wrapper: { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: COLORS.bg },
  title: { fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, color: COLORS.text },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 16, backgroundColor: COLORS.inputBg, color: COLORS.text },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  showPwdText: { color: COLORS.primary, fontSize: 14, fontWeight: '600' },
  button: { backgroundColor: COLORS.primary, padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  link: { marginTop: 20, textAlign: 'center', color: COLORS.link, fontSize: 14 },
  error: { color: COLORS.error, textAlign: 'center', marginBottom: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 8, color: '#111' },
  modalSub: { color: '#666', marginBottom: 16, lineHeight: 20 },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 10 },
  modalBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, minWidth: 80, alignItems: 'center' },
  modalBtnText: { fontWeight: '700' },
});