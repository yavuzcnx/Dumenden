'use client';

import { publicUrl, uploadImage } from '@/lib/storage';
import { supabase } from '@/lib/supabaseClient';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const ORANGE = '#FF6B00';

export default function AddXPPack() {
  const [name, setName]       = useState('');
  const [xp, setXp]           = useState('1000');  // xp_amount
  const [price, setPrice]     = useState('0');     // price_cents
  const [sort, setSort]       = useState('10');    // sıralama
  const [active, setActive]   = useState(true);
  const [busy, setBusy]       = useState(false);

  // görsel
  const [localUri, setLocalUri] = useState<string|null>(null);
  const [imgUrl, setImgUrl]     = useState<string|null>(null); // upload sonrası oluşan public url

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return Alert.alert('İzin gerekli', 'Galeriden izin ver.');
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (res.canceled) return;
    const a = res.assets?.[0];
    if (a?.uri) setLocalUri(a.uri);
  };

  const uploadIfNeeded = async (): Promise<string|null> => {
    // yeni görsel seçildiyse yükle
    if (!localUri) return imgUrl ?? null;
    const path = `xp_packs/${Date.now()}.jpg`;
    await uploadImage(localUri, path, { bucket: 'Media', contentType: 'image/jpeg' });
    const url = publicUrl(path, 'Media');
    setImgUrl(url);
    return url;
  };

  const save = async () => {
    const xp_amount   = parseInt(xp || '0', 10);
    const price_cents = parseInt(price || '0', 10);
    const srt         = parseInt(sort || '0', 10);

    if (!name.trim() || !Number.isFinite(xp_amount) || xp_amount <= 0) {
      return Alert.alert('Hata', 'Paket adı ve XP miktarı zorunlu (XP > 0).');
    }
    if (!Number.isFinite(price_cents) || price_cents < 0) {
      return Alert.alert('Hata', 'Fiyat (kuruş) 0 veya üzeri olmalı.');
    }
    if (!Number.isFinite(srt)) {
      return Alert.alert('Hata', 'Sıra sayısal olmalı.');
    }

    try {
      setBusy(true);

      // 1) Görseli (varsa) yükle
      const image_url = await uploadIfNeeded();

      // 2) Insert: önce image_url ile dene
      const payloadWithImage: any = {
        name: name.trim(),
        xp_amount,
        price_cents,
        sort: srt,
        is_active: active,
      };
      if (image_url) payloadWithImage.image_url = image_url;

      let { error } = await supabase.from('xp_packs').insert(payloadWithImage);

      // 3) image_url kolonu yoksa fallback: görselsiz tekrar dene
      if (error && String(error.message || '').toLowerCase().includes('image_url')) {
        const payloadNoImage = {
          name: name.trim(),
          xp_amount,
          price_cents,
          sort: srt,
          is_active: active,
        };
        const retry = await supabase.from('xp_packs').insert(payloadNoImage);
        if (retry.error) throw retry.error;
        Alert.alert('Uyarı', 'Görsel alanı tabloya kayıt edilemedi (image_url kolonu yok). Paket görselsiz eklendi.');
      } else if (error) {
        throw error;
      } else {
        Alert.alert('Başarılı', 'XP paketi eklendi ✅');
      }

      // form reset
      setName(''); setXp('1000'); setPrice('0'); setSort('10'); setActive(true);
      setLocalUri(null); setImgUrl(null);
    } catch (e:any) {
      Alert.alert('Hata', e?.message ?? 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ padding:16 }}>
      <Text style={styles.h1}>XP Paketi Ekle</Text>

      <TextInput value={name} onChangeText={setName} placeholder="Paket adı" style={styles.input}/>
      <TextInput value={xp} onChangeText={setXp} placeholder="XP miktarı" keyboardType="numeric" style={styles.input}/>
      <TextInput value={price} onChangeText={setPrice} placeholder="Fiyat (kuruş)" keyboardType="numeric" style={styles.input}/>
      <TextInput value={sort} onChangeText={setSort} placeholder="Sıra" keyboardType="numeric" style={styles.input}/>

      <TouchableOpacity onPress={() => setActive(!active)} style={[styles.toggle,{backgroundColor:active?'#43A047':'#9E9E9E'}]}>
        <Text style={{color:'#fff',fontWeight:'800'}}>{active?'Aktif':'Pasif'}</Text>
      </TouchableOpacity>

      {/* Görsel seç */}
      <TouchableOpacity onPress={pickImage} style={styles.imgBtn}>
        <Text style={{ color:'#fff', fontWeight:'900' }}>
          {(localUri || imgUrl) ? 'Görseli Değiştir' : 'Görsel Yükle'}
        </Text>
      </TouchableOpacity>

      {(localUri || imgUrl) ? (
        <Image source={{ uri: localUri ?? imgUrl! }} style={styles.preview}/>
      ) : null}

      <TouchableOpacity onPress={save} disabled={busy} style={[styles.save,{opacity:busy?0.6:1}]}>
        <Text style={{color:'#fff',fontWeight:'900'}}>{busy?'Kaydediliyor…':'Kaydet'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  h1:{ fontSize:22, fontWeight:'900', color:ORANGE, textAlign:'center', marginBottom:12 },
  input:{ borderWidth:1, borderColor:'#ddd', borderRadius:10, padding:10, marginBottom:8 },
  toggle:{ padding:12, borderRadius:10, alignItems:'center', marginTop:6 },
  imgBtn:{ backgroundColor:'#3D5AFE', padding:12, borderRadius:10, alignItems:'center', marginTop:8 },
  preview:{ width:'100%', height:200, borderRadius:12, marginTop:10 },
  save:{ backgroundColor:ORANGE, padding:14, borderRadius:12, alignItems:'center', marginTop:12 },
});
