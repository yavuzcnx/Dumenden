'use client';

import { supabase } from '@/lib/supabaseClient';
import { decode as atob } from 'base-64';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const MEDIA_BUCKET = 'Media';
const BRAND = '#FF6B00';

type Cat = { id: string; name: string };

function uid() { return Math.random().toString(36).slice(2); }
const guessExt = (uri: string) => {
  const raw = uri.split('?')[0].split('#')[0];
  const ext = raw.includes('.') ? raw.slice(raw.lastIndexOf('.') + 1).toLowerCase() : 'jpg';
  return ext === 'jpeg' ? 'jpg' : ext;
};
const contentType = (ext: string) => (ext === 'jpg' ? 'image/jpeg' : ext === 'heic' ? 'image/heic' : `image/${ext}`);
async function uploadToMediaBucket(uri: string, path: string) {
  const ext = guessExt(uri);
  const ct = contentType(ext);
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: ct, upsert: false });
  if (error) throw error;
  return path;
}

export default function AddMarket() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [catName, setCatName] = useState('');
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [localUri, setLocalUri] = useState<string | null>(null);

  const loadCats = async () => {
    const { data } = await supabase.from('reward_categories').select('id,name').order('name');
    setCats((data ?? []) as any);
  };
  useEffect(() => { loadCats(); }, []);

  const createCat = async () => {
    if (!catName.trim()) return;
    const { data, error } = await supabase.from('reward_categories').insert([{ name: catName }]).select('id').single();
    if (error) return Alert.alert('Hata', error.message);
    setCatName('');
    await loadCats();
    setActiveCat(data!.id);
    Alert.alert('OK', 'Kategori eklendi');
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return Alert.alert('İzin gerekli', 'Galeriden seçim izni ver.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9, allowsEditing: true });
    if (res.canceled) return;
    const a = res.assets?.[0];
    if (!a?.uri) return;
    setLocalUri(a.uri);
  };

  const createItem = async () => {
    if (!activeCat || !name.trim() || !price) return Alert.alert('Eksik', 'Kategori, isim ve fiyat gerekli.');
    let image_url: string | null = null;
    if (localUri) {
      const path = await uploadToMediaBucket(localUri, `rewards/${activeCat}/${uid()}.${guessExt(localUri)}`);
      const pub = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data?.publicUrl;
      image_url = pub ?? path;
    }
    const { error } = await supabase.from('rewards').insert([{
      category_id: activeCat, name, description: desc || null, int_price: Number(price), stock: Number(stock || '0'), image_url
    }]);
    if (error) return Alert.alert('Hata', error.message);
    setName(''); setDesc(''); setPrice(''); setStock(''); setLocalUri(null);
    Alert.alert('OK', 'Ödül eklendi');
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.header}>Kategori Ekle</Text>
      <View style={styles.row}>
        <TextInput value={catName} onChangeText={setCatName} placeholder="Kategori adı"
          style={styles.input} />
        <TouchableOpacity onPress={createCat} style={styles.btn}><Text style={styles.btnTxt}>Kaydet</Text></TouchableOpacity>
      </View>

      <Text style={[styles.header, { marginTop: 24 }]}>Kategori Seç</Text>
      <FlatList
        data={cats}
        keyExtractor={(i) => i.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 6 }}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => setActiveCat(item.id)}
            style={[styles.chip, activeCat === item.id && { backgroundColor: '#FFEEE2', borderColor: BRAND }]}>
            <Text style={[styles.chipTxt, activeCat === item.id && { color: BRAND, fontWeight: '900' }]}>{item.name}</Text>
          </TouchableOpacity>
        )}
      />

      <Text style={[styles.header, { marginTop: 24 }]}>Ödül Ekle</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Ödül adı" style={styles.input} />
      <TextInput value={desc} onChangeText={setDesc} placeholder="Açıklama" style={styles.input} />
      <TextInput value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="XP fiyatı" style={styles.input} />
      <TextInput value={stock} onChangeText={setStock} keyboardType="numeric" placeholder="Stok" style={styles.input} />

      <Text style={[styles.sub, { marginTop: 8 }]}>Görsel</Text>
      {localUri
        ? <Image source={{ uri: localUri }} style={{ width: '100%', height: 180, borderRadius: 12 }} />
        : <View style={{ width: '100%', height: 160, borderRadius: 12, backgroundColor: '#f3f3f3' }} />}
      <TouchableOpacity onPress={pickImage} style={[styles.btn, { backgroundColor: '#3D5AFE', marginTop: 8 }]}>
        <Text style={styles.btnTxt}>Görsel Seç</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={createItem} disabled={!activeCat} style={[styles.btn, { opacity: activeCat ? 1 : 0.6, marginTop: 10 }]}>
        <Text style={styles.btnTxt}>Ödülü Kaydet</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 18, fontWeight: '900', color: BRAND },
  sub: { color: '#333', fontWeight: '800' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 12, marginTop: 8 },
  btn: { backgroundColor: BRAND, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: '900' },
  chip: { borderWidth: 1, borderColor: '#eee', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginRight: 8, backgroundColor: '#fff' },
  chipTxt: { color: '#333', fontWeight: '700' }
});
