import { supabase } from "@/lib/supabaseClient";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Image, Pressable, Text, View } from "react-native";

const BRAND = "#FF6B00";
const MASCOT_SRC = require("@/assets/images/dumendenci.png");

export default function PlusPaywall() {
  const r = useRouter();
  // 🔥 FİX: usePlus ve refresh'i kaldırdık çünkü hook dosyasında tanımlı değil.
  // Onun yerine aşağıda supabase.auth.refreshSession() kullanacağız.
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = useState(false);

  // Animasyon başlat
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  // Zaten üye mi kontrolü (Sonsuz döngüyü engeller)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const isDumendenci = data.user?.user_metadata?.dumendenci === true;
      if (isDumendenci) {
        r.replace("/plus"); // Zaten üyeyse direkt gönder
      }
    });
  }, []);

  const joinDumendenci = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) {
        // Giriş yoksa önce login'e
        setLoading(false);
        return r.replace("/login");
      }

      // 1) Kullanıcı metadata'sına dumendenci bayrağı ekle
      const { error } = await supabase.auth.updateUser({
        data: {
          dumendenci: true,
          dumendenci_since: new Date().toISOString(),
        },
      });

      if (error) {
        console.log("Update error:", error);
        setLoading(false);
        return;
      }

      // 🔥 FİX: Context'teki refresh yerine Supabase oturumunu zorla yeniliyoruz.
      // Bu işlem, uygulamadaki dinleyicileri (listeners) tetikleyip "Plus oldum" bilgisini yayar.
      await supabase.auth.refreshSession();

      // 3) Başarıyla katıldı -> Dümendenci merkezine
      r.replace("/plus"); 

    } catch (e) {
      console.log("join error: ", e);
      setLoading(false);
    }
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.75)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View style={{ opacity: fadeAnim, width: "90%" }}>
        <LinearGradient
          colors={["#ffffff", "#FFF8F2"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{
            borderRadius: 24,
            paddingVertical: 32,
            paddingHorizontal: 24,
            alignItems: "center",
            shadowColor: "#000",
            shadowOpacity: 0.3,
            shadowRadius: 20,
            elevation: 10,
          }}
        >
          {/* Maskot / Logo */}
          <View style={{
            shadowColor: BRAND,
            shadowOpacity: 0.5,
            shadowRadius: 12,
            elevation: 5
          }}>
            <Image
              source={MASCOT_SRC}
              style={{
                width: 100,
                height: 100,
                borderRadius: 50,
                marginBottom: 16,
                borderWidth: 3,
                borderColor: BRAND
              }}
            />
          </View>

          <Text
            style={{
              fontSize: 22,
              fontWeight: "900",
              color: BRAND,
              textAlign: "center",
              marginBottom: 8
            }}
          >
            Dümenci Olmaya Hazır Mısın?
          </Text>

          <Text style={{ textAlign:'center', color:'#666', marginBottom: 20, fontWeight:'600' }}>
            Aramıza katıl ve ayrıcalıkların tadını çıkar!
          </Text>

          <View style={{ width:'100%', marginBottom: 24 }}>
            {[
              "🔥 Toplulukta öne çık, herkes seni konuşsun!",
              "🎯 Keşfetteki tüm özel tahminleri gör",
              "🚀 Kendi tahminlerini oluştur ve paylaş",
              "🏆 XP kazan, seviyeni yükselt ve yarış",
            ].map((t, i) => (
              <View key={i} style={{ flexDirection:'row', alignItems:'center', marginBottom: 10 }}>
                <Text style={{ fontSize: 16, marginRight: 8 }}>{t.split(' ')[0]}</Text>
                <Text style={{ fontSize: 14, color: "#333", fontWeight:'600', flex:1 }}>
                  {t.substring(t.indexOf(' ')+1)}
                </Text>
              </View>
            ))}
          </View>

          {/* Katıl Butonu */}
          <Pressable
            onPress={joinDumendenci}
            disabled={loading}
            style={({ pressed }) => ({
              width: '100%',
              backgroundColor: BRAND,
              paddingVertical: 16,
              borderRadius: 16,
              alignItems: 'center',
              shadowColor: BRAND,
              shadowOpacity: 0.4,
              shadowRadius: 8,
              opacity: pressed || loading ? 0.8 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }]
            })}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 18 }}>
                KATIL VE BAŞLA 🚀
              </Text>
            )}
          </Pressable>

          {/* Kapat */}
          <Pressable onPress={() => r.back()} style={{ marginTop: 16, padding: 8 }}>
            <Text style={{ color: "#999", fontWeight: "700", fontSize: 14 }}>
              Daha Sonra
            </Text>
          </Pressable>

        </LinearGradient>
      </Animated.View>
    </View>
  );
}