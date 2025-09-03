'use client';

import { usePlus } from '@/app/hooks/userPlus';
import { uploadImage } from '@/lib/storage';
import { supabase } from '@/lib/supabaseClient';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable,
  SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

const BRAND  = '#FF6B00';
const BORDER = '#F2D9C8';
const SOFT   = '#FFF2E8';

type Quota = { is_plus: boolean; used_last7: number; remaining_last7: number };
const CATS = ['Gündem', 'Spor', 'Magazin', 'Politika', 'Absürt'];

export default function CreateCouponModal() {
  const router = useRouter();
  const { isPlus, loading } = usePlus();

  const [uid, setUid] = useState<string | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: au } = await supabase.auth.getUser();
      setUid(au?.user?.id ?? null);
      const { data: q } = await supabase.rpc('my_submission_quota');
      if (q) setQuota(q as Quota);
      setBusy(false);
    })();
  }, []);

  useEffect(() => {
    if (!loading && !isPlus) router.replace('/(modals)/plus-paywall');
  }, [loading, isPlus]);

  const [title, setTitle]   = useState('');
  const [desc, setDesc]     = useState('');
  const [cat, setCat]       = useState(CATS[0]);
  const [closing, setClosing] = useState<Date>(new Date(Date.now() + 7 * 24 * 3600 * 1000));
  const [yes, setYes]       = useState('1.80');
  const [no,  setNo ]       = useState('2.10');
  const [img, setImg]       = useState<{ uri: string; w: number; h: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const errors = useMemo(() => {
    const e: string[] = [];
    const y = Number(yes.replace(',', '.'));
    const n = Number(no.replace(',', '.'));
    if (!title.trim()) e.push('Başlık boş olamaz.');
    if (title.trim().length < 6) e.push('Başlık en az 6 karakter olmalı.');
    if (!CATS.includes(cat)) e.push('Kategori geçersiz.');
    if (!Number.isFinite(y) || y < 1.01 || y > 10) e.push('Yes oranı 1.01–10 aralığında olmalı.');
    if (!Number.isFinite(n) || n < 1.01 || n > 10) e.push('No oranı 1.01–10 aralığında olmalı.');
    if (!(closing instanceof Date) || isNaN(closing.getTime())) e.push('Kapanış tarihi hatalı.');
    if (closing.getTime() <= Date.now() + 3600 * 1000) e.push('Kapanış en az 1 saat sonrası olmalı.');
    return e;
  }, [title, cat, closing, yes, no]);

  const canSubmit = errors.length === 0 && !!uid && !submitting;

  // Görsel seç + sıkıştır
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert('İzin gerekli', 'Görsel eklemek için fotoğraflara izin ver.');
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
    });
    if (res.canceled) return;
    const asset = res.assets?.[0]; if (!asset) return;

    const maxW = 1200;
    const ratio = asset.width > maxW ? maxW / asset.width : 1;
    const manip = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: Math.round(asset.width * ratio) } }],
      { compress: 0.84, format: ImageManipulator.SaveFormat.JPEG }
    );
    setImg({ uri: manip.uri, w: manip.width ?? asset.width, h: manip.height ?? asset.height });
  };
  const removeImage = () => setImg(null);

  // Storage’a yükleyip PATH döndür
  async function uploadToStorage(localUri: string, userId: string) {
    const fileName = `${Math.random().toString(36).slice(2)}-${Date.now()}.jpg`;
    const destPath = `submissions/${userId}/${fileName}`;
    await uploadImage(localUri, destPath);   // helper 0-byte fix ile yükler
    return destPath;                          // DB’ye path yazıyoruz
  }

  const submit = async () => {
    if (!uid) return;
    if (!canSubmit) return Alert.alert('Form Hatalı', errors.join('\n'));

    try {
      setSubmitting(true);
      let image_path: string | null = null;
      if (img) image_path = await uploadToStorage(img.uri, uid);

      const payload = {
        user_id: uid,
        title: title.trim(),
        description: desc.trim() || null,
        category: cat,
        yes_price: Number(yes.replace(',', '.')),
        no_price:  Number(no.replace(',', '.')),
        closing_date: closing.toISOString(),
        image_path,            // PATH
        status: 'pending' as const,
      };

      const { error } = await supabase.from('coupon_submissions').insert(payload);
      if (error) throw error;

      Alert.alert('Gönderildi', 'Önerin admin onayına gönderildi.');
      router.back();
    } catch (e: any) {
      Alert.alert('Gönderilemedi', e?.message ?? 'Bilinmeyen hata');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || busy) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={BRAND} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
          {/* Haftalık hak */}
          <View style={styles.quota}>
            <Text style={{ color: '#8d6e63', fontWeight: '900' }}>
              Haftalık hak:<Text style={{ color: BRAND }}> {quota?.remaining_last7 ?? 0}/1 </Text>
              <Text style={{ color: '#8d6e63' }}>(kullanılan: {quota?.used_last7 ?? 0})</Text>
            </Text>
          </View>

          {/* Başlık */}
          <Text style={styles.label}>Başlık</Text>
          <TextInput placeholder="Örn: X takımı bu hafta kazanır mı?" value={title} onChangeText={setTitle} style={styles.input} maxLength={120} />

          {/* Açıklama */}
          <Text style={styles.label}>Açıklama (opsiyonel)</Text>
          <TextInput placeholder="Gerekçe, kaynak linki vs." value={desc} onChangeText={setDesc} style={[styles.input, { height: 90, textAlignVertical: 'top' }]} multiline />

          {/* Kategori */}
          <Text style={styles.label}>Kategori</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {CATS.map((c) => (
              <Pressable key={c} onPress={() => setCat(c)} style={[styles.chip, { backgroundColor: cat === c ? BRAND : '#eee' }]}>
                <Text style={{ color: cat === c ? '#fff' : '#333', fontWeight: '800' }}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Oranlar */}
          <Text style={[styles.label, { marginTop: 16 }]}>Oranlar</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.smallMut}>Yes</Text>
              <TextInput keyboardType="decimal-pad" value={yes} onChangeText={setYes} style={styles.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.smallMut}>No</Text>
              <TextInput keyboardType="decimal-pad" value={no} onChangeText={setNo} style={styles.input} />
            </View>
          </View>

          {/* Kapanış */}
          <Text style={[styles.label, { marginTop: 16 }]}>Kapanış</Text>
          <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.input}>
            <Text style={{ fontWeight: '700' }}>{closing.toLocaleString()}</Text>
          </TouchableOpacity>

          {/* Görsel */}
          <Text style={[styles.label, { marginTop: 16 }]}>Kapak Görseli (opsiyonel)</Text>
          {!img ? (
            <TouchableOpacity onPress={pickImage} style={styles.imagePick}>
              <Text style={{ color: BRAND, fontWeight: '900' }}>Görsel Seç</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.imageWrap}>
              <Image source={{ uri: img.uri }} style={{ width: '100%', height: 180, borderRadius: 12 }} />
              <Pressable onPress={removeImage} style={styles.removeBtn}>
                <Text style={{ color: '#fff', fontWeight: '900' }}>Sil</Text>
              </Pressable>
            </View>
          )}

          {/* Hatalar */}
          {errors.length > 0 && (
            <View style={styles.errorBox}>{errors.map((e) => <Text key={e} style={{ color: '#b71c1c' }}>• {e}</Text>)}</View>
          )}

          {/* Gönder */}
          <TouchableOpacity disabled={!canSubmit} onPress={submit} style={[styles.submitBtn, { opacity: canSubmit ? 1 : 0.5 }]}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '900' }}>Gönder (Onaya)</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Basit tarih seçici (modal) */}
      <Modal visible={showDatePicker} transparent animationType="fade">
        <Pressable onPress={() => setShowDatePicker(false)} style={styles.dpBackdrop}>
          <Pressable style={styles.dpCard} onPress={() => {}}>
            <Text style={{ fontWeight: '900', marginBottom: 8 }}>Kapanış Tarihi</Text>
            <Text style={{ color: '#666', marginBottom: 10 }}>Hızlı +/− 1 saat / gün</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[
                ['+1s', 3600e3], ['+6s', 6*3600e3], ['+1g', 24*3600e3], ['+3g', 3*24*3600e3],
                ['-1s', -3600e3], ['-6s', -6*3600e3], ['-1g', -24*3600e3],
              ].map(([l, delta]) => (
                <TouchableOpacity key={String(l)} onPress={() => setClosing(new Date(closing.getTime() + (delta as number)))} style={styles.dpBtn}>
                  <Text style={{ fontWeight: '800' }}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ marginTop: 12, fontWeight: '700' }}>{closing.toLocaleString()}</Text>
            <TouchableOpacity onPress={() => setShowDatePicker(false)} style={[styles.dpBtn, { marginTop: 12, backgroundColor: BRAND }]}>
              <Text style={{ color: '#fff', fontWeight: '900' }}>Tamam</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  quota: { backgroundColor: SOFT, borderColor: BORDER, borderWidth: 1, padding: 10, borderRadius: 12, marginBottom: 12 },
  label: { fontWeight: '900', marginTop: 10, marginBottom: 6 },
  smallMut: { color: '#666', marginBottom: 6, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 10, backgroundColor: '#fff' },
  imagePick: { borderWidth: 2, borderColor: BRAND, borderStyle: 'dashed', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#ddd' },
  imageWrap: { marginTop: 4, position: 'relative' },
  removeBtn: { position: 'absolute', right: 10, bottom: 10, backgroundColor: '#E53935', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  preview: { marginTop: 16 },
  previewCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 10, backgroundColor: '#fff' },
  errorBox: { marginTop: 12, backgroundColor: '#ffebee', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#ffcdd2' },
  submitBtn: { backgroundColor: BRAND, padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  dpBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  dpCard: { width: '86%', backgroundColor: '#fff', padding: 16, borderRadius: 12 },
  dpBtn: { backgroundColor: '#f2f2f2', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
});
