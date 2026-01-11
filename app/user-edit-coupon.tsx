'use client';

import { publicUrl, uploadImage } from '@/lib/storage';
import { supabase } from '@/lib/supabaseClient';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BRAND = '#FF6B00';
const SOFT = '#FFF4EB';
const BORDER = '#FFD9C4';

export default function EditCoupon() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams(); // kupon ID
  const [uid, setUid] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form alanları
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('');
  const [yesPrice, setYesPrice] = useState('');
  const [noPrice, setNoPrice] = useState('');
  const [closing, setClosing] = useState('');
  const [image, setImage] = useState<string | null>(null); // mevcut resim
  const [localUri, setLocalUri] = useState<string | null>(null); // yeni seçilen

  // -------------------------------------------------------------------------
  // 🔥 Kullanıcı + Kupon verisini çek
  // -------------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      const { data: au } = await supabase.auth.getUser();
      if (!au?.user) return;

      setUid(au.user.id);

      const { data, error } = await supabase
        .from('coupon_submissions')
        .select('*')
        .eq('id', id)
        .eq('user_id', au.user.id)
        .maybeSingle();

      if (error) {
        Alert.alert('Hata', error.message);
        return;
      }

      if (!data) {
        Alert.alert('Bulunamadı', 'Kupon verisi yüklenemedi.');
        return;
      }

      // Form alanlarını doldur
      setTitle(data.title || '');
      setDesc(data.description || '');
      setCategory(data.category || '');
      setYesPrice(String(data.yes_price || ''));
      setNoPrice(String(data.no_price || ''));
      setClosing(data.closing_date || '');
      setImage(publicUrl(data.image_path, 'Media'));

      setLoading(false);
    })();
  }, []);

  // -------------------------------------------------------------------------
  // 🔥 GALERİ / RESİM SEÇİMİ
  // -------------------------------------------------------------------------
  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted')
      return Alert.alert('İzin gerekli', 'Galeriden seçim izni ver.');

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.9,
    });

    if (!res.canceled) {
      const a = res.assets?.[0];
      if (a?.uri) setLocalUri(a.uri);
    }
  };

  // -------------------------------------------------------------------------
  // 🔥 GÜNCELLE
  // -------------------------------------------------------------------------
  const save = async () => {
    if (!uid) return;

    if (!title.trim()) return Alert.alert('Eksik', 'Başlık gerekli.');
    if (!category.trim()) return Alert.alert('Eksik', 'Kategori gerekli.');
    if (!yesPrice.trim() || !noPrice.trim())
      return Alert.alert('Eksik', 'Oranlar gerekli.');
    if (!closing.trim()) return Alert.alert('Eksik', 'Kapanış tarihi gerekli.');

    try {
      setSaving(true);

      let finalImagePath = null;

      // Yeni resim seçilmişse yükle
      if (localUri) {
        const filePath = `coupons/${uid}/${Date.now()}.jpg`;
        await uploadImage(localUri, filePath, {
          bucket: 'Media',
          contentType: 'image/jpeg',
        });
let finalImagePath: string | null = null;
      }

      const updatePayload: any = {
        title: title.trim(),
        description: desc.trim(),
        category: category.trim(),
        yes_price: Number(yesPrice),
        no_price: Number(noPrice),
        closing_date: closing,
        status: 'pending', // 🔥 tekrar admin onayına düşer
      };

      if (finalImagePath) updatePayload.image_path = finalImagePath;

      const { error } = await supabase
        .from('coupon_submissions')
        .update(updatePayload)
        .eq('id', id)
        .eq('user_id', uid);

      if (error) throw error;

      Alert.alert('Başarılı ✔', 'Kupon güncellendi. Admin tekrar inceleyecek.');
      router.back();
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------------------
  // UI
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#fff' }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 }}
    >
      {/* HEADER */}
      <LinearGradient
        colors={['#FFF0E6', '#FFFFFF']}
        style={{
          padding: 12,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: BORDER,
          marginBottom: 12,
        }}
      >
        <Text style={{ fontSize: 24, fontWeight: '900', color: BRAND }}>
          Kuponu Düzenle
        </Text>
        <Text style={{ color: '#7A5A4A', marginTop: 4 }}>
          Gönderdiğin kuponu güncelle, admin tekrar incelesin.
        </Text>
      </LinearGradient>

      {/* TITLE */}
      <Text style={{ fontWeight: '900', marginBottom: 4 }}>Başlık</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Kupon başlığı"
        style={{
          borderWidth: 1,
          borderColor: '#ddd',
          padding: 12,
          borderRadius: 12,
          marginBottom: 12,
        }}
      />

      {/* DESC */}
      <Text style={{ fontWeight: '900', marginBottom: 4 }}>Açıklama</Text>
      <TextInput
        value={desc}
        onChangeText={setDesc}
        placeholder="Açıklama (opsiyonel)"
        multiline
        style={{
          borderWidth: 1,
          borderColor: '#ddd',
          padding: 12,
          borderRadius: 12,
          marginBottom: 12,
          minHeight: 80,
        }}
      />

      {/* CATEGORY */}
      <Text style={{ fontWeight: '900', marginBottom: 4 }}>Kategori</Text>
      <TextInput
        value={category}
        onChangeText={setCategory}
        placeholder="Örn: Gündem"
        style={{
          borderWidth: 1,
          borderColor: '#ddd',
          padding: 12,
          borderRadius: 12,
          marginBottom: 12,
        }}
      />

      {/* ORANLAR */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '900' }}>YES Oranı</Text>
          <TextInput
            value={yesPrice}
            onChangeText={setYesPrice}
            keyboardType="numeric"
            style={{
              borderWidth: 1,
              borderColor: '#ddd',
              padding: 12,
              borderRadius: 12,
              marginBottom: 12,
            }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '900' }}>NO Oranı</Text>
          <TextInput
            value={noPrice}
            onChangeText={setNoPrice}
            keyboardType="numeric"
            style={{
              borderWidth: 1,
              borderColor: '#ddd',
              padding: 12,
              borderRadius: 12,
              marginBottom: 12,
            }}
          />
        </View>
      </View>

      {/* CLOSING DATE */}
      <Text style={{ fontWeight: '900', marginBottom: 4 }}>Kapanış Tarihi</Text>
      <TextInput
        value={closing}
        onChangeText={setClosing}
        placeholder="2025-12-31 23:59:59"
        style={{
          borderWidth: 1,
          borderColor: '#ddd',
          padding: 12,
          borderRadius: 12,
          marginBottom: 12,
        }}
      />

      {/* IMAGE */}
      <Text style={{ fontWeight: '900', marginBottom: 6 }}>Kapak Görseli</Text>

      {localUri ? (
        <Image
          source={{ uri: localUri }}
          style={{ width: '100%', height: 200, borderRadius: 12, marginBottom: 12 }}
        />
      ) : image ? (
        <Image
          source={{ uri: image }}
          style={{ width: '100%', height: 200, borderRadius: 12, marginBottom: 12 }}
        />
      ) : null}

      <TouchableOpacity
        onPress={pickImage}
        style={{
          backgroundColor: BRAND,
          padding: 14,
          borderRadius: 12,
          marginBottom: 20,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '900', textAlign: 'center' }}>
          Görsel Seç
        </Text>
      </TouchableOpacity>

      {/* SAVE BUTTON */}
      <TouchableOpacity
        onPress={save}
        disabled={saving}
        style={{
          backgroundColor: saving ? '#f4a36b' : BRAND,
          padding: 16,
          borderRadius: 14,
          alignItems: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.15,
          shadowRadius: 8,
          elevation: 3,
        }}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>
            Güncelle & Gönder
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}
