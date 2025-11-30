'use client';

import { supabase } from '@/lib/supabaseClient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ORANGE = '#FF6B00';

export default function AdminLanding() {
  const router = useRouter();
  const insets = useSafeAreaInsets(); // 🔥 Güvenli alan hesaplayıcısı
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
      <View style={styles.center}>
        <Text style={{ textAlign: 'center', color: '#666' }}>Yükleniyor…</Text>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={styles.center}>
        <Text style={styles.header}>Admin Paneli</Text>
        <Text style={{ textAlign: 'center', fontWeight: '700', color: '#333' }}>
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
    color = ORANGE
  }: {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    color?: string;
  }) => (
    <TouchableOpacity style={[styles.rowBtn, { backgroundColor: color }]} onPress={onPress}>
      <Ionicons name={icon} size={24} color="#fff" style={{ marginRight: 12 }} />
      <Text style={styles.rowBtnText}>{label}</Text>
      <Ionicons name="chevron-forward" size={20} color="#ffffffaa" style={{ marginLeft: 'auto' }} />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />
      
      <ScrollView 
        contentContainerStyle={{ 
            padding: 24, 
            paddingBottom: insets.bottom + 100 // 🔥 Alt bar çakışmasını önleyen boşluk
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.header}>Admin Paneli 👑</Text>

        <Btn label="Kupon Ekle"           icon="add-circle"            onPress={() => router.push('/admin/add-coupon')} />
        <Btn label="Kuponları Düzenle"    icon="create"                onPress={() => router.push('/admin/edit-coupons')} />
        <Btn label="Önerileri Onayla"     icon="checkmark-done-circle" onPress={() => router.push('/admin/submission')} />
        
        <View style={styles.divider} />

        <Btn label="Kanıt Ekle"           icon="document-attach"       onPress={() => router.push('/admin/add-proof')} />
       
        <Btn label="Kanıt Vitrini Yönet"  icon="images"                onPress={() => router.push('/admin/vitrin-settings')} color="#4A90E2" />

        <View style={styles.divider} />

        <Btn label="Ödül Ekle"            icon="gift"                  onPress={() => router.push('/admin/add-market')} />
        <Btn label="Market Yönetimi"      icon="cart"                  onPress={() => router.push('/admin/purchases')} />
        <Btn label="Market Durum Kontrol" icon="power"                 onPress={() => router.push('/admin/market-control')} color="#E53935" />
        
        <View style={styles.divider} />

        <Btn label="Xp Shop"              icon="storefront"            onPress={() => router.push('/admin/add-shop')} />
        <Btn label="Ayarlar"              icon="settings"              onPress={() => router.push('/admin/settings')} color="#555" />

      </ScrollView>

      {/* SABİT BUTONLAR (Alt Barın Üstünde) */}
      <View style={[styles.fabContainer, { bottom: insets.bottom + 20 }]}>
          
          {/* Çıkış Yap */}
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: '#333', marginRight: 16 }]}
            onPress={async () => {
              await supabase.auth.signOut();
              router.replace('/login');
            }}
          >
            <Ionicons name="log-out-outline" size={26} color="#fff" />
          </TouchableOpacity>

          {/* Ana Sayfa */}
          <TouchableOpacity style={styles.fab} onPress={() => router.replace('/home')}>
            <Ionicons name="home" size={26} color="#fff" />
          </TouchableOpacity>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  header: { fontSize: 32, fontWeight: '900', color: '#111', marginBottom: 28, textAlign: 'center', marginTop: 10 },

  rowBtn: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, borderRadius: 16, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  rowBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  btn: { backgroundColor: ORANGE, padding: 14, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' },

  divider: { height: 1, backgroundColor: '#eee', marginVertical: 12 },

  fabContainer: {
      position: 'absolute',
      right: 24,
      flexDirection: 'row',
      alignItems: 'center'
  },
  fab: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center',
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
});