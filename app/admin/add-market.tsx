'use client';

import { publicUrl, uploadImage } from '@/lib/storage';
import { supabase } from '@/lib/supabaseClient';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert, FlatList, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';

const MEDIA_BUCKET = 'Media';
const BRAND = '#FF6B00';
const MUTED = '#6B7280';

type Cat = { id: string; name: string };
type RewardRow = {
  id: string; name: string; image_url: string | null;
  int_price: number; stock: number; category_id: string | null;
};

// utils
function uid() { return Math.random().toString(36).slice(2); }
const guessExt = (uri: string) => {
  const raw = uri.split('?')[0].split('#')[0];
  const ext = raw.includes('.') ? raw.slice(raw.lastIndexOf('.') + 1).toLowerCase() : 'jpg';
  return ext === 'jpeg' ? 'jpg' : ext;
};
async function uploadToMediaBucket(uri: string, path: string) {
  await uploadImage(uri, path, { bucket: MEDIA_BUCKET });
  return path;
}

// raf tipleri (UI için – DB değişmiyor)
type ShelfType = 'podium'|'hanger'|'wood'|'glass'|'cubbies'|'holo'|'xppacks';
function detectShelfType(name?: string): ShelfType {
  const n = (name || '').toLowerCase();
  if (/(büyük ödül|grand|premium)/i.test(name || '')) return 'podium';
  if (/(giyim|tişört|tshirt|hoodie|şapka|kıyafet|merch)/i.test(n)) return 'hanger';
  if (/(beyaz eşya|çamaşır|bulaşık|buzdolabı)/i.test(n)) return 'wood';
  if (/(ev aleti|elektronik|kulaklık|tablet|tv|monitor|kahve)/i.test(n)) return 'glass';
  if (/(aksesuar|koleksiyon|sticker|kupa|anahtarlık|pin|rozet)/i.test(n)) return 'cubbies';
  if (/(dijital|gift|kart|abonelik|subscription|oyun içi|in-game)/i.test(n)) return 'holo';
  if (/(xp|boost|paket|paketi)/i.test(n)) return 'xppacks';
  return 'wood';
}
function shelfBadge(t: ShelfType) {
  switch (t) {
    case 'podium':  return '🏆 Podyum';
    case 'hanger':  return '👚 Askılı Raf';
    case 'wood':    return '🪵 Tahta Raf';
    case 'glass':   return '🧊 Cam Raf';
    case 'cubbies': return '🧩 Küp Raf';
    case 'holo':    return '✨ Hologram Kart';
    case 'xppacks': return '⚡️ XP Kutuları';
  }
}

// önerilen kategoriler
const PRESETS: { label: string; emoji: string }[] = [
  { label: 'Büyük Ödül', emoji: '🏆' },
  { label: 'Giyim', emoji: '👚' },
  { label: 'Beyaz Eşya', emoji: '🪵' },
  { label: 'Ev Aletleri / Elektronik', emoji: '🧊' },
  { label: 'Aksesuar / Koleksiyon', emoji: '🧩' },
  { label: 'Dijital Ödüller', emoji: '✨' },
  { label: 'XP Paketleri', emoji: '⚡️' },
];

export default function AddMarket() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [catName, setCatName] = useState('');
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const [name, setName]   = useState('');
  const [desc, setDesc]   = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // yönetim listesi
  const [items, setItems] = useState<RewardRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  // kategoriler
  const loadCats = async () => {
    const { data } = await supabase.from('reward_categories').select('id,name').order('name');
    setCats((data ?? []) as Cat[]);
  };
  useEffect(() => { loadCats(); }, []);

  // preset seç → yoksa oluştur
  const selectOrCreatePreset = async (label: string) => {
    const existing = cats.find(c => c.name.toLowerCase() === label.toLowerCase());
    if (existing) { setActiveCat(existing.id); return; }
    const { data, error } = await supabase.from('reward_categories')
      .insert([{ name: label }]).select('id').single();
    if (error) { Alert.alert('Hata', error.message); return; }
    await loadCats();
    setActiveCat(data!.id);
  };

  // manuel kategori oluştur
  const createCat = async () => {
    if (!catName.trim()) return;
    const { data, error } = await supabase.from('reward_categories').insert([{ name: catName }]).select('id').single();
    if (error) return Alert.alert('Hata', error.message);
    setCatName('');
    await loadCats();
    setActiveCat(data!.id);
    Alert.alert('OK', 'Kategori eklendi');
  };

  // kategori değişince ürünleri getir
  const loadItems = async () => {
    if (!activeCat) { setItems([]); return; }
    setLoadingList(true);
    // 🔥 SADECE AKTİF ÜRÜNLERİ GETİRİYORUZ (Silinenler gelmesin)
    const { data, error } = await supabase
      .from('rewards')
      .select('id,name,image_url,int_price,stock,category_id')
      .eq('category_id', activeCat)
      .eq('is_active', true) 
      .order('created_at', { ascending: false });
    if (!error) setItems((data ?? []) as RewardRow[]);
    setLoadingList(false);
  };
  useEffect(() => { loadItems(); }, [activeCat]);

  // görsel seç
  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return Alert.alert('İzin gerekli', 'Galeriden seçim izni ver.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9, allowsEditing: true });
    if (res.canceled) return;
    const a = res.assets?.[0]; if (!a?.uri) return;
    setLocalUri(a.uri);
  };

  // ödül ekle
  const createItem = async () => {
    if (saving) return;
    if (!activeCat)      return Alert.alert('Eksik', 'Kategori seçmelisin.');
    if (!name.trim())    return Alert.alert('Eksik', 'Ödül adı gerekli.');
    if (!price.trim() || Number.isNaN(Number(price))) return Alert.alert('Eksik', 'Geçerli bir XP fiyatı gir.');
    if (stock && Number.isNaN(Number(stock))) return Alert.alert('Eksik', 'Stok sayısı sayı olmalı.');

    try {
      setSaving(true);
      let image_url: string | null = null;
      if (localUri) {
        const path = await uploadToMediaBucket(localUri, `rewards/${activeCat}/${uid()}.${guessExt(localUri)}`);
        const pub = publicUrl(path, MEDIA_BUCKET);
        image_url = pub || path;
      }
      const { error } = await supabase.from('rewards').insert([{
        category_id: activeCat,
        name: name.trim(),
        description: desc.trim() || null,
        int_price: Number(price),
        stock: Number(stock || '0'),
        image_url,
        is_active: true // Yeni eklenenler aktif olsun
      }]);
      if (error) throw error;

      setName(''); setDesc(''); setPrice(''); setStock(''); setLocalUri(null);
      await loadItems();
      Alert.alert('OK', 'Ödül eklendi');
    } catch (e: any) {
      Alert.alert('Hata', e?.message ?? 'Odul kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  // 🔥 SOFT DELETE (GİZLEME) FONKSİYONU
  const deleteItem = async (row: RewardRow) => {
    Alert.alert('Silinsin mi?', `"${row.name}" marketten kaldırılacak.`, [
      { text: 'Vazgeç' },
      {
        text: 'Sil', style: 'destructive',
        onPress: async () => {
          try {
            // DELETE yerine UPDATE yapıyoruz -> is_active = false
            const { error } = await supabase
              .from('rewards')
              .update({ is_active: false })
              .eq('id', row.id);

            if (error) throw error;
            
            // Listeden anında siliyoruz (UI güncellemesi)
            setItems(prev => prev.filter(i => i.id !== row.id));
          } catch (e: any) {
            Alert.alert('Silinemedi', e?.message ?? 'Bilinmeyen hata');
          }
        }
      }
    ]);
  };

  // *** KATEGORİ SİLME (Soft Delete Entegreli) ***
  const deleteCategory = async (catId: string, catName: string) => {
    try {
      // Bu kategorideki aktif ürün sayısı
      const countRes = await supabase
        .from('rewards')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', catId)
        .eq('is_active', true);
      const total = countRes.count ?? 0;

      const msg = total > 0
        ? `"${catName}" kategorisinde ${total} ürün var.\n\n` +
          '• "Kategoriyi Sil" dersen ürünler gizlenir.'
        : `"${catName}" kategorisini silmek istiyor musun?`;

      Alert.alert('Kategori Sil', msg, [
        { text: 'Vazgeç' },
        {
          text: 'Kategoriyi Sil',
          style: 'destructive',
          onPress: async () => {
            // 1) Önce ürünleri gizle
            await supabase.from('rewards').update({ is_active: false }).eq('category_id', catId);
            
            // 2) Sonra kategoriyi sil
            const { error } = await supabase.from('reward_categories').delete().eq('id', catId);
            
            if (error) { 
                Alert.alert('Bilgi', 'Kategori ilişkili veriler nedeniyle tam silinemedi ama ürünler gizlendi.'); 
            } else {
                Alert.alert('OK', 'Kategori silindi');
            }
            
            if (activeCat === catId) { setActiveCat(null); setItems([]); }
            await loadCats();
          }
        }
      ]);
    } catch (e: any) {
      Alert.alert('Hata', e?.message ?? 'Kategori silinemedi');
    }
  };

  // seçili kategori / rozet
  const activeCatObj = useMemo(() => cats.find(c => c.id === activeCat) || null, [cats, activeCat]);
  const shelfType: ShelfType = detectShelfType(activeCatObj?.name);
  const shelfHint = shelfBadge(shelfType);

  // küçük market önizlemesi
  const Preview = () => {
    if (!name && !localUri && !price) return null;
    const p = Number(price || 0);
    return (
      <View style={styles.preview}>
        <Text style={styles.previewTitle}>Market Önizleme</Text>
        <View style={[
          styles.rail,
          shelfType === 'wood'  && { backgroundColor: '#f6d6be' },
          shelfType === 'glass' && { backgroundColor: '#ECF8FF', borderColor:'#EAF6FF', borderWidth:1 },
          shelfType === 'holo'  && { backgroundColor: '#0b1020' },
          shelfType === 'xppacks' && { backgroundColor: '#FFF2E8', borderColor: BRAND, borderWidth: 1 }
        ]} />
        <View style={styles.previewCardWrap}>
          <View style={[
            styles.previewCard,
            shelfType === 'holo' && { backgroundColor:'#0b1020', borderColor:'#22D3EEaa', borderWidth:2 },
          ]}>
            <View style={[styles.previewImg, shelfType === 'holo' && { backgroundColor:'#111827' }]}>
              {localUri ? <Image source={{ uri: localUri }} style={{ width:'100%', height:'100%' }} /> : null}
            </View>
            <Text numberOfLines={1} style={[styles.previewName, shelfType === 'holo' && { color:'#E5E7EB' }]}>{name || 'Ödül adı'}</Text>
            <Text style={[styles.previewPrice, shelfType === 'holo' && { color:'#A78BFA' }]}>{p.toLocaleString()} XP</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
      {/* Önerilen kategoriler */}
      <Text style={styles.header}>Önerilen Kategoriler</Text>
      <FlatList
        data={PRESETS}
        horizontal
        keyExtractor={(i) => i.label}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 6 }}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => selectOrCreatePreset(item.label)}
            style={[styles.presetChip, { borderColor: '#eee' }]}>
            <Text style={{ fontSize: 16, marginRight: 6 }}>{item.emoji}</Text>
            <Text style={{ fontWeight: '800' }}>{item.label}</Text>
          </TouchableOpacity>
        )}
      />

      {/* Mevcut kategoriler (SEÇ + SİL) */}
      <Text style={[styles.header, { marginTop: 18 }]}>Kategori Seç</Text>
      <FlatList
        data={cats}
        keyExtractor={(i) => i.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 6 }}
        renderItem={({ item }) => {
          const active = activeCat === item.id;
          return (
            <View style={styles.catPillWrap}>
              <TouchableOpacity onPress={() => setActiveCat(item.id)}
                style={[styles.chip, active && { backgroundColor: '#FFEEE2', borderColor: BRAND }]}>
                <Text style={[styles.chipTxt, active && { color: BRAND, fontWeight: '900' }]}>{item.name}</Text>
              </TouchableOpacity>

              {/* Sil butonu */}
              <TouchableOpacity
                onPress={() => deleteCategory(item.id, item.name)}
                style={styles.catDelBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={{ color: '#fff', fontWeight: '900' }}>×</Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />

      {/* rozet */}
      {activeCatObj && (
        <View style={styles.badgeRow}>
          <Text style={{ color: MUTED }}>Raf Tipi:</Text>
          <Text style={{ marginLeft: 6, fontWeight: '900', color: BRAND }}>{shelfHint}</Text>
        </View>
      )}

      {/* Yeni kategori oluştur */}
      <Text style={[styles.header, { marginTop: 18 }]}>Yeni Kategori Ekle</Text>
      <View style={styles.row}>
        <TextInput value={catName} onChangeText={setCatName} placeholder="Kategori adı" style={styles.input} />
        <TouchableOpacity onPress={createCat} style={styles.btn}><Text style={styles.btnTxt}>Kaydet</Text></TouchableOpacity>
      </View>

      {/* Ödül formu */}
      <Text style={[styles.header, { marginTop: 24 }]}>Ödül Ekle</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Ödül adı" style={styles.input} />
      <TextInput value={desc} onChangeText={setDesc} placeholder="Açıklama (opsiyonel)" style={styles.input} />
      <TextInput value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="XP fiyatı" style={styles.input} />
      <TextInput value={stock} onChangeText={setStock} keyboardType="numeric" placeholder="Stok (opsiyonel)" style={styles.input} />

      <Text style={[styles.sub, { marginTop: 8 }]}>Görsel</Text>
      {localUri
        ? <Image source={{ uri: localUri }} style={{ width: '100%', height: 180, borderRadius: 12 }} />
        : <View style={{ width: '100%', height: 160, borderRadius: 12, backgroundColor: '#f3f3f3' }} />}
      <TouchableOpacity onPress={pickImage} style={[styles.btn, { backgroundColor: '#3D5AFE', marginTop: 8 }]}>
        <Text style={styles.btnTxt}>Görsel Seç</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={createItem} disabled={!activeCat || saving}
        style={[styles.btn, { opacity: activeCat && !saving ? 1 : 0.6, marginTop: 10 }]}>
        <Text style={styles.btnTxt}>{saving ? 'Kaydediliyor...' : 'Ödülü Kaydet'}</Text>
      </TouchableOpacity>

      {/* canlı market önizleme */}
      <Preview />

      {/* Yönetim: Seçili kategorideki ödüller */}
      <Text style={[styles.header, { marginTop: 26 }]}>Ödülleri Yönet</Text>
      {!activeCat && <Text style={{ color: MUTED, marginTop: 6 }}>Önce bir kategori seç.</Text>}
      {activeCat && (
        <>
          {loadingList ? (
            <Text style={{ color: MUTED, marginTop: 8 }}>Yükleniyor…</Text>
          ) : items.length === 0 ? (
            <Text style={{ color: MUTED, marginTop: 8 }}>Bu kategoride ürün yok.</Text>
          ) : (
            <View style={{ marginTop: 8 }}>
              {items.map(row => (
                <View key={row.id} style={styles.rowItem}>
                  <View style={styles.thumb}>
                    {row.image_url ? <Image source={{ uri: row.image_url }} style={{ width: '100%', height: '100%', borderRadius: 8 }} /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontWeight: '900' }}>{row.name}</Text>
                    <Text style={{ color: MUTED, marginTop: 2 }}>
                      {row.int_price.toLocaleString()} XP · Stok: {row.stock}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => deleteItem(row)} style={styles.deleteBtn}>
                    <Text style={{ color:'#fff', fontWeight:'900' }}>Sil</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </>
      )}
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

  presetChip: { flexDirection:'row', alignItems:'center', borderWidth:1, paddingHorizontal:12, paddingVertical:8, borderRadius:999, marginRight:8, backgroundColor:'#fff' },

  chip: { borderWidth: 1, borderColor: '#eee', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginRight: 8, backgroundColor:'#fff' },
  chipTxt: { color: '#333', fontWeight: '700' },

  // kategori pill + sil
  catPillWrap: { position: 'relative', marginRight: 8, justifyContent:'center' },
  catDelBtn: {
    position: 'absolute', top: -6, right: -6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#E53935', alignItems:'center', justifyContent:'center',
    borderWidth: 1, borderColor: '#fff'
  },

  badgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, marginBottom: 6 },

  // önizleme
  preview: { marginTop: 22 },
  previewTitle: { fontWeight: '900', marginBottom: 8 },
  rail: { height: 12, backgroundColor: '#E6E7EB', borderRadius: 8, marginBottom: 10 },
  previewCardWrap: { alignItems: 'flex-start' },
  previewCard: { backgroundColor:'#fff', borderRadius: 14, padding: 10, borderWidth:1, borderColor:'#EFEFEF', width: 180 },
  previewImg: { height: 100, borderRadius: 10, backgroundColor:'#F3F4F6', overflow:'hidden' },
  previewName: { fontWeight: '900', marginTop: 6 },
  previewPrice: { color: BRAND, fontWeight: '900' },

  // yönetim listesi
  rowItem: { flexDirection:'row', alignItems:'center', gap:10, paddingVertical:10, borderBottomWidth:1, borderColor:'#F3F4F6' },
  thumb: { width:48, height:48, borderRadius:8, backgroundColor:'#F3F4F6', overflow:'hidden' },
  deleteBtn: { backgroundColor:'#E53935', paddingHorizontal:12, paddingVertical:8, borderRadius:10 }
});
