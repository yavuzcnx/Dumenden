'use client';

import { supabase } from '@/lib/supabaseClient';
import { decode as atob } from 'base-64';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

const MEDIA_BUCKET = 'Media';

type Coupon = { id: string; title: string; closing_date: string; image_url: string | null; };

const ORANGE = '#FF6B00';

function uid() { return Math.random().toString(36).slice(2); }
function guessExt(uri: string) { const raw = uri.split(/[?#]/)[0]; const e = raw.includes('.') ? raw.slice(raw.lastIndexOf('.')+1).toLowerCase() : 'jpg'; return e==='jpeg'?'jpg':e; }
function ct(e: string) { return e==='jpg'?'image/jpeg': e==='heic'?'image/heic': `image/${e}`; }
async function uploadToMediaBucket(uri: string, path: string) {
  const ext = guessExt(uri);
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const bin = atob(base64); const bytes = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, bytes, { upsert:false, contentType: ct(ext) });
  if (error) throw error;
  return path;
}

export default function AddProof() {
  const router = useRouter();
  const [amIAdmin, setAmIAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState('');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [selected, setSelected] = useState<Coupon | null>(null);

  const [title, setTitle] = useState('');
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<'approved' | 'pending'>('approved');

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) { setLoading(false); return; }
      const { data } = await supabase.from('admins').select('user_id').eq('user_id', uid).maybeSingle();
      setAmIAdmin(!!data); setLoading(false);
    })();
  }, []);

  const loadCoupons = async (term: string) => {
    const base = supabase.from('coupons').select('id,title,closing_date,image_url').order('created_at', { ascending:false }).limit(200);
    const { data } = await (term.trim() ? base.ilike('title', `%${term.trim()}%`) : base);
    setCoupons((data ?? []) as any);
  };
  useEffect(() => { loadCoupons(''); }, []);
  useEffect(() => { const t = setTimeout(()=>loadCoupons(q), 250); return () => clearTimeout(t); }, [q]);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return Alert.alert('İzin gerekli', 'Galeriden seçim izni ver.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing:true, quality:0.9 });
    if (res.canceled) return;
    const a = res.assets?.[0]; if (!a?.uri) return;
    setLocalUri(a.uri);
  };

  const save = async () => {
    try {
      if (!amIAdmin) return Alert.alert('Yetki yok', 'Sadece admin ekleyebilir.');
      if (!selected) return Alert.alert('Eksik', 'Bir kupon seç.');
      if (!localUri) return Alert.alert('Eksik', 'Bir görsel seç.');

      setUploading(true);
      const path = `proofs/${selected.id}/${uid()}.${guessExt(localUri)}`;
      const storagePath = await uploadToMediaBucket(localUri, path);
      const pub = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath).data?.publicUrl;
      const mediaUrl = pub ?? storagePath;

      const { data: auth } = await supabase.auth.getUser();
      await supabase.from('coupon_proofs').insert([{
        coupon_id: selected.id,
        title: title || null,
        media_url: mediaUrl,
        status,
        created_by: auth?.user?.id ?? null,
      }]);

      Alert.alert('Tamam', 'Kanıt eklendi');
      setTitle(''); setLocalUri(null);
      // seçili kuponu BIRAKIYORUM (admin karışmasın diye)
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Kaydedilemedi.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <Center><ActivityIndicator /><Text>Yükleniyor…</Text></Center>;
  if (!amIAdmin) return (
    <Center>
      <Text style={{ fontSize:24, fontWeight:'900', color:ORANGE, marginBottom:6 }}>Admin Paneli</Text>
      <Text>Bu sayfa sadece adminler içindir.</Text>
    </Center>
  );

  return (
    <ScrollView contentContainerStyle={{ padding:16 }}>
      <Text style={{ fontSize:22, fontWeight:'900', color:ORANGE }}>Kanıt Ekle (Admin)</Text>

      <Text style={{ marginTop:16, fontWeight:'800' }}>Kupon seç</Text>
      <TextInput
        value={q} onChangeText={setQ} placeholder="Başlıkta ara…"
        style={{ borderWidth:1, borderColor:'#ddd', borderRadius:12, padding:10, marginTop:8 }}
      />

      <FlatList
        data={coupons}
        keyExtractor={(i)=>i.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginTop:10 }}
        renderItem={({ item }) => {
          const active = selected?.id === item.id;
          return (
            <TouchableOpacity
              onPress={()=>setSelected(item)}
              style={{
                width: 220, marginRight:10, padding:10, borderRadius:12,
                borderWidth:2, borderColor: active ? ORANGE : '#eee', backgroundColor:'#fff'
              }}>
              {item.image_url
                ? <Image source={{ uri: item.image_url }} style={{ width:'100%', height:100, borderRadius:8 }} />
                : <View style={{ width:'100%', height:100, borderRadius:8, backgroundColor:'#eee' }} />}
              <Text style={{ fontWeight:'900', marginTop:6 }} numberOfLines={2}>{item.title}</Text>
              <Text style={{ color:'#777' }}>Kapanış: {item.closing_date?.split('T')[0]}</Text>
            </TouchableOpacity>
          );
        }}
      />

      <Text style={{ marginTop:16, fontWeight:'800' }}>Başlık (opsiyonel)</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="Kısa açıklama…"
        style={{ borderWidth:1, borderColor:'#ddd', borderRadius:12, padding:10, marginTop:8 }} />

      <Text style={{ marginTop:16, fontWeight:'800' }}>Durum</Text>
      <View style={{ flexDirection:'row', gap:10, marginTop:8 }}>
        {(['approved','pending'] as const).map(s=>(
          <TouchableOpacity key={s} onPress={()=>setStatus(s)}
            style={{
              paddingVertical:8,paddingHorizontal:14,borderRadius:10,
              borderWidth:1,borderColor:status===s?ORANGE:'#ddd',
              backgroundColor: status===s?'#FFEEE2':'#fff'
            }}>
            <Text style={{ color:status===s?ORANGE:'#333', fontWeight:'800' }}>
              {s==='approved'?'Onaylı':'Beklemede'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={{ marginTop:16, fontWeight:'800' }}>Görsel</Text>
      {localUri
        ? <Image source={{ uri: localUri }} style={{ width:'100%', height:220, borderRadius:12, marginTop:8 }} />
        : <View style={{ width:'100%', height:180, borderRadius:12, backgroundColor:'#f3f3f3', marginTop:8, alignItems:'center', justifyContent:'center' }}>
            <Text style={{ color:'#777' }}>Henüz seçilmedi</Text>
          </View>}

      <TouchableOpacity onPress={pickImage}
        style={{ backgroundColor:'#3D5AFE', padding:12, borderRadius:12, alignItems:'center', marginTop:10 }}>
        <Text style={{ color:'#fff', fontWeight:'900' }}>{localUri ? 'Değiştir' : 'Görsel Seç'}</Text>
      </TouchableOpacity>

      <TouchableOpacity disabled={!selected || !localUri || uploading} onPress={save}
        style={{ opacity: (!selected || !localUri || uploading) ? .6 : 1, backgroundColor:ORANGE, padding:14, borderRadius:12, alignItems:'center', marginTop:14 }}>
        <Text style={{ color:'#fff', fontWeight:'900' }}>{uploading ? 'Kaydediliyor…' : 'Kaydet'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Center({ children }: { children: any }) {
  return <View style={{ flex:1, alignItems:'center', justifyContent:'center', padding:24 }}>{children}</View>;
}
