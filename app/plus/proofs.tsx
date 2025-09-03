// app/plus/proofs.tsx
import { uploadImage } from '@/lib/storage';
import { supabase } from '@/lib/supabaseClient';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Pressable, SafeAreaView, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';

const BRAND = '#FF6B00';
const SOFT  = '#FFF2E8';
const BORDER= '#F2D9C8';

type MyCoupon = { id: string; title: string };

export default function ProofsForPlus() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [coupons, setCoupons] = useState<MyCoupon[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [img, setImg] = useState<{ uri: string; w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(true);
  const [sending, setSending] = useState(false);

  // Kullanıcı kuponlarını getir
  useEffect(() => {
    (async () => {
      const { data: au } = await supabase.auth.getUser();
      const u = au?.user;
      if (!u) { setBusy(false); Alert.alert('Oturum yok', 'Lütfen giriş yap.'); return; }
      setUid(u.id);

      // ✅ Kullanıcının kendi oluşturduğu user-generated kuponlar
      const { data, error } = await supabase
        .from('coupons')
        .select('id,title')
        .eq('author_id', u.id)
        .eq('is_user_generated', true)
        .order('created_at', { ascending: false });

      if (error) console.log('COUPONS ERR', error);
      const list = (data ?? []) as MyCoupon[];
      setCoupons(list);
      setSelected(list[0]?.id ?? null);
      setBusy(false);
    })();
  }, []);

  // Fotoğraf seç
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('İzin gerekli', 'Görsel seçmek için izin ver.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: true
    });
    if (res.canceled) return;
    const a = res.assets?.[0]; if (!a) return;

    const maxW = 1200;
    const ratio = a.width > maxW ? maxW / a.width : 1;
    const mani = await ImageManipulator.manipulateAsync(
      a.uri,
      [{ resize: { width: Math.round(a.width * ratio) } }],
      { compress: 0.86, format: ImageManipulator.SaveFormat.JPEG }
    );
    setImg({ uri: mani.uri, w: mani.width ?? a.width, h: mani.height ?? a.height });
  };

  // Gönder
  const submit = async () => {
    if (!uid || !selected) return;
    if (!img) { Alert.alert('Görsel eksik', 'Bir görsel seç.'); return; }

    try {
      setSending(true);

      // Benzersiz dosya adı üret
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const destPath = `proofs/${uid}/${fileName}`;

      // Storage'a yükle
      await uploadImage(img.uri, destPath);

      // DB'ye kaydet
      const { error } = await supabase.from('coupon_proofs').insert({
        coupon_id: selected,
        title: title.trim() || null,
        media_url: destPath,
        status: 'pending',
        created_by: uid,
      });
      if (error) throw error;

      Alert.alert('Gönderildi', 'Kanıtın admin onayına gönderildi.');
      router.back();
    } catch (e: any) {
      Alert.alert('Gönderilemedi', e?.message ?? 'Hata');
    } finally {
      setSending(false);
    }
  };

  if (busy) {
    return (
      <SafeAreaView style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
        <ActivityIndicator color={BRAND} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:'#fff' }}>
      <ScrollView contentContainerStyle={{ padding:16, paddingBottom:24 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 6, marginRight: 8 }}>
            <Text style={{ color: BRAND, fontWeight: '900' }}>{'<'} Geri</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: '900', color: BRAND }}>Kanıt Ekle</Text>
        </View>

        {/* Kupon seçimi */}
        <Text style={styles.label}>Kuponunu Seç</Text>
        {coupons.length === 0 ? (
          <Text style={{ color:'#666', marginTop:6 }}>
            Henüz kullanıcı üretimli bir kuponun yok. Keşfet’e kupon gönderip onaylat, sonra burada kanıt ekleyebilirsin.
          </Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:10, marginTop:8 }}>
            {coupons.map(c => {
              const active = selected === c.id;
              return (
                <Pressable key={c.id} onPress={() => setSelected(c.id)} style={[styles.selCard, active && styles.selActive]}>
                  <Text style={{ fontWeight:'900', color: active ? BRAND : '#333' }} numberOfLines={3}>{c.title}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Başlık (opsiyonel) */}
        <Text style={styles.label}>Başlık (opsiyonel)</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder="Örn: Resmi kaynak" style={styles.input} />

        {/* Görsel */}
        <Text style={styles.label}>Görsel</Text>
        {!img ? (
          <TouchableOpacity onPress={pickImage} style={styles.pick}>
            <Text style={{ color: BRAND, fontWeight:'900' }}>Görsel Seç</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ position:'relative', marginTop:6 }}>
            <Image source={{ uri: img.uri }} style={{ width:'100%', height:220, borderRadius:12 }} />
            <TouchableOpacity onPress={() => setImg(null)} style={styles.remove}>
              <Text style={{ color:'#fff', fontWeight:'900' }}>Sil</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Gönder */}
        <TouchableOpacity onPress={submit} disabled={!img || !selected || sending} style={[styles.submit, { opacity: (!img || !selected || sending) ? 0.6 : 1 }]}>
          {sending ? <ActivityIndicator color="#fff" /> : <Text style={{ color:'#fff', fontWeight:'900' }}>Kanıtı Gönder (Onaya)</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection:'row', alignItems:'center', paddingBottom: 4, marginBottom: 8,
    borderBottomWidth: 1, borderColor: '#f1f1f1'
  },
  label:{ marginTop:14, fontWeight:'900' },
  input:{ borderWidth:1, borderColor:'#ddd', borderRadius:10, padding:12, marginTop:6, backgroundColor:'#fff' },

  selCard:{ width:160, minHeight:90, borderWidth:1, borderColor:'#eee', borderRadius:12, padding:12, justifyContent:'center', backgroundColor:'#fafafa' },
  selActive:{ backgroundColor:SOFT, borderColor:BRAND },

  pick:{ marginTop:6, borderWidth:2, borderColor:BRAND, borderStyle:'dashed', borderRadius:12, paddingVertical:16, alignItems:'center' },
  remove:{ position:'absolute', right:10, bottom:10, backgroundColor:'#E53935', paddingHorizontal:10, paddingVertical:8, borderRadius:10 },

  submit:{ marginTop:16, backgroundColor:BRAND, borderRadius:12, padding:14, alignItems:'center' },
});
