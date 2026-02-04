'use client';

import AnimatedLogo from '@/components/AnimatedLogo';
import { ensureBootstrapAndProfile } from '@/lib/bootstrap';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'expo-router';

import * as MailComposer from 'expo-mail-composer';
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
  const [forgotEmail, setForgotEmail] = useState(''); // ✅ modal input
  const [supportLoading, setSupportLoading] = useState(false); // ✅ disable/spam engel

  const adminEmails = ['admin1@dumenden.com', 'admin2@dumenden.com', 'admin3@dumenden.com'];

  // yönlendirme çakışmasını engellemek için tek sefer kilit
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
        const { data } = await supabase.auth.getSession();
        const sess = data.session;

        if (sess?.user && mounted) {
          // stale session kontrolü: getUser ile doğrula
          const { data: u } = await supabase.auth.getUser();
          if (u?.user?.id) {
            navigateBasedOnUser(sess.user.email);
            return;
          }

          // stale ise lokal temizle
          try {
            await supabase.auth.signOut({ scope: 'local' } as any);
          } catch {}
        }
      } finally {
        if (mounted) setCheckingSession(false);
      }
    };

    checkInitial();

    return () => {
      mounted = false;
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

      if (data.session) {
        await ensureBootstrapAndProfile().catch(() => {});
      }

      if (data.session?.user) {
        setBusy(false);
        navigateBasedOnUser(data.session.user.email);
      } else {
        setBusy(false);
      }
    } catch (e: any) {
      setError(e?.message || 'Beklenmedik bir hata oluştu.');
      setBusy(false);
    }
  };

  // ✅ Şifremi Unuttum -> Destek maili aç (expo-mail-composer)
  const openSupportEmail = async () => {
    const to = 'dumendenhelp@gmail.com';
    const subject = 'Dümenden – Şifre Sıfırlama Talebi';

    // ✅ modal email > login email fallback
    const knownEmail = (forgotEmail || email || '').trim();

    if (!knownEmail) {
      Alert.alert('Uyarı', 'Lütfen e-posta adresinizi girin.');
      return;
    }

    const body = `Merhaba Dümenden Destek Ekibi,

Hesabıma giriş yapamıyorum ve şifremi sıfırlamak istiyorum.

Kayıtlı e-posta adresim: ${knownEmail}
Kullanıcı adım (varsa):

Yardımcı olabilir misiniz?

Teşekkürler.`;

    try {
      setSupportLoading(true);

      const available = await MailComposer.isAvailableAsync();
      if (!available) {
        Alert.alert(
          'Mail uygulaması bulunamadı',
          `Lütfen manuel mail at:\n\nTo: ${to}\nSubject: ${subject}\n\n${body}`
        );
        return;
      }

      await MailComposer.composeAsync({
        recipients: [to],
        subject,
        body,
      });

      // ✅ modal kapansın + temizlensin
      setForgotModalVisible(false);
      setForgotEmail('');
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Mail ekranı açılamadı.');
    } finally {
      setSupportLoading(false);
    }
  };

  const closeForgotModal = () => {
    setForgotModalVisible(false);
    setForgotEmail('');
    setSupportLoading(false);
    Keyboard.dismiss();
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
            onChangeText={(t) => {
              didNavigateRef.current = false;
              setEmail(t);
            }}
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor={COLORS.placeholder}
          />

          <View style={styles.passRow}>
            <TextInput
              placeholder="Şifre"
              value={password}
              onChangeText={(t) => {
                didNavigateRef.current = false;
                setPassword(t);
              }}
              style={styles.passInput}
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
            <TouchableOpacity
              onPress={() => {
                setForgotModalVisible(true);
                // ✅ modal açılınca login email'i her seferinde bas (boşsa boş)
                setForgotEmail((email || '').trim());
              }}
            >
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

          {/* ✅ MODAL: destek yazısı + email input + mail aç */}
          <Modal visible={forgotModalVisible} transparent animationType="fade" onRequestClose={closeForgotModal}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.modalOverlay}
            >
              {/* ✅ dışarı tıklayınca klavye kapansın ama butonları yutmasın */}
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                  <View style={styles.modalBackdropTouch} />
                </TouchableWithoutFeedback>

                <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Şifrenizi mi unuttunuz?</Text>
                  <Text style={styles.modalSub}>
                    Destek ekibimizle iletişime geçerek yeni bir şifre alabilirsiniz. E-postanızı yazın, mail otomatik hazırlanacak.
                  </Text>

                  <TextInput
                    placeholder="E-posta"
                    value={forgotEmail}
                    onChangeText={setForgotEmail}
                    style={styles.input}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholderTextColor={COLORS.placeholder}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />

                  <Text style={styles.supportHint}>Destek: dumendenhelp@gmail.com</Text>

                  <TouchableOpacity
                    onPress={openSupportEmail}
                    style={[styles.supportBtn, { backgroundColor: COLORS.primary }, supportLoading && { opacity: 0.6 }]}
                    disabled={supportLoading}
                  >
                    {supportLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={[styles.supportBtnText, { color: '#fff' }]}>👉 Destekle İletişime Geç</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity onPress={closeForgotModal} style={[styles.supportBtn, { backgroundColor: '#eee' }]}>
                    <Text style={[styles.supportBtnText, { color: '#333' }]}>İptal</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
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
    marginBottom: 12,
  },

  passRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    height: 50,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  passInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 12,
    color: COLORS.text,
    backgroundColor: 'transparent',
  },
  eyeBtn: {
    height: '100%',
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },

  topRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 20 },
  button: { backgroundColor: COLORS.primary, padding: 14, borderRadius: 12, alignItems: 'center', height: 50, justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  link: { marginTop: 20, textAlign: 'center', color: COLORS.link },
  error: { color: COLORS.error, textAlign: 'center', marginBottom: 10 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalBackdropTouch: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 6 },
  modalSub: { fontSize: 13, color: '#666', marginBottom: 14, lineHeight: 18 },

  supportHint: {
    fontSize: 12,
    color: '#888',
    marginTop: -6,
    marginBottom: 6,
  },

  supportBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  supportBtnText: {
    fontWeight: '800', // ✅ renk butonda veriliyor
  },
});
