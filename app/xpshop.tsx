'use client';

import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabaseClient';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Pack = {
  id: string;
  name: string;
  xp_amount: number;
  price_cents: number;
  stock: number | null;
  image_url: string | null;
  sort: number | null;
  is_active: boolean | null;
};

const ORANGE = '#FF6B00';

export default function XPShop() {
  const { t, numberLocale } = useI18n();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    // packs
    const { data: p } = await supabase
      .from('xp_packs')
      .select('*')
      .eq('is_active', true)
      .order('sort', { ascending: true });
    setPacks((p ?? []) as any);

    // balance
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (uid) {
      const { data: w } = await supabase.from('xp_wallets').select('balance').eq('user_id', uid).single();
      setBalance((w?.balance ?? 0) as number);
    } else {
      setBalance(0);
    }

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const buy = async (packId: string) => {
    if (busyId) return;
    setBusyId(packId);
    try {
      const { data, error } = await supabase.rpc('xp_buy_pack', { p_pack_id: packId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : (data as any);
      if (row?.status === 'ok') {
        setBalance(row.new_balance ?? balance);
        // stok güncellemek için yeniden çek
        load();
        Alert.alert(t('common.success'), t('xpshop.purchaseSuccess'));
      } else if (row?.status === 'out_of_stock') {
        Alert.alert(t('common.error'), t('xpshop.outOfStock'));
      } else {
        Alert.alert(t('common.error'), t('xpshop.purchaseFailed'));
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? t('xpshop.purchaseFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const renderItem = ({ item }: { item: Pack }) => {
    return (
      <View style={styles.card}>
        {item.image_url
          ? <Image source={{ uri: item.image_url }} style={styles.cardImg} />
          : <View style={[styles.cardImg, { backgroundColor: '#eee' }]} />}
        <Text style={styles.cardTitle}>{item.name}</Text>
        <View style={styles.row}>
          <View style={styles.tag}>
            <Text style={styles.tagTxt}>{(item.xp_amount ?? 0).toLocaleString(numberLocale)} XP</Text>
          </View>
          <View style={[styles.tag, { backgroundColor: '#E8F5E9' }]}>
            <Text style={[styles.tagTxt, { color: '#2E7D32' }]}>{t('xpshop.stock', { count: item.stock ?? 0 })}</Text>
          </View>
        </View>
        <TouchableOpacity
          disabled={(item.stock ?? 0) <= 0 || busyId === item.id}
          onPress={() => buy(item.id)}
          style={[styles.buyBtn, ((item.stock ?? 0) <= 0 || busyId === item.id) && { opacity: 0.6 }]}>
          <Text style={styles.buyTxt}>{busyId === item.id ? t('common.processing') : t('xpshop.buy')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={styles.header}>
        <Text style={styles.h1}>{t('xpshop.title')}</Text>
        <View style={styles.balance}><Text style={styles.balanceTxt}>{balance.toLocaleString(numberLocale)} XP</Text></View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={packs}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 52, paddingHorizontal: 16, paddingBottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h1: { fontSize: 28, fontWeight: '900', color: ORANGE },
  balance: { backgroundColor: '#FFE0B2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  balanceTxt: { color: ORANGE, fontWeight: '900' },
  card: { borderWidth: 1, borderColor: '#eee', borderRadius: 16, padding: 12, marginBottom: 14, backgroundColor: '#fff' },
  cardImg: { width: '100%', height: 140, borderRadius: 12, marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '900', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  tag: { backgroundColor: '#FFF3E0', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  tagTxt: { color: '#333', fontWeight: '900' },
  buyBtn: { backgroundColor: ORANGE, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  buyTxt: { color: '#fff', fontWeight: '900' },
});
