import { ensureBootstrapAndProfile } from '@/lib/bootstrap';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

export default function GoogleAuthCallback() {
  const router = useRouter();

  useEffect(() => {
    // 1. Supabase'in auth durumunu dinleyen bir listener kuruyoruz.
    // Uygulama URL'den token'ı kaptığı anda bu tetiklenecek.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      
      console.log("📌 Auth Event Tetiklendi:", event);

      if (session) {
        console.log("✅ Google Session Yakalandı:", session.user.id);
        
        // Kullanıcı ve Cüzdan oluşturma işlemini yap
        await ensureBootstrapAndProfile();
        
        // İşlem bitince anasayfaya yönlendir
        router.replace('/home');
      }
    });

    // 2. Çok nadiren de olsa event tetiklenmezse diye manuel kontrol (Backup)
    const checkSessionManually = async () => {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
            console.log("✅ Manuel Kontrol: Session Zaten Var");
            await ensureBootstrapAndProfile();
            router.replace('/home');
        }
    };
    
    // Ufak bir gecikme ile manuel kontrolü de çalıştır (ne olur ne olmaz)
    setTimeout(checkSessionManually, 1000);

    return () => {
      // Sayfadan çıkarken dinlemeyi bırak
      subscription.unsubscribe();
    };
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
      <ActivityIndicator size="large" color="#FF6B00" />
      <Text style={{ marginTop: 20, color: '#444', fontWeight:'500' }}>Google ile bağlanılıyor...</Text>
      <Text style={{ marginTop: 5, color: '#999', fontSize:12 }}>Lütfen bekleyiniz</Text>
    </View>
  );
}