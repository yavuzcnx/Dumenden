'use client';

import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

const COLORS = {
  primary: "#FF6B00",
  text: "#111",
  bg: "#FFF",
  border: "#E0E0E0"
};

export default function ResetPasswordPage() {
  const router = useRouter();
  
  const [newPass, setNewPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    // 1. Sayfa açılır açılmaz: Zaten bir oturum oluştu mu?
    // Supabase linke tıklandığında otomatik session kurar.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionReady(true);
      }
    });

    // 2. Anlık Değişimleri Dinle (En Önemlisi Bu)
    // Linke tıklandığında 'PASSWORD_RECOVERY' veya 'SIGNED_IN' olayı tetiklenir.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Supabase Olayı:", event);
      
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setSessionReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleUpdate = async () => {
    if (newPass.length < 6) return Alert.alert("Hata", "Şifre en az 6 karakter olmalı.");
    setLoading(true);

    // Oturum zaten var olduğu için sadece şifreyi güncellemek yetiyor
    const { error } = await supabase.auth.updateUser({ password: newPass });
    
    setLoading(false);

    if (error) {
      Alert.alert("Hata", error.message);
    } else {
      Alert.alert("Başarılı", "Şifren güncellendi! Giriş yapabilirsin.", [
        { text: "Tamam", onPress: () => router.replace("/login") }
      ]);
    }
  };

  // 🔄 YÜKLENİYOR / BEKLENİYOR EKRANI
  if (!sessionReady)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ marginTop: 20, fontWeight: 'bold', color: '#555' }}>
          Link doğrulanıyor...
        </Text>
        <Text style={{ marginTop: 10, fontSize: 12, color: '#999', textAlign:'center', paddingHorizontal:20 }}>
          Eğer uzun süre açılmazsa uygulamayı tamamen kapatıp maildeki linke tekrar tıkla.
        </Text>
        <TouchableOpacity onPress={() => router.replace("/login")} style={{marginTop: 30}}>
            <Text style={{color: COLORS.primary, fontWeight:'bold'}}>Giriş Ekranına Dön</Text>
        </TouchableOpacity>
      </View>
    );

  // ✅ ŞİFRE DEĞİŞTİRME FORMU
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Yeni Şifre Belirle</Text>
      <Text style={{textAlign:'center', marginBottom:20, color:'#666'}}>
        Artık yeni şifreni belirleyebilirsin.
      </Text>
      
      <TextInput
        placeholder="Yeni şifrenizi girin"
        secureTextEntry
        value={newPass}
        onChangeText={setNewPass}
        style={styles.input}
        placeholderTextColor="#999"
      />
      
      <TouchableOpacity style={styles.button} onPress={handleUpdate}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Şifreyi Kaydet</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: '#fff' },
  container: { flex: 1, padding: 24, justifyContent: "center", backgroundColor: '#fff' },
  title: { fontSize: 26, fontWeight: "bold", marginBottom: 10, textAlign: "center", color: COLORS.text },
  input: { height: 55, borderWidth: 1, borderRadius: 12, borderColor: COLORS.border, paddingHorizontal: 16, marginBottom: 20, color: COLORS.text, backgroundColor: '#F9F9F9' },
  button: { height: 55, backgroundColor: COLORS.primary, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "bold" }
});