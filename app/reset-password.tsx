'use client';

import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabaseClient';

const COLORS = {
  primary: '#FF6B00',
  bg: '#FFFFFF',
  text: '#111111',
  border: '#E0E0E0',
  placeholder: '#9AA0A6',
};

export default function ResetPasswordPage() {
  const router = useRouter();

  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false); // Token yakalandı mı?

  // 🔥 URL'den Token Yakalama ve Session Kurma (FIX)
  useEffect(() => {
    const handleUrl = async () => {
      const url = await Linking.getInitialURL();
      
      // Hash (#) içindeki tokenları al
      if (url && url.includes('access_token')) {
        try {
            const fragment = url.split('#')[1];
            const params = new URLSearchParams(fragment);
            const access_token = params.get('access_token');
            const refresh_token = params.get('refresh_token');

            if (access_token && refresh_token) {
                const { error } = await supabase.auth.setSession({ access_token, refresh_token });
                if (!error) {
                    setReady(true);
                } else {
                    console.log("Session set error:", error);
                }
            }
        } catch (e) {
            console.log("URL Parse Hatası:", e);
        }
      } else {
          // Belki zaten oturum açıktır
          const { data } = await supabase.auth.getSession();
          if (data.session) setReady(true);
      }
    };

    handleUrl();
  }, []);

  const handleReset = async () => {
    if (!ready) {
        Alert.alert("Hata", "Geçersiz veya süresi dolmuş bağlantı. Lütfen maildeki linke tekrar tıkla.");
        return;
    }
    if (!newPass || !newPass2) {
      Alert.alert("Uyarı", "Şifre alanları boş olamaz.");
      return;
    }
    if (newPass !== newPass2) {
      Alert.alert("Uyarı", "Şifreler eşleşmiyor.");
      return;
    }
    if (newPass.length < 6) {
      Alert.alert("Uyarı", "Şifre en az 6 karakter olmalı.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setLoading(false);

    if (error) {
      Alert.alert("Hata", error.message);
    } else {
      Alert.alert(
        "Başarılı",
        "Şifren başarıyla güncellendi! Lütfen yeni şifrenle giriş yap.",
        [{ text: "Tamam", onPress: async () => {
            await supabase.auth.signOut();
            router.replace('/login');
        }}]
      );
    }
  };

  if (!ready) {
      return (
          <View style={styles.container}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={{marginTop:10, color:'#666'}}>Bağlantı doğrulanıyor...</Text>
          </View>
      );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.wrapper}>
      <View style={styles.container}>
        <Text style={styles.title}>Yeni Şifre Belirle</Text>
        <Text style={styles.subTitle}>Hesabın için yeni ve güvenli bir şifre gir.</Text>

        <TextInput
          placeholder="Yeni şifre"
          secureTextEntry
          value={newPass}
          onChangeText={setNewPass}
          style={styles.input}
          placeholderTextColor={COLORS.placeholder}
        />

        <TextInput
          placeholder="Yeni şifre (tekrar)"
          secureTextEntry
          value={newPass2}
          onChangeText={setNewPass2}
          style={styles.input}
          placeholderTextColor={COLORS.placeholder}
        />

        <TouchableOpacity style={styles.button} onPress={handleReset} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Şifreyi Değiştir</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.replace('/login')} style={{marginTop: 20}}>
          <Text style={styles.backLink}>İptal</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, padding: 24, justifyContent: 'center', alignItems:'center' },
  title: { fontSize: 26, fontWeight: 'bold', color: COLORS.text, textAlign: 'center', marginBottom: 10 },
  subTitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 30, paddingHorizontal: 20 },
  input: { width:'100%', borderWidth: 1, borderColor: COLORS.border, padding: 14, borderRadius: 12, fontSize: 16, marginBottom: 14, color: COLORS.text, backgroundColor: '#fff' },
  button: { width:'100%', backgroundColor: COLORS.primary, padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 10, height: 50, justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  backLink: { color: '#999', textAlign: 'center', fontSize: 15, fontWeight: '500' },
});