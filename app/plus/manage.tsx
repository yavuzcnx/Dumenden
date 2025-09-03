// app/manage-my-submissions.tsx
'use client';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Text, TouchableOpacity, View } from 'react-native';

type Row = {
  id: string;
  title: string;
  status: 'pending'|'approved'|'rejected'|'withdrawn';
  closing_date: string;
  category: string;
};

const BRAND = '#FF6B00';
const TABS = [
  { key: 'all', label: 'Tümü' },
  { key: 'pending', label: 'Beklemede' },
  { key: 'approved', label: 'Onaylandı' },
  { key: 'rejected', label: 'Reddedildi' },
  { key: 'withdrawn', label: 'Kaldırılan' },
] as const;
type TabKey = typeof TABS[number]['key'];

export default function ManageMySubmissions() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('all');
  const [rows, setRows] = useState<Row[]>([]);
  const [uid, setUid] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!uid) return;
    let q = supabase
      .from('coupon_submissions')
      .select('id,title,status,closing_date,category')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    if (tab !== 'all') q = q.eq('status', tab);
    const { data, error } = await q;
    if (error) { Alert.alert('Hata', error.message); return; }
    setRows((data || []) as Row[]);
  }, [uid, tab]);

  useEffect(() => { (async () => {
    const { data: au } = await supabase.auth.getUser();
    setUid(au?.user?.id ?? null);
  })(); }, []);
  useEffect(() => { load(); }, [load]);

  const tag = (s: Row['status']) => {
    switch (s) {
      case 'approved': return { label: 'Onaylandı', bg: '#E8F5E9', fg: '#1B5E20' };
      case 'rejected': return { label: 'Reddedildi', bg: '#FFEBEE', fg: '#B71C1C' };
      case 'withdrawn':return { label: 'Kaldırıldı', bg: '#ECEFF1', fg: '#455A64' };
      default:         return { label: 'Beklemede', bg: '#FFF8E1', fg: '#8D6E63' };
    }
  };

  const withdraw = async (id: string) => {
    Alert.alert('Kaldır', 'Öneriyi kaldırmak ister misin?', [
      { text:'Vazgeç', style:'cancel' },
      { text:'Evet', style:'destructive', onPress: async () => {
          const { error } = await supabase
            .from('coupon_submissions')
            .update({ status: 'withdrawn' })
            .eq('id', id)
            .eq('user_id', uid!);
          if (error) { Alert.alert('Hata', error.message); return; }
          setRows(prev => prev.filter(r => r.id !== id));
        }
      }
    ]);
  };

  const Item = ({ item }: { item: Row }) => {
    const t = tag(item.status);
    const canEdit = item.status === 'pending';
    const canWithdraw = item.status === 'pending';
    return (
      <View style={{ borderWidth:1, borderColor:'#eee', borderRadius:12, padding:12, marginBottom:10 }}>
        <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
          <Text style={{ fontWeight:'900', flex:1 }} numberOfLines={1}>{item.title}</Text>
          <View style={{ backgroundColor:t.bg, paddingHorizontal:8, paddingVertical:4, borderRadius:8, marginLeft:8 }}>
            <Text style={{ color:t.fg, fontWeight:'800', fontSize:12 }}>{t.label}</Text>
          </View>
        </View>
        <Text style={{ color:'#666', marginTop:4 }}>
          {item.category} • Kapanış: {new Date(item.closing_date).toLocaleString()}
        </Text>

        <View style={{ flexDirection:'row', gap:8, marginTop:10 }}>
          <TouchableOpacity
            disabled={!canEdit}
            onPress={() => router.push('/(modals)/create')}
            style={{ flex:1, backgroundColor: canEdit ? '#e0e0e0' : '#f5f5f5', padding:10, borderRadius:10 }}>
            <Text style={{ textAlign:'center', fontWeight:'800', color: canEdit ? '#000' : '#aaa' }}>Düzenle</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/admin/add-proof')} style={{ flex:1, backgroundColor:BRAND, padding:10, borderRadius:10 }}>
            <Text style={{ textAlign:'center', color:'#fff', fontWeight:'900' }}>Kanıt Ekle</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={!canWithdraw}
            onPress={() => withdraw(item.id)}
            style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:10, backgroundColor: canWithdraw ? '#ef4444' : '#f5f5f5' }}>
            <Text style={{ color: canWithdraw ? '#fff' : '#aaa', fontWeight:'900' }}>Sil</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex:1, backgroundColor:'#fff' }}>
      <View style={{ paddingTop:56, paddingHorizontal:16, paddingBottom:8, backgroundColor:'#fff' }}>
        <Text style={{ fontSize:22, fontWeight:'900', color:BRAND, marginBottom:10 }}>Kuponlarım</Text>
        <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8 }}>
          {TABS.map(t => (
            <Pressable key={t.key} onPress={()=>setTab(t.key)} style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:12, backgroundColor: tab===t.key ? BRAND : '#eee' }}>
              <Text style={{ color: tab===t.key ? '#fff' : '#333', fontWeight:'700' }}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(x) => x.id}
        renderItem={Item}
        contentContainerStyle={{ padding:16, paddingBottom:24 }}
        ListEmptyComponent={<Text style={{ textAlign:'center', color:'#888', marginTop:24 }}>Bu kategoride önerin yok.</Text>}
      />
    </View>
  );
}
