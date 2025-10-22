// app/dailyentry.tsx
'use client';

import { supabase } from '@/lib/supabaseClient';
import { useXp } from '@/src/contexts/XpProvider';
import { showRewarded } from '@/src/contexts/ads/rewarded'; // 👈 ödüllü reklam helper'ı
import { BlurView } from 'expo-blur';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, Text, TouchableOpacity, View } from 'react-native';

const BRAND = '#FF6B00';
const SOFT = '#FFF2E8';

export default function DailyEntryScreen() {
  const { xp, loading: xpLoading, refresh } = useXp();
  const [granting, setGranting] = useState(false);

  const onPress = async () => {
    if (granting) return;
    setGranting(true);
    try {
      // 1) Reklamı göster (tam ekran açılır, kapanınca bu sayfaya geri döner)
      const ok = await showRewarded();
      if (!ok) {
        Alert.alert('Bilgi', 'Reklam tamamlanmadı.');
        return;
      }

      // 2) Ödül kazanıldı → 50 XP yükle (3 saat cooldown server’da)
      const { data, error } = await supabase.rpc('grant_xp', {
        amount: 50,
        reason: 'rewarded',
      });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : (data as any);
      if (row?.status === 'ok') {
        await refresh();
        Alert.alert('Tebrikler', '50 XP yüklendi 🎉');
      } else if (row?.status === 'cooldown') {
        const t = new Date(row.next_allowed_at);
        const mins = Math.max(0, Math.ceil((+t - Date.now()) / 60000));
        const h = Math.floor(mins / 60), m = mins % 60;
        Alert.alert('Bekleme', `Tekrar ${h}s ${m}dk sonra alabilirsin.`);
      } else if (row?.status === 'auth_required') {
        Alert.alert('Giriş gerekli', 'Ödül için giriş yap.');
      } else {
        Alert.alert('Hata', 'İşlem tamamlanamadı.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e?.message ?? 'Bilinmeyen hata');
    } finally {
      setGranting(false);
    }
  };

  const title = useMemo(
    () => (xpLoading ? '...' : `${xp.toLocaleString('tr-TR')} XP`),
    [xp, xpLoading]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', padding: 16 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
        <Text style={{ fontSize: 24, fontWeight: '900', color: BRAND }}>Günlük Giriş</Text>
        <View
          style={{
            marginLeft: 'auto',
            backgroundColor: SOFT,
            borderWidth: 1,
            borderColor: BRAND,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: BRAND, fontWeight: '800' }}>{title}</Text>
        </View>
      </View>

      <Text style={{ color: '#6B7280', marginBottom: 16 }}>
        Reklamı tamamlayınca 50 XP kazanırsın. 3 saatte bir kullanılabilir.
      </Text>

      <TouchableOpacity
        onPress={onPress}
        disabled={granting}
        style={{
          backgroundColor: BRAND,
          paddingVertical: 14,
          borderRadius: 14,
          alignItems: 'center',
          opacity: granting ? 0.7 : 1,
        }}
      >
        {granting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: '#fff', fontWeight: '900' }}>XP Al</Text>
        )}
      </TouchableOpacity>

      {/* işlem devam ederken blur + spinner */}
      {granting && (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
          <BlurView intensity={30} tint="light" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={BRAND} />
            <Text style={{ marginTop: 10, fontWeight: '700' }}>XP yükleniyor…</Text>
          </BlurView>
        </View>
      )}
    </SafeAreaView>
  );
}
