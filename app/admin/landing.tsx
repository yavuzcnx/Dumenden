'use client';

import { supabase } from '@/lib/supabaseClient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function AdminLanding() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) { setChecking(false); return; }
      const { data } = await supabase
        .from('admins')
        .select('user_id')
        .eq('user_id', uid)
        .maybeSingle();
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
        <Text style={styles.header}>Admin Paneli</Text>
        <Text style={{ textAlign: 'center', fontWeight: '700' }}>
          Bu sayfa sadece adminler içindir.
        </Text>
        <TouchableOpacity style={[styles.btn, { marginTop: 24 }]} onPress={() => router.replace('/home')}>
          <Text style={styles.btnText}>Ana Sayfaya Dön</Text>
        </TouchableOpacity>
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
    <TouchableOpacity style={styles.rowBtn} onPress={onPress}>
      <Ionicons name={icon} size={24} color="#fff" style={{ marginRight: 12 }} />
      <Text style={styles.rowBtnText}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Admin Paneli</Text>

      <Btn label="Kupon Ekle"         icon="add-circle"            onPress={() => router.push('/admin/add-coupon')} />
      <Btn label="Xp shop"            icon="storefront"            onPress={() => router.push('/admin/add-shop')} />
      <Btn label="Kuponları Düzenle"  icon="create"                onPress={() => router.push('/admin/edit-coupons')} />
      <Btn label="Ödül Ekle"          icon="gift"                  onPress={() => router.push('/admin/add-market')} />
      <Btn label="Önerileri Onayla"   icon="checkmark-done-circle" onPress={() => router.push('/admin/submission')} />
      <Btn label="Kanıt Ekle"         icon="document-attach"       onPress={() => router.push('/admin/add-proof')} />
      <Btn label="Market Yönetimi"    icon="pricetags"             onPress={() => router.push('/admin/purchases')} />
      <Btn label="Ayarlar"            icon="settings"              onPress={() => router.push('/admin/settings')} />

      {/* yalnızca alttaki HOME fab kaldı */}
      <TouchableOpacity style={styles.fab} onPress={() => router.replace('/admin/landing')}>
        <Ionicons name="home" size={26} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const ORANGE = '#FF6B00';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24 },
  header: { fontSize: 28, fontWeight: '900', color: ORANGE, marginBottom: 28, textAlign: 'center' },

  rowBtn: {
    backgroundColor: ORANGE, flexDirection: 'row', alignItems: 'center',
    padding: 16, borderRadius: 14, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 2,
  },
  rowBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  btn: { backgroundColor: ORANGE, padding: 14, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' },

  fab: {
    position: 'absolute', right: 22, bottom: 28,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center',
    shadowColor: ORANGE, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
});