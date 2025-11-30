// app/plus/index.tsx
import { supabase } from '@/lib/supabaseClient';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';

const BRAND = '#FF6B00';
const SOFT = '#FFF3E9';
const MASCOT_SRC = require('@/assets/images/dumendenci.png');

export default function PlusScreen() {
  const r = useRouter();
  const [joining, setJoining] = useState(false);

  const joinDumendenci = async () => {
    if (joining) return;

    try {
      setJoining(true);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user) {
        return r.replace('/login');
      }

      await supabase.auth.updateUser({
        data: {
          dumendenci: true,
          dumendenci_since: new Date().toISOString(),
        },
      });

    r.replace('/plus'); // Kullanıcı artık dümendenci → home'a gidiyor
    } catch (e) {
      console.log('join error', e);
    } finally {
      setJoining(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0E0E0E' }}>
      <LinearGradient
        colors={[BRAND, '#A83F00']}
        style={{
          paddingTop: 48,
          paddingBottom: 24,
          paddingHorizontal: 20,
          borderBottomLeftRadius: 28,
          borderBottomRightRadius: 28,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900' }}>
          Dümendenci olmaya hazır mısın?
        </Text>

        <Text style={{ color: '#fff', opacity: 0.9, marginTop: 6 }}>
          Keşfete katıl, topluluğun bir parçası ol!
        </Text>

        <View style={{ alignItems: 'center', marginTop: 12 }}>
          <Image
            source={MASCOT_SRC}
            style={{
              width: 130,
              height: 130,
              borderRadius: 26,
              resizeMode: 'cover',
            }}
          />
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{
          backgroundColor: '#121212',
          borderRadius: 16,
          padding: 18,
          borderColor: '#232323',
          borderWidth: 1
        }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>
            Keşfete Katılınca Neler Açılıyor?
          </Text>

          {[
            { icon: '🔥', text: 'Keşfette tüm tahminleri gör' },
            { icon: '🎯', text: 'Kendi tahminini oluştur' },
            { icon: '🚀', text: 'XP kazan, seviyeni yükselt' },
            { icon: '🏆', text: 'Toplumu yönlendiren “Dümendenci” ol' },
            { icon: '👥', text: 'Diğer tahmincilerle yarış' },
          ].map((b, i) => (
            <View
              key={i}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 10,
              }}
            >
              <Text style={{ fontSize: 20, marginRight: 10 }}>{b.icon}</Text>
              <Text style={{ color: '#EAEAEA', fontSize: 15 }}>{b.text}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          onPress={joinDumendenci}
          style={{
            marginTop: 20,
            backgroundColor: BRAND,
            paddingVertical: 16,
            borderRadius: 16,
            shadowColor: BRAND,
            shadowOpacity: 0.4,
            shadowRadius: 8,
          }}
        >
          <Text style={{
            color: '#fff',
            textAlign: 'center',
            fontWeight: '800',
            fontSize: 18
          }}>
            Katıl
          </Text>
        </TouchableOpacity>

        {joining && (
          <View style={{ marginTop: 10, alignItems: 'center' }}>
            <ActivityIndicator color={BRAND} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}
