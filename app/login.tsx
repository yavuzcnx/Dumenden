'use client';

import AnimatedLogo from '@/components/AnimatedLogo';
import { ensureBootstrapAndProfile } from '@/lib/bootstrap';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
  View,
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
  const [checkingSession, setCheckingSession] = useState(true);

  const [showPassword, setShowPassword] = useState(false);

  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const adminEmails = ['admin1@dumenden.com', 'admin2@dumenden.com', 'admin3@dumenden.com'];

  // ✅ yönlendirme çakışmasını engellemek için tek sefer kilit
  const didNavigateRef = useRef(false);

  const navigateBasedOnUser = (userEmail: string | undefined) => {
    if (didNavigateRef.current) return;
    didNavigateRef.current = true;

    const e = (userEmail || '').trim().toLowerCase();
    if (adminEmails.includes(e)) {
      router.replace('/admin/landing');
    } else {
      router.replace('/home');
    }
  };

  useEffect(() => {
    let mounted = true;

    const checkInitial = async () => {
      try {
        // 1) Session var mı?
        const { data } = await supabase.auth.getSession();
        const sess = data.session;

        if (sess?.user && mounted) {
          // 2) ✅ STALE SESSION KONTROLÜ
          // getSession bazı edge durumlarda eski session döndürebilir.
          // getUser ile doğrulayalım:
          const { data: u } = await supabase.auth.getUser();
          if (u?.user?.id) {
            navigateBasedOnUser(sess.user.email);
            return;
          }

          // getUser yoksa: session stale → lokal temizle, login'de kal
          try {
            await supabase.auth.signOut({ scope: 'local' } as any);
          } catch {}
        }
      } finally {
        if (mounted) setCheckingSession(false);
      }
    };

    checkInitial();

    // ✅ SIGNED_IN olayı gelirse tek sefer yönlendir
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_IN' && session?.user) {
        setBusy(false);
        navigateBasedOnUser(session.user.email);
      }

      // logout’tan sonra login’de kaldığımızı garanti etmek istersen:
      if (event === 'SIGNED_OUT') {
        didNavigateRef.current = false;
        setBusy(false);
      }
    });

    return () => {
      mounted = false;
      try {
        authListener.subscription.unsubscribe();
      } catch {}
    };
  }, []);

  const handleLogin = async () => {
    setError('');
    Keyboard.dismiss();

    if (!email || !password) {
      setError('E-posta ve şifre gir.');
      return;
    }

    setBusy(true);

    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (loginError) {
        setError(loginError.message);
        setBusy(false);
        return;
      }

      // Session geldiyse bootstrap’i bekletebiliriz (çok uzarsa UI dönüyor gibi olur)
      if (data.session) {
        await ensureBootstrapAndProfile().catch(() => {});
      }

      // ✅ KRİTİK: Listener gelmezse bile asla sonsuz dönmesin
      // Ayrıca yönlendirme çakışmasını didNavigateRef engelliyor.
      if (data.session?.user) {
        setBusy(false);
        navigateBasedOnUser(data.session.user.email);
      } else {
        // Çok nadir: session yoksa busy kapat
        setBusy(false);
      }
    } catch (e: any) {
      setError(e?.message || 'Beklenmedik bir hata oluştu.');
      setBusy(false);
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

      Alert.alert('Başarılı', 'Sıfırlama bağlantısı gönderildi.');
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

          <View style={styles.passRow}>
            <TextInput
              placeholder="Şifre"
              value={password}
              onChangeText={setPassword}
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              secureTextEntry={!showPassword}
              placeholderTextColor={COLORS.placeholder}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
              <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 12 }}>
                {showPassword ? 'GİZLE' : 'GÖSTER'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginBottom: 14 }} />

          <View style={styles.topRow}>
            <TouchableOpacity onPress={() => setForgotModalVisible(true)}>
              <Text style={{ color: '#666', fontWeight: '400' }}>Şifremi Unuttum?</Text>
            </TouchableOpacity>
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity style={[styles.button, busy && { opacity: 0.6 }]} onPress={handleLogin} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Giriş Yap</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/register')}>
            <Text style={styles.link}>Hesabın yok mu? Kayıt Ol</Text>
          </TouchableOpacity>

          <Modal visible={forgotModalVisible} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Şifre Sıfırlama</Text>
                <Text style={styles.modalSub}>E-postanı gir, sana sıfırlama linki gönderelim.</Text>

                <TextInput
                  placeholder="E-posta"
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  style={styles.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor={COLORS.placeholder}
                />

                <View style={styles.modalBtns}>
                  <TouchableOpacity
                    onPress={() => setForgotModalVisible(false)}
                    style={[styles.modalBtn, { backgroundColor: '#eee' }]}
                  >
                    <Text style={{ color: '#333', fontWeight: '700' }}>İptal</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleResetPassword}
                    style={[styles.modalBtn, { backgroundColor: COLORS.primary }]}
                    disabled={forgotLoading}
                  >
                    {forgotLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Gönder</Text>}
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
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  wrapper: { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, color: COLORS.text },

  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: '#fff',
    height: 50,
  },

  passRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingRight: 12,
    height: 50,
    marginBottom: 0,
  },
  eyeBtn: { padding: 4 },

  topRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 20 },
  button: { backgroundColor: COLORS.primary, padding: 14, borderRadius: 12, alignItems: 'center', height: 50, justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  link: { marginTop: 20, textAlign: 'center', color: COLORS.link },
  error: { color: COLORS.error, textAlign: 'center', marginBottom: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 6 },
  modalSub: { fontSize: 13, color: '#666', marginBottom: 20 },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, minWidth: 80, alignItems: 'center' },
});
