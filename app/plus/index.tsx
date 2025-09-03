import { usePlus } from '@/app/hooks/userPlus';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const BRAND  = '#FF6B00';
const SOFT   = '#FFF2E8';
const BORDER = '#F2D9C8';

// 👇 dosya adın farklıysa değiştir
const MASCOT_SRC = require('@/assets/images/dumendenci.png');

type Quota = { is_plus: boolean; used_last7: number; remaining_last7: number };

export default function PlusHome() {
  const router = useRouter();
  const { isPlus, loading } = usePlus();

  const [busy, setBusy] = useState(true);
  const [user, setUser] = useState<{ name: string; xp: number; avatar?: string | null }>({ name: 'Kullanıcı', xp: 0 });
  const [quota, setQuota] = useState<Quota | null>(null);

  useEffect(() => {
    (async () => {
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id;
      if (!uid) { setBusy(false); return; }

      const { data } = await supabase.from('users')
        .select('full_name,xp,avatar_url').eq('id', uid).single();
      setUser({
        name: (data?.full_name || 'Kullanıcı').trim(),
        xp: data?.xp ?? 0,
        avatar: data?.avatar_url ?? null,
      });

      const { data: q } = await supabase.rpc('my_submission_quota');
      if (q) setQuota(q as Quota);

      setBusy(false);
    })();
  }, []);

  useEffect(() => {
    if (!loading && !isPlus) router.replace('/(modals)/plus-paywall');
  }, [loading, isPlus]);

  if (loading || !isPlus || busy) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={BRAND} />
      </SafeAreaView>
    );
  }

  /* ---- ROUTES ---- */
  const goDaily    = () => router.push('/dailyentry');
  const goShop     = () => router.push('/xpshop');
  const goCreate   = () => router.push('/(modals)/create');
  const goManage   = () => router.push('/plus/manage');
  const goProof = () => router.push('/plus/proofs'); // 👈

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        {/* HEADER */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Dümenci</Text>
            <Text style={styles.subtitle}>{user.name}</Text>
            <View style={styles.xpPill}>
              <Text style={styles.xpPillTxt}>{user.xp.toLocaleString('tr-TR')} XP</Text>
            </View>
          </View>
          <Image source={MASCOT_SRC} style={styles.mascot} />
        </View>

        {/* GÜNLÜK GİRİŞ & MARKET ÖNCELİĞİ */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
          <SmallCard title="Günlük Giriş" subtitle="XP toplama ödülleri" icon="📅" onPress={goDaily} />
          <SmallCard title="İndirimli XP"  subtitle="%10 Plus indirimi"  icon="💸" onPress={goShop} />
        </View>

        {/* KUPON İŞLERİ */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Kupon İşlemleri</Text>

          {/* Hak bilgisi */}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <Text style={{ fontSize: 28, fontWeight: '900', color: BRAND }}>{quota?.remaining_last7 ?? 0}</Text>
            <Text style={{ fontWeight: '800' }}>/ 1</Text>
            <Text style={{ color: '#666' }}>(kullanılan: {quota?.used_last7 ?? 0})</Text>
          </View>

          {/* Butonlar */}
          <View style={{ gap: 8 }}>
            <PrimaryButton label="Kupon Ekle"        onPress={goCreate} />
            <GhostButton   label="Kuponlarımı Yönet" onPress={goManage} />
            <GhostButton   label="Kuponuma Kanıt Ekle" onPress={goProof} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---- UI Primitives ---- */
function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.primaryBtn}>
      <Text style={{ color: '#fff', fontWeight: '900' }}>{label}</Text>
    </TouchableOpacity>
  );
}
function GhostButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.ghostBtn}>
      <Text style={{ color: BRAND, fontWeight: '900' }}>{label}</Text>
    </TouchableOpacity>
  );
}
function SmallCard({ title, subtitle, icon, onPress }:
  { title: string; subtitle: string; icon: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.smallCard}>
      <Text style={{ fontSize: 20, marginBottom: 6 }}>{icon}</Text>
      <Text style={{ fontWeight: '900' }}>{title}</Text>
      <Text style={{ color: '#666' }}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

/* ---- STYLES ---- */
const styles = StyleSheet.create({
  header: {
    backgroundColor: SOFT,
    borderWidth: 1, borderColor: BORDER,
    borderRadius: 18, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '900', color: BRAND },
  subtitle: { color: '#666', marginTop: 2, marginBottom: 8, fontWeight: '700' },
  mascot: { width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderColor: BORDER, backgroundColor: '#FFA24F' },

  xpPill: { alignSelf: 'flex-start', backgroundColor: '#FFE0B2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  xpPillTxt: { color: BRAND, fontWeight: '800' },

  card: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee',
    borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardTitle: { fontWeight: '900', marginBottom: 8 },

  primaryBtn: {
    backgroundColor: BRAND, alignItems: 'center',
    paddingVertical: 12, borderRadius: 12,
  },
  ghostBtn: {
    backgroundColor: '#fff', alignItems: 'center',
    paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: BRAND,
  },
  smallCard: {
    flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee',
    borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
});
