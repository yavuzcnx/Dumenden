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

const CATS = ['Gündem', 'Spor', 'Magazin', 'Politika', 'Absürt'];

/* Sexy Live Preview Component */
function LivePreview({ title, yes, no, cat, img, closing }) {
  return (
    <View style={{
      marginTop: 35,
      padding: 16,
      borderRadius: 16,
      backgroundColor: '#fff',
      borderWidth: 1,
      borderColor: '#e0e0e0',
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 4
    }}>

      <Text style={{ fontWeight:'900', fontSize:16, marginBottom: 4 }}>
        Canlı Önizleme
      </Text>
      <Text style={{ fontSize:12, color:'#888', marginBottom: 12 }}>
        Kuponun kullanıcıya böyle görünecek 👇
      </Text>

      {img?.uri ? (
        <Image
          source={{ uri: img.uri }}
          style={{
            width: '100%',
            height: 170,
            borderRadius: 12,
            marginBottom: 12,
          }}
        />
      ) : (
        <View style={{
          width:'100%',
          height:170,
          borderRadius:12,
          backgroundColor:'#f2f2f2',
          alignItems:'center',
          justifyContent:'center',
          marginBottom:12
        }}>
          <Ionicons name="image" size={36} color="#bbb" />
          <Text style={{ color:'#aaa', marginTop:4 }}>Görsel seçilmedi</Text>
        </View>
      )}

      <View style={{
        alignSelf:'flex-start',
        paddingHorizontal:12,
        paddingVertical:6,
        backgroundColor:'#FFEEDE',
        borderRadius:20,
        marginBottom:10
      }}>
        <Text style={{ fontWeight:'800', color:'#D45F00', fontSize:12 }}>{cat}</Text>
      </View>

      <Text style={{ fontWeight:'900', fontSize:15, marginBottom:12 }}>
        {title || 'Başlık buraya gelecek…'}
      </Text>

      <View style={{ flexDirection:'row', gap:10 }}>
        <View style={{ flex:1, backgroundColor:'#E8FFF1', padding:10, borderRadius:10 }}>
          <Text style={{ color:'#1B8E3F', fontWeight:'900', fontSize:12 }}>YES</Text>
          <Text style={{ fontWeight:'900', fontSize:18 }}>{yes || '--'}</Text>
        </View>

        <View style={{ flex:1, backgroundColor:'#FFECEC', padding:10, borderRadius:10 }}>
          <Text style={{ color:'#C62828', fontWeight:'900', fontSize:12 }}>NO</Text>
          <Text style={{ fontWeight:'900', fontSize:18 }}>{no || '--'}</Text>
        </View>
      </View>

      <Text style={{ marginTop:12, color:'#555', fontWeight:'700', fontSize:12 }}>
        Kapanış: {closing.toLocaleDateString()} - {closing.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
      </Text>
    </View>
  );
}

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
  const { xp, loading: xpLoading } = useXp();
  const isPlus = xp > 0;
  const insets = useSafeAreaInsets();

  const [uid, setUid] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [used, setUsed] = useState<number>(0);
  const [quotaLoading, setQuotaLoading] = useState(true);

  // 🔥 Picker Mode: 'date' | 'time' | null
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);

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
        if (q) {
            const row = Array.isArray(q) ? q[0] : q;
            setRemaining(row.remaining_last7);
            setUsed(row.used_last7);
        }
      } catch {}
      finally { setQuotaLoading(false); }
    })();
  }, []);

  

  const [title, setTitle]   = useState('');
  const [desc, setDesc]     = useState('');
  const [cat, setCat]       = useState(CATS[0]);
  
  // Default kapanış 24 saat sonra olsun ki hata vermesin başta
  const [closing, setClosing] = useState<Date>(new Date(Date.now() + 24 * 3600 * 1000));
  
  const [yes, setYes]       = useState('1.80');
  const [no,  setNo ]       = useState('2.10');
  const [img, setImg]       = useState<{ uri: string; w: number; h: number } | null>(null);

  const [mediaSheet, setMediaSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const errors = useMemo(() => {
    const e: string[] = [];
    const y = Number(yes.replace(',', '.'));
    const n = Number(no.replace(',', '.'));
    if (!title.trim()) e.push('Başlık boş olamaz.');
    if (title.trim().length < 6) e.push('Başlık en az 6 karakter olmalı.');
    if (!CATS.includes(cat)) e.push('Kategori geçersiz.');
    if (!Number.isFinite(y) || y < 1.01 || y > 10) e.push('Yes oranı 1.01–10 aralığında olmalı.');
    if (!Number.isFinite(n) || n < 1.01 || n > 10) e.push('No oranı 1.01–10 aralığında olmalı.');
    
    // 🔥 FİX: En az 3 saat kuralı
    const minTime = Date.now() + 3 * 3600 * 1000;
    if (closing.getTime() <= minTime) {
        e.push('Kapanış tarihi şu andan en az 3 saat sonra olmalıdır.');
    }

    if (!quotaLoading && (remaining ?? 0) <= 0) e.push('Haftalık gönderim hakkın doldu.');
    return e;
  }, [title, yes, no, closing, cat, remaining, quotaLoading]);

  const canSubmit = errors.length === 0 && uid && !submitting;

  const onDateChange = (event: any, selectedDate?: Date) => {
    // Android için otomatik kapama
    if (Platform.OS === 'android') {
        setPickerMode(null);
    }
    
    if (selectedDate) {
        // Seçilen tarihi/saati mevcut closing state'ine işle
        const current = new Date(closing);
        if (pickerMode === 'time') {
            current.setHours(selectedDate.getHours());
            current.setMinutes(selectedDate.getMinutes());
        } else {
            // mode === 'date'
            current.setFullYear(selectedDate.getFullYear());
            current.setMonth(selectedDate.getMonth());
            current.setDate(selectedDate.getDate());
        }
        setClosing(current);
    }
  };

  const normalizeAsset = async (assetUri: string, width?: number) => {
    if (!width || width <= 1400) return assetUri;
    const out = await ImageManipulator.manipulateAsync(
      assetUri,
      [{ resize: { width: 1400 } }],
      { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
    );
    return out.uri;
  };

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') return;
    const r = await ImagePicker.launchCameraAsync({ quality: 0.9, allowsEditing: true });
    if (!r.canceled && r.assets) {
      const a = r.assets[0];
      const uri = await normalizeAsset(a.uri, a.width);
      setImg({ uri, w: a.width ?? 0, h: a.height ?? 0 });
      setMediaSheet(false);
    }
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return;
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      selectionLimit: 1,
      quality: 0.9,
    });
    if (!r.canceled && r.assets) {
      const a = r.assets[0];
      const uri = await normalizeAsset(a.uri, a.width);
      setImg({ uri, w: a.width ?? 0, h: a.height ?? 0 });
      setMediaSheet(false);
    }
  };

  const removeImage = () => setImg(null);

  const uploadToStorage = async (localUri: string, userId: string) => {
    const fileName = `${Math.random().toString(36).slice(2)}-${Date.now()}.jpg`;
    const dest = `submissions/${userId}/${fileName}`;
    await uploadImage(localUri, dest, { bucket: 'Media', contentType: 'image/jpeg' });
    return dest;
  };

  const submit = async () => {
    if (!canSubmit) {
      return Alert.alert("Form Hatalı", errors.join("\n"));
    }
    try {
      setSubmitting(true);
      let image_path: string | null = null;
      if (img?.uri) {
        const safe = await normalizeAsset(img.uri);
        image_path = await uploadToStorage(safe, uid!);
      }

      const payload = {
        user_id: uid,
        title: title.trim(),
        description: desc.trim() || null,
        category: cat,
        yes_price: Number(yes),
        no_price: Number(no),
        closing_date: closing.toISOString(),
        image_path,
        status: 'pending'
      };

      const { error } = await supabase.from("coupon_submissions").insert(payload);
      if (error) throw error;

      Alert.alert("Gönderildi", "Kupon admin onayına gönderildi.");
      router.back();
    } catch (err: any) {
      Alert.alert("Hata", err.message || "Bilinmeyen hata");
    } finally {
      setSubmitting(false);
    }
  };

  if (quotaLoading || xpLoading) {
    return (
      <SafeAreaView style={{ flex:1, justifyContent:'center', alignItems:'center' }}>
        <ActivityIndicator color={BRAND} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top + 48}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ 
            paddingHorizontal: 16, 
            paddingBottom: 260,
            paddingTop: Platform.OS === 'android' ? (insets.top + 20) : 16
        }}>

          {/* Kota */}
          <View style={styles.quota}>
            <Text style={{ fontWeight:'900', color:'#5a463f' }}>
              Haftalık hak: <Text style={{ color:BRAND }}>{remaining}/5</Text>  
              <Text style={{ color:'#5a463f' }}> (kullanılan: {used})</Text>
            </Text>
          </View>

          {/* Başlık */}
          <Text style={styles.label}>Başlık</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Örn: Bu hafta X takımı kazanır mı?" />

          {/* Açıklama */}
          <Text style={styles.label}>Açıklama (opsiyonel)</Text>
          <TextInput
            style={[styles.input, { height: 90, textAlignVertical:'top' }]}
            value={desc}
            onChangeText={setDesc}
            placeholder="Kaynak, gerekçe vs."
            multiline
          />

          {/* Kategori */}
          <Text style={styles.label}>Kategori</Text>
          <ScrollView horizontal contentContainerStyle={{ gap:10 }}>
            {CATS.map(c => (
              <Pressable
                key={c}
                onPress={() => setCat(c)}
                style={[styles.chip, { backgroundColor: cat === c ? BRAND : '#eee' }]}
              >
                <Text style={{ color: cat === c ? '#fff' : '#333', fontWeight:'800' }}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Oranlar */}
          <Text style={[styles.label, { marginTop:16 }]}>Oranlar</Text>
          <View style={{ flexDirection:'row', gap:10 }}>
            <View style={{ flex:1 }}>
              <Text style={styles.smallMut}>Yes</Text>
              <TextInput keyboardType="decimal-pad" style={styles.input} value={yes} onChangeText={(t)=>setYes(formatOdds(t))} />
            </View>
            <View style={{ flex:1 }}>
              <Text style={styles.smallMut}>No</Text>
              <TextInput keyboardType="decimal-pad" style={styles.input} value={no} onChangeText={(t)=>setNo(formatOdds(t))} />
            </View>
          </View>

          {/* HIZLI ORANLAR */}
          <View style={{ flexDirection:'row', gap:10, marginTop:10, flexWrap:'wrap' }}>
            {['1.20','1.50','2.00','3.00'].map(v => (
              <TouchableOpacity
                key={v}
                onPress={()=>{
                  setYes(v);
                  setNo((Number(v)+0.30).toFixed(2));
                }}
                style={{ paddingHorizontal:12, paddingVertical:8, backgroundColor:'#ffe8cc', borderRadius:10 }}
              >
                <Text style={{ fontWeight:'900', color:'#d35400' }}>+{v}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              onPress={()=>{ setYes('1.80'); setNo('2.10'); }}
              style={{ paddingHorizontal:12, paddingVertical:8, backgroundColor:'#ffdddd', borderRadius:10 }}
            >
              <Text style={{ fontWeight:'900', color:'#c0392b' }}>Sıfırla</Text>
            </TouchableOpacity>
          </View>

          {/* Kapanış - SEXY PICKERS */}
          <Text style={[styles.label, { marginTop:16 }]}>Kapanış (Tarih & Saat)</Text>
          <View style={{ flexDirection:'row', gap:10 }}>
            <TouchableOpacity
              onPress={()=>setPickerMode('date')}
              style={[styles.input,{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor:'#F9FAFB' }]}
            >
              <Ionicons name="calendar-outline" size={22} color={BRAND} />
              <Text style={{ marginTop:4, fontWeight:'700', fontSize:15 }}>{closing.toLocaleDateString()}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={()=>setPickerMode('time')}
              style={[styles.input,{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor:'#F9FAFB' }]}
            >
              <Ionicons name="time-outline" size={22} color={BRAND} />
              <Text style={{ marginTop:4, fontWeight:'700', fontSize:15 }}>
                {closing.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ANDROID INLINE PICKER (Görünmez ama işlevsel) */}
          {Platform.OS === 'android' && pickerMode && (
             <DateTimePicker
               value={closing}
               mode={pickerMode}
               is24Hour={true}
               display="default"
               onChange={onDateChange}
               minimumDate={new Date()} // Geçmiş seçilemez
             />
          )}

          {/* HIZLI GÜNLER */}
          <View style={{ flexDirection:'row', gap:8, marginTop:10, flexWrap:'wrap' }}>
            {[
              {label:'+1g', val:1},
              {label:'+3g', val:3},
              {label:'+7g', val:7},
            ].map(btn=>(
              <TouchableOpacity
                key={btn.label}
                onPress={()=>{
                  const d = new Date(closing);
                  d.setDate(d.getDate()+btn.val);
                  setClosing(new Date(d));
                }}
                style={{ paddingVertical:6, paddingHorizontal:12, backgroundColor:'#eee', borderRadius:10 }}
              >
                <Text style={{ fontWeight:'800' }}>{btn.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* HIZLI SAATLER */}
          <View style={{ flexDirection:'row', gap:8, marginTop:10, flexWrap:'wrap' }}>
            {[
              {label:'+3s', val:3}, // En az 3 saat kuralı için
              {label:'+6s', val:6},
              {label:'-1s', val:-1},
            ].map(btn=>(
              <TouchableOpacity
                key={btn.label}
                onPress={()=>{
                  const d = new Date(closing);
                  d.setHours(d.getHours()+btn.val);
                  setClosing(new Date(d));
                }}
                style={{ paddingVertical:6, paddingHorizontal:12, backgroundColor:'#ddf0ff', borderRadius:10 }}
              >
                <Text style={{ fontWeight:'800', color:'#1565c0' }}>{btn.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Kapak Görseli */}
          <Text style={[styles.label,{ marginTop:16 }]}>Kapak Görseli</Text>

          {!img ? (
            <TouchableOpacity onPress={()=>setMediaSheet(true)} style={styles.imagePick}>
              <Text style={{ color:BRAND, fontWeight:'900' }}>Kamera / Galeri</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.imageWrap}>
              <Image source={{ uri: img.uri }} style={{ width:'100%', height:170, borderRadius:12 }} />
              <Pressable onPress={removeImage} style={styles.removeBtn}>
                <Text style={{ color:'#fff', fontWeight:'900' }}>Sil</Text>
              </Pressable>
            </View>
          )}

          {/* Canlı Önizleme Burada */}
          <LivePreview
            title={title}
            yes={yes}
            no={no}
            cat={cat}
            img={img}
            closing={closing}
          />

          {errors.length > 0 && (
            <View style={styles.errorBox}>
              {errors.map(e=>(
                <Text key={e} style={{ color:'#c0392b', fontWeight:'600' }}>• {e}</Text>
              ))}
            </View>
          )}

          <TouchableOpacity
            disabled={!canSubmit}
            onPress={submit}
            style={[styles.submitBtn, { opacity: canSubmit ? 1 : 0.5 }]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color:'#fff', fontWeight:'900' }}>Gönder (Onaya)</Text>
            )}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* SEXY IOS DATE PICKER MODAL */}
      {Platform.OS === 'ios' && pickerMode && (
         <Modal transparent animationType="fade" visible={!!pickerMode} onRequestClose={()=>setPickerMode(null)}>
            <Pressable style={styles.modalOverlay} onPress={()=>setPickerMode(null)}>
               <View style={styles.pickerSheet}>
                  <View style={styles.pickerHeader}>
                      <Text style={{fontWeight:'bold', color:'#666'}}>
                          {pickerMode === 'date' ? 'Tarih Seç' : 'Saat Seç'}
                      </Text>
                      <TouchableOpacity onPress={()=>setPickerMode(null)} style={styles.doneBtn}>
                          <Text style={{color:'#fff', fontWeight:'bold'}}>Bitti</Text>
                      </TouchableOpacity>
                  </View>
                  <DateTimePicker
                     value={closing}
                     mode={pickerMode}
                     display="spinner"
                     onChange={onDateChange}
                     minimumDate={new Date()} // Geçmiş seçilemez!
                     textColor="#000"
                     style={{ height: 180 }}
                  />
               </View>
            </Pressable>
         </Modal>
      )}

      {/* MEDIA SHEET */}
      <Modal visible={mediaSheet} transparent animationType="fade" onRequestClose={()=>setMediaSheet(false)}>
        <Pressable style={{ flex:1, backgroundColor:'rgba(0,0,0,0.4)' }} onPress={()=>setMediaSheet(false)}>
          <View style={{
            position:'absolute',
            left:0, right:0, bottom:0,
            backgroundColor:'#fff',
            borderTopLeftRadius:20,
            borderTopRightRadius:20,
            padding:20,
            paddingBottom: insets.bottom + 30
          }}>

            <Text style={{ fontWeight:'900', fontSize:16, marginBottom:12 }}>Görsel Kaynağı</Text>

            <View style={{ flexDirection:'row', gap:12 }}>
              <TouchableOpacity onPress={pickFromCamera} style={styles.sheetBtnCamera}>
                <Ionicons name="camera" size={22} color={BRAND} />
                <Text style={styles.sheetLabelCamera}>Kamera</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={pickFromGallery} style={styles.sheetBtnGallery}>
                <Ionicons name="image" size={22} color="#1B66FF" />
                <Text style={styles.sheetLabelGallery}>Galeri</Text>
              </TouchableOpacity>
            </View>

          </View>
        </Pressable>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  quota: { backgroundColor:SOFT, borderColor:BORDER, borderWidth:1, padding:10, borderRadius:12, marginBottom:12 },
  label: { fontWeight:'900', marginTop:10, marginBottom:6 },
  smallMut: { color:'#666', marginBottom:6, fontWeight:'700' },
  input: { borderWidth:1, borderColor:'#ddd', borderRadius:10, padding:10, backgroundColor:'#fff' },
  chip: { paddingHorizontal:14, paddingVertical:8, borderRadius:20, borderWidth:1, borderColor:'#ddd' },
  imagePick: { borderWidth:2, borderColor:BRAND, borderStyle:'dashed', paddingVertical:14, borderRadius:12, alignItems:'center' },
  imageWrap: { marginTop:4, position:'relative' },
  removeBtn: { position:'absolute', right:10, bottom:10, backgroundColor:'#E53935', paddingHorizontal:10, paddingVertical:8, borderRadius:10 },
  errorBox: { marginTop:12, backgroundColor:'#ffebee', borderRadius:10, padding:10, borderWidth:1, borderColor:'#ffcdd2' },
  submitBtn: { backgroundColor:BRAND, padding:14, borderRadius:12, alignItems:'center', marginTop:20 },

  sheetBtnCamera: {
    flex:1, borderWidth:1, borderColor:'#FFD4B8',
    backgroundColor:'#FFF3EC', borderRadius:12, padding:18, alignItems:'center'
  },
  sheetBtnGallery: {
    flex:1, borderWidth:1, borderColor:'#C9E7FF',
    backgroundColor:'#EEF6FF', borderRadius:12, padding:18, alignItems:'center'
  },
  sheetLabelCamera: { marginTop:6, fontWeight:'900', color:'#C24E14' },
  sheetLabelGallery: { marginTop:6, fontWeight:'900', color:'#1B66FF' },

  // SEXY PICKER STYLES
  modalOverlay: {
      flex:1, backgroundColor:'rgba(0,0,0,0.4)', justifyContent:'flex-end'
  },
  pickerSheet: {
      backgroundColor:'#fff',
      borderTopLeftRadius:24,
      borderTopRightRadius:24,
      paddingBottom: 40,
      paddingTop: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
      elevation: 5
  },
  pickerHeader: {
      flexDirection:'row',
      justifyContent:'space-between',
      alignItems:'center',
      paddingHorizontal:20,
      marginBottom:10,
      borderBottomWidth:1,
      borderBottomColor:'#eee',
      paddingBottom:10
  },
  doneBtn: {
      backgroundColor: BRAND,
      paddingHorizontal:16,
      paddingVertical:6,
      borderRadius:20
  }
});