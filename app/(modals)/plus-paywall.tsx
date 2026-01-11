import { supabase } from "@/lib/supabaseClient";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Image, Pressable, Text, View } from "react-native";

const BRAND = "#FF6B00";
const MASCOT_SRC = require("@/assets/images/dumendenci.png");

export default function PlusPaywall() {
  const r = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const joinDumendenci = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) {
        // giriş yoksa önce login'e
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
        return;
      }

      // 2) Başarıyla katıldı -> Dümendenci merkezine
      r.replace("/plus");
    } catch (e) {
      console.log("join error: ", e);
    }
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.6)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View style={{ opacity: fadeAnim, width: "88%" }}>
        <LinearGradient
          colors={["#fff", "#FFF3E9"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 22,
            padding: 22,
            alignItems: "center",
            shadowColor: "#000",
            shadowOpacity: 0.25,
            shadowRadius: 10,
          }}
        >
          <Image
            source={MASCOT_SRC}
            style={{
              width: 120,
              height: 120,
              borderRadius: 60,
              marginBottom: 10,
            }}
          />

          <Text
            style={{
              fontSize: 24,
              fontWeight: "900",
              color: BRAND,
              textAlign: "center",
            }}
          >
            Dümenci olmaya hazır mısın?
          </Text>

          <View style={{ marginTop: 12 }}>
            {[
              "🔥 İlk katılanlardan biri ol – topluluk seni konuşsun!",
              "🎯 Keşfette tüm tahminleri gör",
              "🚀 Kendi tahminini oluştur",
              "🏆 XP kazan, seviyeni yükselt",
              "👥 Diğer tahmincilerle yarış",
            ].map((t, i) => (
              <Text
                key={i}
                style={{
                  marginVertical: 3,
                  fontSize: 15,
                  color: "#333",
                  textAlign: "center",
                }}
              >
                {t}
              </Text>
            ))}
          </View>

          {/* Katıl butonu */}
          <Pressable
            onPress={joinDumendenci}
            style={{
              marginTop: 20,
              backgroundColor: BRAND,
              paddingVertical: 14,
              paddingHorizontal: 32,
              borderRadius: 14,
              shadowColor: BRAND,
              shadowOpacity: 0.4,
              shadowRadius: 8,
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontWeight: "800",
                fontSize: 18,
              }}
            >
              Katıl
            </Text>
          </Pressable>

          <Pressable onPress={() => r.back()} style={{ marginTop: 14 }}>
            <Text
              style={{
                color: "#777",
                fontWeight: "700",
                textDecorationLine: "underline",
              }}
            >
              Kapat
            </Text>
          </Pressable>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}
