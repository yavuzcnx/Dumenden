// app/(modals)/create.tsx
'use client';

import { uploadImage } from '@/lib/storage';
import { supabase } from '@/lib/supabaseClient';
import { useXp } from '@/src/contexts/hooks/useXp';

import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable,
  SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BRAND  = '#FF6B00';
const BORDER = '#F2D9C8';
const SOFT   = '#FFF2E8';
const TAB_BAR_HEIGHT = 72;

type Quota = { is_plus: boolean; used_last7: number; remaining_last7: number };
const CATS = ['Gündem', 'Spor', 'Magazin', 'Politika', 'Absürt'];

/* odds helper – iOS decimal-pad için ilk rakamdan sonra otomatik '.' */
function formatOdds(next: string) {
  let s = next.replace(',', '.').replace(/[^0-9.]/g, '');
  if (/^\d{2,}$/.test(s) && !s.includes('.')) s = `${s[0]}.${s.slice(1)}`;
  const parts = s.split('.');
  if (parts.length > 2) s = parts[0] + '.' + parts.slice(1).join('');
  if (s.startsWith('.')) s = '0' + s;
  return s;
}

export default function CreateCouponModal() {
  const router = useRouter();
  const { xp, loading } = useXp();
  const isPlus = xp > 0;

  const insets = useSafeAreaInsets();

  const [uid, setUid] = useState<string | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [busy, setBusy] = useState(true);

  // 📸 izinleri önceden iste – galeri/kamera açılışını hızlandırır
  useEffect(() => {
    ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => {});
    ImagePicker.requestCameraPermissionsAsync().catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data: au } = await supabase.auth.getUser();
        setUid(au?.user?.id ?? null);

        const { data: q } = await supabase.rpc('my_submission_quota');
        if (q) setQuota(q as Quota);
      } catch {}
      finally { setBusy(false); }
    })();
  }, []);

  useEffect(() => {
    if (!loading && !isPlus) router.replace('/(modals)/plus-paywall');
  }, [loading, isPlus, router]);

  const [title, setTitle]   = useState('');
  const [desc, setDesc]     = useState('');
  const [cat, setCat]       = useState(CATS[0]);
  const [closing, setClosing] = useState<Date>(new Date(Date.now() + 7 * 24 * 3600 * 1000));
  const [yes, setYes]       = useState('1.80');
  const [no,  setNo ]       = useState('2.10');
  const [img, setImg]       = useState<{ uri: string; w: number; h: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Sheets
  const [mediaSheet, setMediaSheet] = useState(false);
  const [dateSheet, setDateSheet] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showClock, setShowClock] = useState(false);

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
    // 🔑 Plus kullanıcıları kota kontrolünden muaf
    if (!isPlus && (quota?.remaining_last7 ?? 0) <= 0) e.push('Haftalık gönderim hakkın kalmamış.');
    return e;
  }, [title, cat, closing, yes, no, quota?.remaining_last7, isPlus]);

  const canSubmit = errors.length === 0 && !!uid && !submitting;

  // HEIC / ph:// normalize → JPEG + file:// garanti (hızlı)
  const normalizeAsset = async (assetUri: string, width?: number) => {
    const maxW = 1400;
    if (!width || width <= maxW) return assetUri;
    const ratio = maxW / width;
    const out = await ImageManipulator.manipulateAsync(
      assetUri,
      [{ resize: { width: Math.round(width * ratio) } }],
      { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
    );
    return out.uri;
  };

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') return;
    const r = await ImagePicker.launchCameraAsync({ quality: 0.9, allowsEditing: true });
    if (r.canceled || !r.assets?.[0]?.uri) return;
    const a = r.assets[0];
    const uri = await normalizeAsset(a.uri, a.width);
    setImg({ uri, w: a.width ?? 0, h: a.height ?? 0 });
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return;
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
      selectionLimit: 1,
      exif: false,
      presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
    });
    if (r.canceled || !r.assets?.[0]?.uri) return;
    const a = r.assets[0];
    const uri = await normalizeAsset(a.uri, a.width);
    setImg({ uri, w: a.width ?? 0, h: a.height ?? 0 });
  };

  const removeImage = () => setImg(null);

  // Storage’a yükleyip PATH döndür
  async function uploadToStorage(localUri: string, userId: string) {
    const fileName = `${Math.random().toString(36).slice(2)}-${Date.now()}.jpg`;
    const destPath = `submissions/${userId}/${fileName}`;
    await uploadImage(localUri, destPath, { bucket: 'Media', contentType: 'image/jpeg' });
    return destPath;
  }

  const submit = async () => {
    if (!uid) return;
    if (!canSubmit) return Alert.alert('Form Hatalı', errors.join('\n'));

    try {
      setSubmitting(true);
      let image_path: string | null = null;

      if (img?.uri) {
        const safeUri = await normalizeAsset(img.uri);
        image_path = await uploadToStorage(safeUri, uid);
      }

      const payload = {
        user_id: uid,
        title: title.trim(),
        description: desc.trim() || null,
        category: cat,
        yes_price: Number(yes.replace(',', '.')),
        no_price:  Number(no.replace(',', '.')),
        closing_date: closing.toISOString(),
        image_path,
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

  const bottomPad = insets.bottom + TAB_BAR_HEIGHT + 24;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 48}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}>
          {/* Haftalık hak */}
          <View style={styles.quota}>
            <Text style={{ color: '#8d6e63', fontWeight: '900' }}>
              Haftalık hak:
              <Text style={{ color: BRAND }}>
                {isPlus ? ' Sınırsız' : ` ${(quota?.remaining_last7 ?? 0)}/1 `}
              </Text>
              {!isPlus && (
                <Text style={{ color: '#8d6e63' }}> (kullanılan: {quota?.used_last7 ?? 0})</Text>
              )}
            </Text>
          </View>

          {/* Başlık */}
          <Text style={styles.label}>Başlık</Text>
          <TextInput
            placeholder="Örn: X takımı bu hafta kazanır mı?"
            value={title}
            onChangeText={setTitle}
            style={styles.input}
            maxLength={120}
          />

          {/* Açıklama */}
          <Text style={styles.label}>Açıklama (opsiyonel)</Text>
          <TextInput
            placeholder="Gerekçe, kaynak linki vs."
            value={desc}
            onChangeText={setDesc}
            style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
            multiline
          />

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

          {/* Hızlı YES */}
          <View style={{ flexDirection:'row', gap:8, marginBottom:8 }}>
            {['1.50','1.80','2.10','3.00'].map(v => (
              <TouchableOpacity
                key={'Y'+v}
                onPress={() => setYes(v)}
                style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:14, backgroundColor:'#E8F1FF', borderWidth:1, borderColor:'#C9E0FF' }}>
                <Text style={{ color:'#1B66FF', fontWeight:'900' }}>Yes {v}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* Hızlı NO */}
          <View style={{ flexDirection:'row', gap:8, marginBottom:8 }}>
            {['1.50','1.80','2.10','3.00'].map(v => (
              <TouchableOpacity
                key={'N'+v}
                onPress={() => setNo(v)}
                style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:14, backgroundColor:'#FFE6EF', borderWidth:1, borderColor:'#FFC7DA' }}>
                <Text style={{ color:'#D61C7B', fontWeight:'900' }}>No {v}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.smallMut}>Yes</Text>
              <TextInput
                keyboardType="decimal-pad"
                value={yes}
                onChangeText={(t) => setYes(formatOdds(t))}
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.smallMut}>No</Text>
              <TextInput
                keyboardType="decimal-pad"
                value={no}
                onChangeText={(t) => setNo(formatOdds(t))}
                style={styles.input}
              />
            </View>
          </View>

          {/* Kapanış */}
          <Text style={[styles.label, { marginTop: 16 }]}>Kapanış</Text>
          <TouchableOpacity onPress={() => setDateSheet(true)} style={styles.input}>
            <Text style={{ fontWeight: '700' }}>{closing.toLocaleString()}</Text>
          </TouchableOpacity>

          {/* Görsel */}
          <Text style={[styles.label, { marginTop: 16 }]}>Kapak Görseli (opsiyonel)</Text>
          {!img ? (
            <TouchableOpacity onPress={() => setMediaSheet(true)} style={styles.imagePick}>
              <Text style={{ color: BRAND, fontWeight: '900' }}>Kamera / Galeri</Text>
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
            <View style={styles.errorBox}>
              {errors.map((e) => (
                <Text key={e} style={{ color: '#b71c1c' }}>• {e}</Text>
              ))}
            </View>
          )}

          {/* Gönder */}
          <TouchableOpacity
            disabled={!canSubmit}
            onPress={submit}
            style={[styles.submitBtn, { opacity: canSubmit ? 1 : 0.5, marginTop: 12 }]}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '900' }}>Gönder (Onaya)</Text>}
          </TouchableOpacity>

          <View style={{ height: insets.bottom + 8 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ===== MEDIA SHEET ===== */}
      <Modal visible={mediaSheet} transparent animationType="fade" onRequestClose={() => setMediaSheet(false)}>
        <Pressable style={{ flex:1, backgroundColor:'rgba(0,0,0,0.35)' }} onPress={() => setMediaSheet(false)}>
          <View style={{
            position:'absolute', left:0, right:0, bottom:0,
            backgroundColor:'#fff', borderTopLeftRadius:18, borderTopRightRadius:18,
            padding:16, paddingBottom:24
          }}>
            <Text style={{ fontWeight:'900', fontSize:16, marginBottom:10 }}>Görsel Kaynağı</Text>
            <View style={{ flexDirection:'row', gap:12 }}>
              <TouchableOpacity
                onPress={async () => { try { await pickFromCamera(); } finally { setMediaSheet(false); } }}
                style={{ flex:1, borderWidth:1, borderColor:'#FFD4B8', backgroundColor:'#FFF3EC', borderRadius:12, padding:16, alignItems:'center' }}>
                <Ionicons name="camera" size={20} color={BRAND} />
                <Text style={{ marginTop:6, fontWeight:'900', color:'#C24E14' }}>Kamera</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={async () => { try { await pickFromGallery(); } finally { setMediaSheet(false); } }}
                style={{ flex:1, borderWidth:1, borderColor:'#C9E7FF', backgroundColor:'#EEF6FF', borderRadius:12, padding:16, alignItems:'center' }}>
                <Ionicons name="image" size={20} color="#1B66FF" />
                <Text style={{ marginTop:6, fontWeight:'900', color:'#1B66FF' }}>Galeri</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* ===== DATE SHEET ===== */}
      <Modal visible={dateSheet} transparent animationType="fade" onRequestClose={() => setDateSheet(false)}>
        <Pressable style={{ flex:1, backgroundColor:'rgba(0,0,0,0.35)' }} onPress={() => setDateSheet(false)}>
          <View style={{
            position:'absolute', left:0, right:0, bottom:0,
            backgroundColor:'#fff', borderTopLeftRadius:20, borderTopRightRadius:20,
            padding:16, paddingBottom:24
          }}>
            <Text style={{ fontWeight:'900', fontSize:16 }}>Kapanış Tarihi</Text>
            <Text style={{ color:'#6B7280', marginBottom:10 }}>Hızlı +/− 1 saat / gün</Text>

            <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:10 }}>
              {[['+1s', 3600e3], ['+6s', 6*3600e3], ['+1g', 24*3600e3], ['+3g', 3*24*3600e3],
                ['-1s', -3600e3], ['-6s', -6*3600e3], ['-1g', -24*3600e3],
              ].map(([l, d]) => (
                <TouchableOpacity key={String(l)} onPress={() => setClosing(new Date(closing.getTime() + (d as number)))}
                  style={{ paddingVertical:10, paddingHorizontal:12, borderRadius:10, backgroundColor:'#F3F4F6' }}>
                  <Text style={{ fontWeight:'800' }}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection:'row', gap:10, marginBottom:8 }}>
              <TouchableOpacity onPress={() => { setShowCalendar(v => !v); setShowClock(false); }}
                style={{ flex:1, backgroundColor:'#FFF3EC', borderWidth:1, borderColor:'#FFD3B7', borderRadius:12, padding:12, alignItems:'center' }}>
                <Ionicons name="calendar" size={16} color={BRAND} />
                <Text style={{ fontWeight:'900', color:'#C24E14', marginTop:4 }}>Takvim Aç</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowClock(v => !v); setShowCalendar(false); }}
                style={{ flex:1, backgroundColor:'#EEF6FF', borderWidth:1, borderColor:'#C9E7FF', borderRadius:12, padding:12, alignItems:'center' }}>
                <Ionicons name="time" size={16} color="#1B66FF" />
                <Text style={{ fontWeight:'900', color:'#1B66FF', marginTop:4 }}>Saat Seç</Text>
              </TouchableOpacity>
            </View>

            {showCalendar && (
              <DateTimePicker
                value={closing}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                onChange={(_, d) => {
                  if (!d) return;
                  const x = new Date(closing);
                  x.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                  setClosing(x);
                }}
                minimumDate={new Date(Date.now() + 30*60*1000)}
              />
            )}

            {showClock && (
              <DateTimePicker
                value={closing}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'clock'}
                minuteInterval={1}
                onChange={(_, d) => {
                  if (!d) return;
                  const x = new Date(closing);
                  x.setHours(d.getHours(), d.getMinutes(), 0, 0);
                  setClosing(x);
                }}
              />
            )}

            <Text style={{ marginTop:12, fontWeight:'700' }}>{closing.toLocaleString()}</Text>

            <TouchableOpacity onPress={() => setDateSheet(false)} style={{ marginTop:12, backgroundColor:BRAND, padding:14, borderRadius:12, alignItems:'center' }}>
              <Text style={{ color:'#fff', fontWeight:'900' }}>Tamam</Text>
            </TouchableOpacity>
          </View>
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
  errorBox: { marginTop: 12, backgroundColor: '#ffebee', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#ffcdd2' },
  submitBtn: { backgroundColor: BRAND, padding: 14, borderRadius: 12, alignItems: 'center' },
});
