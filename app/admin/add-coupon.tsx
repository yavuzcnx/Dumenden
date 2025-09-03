'use client';

import { supabase } from '@/lib/supabaseClient';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { decode as atob } from 'base-64';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type MarketType = 'binary' | 'multi';
type Line = { name: string; yesOdds: string; noOdds: string };

const toNum = (v: string) => {
  const n = parseFloat((v || '').replace(',', '.'));
  return isNaN(n) ? undefined : n;
};

/* ---- Storage helpers ---- */
const guessExt = (uri: string) => {
  const raw = uri.split('?')[0].split('#')[0];
  const ext = raw.includes('.') ? raw.substring(raw.lastIndexOf('.') + 1).toLowerCase() : 'jpg';
  return ext === 'jpeg' ? 'jpg' : ext;
};
const contentType = (ext: string) => (ext === 'jpg' ? 'image/jpeg' : `image/${ext}`);

const MEDIA_BUCKET = 'Media'; // Supabase Storage’taki gerçek isim (büyük-küçük harf önemli)

async function uploadToMediaBucket(uri: string) {
  // uzantı ve content-type
  const ext = guessExt(uri);
  const ct = contentType(ext);

  // RN: fetch(file://) bazen 0 byte döndürür → FileSystem ile oku
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // base64 → Uint8Array
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);

  // benzersiz path
  const fileName = `coupons/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  // Supabase'e yükle
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(fileName, bytes, { contentType: ct, upsert: false });

  if (error) throw error;

  // İstersen direkt public URL dönelim (Home bunu zaten destekliyor)
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(fileName);
  return data.publicUrl as string;
}

export default function AddCouponPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Gündem');
  const [description, setDescription] = useState('');
  const [closingDate, setClosingDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);

  const [imageUrl, setImageUrl] = useState('');
  const [proofUrl, setProofUrl] = useState('');

  const [liquidity, setLiquidity] = useState('0');
  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(false);

  const [marketType, setMarketType] = useState<MarketType>('binary');
  const [yesOdds, setYesOdds] = useState('1.50');
  const [noOdds, setNoOdds] = useState('1.50');
  const [lines, setLines] = useState<Line[]>([{ name: '', yesOdds: '', noOdds: '' }]);

const pickImg = async (setter: (v: string) => void) => {
  // SDK farklarına dayanıklı: varsa yeni API'yi, yoksa eskiyi kullan
  const pickerMediaTypes: any =
    (ImagePicker as any).MediaType
      ? [(ImagePicker as any).MediaType.Images]           // yeni API
      : ImagePicker.MediaTypeOptions.Images;              // eski API

  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: pickerMediaTypes,
    allowsEditing: true,
    quality: 0.9,
  });

  if (!r.canceled && r.assets?.length) setter(r.assets[0].uri);
};

  const addLine = () => setLines([...lines, { name: '', yesOdds: '', noOdds: '' }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));
  const setLine = (i: number, key: keyof Line, val: string) => {
    const c = [...lines]; (c[i] as any)[key] = val; setLines(c);
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) { setLoading(false); Alert.alert('Giriş gerekli', 'Kupon eklemek için önce giriş yap.'); return; }

      // file:// ise Storage'a yükle
      let finalImageUrl = imageUrl;
      let finalProofUrl = proofUrl;
      if (finalImageUrl?.startsWith('file:')) finalImageUrl = await uploadToMediaBucket(finalImageUrl);
      if (finalProofUrl?.startsWith('file:')) finalProofUrl = await uploadToMediaBucket(finalProofUrl);

      const payload: any = {
        title,
        description,
        category,
        closing_date: closingDate.toISOString(),
        image_url: finalImageUrl || null,
        proof_url: finalProofUrl || null,
        liquidity: Number(liquidity || 0),
        is_open: isOpen,
        market_type: marketType,
        author_id: session.user.id,
      };

      if (marketType === 'binary') {
        const y = toNum(yesOdds); const n = toNum(noOdds);
        if (!y || !n || y <= 1 || n <= 1) { setLoading(false); Alert.alert('Hata', 'YES/NO oranları 1.01 ve üzeri olmalı.'); return; }
        payload.yes_price = y; payload.no_price = n;
      } else {
        const prepared = lines
          .filter(l => l.name && toNum(l.yesOdds) && toNum(l.noOdds))
          .map(l => ({ name: l.name.trim(), yesPrice: toNum(l.yesOdds)!, noPrice: toNum(l.noOdds)! }));
        if (prepared.length === 0) { setLoading(false); Alert.alert('Hata', 'En az bir satır (aday) ekleyin ve oranları girin.'); return; }
        payload.lines = prepared;
      }

      const { error } = await supabase.from('coupons').insert([payload]);
      setLoading(false);
      if (error) Alert.alert('Hata', error.message);
      else { Alert.alert('Başarılı', 'Market oluşturuldu.'); router.replace('/admin/landing'); }
    } catch (e: any) {
      setLoading(false);
      Alert.alert('Yükleme Hatası', e?.message || 'Görsel yüklenirken bir sorun oluştu.');
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FF6B00" />
        </TouchableOpacity>

        <Text style={styles.title}>Market Ekle (Odds)</Text>

        <View style={styles.switchRow}>
          {(['binary', 'multi'] as MarketType[]).map(t => (
            <TouchableOpacity key={t} onPress={() => setMarketType(t)} style={[styles.switchBtn, marketType === t && styles.switchBtnActive]}>
              <Text style={[styles.switchText, marketType === t && styles.switchTextActive]}>
                {t === 'binary' ? 'Binary (YES/NO)' : 'Multi (Adaylı)'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput placeholder="Başlık" value={title} onChangeText={setTitle} style={styles.input} />
        <TextInput placeholder="Kategori (örn: Gündem, Spor, Magazin)" value={category} onChangeText={setCategory} style={styles.input} />

        <TouchableOpacity onPress={() => setShowPicker(true)} style={styles.input}>
          <Text>Kapanış: {closingDate.toLocaleString()}</Text>
        </TouchableOpacity>
        {showPicker && (
          <View style={{ overflow: 'hidden' }}>
            <DateTimePicker
              value={closingDate}
              mode="datetime"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              style={Platform.OS === 'ios' ? { height: 330 } : undefined}
              onChange={(e: DateTimePickerEvent, d?: Date) => { setShowPicker(false); if (d) setClosingDate(d); }}
            />
          </View>
        )}

        <TextInput placeholder="Açıklama (opsiyonel)" value={description} onChangeText={setDescription} multiline style={[styles.input, { height: 80 }]} />

        <View style={styles.row}>
          <TextInput placeholder="Likidite (örn: 25000)" value={liquidity} onChangeText={setLiquidity} keyboardType="numeric" style={[styles.input, { flex: 1 }]} />
          <TouchableOpacity onPress={() => setIsOpen(!isOpen)} style={[styles.toggle, isOpen ? styles.toggleOn : styles.toggleOff]}>
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>{isOpen ? 'Açık' : 'Kapalı'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.row}>
          <TouchableOpacity onPress={() => pickImg(setImageUrl)} style={styles.smallBtn}><Text style={styles.btnText}>Görsel Seç</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => pickImg(setProofUrl)} style={styles.smallBtnAlt}><Text style={styles.btnText}>Kanıt Seç</Text></TouchableOpacity>
        </View>
        {!!imageUrl && <Image source={{ uri: imageUrl }} style={styles.preview} />}

        {marketType === 'binary' ? (
          <>
            <Text style={styles.section}>Binary Oranları (Odds)</Text>
            <View style={styles.row}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="YES (örn: 1.80)" value={yesOdds} onChangeText={setYesOdds} keyboardType="default" />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="NO (örn: 2.10)" value={noOdds} onChangeText={setNoOdds} keyboardType="default" />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.section}>Aday Satırları</Text>
            {lines.map((l, i) => (
              <View key={i} style={styles.lineRow}>
                <TextInput value={l.name} onChangeText={v => setLine(i, 'name', v)} placeholder="Aday adı" style={[styles.input, { flex: 1 }]} />
                <TextInput value={l.yesOdds} onChangeText={v => setLine(i, 'yesOdds', v)} placeholder="YES (1.50)" keyboardType="default" style={[styles.input, { width: 120 }]} />
                <TextInput value={l.noOdds} onChangeText={v => setLine(i, 'noOdds', v)} placeholder="NO (2.10)" keyboardType="default" style={[styles.input, { width: 120 }]} />
                <TouchableOpacity onPress={() => removeLine(i)} style={styles.trash}><Ionicons name="trash" size={18} color="#fff" /></TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity onPress={addLine} style={styles.addLine}><Ionicons name="add" size={18} color="#fff" /><Text style={styles.btnText}>Satır Ekle</Text></TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={styles.submit} onPress={handleSubmit} disabled={loading}>
          <Text style={styles.submitText}>{loading ? 'Kaydediliyor…' : 'Market Oluştur'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: '#fff', flexGrow: 1 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#FF6B00', textAlign: 'center', marginBottom: 16 },
  input: { backgroundColor: '#f7f7f7', borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 12, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  smallBtn: { backgroundColor: '#FF6B00', padding: 12, borderRadius: 10, flex: 1, alignItems: 'center' },
  smallBtnAlt: { backgroundColor: '#FF9800', padding: 12, borderRadius: 10, flex: 1, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  preview: { width: '100%', height: 160, borderRadius: 12, marginBottom: 10 },
  section: { fontWeight: 'bold', marginTop: 10, marginBottom: 8 },
  switchRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  switchBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#eee' },
  switchBtnActive: { backgroundColor: '#FF6B00' },
  switchText: { color: '#333', fontWeight: '700' },
  switchTextActive: { color: '#fff' },
  toggle: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10 },
  toggleOn: { backgroundColor: '#43A047' }, toggleOff: { backgroundColor: '#9E9E9E' },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  trash: { backgroundColor: '#E53935', padding: 10, borderRadius: 10 },
  addLine: { backgroundColor: '#1976D2', padding: 12, borderRadius: 10, alignItems: 'center', flexDirection: 'row', gap: 6, alignSelf: 'flex-start' },
  submit: { backgroundColor: '#FF6B00', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  backButton: { position: 'absolute', top: 50, left: 20, zIndex: 10 },
});
