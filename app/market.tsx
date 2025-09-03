import { supabase } from '@/lib/supabaseClient';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Category = { id: string; name: string };
type Reward = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  int_price: number;
  stock: number;
  category_id: string | null;
};

const { width, height } = Dimensions.get('window');
const base = 375;
const s = (n: number) => Math.round((n * width) / base);
const ORANGE = '#FF6B00';

export default function Market() {
  const ins = useSafeAreaInsets();
const topPad =
  Platform.OS === 'ios'
    ? s(6)
    : ((ins.top || StatusBar.currentHeight || 0) + s(6));

  const [loading, setLoading] = useState(true);
  const [cats, setCats] = useState<Category[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [active, setActive] = useState<string>('all');
  const [xp, setXp] = useState<number>(0);
  const [detail, setDetail] = useState<Reward | null>(null);

  const load = async () => {
    setLoading(true);
    const [cRes, rRes, uRes] = await Promise.all([
      supabase.from('reward_categories').select('id,name').order('name', { ascending: true }),
      supabase.from('rewards').select('*').order('int_price'),
      supabase.rpc('get_user_xp'),
    ]);
    setCats([{ id: 'all', name: 'Tümü' }, ...((cRes.data ?? []) as Category[])] as Category[]);
    setRewards((rRes.data ?? []) as Reward[]);
    setXp(Number(uRes.data ?? 0));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () => (active === 'all' ? rewards : rewards.filter(r => r.category_id === active)),
    [active, rewards]
  );

  const Header = () => (
    <View
      // Android sticky için sağlam zemin
      style={{
        backgroundColor: '#fff',
        paddingTop: topPad,
        paddingBottom: s(10),
        paddingHorizontal: s(16),
        borderBottomWidth: Platform.OS === 'android' ? 0.5 : 0, // hafif stabilite
        borderBottomColor: '#00000010',
        zIndex: 2,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: s(10) }}>
        <Text
          style={{
            fontSize: s(28),
            fontWeight: '900',
            color: ORANGE,
            includeFontPadding: false,
          }}
        >
          Market
        </Text>
        <View
          style={{
            marginLeft: 'auto',
            backgroundColor: '#FFF2E8',
            borderWidth: 1,
            borderColor: ORANGE,
            paddingVertical: s(6),
            paddingHorizontal: s(10),
            borderRadius: s(20),
          }}
        >
          <Text style={{ color: ORANGE, fontWeight: '800', includeFontPadding: false }}>
            {xp.toLocaleString()} XP
          </Text>
        </View>
      </View>

      <FlatList
        data={cats}
        keyExtractor={i => i.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: s(6) }}
        renderItem={({ item }) => {
          const selected = active === item.id;
          return (
            <Pressable
              onPress={() => setActive(item.id)}
              style={{
                marginRight: s(10),
                paddingVertical: s(10),
                paddingHorizontal: s(16),
                borderRadius: s(22),
                borderWidth: 1.5,
                borderColor: selected ? ORANGE : '#eee',
                backgroundColor: selected ? '#FFE8D8' : '#fff',
              }}
            >
              <Text
                style={{
                  fontWeight: '800',
                  color: selected ? ORANGE : '#333',
                  fontSize: s(14),
                  includeFontPadding: false,
                }}
              >
                {item.name}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );

  const buy = (item: Reward) => {
    // TODO: satın alma/sepet entegrasyonu
    setDetail(null);
  };

  const Card = ({ item }: { item: Reward }) => (
    <Pressable
      onPress={() => setDetail(item)}
      style={{
        width: (width - s(16) * 2 - s(10)) / 2,
        backgroundColor: '#fff',
        borderRadius: s(16),
        borderWidth: 1,
        borderColor: '#EFEFEF',
        padding: s(12),
        marginBottom: s(12),
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 2,
      }}
    >
      <View
        style={{
          height: s(130),
          backgroundColor: '#F2F3F5',
          borderRadius: s(12),
          marginBottom: s(10),
          overflow: 'hidden',
        }}
      >
        {item.image_url ? <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} /> : null}
      </View>

      <Text style={{ fontWeight: '900', fontSize: s(16), marginBottom: 2, textAlign: 'center', includeFontPadding: false }}>
        {item.name}
      </Text>
      {!!item.description && (
        <Text style={{ color: '#6B7280', marginBottom: s(6), textAlign: 'center', includeFontPadding: false }}>
          {item.description}
        </Text>
      )}

      <Text style={{ color: ORANGE, fontWeight: '900', fontSize: s(16), textAlign: 'center', includeFontPadding: false }}>
        {item.int_price.toLocaleString()} XP
      </Text>
      <Text style={{ color: '#6B7280', marginBottom: s(10), textAlign: 'center', includeFontPadding: false }}>
        Stok: {item.stock}
      </Text>

      <TouchableOpacity
        onPress={() => buy(item)}
        activeOpacity={0.9}
        style={{ backgroundColor: ORANGE, paddingVertical: s(12), borderRadius: s(12), alignItems: 'center' }}
      >
        <Text style={{ color: '#fff', fontWeight: '900', includeFontPadding: false }}>Satın Al</Text>
      </TouchableOpacity>
    </Pressable>
  );

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        numColumns={2}
        columnWrapperStyle={{ gap: s(10), paddingHorizontal: s(16) }}
        contentContainerStyle={{ paddingBottom: s(24) }}
        renderItem={Card}
        ListHeaderComponent={Header}
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
      />

      {/* Detay Modal */}
      <Modal visible={!!detail} transparent animationType="fade" onRequestClose={() => setDetail(null)}>
        <Pressable
          onPress={() => setDetail(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}
        >
          {detail && (
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                width: width - 28,
                maxHeight: height - 120,
                backgroundColor: '#fff',
                borderRadius: 18,
                overflow: 'hidden',
                borderWidth: 2,
                borderColor: ORANGE,
              }}
            >
              <View style={{ height: 260, backgroundColor: '#F3F4F6' }}>
                {detail.image_url ? <Image source={{ uri: detail.image_url }} style={{ width: '100%', height: '100%' }} /> : null}
              </View>
              <View style={{ padding: 14 }}>
                <Text style={{ fontSize: 18, fontWeight: '900', textAlign: 'center', includeFontPadding: false }}>
                  {detail.name}
                </Text>
                {!!detail.description && (
                  <Text style={{ marginTop: 6, color: '#374151', textAlign: 'center', includeFontPadding: false }}>
                    {detail.description}
                  </Text>
                )}
                <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ color: '#6B7280' }}>Fiyat</Text>
                    <Text style={{ fontWeight: '900', color: ORANGE }}>{detail.int_price.toLocaleString()} XP</Text>
                    <Text style={{ marginTop: 2, color: '#6B7280' }}>Stok: {detail.stock}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => buy(detail)}
                    activeOpacity={0.9}
                    style={{ backgroundColor: ORANGE, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12 }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '900' }}>Satın Al</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
