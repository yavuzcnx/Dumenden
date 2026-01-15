'use client';

import { supabase } from '@/lib/supabaseClient';
import { AntDesign } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
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
  valid: '#2E7D32',
  invalid: '#888888',
};

const CONSENT_VERSION = '2025-10-16';

const TEXT_KVKK = `
DÜMENDEN – KVKK AYDINLATMA METNİ
Son Güncelleme: 16 Ekim 2025

Veri Sorumlusu: Dümenden Uygulaması
Adres: Fenerbahçe, Iğrıp Sk. No:13, 34726 Kadıköy / İstanbul
E-posta: dumenden.app@gmail.com

1. İşlenen Veriler:
- Kimlik & İletişim: Ad, soyad, e-posta, telefon
- Hesap: Kullanıcı ID, XP puanı, abonelik bilgileri
- İçerik: Kupon başlıkları, tahminler, yorumlar, yüklenen görseller/kanıtlar
- Teknik: IP, cihaz bilgisi, işlem logları
- Analitik: Kullanım istatistikleri, moderasyon kayıtları

2. Amaçlar:
Üyelik ve hesap yönetimi; kupon oluşturma/tahmin/kanıt yükleme; XP/ödül süreçleri; topluluk kuralları moderasyonu; kullanıcı deneyimi/analitik; yasal yükümlülükler.

3. Aktarım:
Yalnızca hizmet sağlayıcılar ve kanunen yetkili mercilerle sınırlıdır; yurtdışına aktarım yapılmaz.

4. Saklama:
Amaç ve mevzuatla sınırlı süreler boyunca saklanır; süre bitiminde silinir/yok edilir/anonimleştirilir.

5. Haklar:
KVKK m.11 uyarınca bilgi talebi, düzeltme/silme, itiraz vb. haklarınızı dumenden.app@gmail.com adresine yazılı başvurarak kullanabilirsiniz.

6. Sorumluluk Reddi:
Kullanıcı içerikleri (kuponlar, tahminler, görseller) kullanıcı sorumluluğundadır. Admin onayı verilmiş olsa dahi içeriklerin doğruluğu/gerçekliği Dümenden’in taahhüdü değildir.
`;

const TEXT_CONSENT = `
DÜMENDEN – AÇIK RIZA METNİ
Son Güncelleme: 16 Ekim 2025

KVKK uyarınca; kimlik/iletişim, hesap, içerik, teknik ve analitik verilerimin; üyelik ve uygulama fonksiyonlarının sağlanması, moderasyon ve yasal yükümlülüklerin yerine getirilmesi, ödül/XP süreçlerinin yürütülmesi ve kullanıcı deneyiminin geliştirilmesi amaçlarıyla işlenmesine, bu kapsamda sınırlı olarak hizmet sağlayıcılarla paylaşılmasına ve kanuni süreler boyunca saklanmasına AÇIK RIZA veriyorum.

Veri Sorumlusu: Dümenden Uygulaması
Adres: Fenerbahçe, Iğrıp Sk. No:13, 34726 Kadıköy / İstanbul
E-posta: dumenden.app@gmail.com
`;

async function sha256(s: string) {
  return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);
}

export default function RegisterPage() {
  const router = useRouter();

  // form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');

  // ui
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<null | 'verify'>(null);

  // password rules
  const [rules, setRules] = useState({
    length: false,
    upper: false,
    lower: false,
    number: false,
    special: false,
  });

  // KVKK & Açık Rıza
  const [acceptKvkk, setAcceptKvkk] = useState(false);
  const [acceptConsent, setAcceptConsent] = useState(false);
  const [showKvkk, setShowKvkk] = useState(false);
  const [showConsent, setShowConsent] = useState(false);

  useEffect(() => {
    setRules({
      length: password.length >= 8,
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
    });
  }, [password]);

  const formatBirthDate = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    let formatted = cleaned;
    if (cleaned.length > 4) formatted = cleaned.slice(0, 4) + '.' + cleaned.slice(4);
    if (cleaned.length > 6) formatted = formatted.slice(0, 7) + '.' + cleaned.slice(6, 8);
    setBirthDate(formatted);
  };

  const canSubmit = useMemo(() => {
    const pwdOk = rules.length && rules.upper && rules.lower && rules.number && rules.special;
    return pwdOk && acceptKvkk && acceptConsent;
  }, [rules, acceptKvkk, acceptConsent]);

  const handleRegister = async () => {
    setError('');
    if (password !== confirmPassword) {
      setError('Şifreler uyuşmuyor.');
      return;
    }
    if (!acceptKvkk || !acceptConsent) {
      setError('Devam etmek için KVKK ve Açık Rıza onaylarını vermelisin.');
      return;
    }

    const consentAt = new Date().toISOString();
    const kvkkHash = await sha256(TEXT_KVKK.trim());
    const explicitHash = await sha256(TEXT_CONSENT.trim());
    const userAgentLike = `${Constants?.appOwnership || 'expo'}/${Constants?.nativeAppVersion || '1.0.0'} (${Platform.OS} ${Platform.Version})`;

    // Auth kaydı (emailRedirectTo opsiyonel, Supabase panelinden de yönetilebilir)
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Paneldeki Redirect URL listesinde ne varsa aynısı olmalı
        emailRedirectTo: 'dumenden://login', 
        data: {
          full_name: fullName || null,
          phone_number: phone || null,
          birth_date: birthDate || null,

          kvkk_consent: true,
          kvkk_consent_version: CONSENT_VERSION,
          kvkk_consent_at: consentAt,
          explicit_consent: true,
          explicit_consent_version: CONSENT_VERSION,
          explicit_consent_at: consentAt,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    // 3) Fallback (Draft kaydı)
    try {
      await AsyncStorage.setItem(
        `registerDraft:${email.toLowerCase()}`,
        JSON.stringify({
          full_name: fullName || null,
          phone_number: phone || null,
          birth_date: birthDate || null,
          kvkk_consent: true,
          kvkk_consent_version: CONSENT_VERSION,
          kvkk_consent_at: consentAt,
          explicit_consent: true,
          explicit_consent_version: CONSENT_VERSION,
          explicit_consent_at: consentAt,
        })
      );

      await AsyncStorage.setItem(
        `consentDraft:${email.toLowerCase()}`,
        JSON.stringify({
          email: email.toLowerCase(),
          version: CONSENT_VERSION,
          consent_at: consentAt,
          kvkk: true,
          explicit: true,
          text_kvkk_hash: kvkkHash,
          text_explicit_hash: explicitHash,
          user_agent: userAgentLike,
        })
      );
    } catch {}

    setSuccess('verify');
    setTimeout(() => router.replace('/login'), 2000);
  };

  // GOOGLE REGISTER FONKSİYONU KALDIRILDI

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.wrapper}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={styles.scrollInner}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            <Image source={require('../assets/images/logo.png')} style={styles.logo} />
            <Text style={styles.title}>Kayıt Ol</Text>

            {success === 'verify' ? (
              <View style={styles.notice}>
                <Text style={styles.noticeTitle}>E-postanı onayla</Text>
                <Text style={styles.noticeText}>
                  Kayıt oluşturuldu. Mailini onayla; birazdan giriş ekranına gideceksin.
                </Text>
              </View>
            ) : (
              <>
                <TextInput
                  placeholder="Ad Soyad"
                  value={fullName}
                  onChangeText={setFullName}
                  style={styles.input}
                  placeholderTextColor={COLORS.placeholder}
                  selectionColor={COLORS.primary}
                />
                <TextInput
                  placeholder="Telefon"
                  value={phone}
                  onChangeText={setPhone}
                  style={styles.input}
                  keyboardType="phone-pad"
                  placeholderTextColor={COLORS.placeholder}
                  selectionColor={COLORS.primary}
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                />
                <TextInput
                  placeholder="Doğum Tarihi (YYYY.MM.DD)"
                  value={birthDate}
                  onChangeText={formatBirthDate}
                  style={styles.input}
                  keyboardType="numeric"
                  maxLength={10}
                  placeholderTextColor={COLORS.placeholder}
                  selectionColor={COLORS.primary}
                />
                <TextInput
                  placeholder="E-posta"
                  value={email}
                  onChangeText={setEmail}
                  style={styles.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor={COLORS.placeholder}
                  selectionColor={COLORS.primary}
                  autoComplete="email"
                  textContentType="emailAddress"
                />
                <TextInput
                  placeholder="Şifre"
                  value={password}
                  onChangeText={setPassword}
                  style={styles.input}
                  secureTextEntry
                  placeholderTextColor={COLORS.placeholder}
                  selectionColor={COLORS.primary}
                  autoComplete="password-new"
                  textContentType="newPassword"
                />
                <TextInput
                  placeholder="Şifre Tekrar"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  style={styles.input}
                  secureTextEntry
                  placeholderTextColor={COLORS.placeholder}
                  selectionColor={COLORS.primary}
                  autoComplete="password-new"
                  textContentType="newPassword"
                />

                <View style={{ marginBottom: 10 }}>
                  <Text style={rules.length ? styles.valid : styles.invalid}>• En az 8 karakter</Text>
                  <Text style={rules.upper ? styles.valid : styles.invalid}>• Büyük harf</Text>
                  <Text style={rules.lower ? styles.valid : styles.invalid}>• Küçük harf</Text>
                  <Text style={rules.number ? styles.valid : styles.invalid}>• Rakam</Text>
                  <Text style={rules.special ? styles.valid : styles.invalid}>• Özel karakter (!@#)</Text>
                </View>

                <View style={styles.checkRow}>
                  <TouchableOpacity
                    onPress={() => setAcceptKvkk((v) => !v)}
                    style={[styles.checkBox, acceptKvkk && styles.checkBoxOn]}
                  >
                    {acceptKvkk && <AntDesign name="check" size={16} color="#fff" />}
                  </TouchableOpacity>
                  <Text style={styles.checkText}>
                    <Text onPress={() => setShowKvkk(true)} style={styles.linkInline}>
                      KVKK Aydınlatma Metni
                    </Text>{' '}
                    metnini okudum ve anladım.
                  </Text>
                </View>

                <View style={styles.checkRow}>
                  <TouchableOpacity
                    onPress={() => setAcceptConsent((v) => !v)}
                    style={[styles.checkBox, acceptConsent && styles.checkBoxOn]}
                  >
                    {acceptConsent && <AntDesign name="check" size={16} color="#fff" />}
                  </TouchableOpacity>
                  <Text style={styles.checkText}>
                    Kişisel verilerimin işlenmesine{' '}
                    <Text onPress={() => setShowConsent(true)} style={styles.linkInline}>
                      Açık Rıza Metni
                    </Text>{' '}
                    kapsamında açık rıza veriyorum.
                  </Text>
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <TouchableOpacity
                  style={[styles.button, !canSubmit && { opacity: 0.5 }]}
                  onPress={handleRegister}
                  disabled={!canSubmit}
                >
                  <Text style={styles.buttonText}>Kayıt Ol</Text>
                </TouchableOpacity>

                {/* GOOGLE BUTONU KALDIRILDI */}

                <TouchableOpacity onPress={() => router.replace('/login')}>
                  <Text style={styles.link}>Zaten hesabın var mı? Giriş Yap</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>

      <Modal visible={showKvkk} animationType="slide" onRequestClose={() => setShowKvkk(false)}>
        <View style={styles.modalWrap}>
          <Text style={styles.modalTitle}>KVKK Aydınlatma Metni</Text>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.modalText}>{TEXT_KVKK}</Text>
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity onPress={() => setShowKvkk(false)} style={styles.modalBtn}>
              <Text style={styles.modalBtnText}>Kapat</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setAcceptKvkk(true);
                setShowKvkk(false);
              }}
              style={[styles.modalBtn, { backgroundColor: COLORS.primary }]}
            >
              <Text style={[styles.modalBtnText, { color: '#fff' }]}>Okudum / Onaylıyorum</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showConsent} animationType="slide" onRequestClose={() => setShowConsent(false)}>
        <View style={styles.modalWrap}>
          <Text style={styles.modalTitle}>Açık Rıza Metni</Text>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.modalText}>{TEXT_CONSENT}</Text>
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity onPress={() => setShowConsent(false)} style={styles.modalBtn}>
              <Text style={styles.modalBtnText}>Kapat</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setAcceptConsent(true);
                setShowConsent(false);
              }}
              style={[styles.modalBtn, { backgroundColor: COLORS.primary }]}
            >
              <Text style={[styles.modalBtnText, { color: '#fff' }]}>Rıza Veriyorum</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: COLORS.bg },
  scrollInner: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 80 },
  container: { width: '100%', backgroundColor: COLORS.bg },
  logo: { width: 96, height: 96, alignSelf: 'center', marginBottom: 12, marginTop: 8 },
  title: { fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginBottom: 16, color: COLORS.text },

  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    fontSize: 16,
    backgroundColor: COLORS.inputBg,
    color: COLORS.text,
  },

  checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: COLORS.bg,
  },
  checkBoxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkText: { flex: 1, color: COLORS.sub },
  linkInline: { color: COLORS.link, fontWeight: '700' },

  button: {
    backgroundColor: COLORS.primary,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  link: {
    marginTop: 20,
    marginBottom: 32,
    textAlign: 'center',
    color: COLORS.link,
    fontSize: 14,
  },

  error: { color: COLORS.error, textAlign: 'center', marginBottom: 10 },
  valid: { color: COLORS.valid, fontSize: 14 },
  invalid: { color: COLORS.invalid, fontSize: 14 },

  // googleButton ve googleText stilleri artık kullanılmıyor, silebilirsin veya kalabilir, zararı yok.
  
  notice: {
    borderWidth: 1,
    borderColor: '#C8E6C9',
    backgroundColor: '#E8F5E9',
    padding: 14,
    borderRadius: 12,
  },
  noticeTitle: {
    fontWeight: '900',
    color: COLORS.valid,
    marginBottom: 6,
    textAlign: 'center',
  },
  noticeText: { color: COLORS.valid, textAlign: 'center' },

  modalWrap: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingTop: 54,
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 12, color: COLORS.text },
  modalBody: { paddingBottom: 24 },
  modalText: { color: COLORS.sub, lineHeight: 20 },
  modalFooter: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', paddingTop: 8 },
  modalBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  modalBtnText: { fontWeight: '800', color: COLORS.text },
});