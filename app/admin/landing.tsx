'use client';

import { supabase } from '@/lib/supabaseClient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function AdminLanding() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) { setChecking(false); return; }
      const { data } = await supabase.from('admins').select('user_id').eq('user_id', uid).maybeSingle();
      setIsAdmin(!!data);
      setChecking(false);
    })();
  }, []);

  if (checking) {
    return (
      <View style={styles.container}>
        <Text style={{ textAlign: 'center' }}>Yükleniyor…</Text>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FF6B00" />
        </TouchableOpacity>
        <Text style={styles.header}>Admin Paneli</Text>
        <Text style={{ textAlign: 'center', fontWeight: '700' }}>
          Bu sayfa sadece adminler içindir.
        </Text>
      </View>
    );
  }

  const Btn = ({
    label,
    icon,
    onPress,
  }: {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  }) => (
    <TouchableOpacity style={styles.button} onPress={onPress}>
      <Ionicons name={icon} size={24} color="#fff" style={styles.icon} />
      <Text style={styles.buttonText}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Geri */}
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#FF6B00" />
      </TouchableOpacity>

      {/* Başlık */}
      <Text style={styles.header}>Admin Paneli</Text>

      {/* Kupon Ekle */}
      <Btn label="Kupon Ekle" icon="add-circle" onPress={() => router.push('/admin/add-coupon')} />

      {/* Kuponları Düzenle */}
      <Btn label="Kuponları Düzenle" icon="create" onPress={() => router.push('/admin/edit-coupons')} />

      {/* Ödül Ekle (Market) */}
      <Btn label="Ödül Ekle" icon="gift" onPress={() => router.push('/admin/add-market')} />
<Btn
  label="Önerileri Onayla"
  icon="checkmark-done-circle"
  onPress={() => router.push('/admin/submission')}
/>
      {/* Kanıt Ekle (Vitrin) */}
      <Btn label="Kanıt Ekle" icon="document-attach" onPress={() => router.push('/admin/add-proof')} />

      {/* Ayarlar */}
      <Btn label="Ayarlar" icon="settings" onPress={() => router.push('/admin/settings')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24, justifyContent: 'center' },
  backButton: { position: 'absolute', top: 50, left: 20 },
  header: { fontSize: 26, fontWeight: 'bold', color: '#FF6B00', marginBottom: 40, textAlign: 'center' },
  button: { backgroundColor: '#FF6B00', flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 16 },
  icon: { marginRight: 12 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
