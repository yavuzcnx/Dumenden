// app/plus/proofs.tsx
import { uploadImage } from '@/lib/storage';
import { supabase } from '@/lib/supabaseClient';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Pressable, SafeAreaView, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BRAND = '#FF6B00';
const SOFT  = '#FFF2E8';
const BORDER= '#F2D9C8';
const INK   = '#0F172A';
const MUTED = '#6B7280';

type MyCouponRow = {
  id: string;
  title: string;
  image_url: string | null;
  closing_date: string | null;
  is_open: boolean | null;
};

type CardCoupon = {
  id: string;
  title: string;
  thumb: string | null;
  disabled: boolean;     // kapalı / süresi geçmiş
  hasProof: boolean;     // herhangi bir kanıt var mı? (pending veya approved)
};

export default function ProofsForPlus() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [uid, setUid] = useState<string | null>(null);
  const [coupons, setCoupons] = useState<CardCoupon[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [img, setImg] = useState<{ uri: string; w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(true);
  const [sending, setSending] = useState(false);

  const openCount = useMemo(() => coupons.filter(c => !c.disabled).length, [coupons]);
  const oldCount  = useMemo(() => coupons.filter(c =>  c.disabled).length, [coupons]);

  useEffect(() => {
    (async () => {
      const { data: au } = await supabase.auth.getUser();
      const u = au?.user;
      if (!u) { setBusy(false); Alert.alert('Oturum yok', 'Lütfen giriş yap.'); return; }
      setUid(u.id);

      // 1) Kullanıcının user-generated kuponları (hepsi)
      const { data, error } = await supabase
        .from('coupons')
        .select('id,title,image_url,closing_date,is_open')
        .eq('created_by', u.id)
        .eq('is_user_generated', true)
        .order('created_at', { ascending: false });

      if (error) console.log('COUPONS ERR', error);

      const now = Date.now();
      const baseList: CardCoupon[] = (data ?? []).map((r: MyCouponRow) => {
        const isExpired = r.closing_date ? new Date(r.closing_date).getTime() <= now : false;
        const disabled = !!(isExpired || r.is_open === false);
        const thumb = r.image_url && r.image_url.length > 3 ? r.image_url : null;
        return { id: r.id, title: r.title, thumb, disabled, hasProof: false };
      });

      // 2) Bu kuponlar arasında herhangi bir kanıtı (pending veya approved) olanları işaretle
      const ids = baseList.map(x => x.id);
      if (ids.length > 0) {
        const { data: proofs } = await supabase
          .from('coupon_proofs')
          .select('coupon_id,status')
          .in('coupon_id', ids)
          .in('status', ['approved', 'pending']) // 🔒 onay bekleyen de sayılır
          .limit(1000);

        const set = new Set((proofs ?? []).map(p => p.coupon_id as string));
        baseList.forEach(x => { x.hasProof = set.has(x.id); });
      }

      setCoupons(baseList);

      // Varsayılan seçim: sadece kanıtı olmayan ilk açık kupon
      const firstOpen = baseList.find(x => !x.disabled && !x.hasProof)?.id ?? null;
      setSelected(firstOpen);
      setBusy(false);
    })();
  }, []);

  /* -------------- Image pickers -------------- */
  const prepareImage = async (uri: string, width: number) => {
    const maxW = 1200;
    const ratio = width > maxW ? maxW / width : 1;
    const mani = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: Math.round((width || maxW) * ratio) } }],
      { compress: 0.86, format: ImageManipulator.SaveFormat.JPEG }
    );
    setImg({ uri: mani.uri, w: mani.width ?? width, h: mani.height ?? 0 });
  };

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('İzin gerekli', 'Galeriye erişim izni ver.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1, allowsEditing: true });
    if (res.canceled) return;
    const a = res.assets?.[0]; if (!a) return;
    await prepareImage(a.uri, a.width ?? 0);
  };

  const pickFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('İzin gerekli', 'Kameraya erişim izni ver.'); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 1, allowsEditing: true });
    if (res.canceled) return;
    const a = res.assets?.[0]; if (!a) return;
    await prepareImage(a.uri, a.width ?? 0);
  };

  /* -------------- Submit -------------- */
  const submit = async () => {
    if (!uid || !selected) return;

    const selectedCoupon = coupons.find(c => c.id === selected);
    if (selectedCoupon?.hasProof) {
      Alert.alert('Zaten Kanıt Var', 'Bu kupon için kanıt daha önce gönderilmiş.');
      return;
    }

    if (!img) { Alert.alert('Görsel eksik', 'Bir görsel seç.'); return; }

    try {
      setSending(true);

      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const destPath = `proofs/${uid}/${fileName}`;

      await uploadImage(img.uri, destPath);

      const { error } = await supabase.from('coupon_proofs').insert({
        coupon_id: selected,
        title: title.trim() || null,
        media_url: destPath,
        status: 'pending',     // admin onayı bekler
        created_by: uid,
      });
      if (error) throw error;

      Alert.alert('Gönderildi', 'Kanıtın admin onayına gönderildi.');

      // Yerelde de kilitle (kullanıcı tekrar seçemesin)
      setCoupons(prev => prev.map(c => c.id === selected ? { ...c, hasProof: true } : c));
      setSelected(null);
      setImg(null);
      setTitle('');

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

  const bottomPad = insets.bottom + 72;
  const selectedCoupon = coupons.find(c => c.id === selected);

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:'#fff' }}>
      <ScrollView contentContainerStyle={{ padding:16, paddingBottom: bottomPad }}>
        {/* HERO */}
        <LinearGradient
          colors={['#FFF7F0', '#FFFFFF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={{ flexDirection:'row', alignItems:'center' }}>
            <Text style={styles.heroTag}>PLUS</Text>
            <Text style={styles.heroDot}>•</Text>
            <Text style={styles.heroTop}>Kanıt Yükle</Text>
          </View>

          <View style={{ flexDirection:'row', alignItems:'center', marginTop: 2 }}>
            <Text style={styles.heroTitle}>Kuponunu parlat</Text>
            <Text style={{ marginLeft: 6, fontSize: 18 }}>✨</Text>
          </View>

          <Text style={styles.heroSub}>Sadece açık ve süresi geçmemiş kuponlar listelenir.</Text>

          <View style={styles.heroStats}>
            <View style={styles.statPill}>
              <Text style={styles.statNum}>{openCount}</Text>
              <Text style={styles.statLabel}>Açık</Text>
            </View>
            <View style={[styles.statPill, { backgroundColor:'#F3F4F6', borderColor:'#E5E7EB' }]}>
              <Text style={[styles.statNum, { color:'#111827' }]}>{oldCount}</Text>
              <Text style={[styles.statLabel, { color:'#6B7280' }]}>Eski/Kapalı</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Kupon seçimi */}
        <Text style={styles.blockTitle}>Kuponunu Seç</Text>

        {coupons.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ color:'#8d6e63', fontWeight:'700' }}>Listelenecek kupon yok</Text>
            <Text style={{ color:'#8d6e63', marginTop: 4 }}>
              Eski / kapanmış kuponlar gizlendi. Yeni kupon gönder, sonra buradan kanıt ekle.
            </Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:12, marginTop:8, paddingVertical:4 }}>
            {coupons.map(c => {
              const active = selected === c.id;
              const badge =
                c.disabled
                  ? (c.hasProof ? { text: 'Kanıtlı', bg:'#FFF7ED', border:'#FED7AA', color:'#9A3412' }
                                : { text: 'Kapalı / Süresi geçmiş', bg:'#F3F4F6', border:'#E5E7EB', color:'#9CA3AF' })
                  : (c.hasProof ? { text: 'Kanıt gönderildi', bg:'#E6FFFA', border:'#99F6E4', color:'#0F766E' } : null);

              return (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    // 🔒 Kapalıysa ya da bu kuponda zaten (pending/approved) kanıt varsa seçtirmiyoruz
                    if (!c.disabled && !c.hasProof) setSelected(c.id);
                  }}
                  style={[
                    styles.card,
                    active && styles.cardActive,
                    (c.disabled || c.hasProof) && { opacity: 0.55 }
                  ]}
                >
                  {c.thumb ? (
                    <Image source={{ uri: c.thumb }} style={{ width: '100%', height: 70, borderRadius: 10, marginBottom: 8 }} />
                  ) : null}

                  <Text numberOfLines={3} style={[styles.cardTitle, active && { color: BRAND }]}>
                    {c.title}
                  </Text>

                  {badge && (
                    <Text
                      style={{
                        marginTop: 6, fontSize: 11, color: badge.color,
                        backgroundColor: badge.bg, borderWidth: 1, borderColor: badge.border,
                        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, alignSelf:'flex-start'
                      }}
                    >
                      {badge.text}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Başlık (opsiyonel) */}
        <Text style={styles.label}>Başlık (opsiyonel)</Text>
        <Text style={styles.hint}>Kısa bir açıklama — örn: “Resmi kaynak”</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder="Örn: Resmi kaynak" style={styles.input} />

        {/* Görsel */}
        <Text style={styles.label}>Görsel</Text>
        <Text style={styles.hint}>Net ve kırpılmış görseller onayı hızlandırır.</Text>

        {!img ? (
          <View style={{ flexDirection:'row', gap: 12 }}>
            <TouchableOpacity
              onPress={pickFromGallery}
              disabled={!selected || !!selectedCoupon?.hasProof}
              style={[
                styles.pick,
                { flex:1, opacity: (!selected || selectedCoupon?.hasProof) ? 0.5 : 1 }
              ]}
            >
              <Text style={{ color: BRAND, fontWeight:'900' }}>Galeriden Seç</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={pickFromCamera}
              disabled={!selected || !!selectedCoupon?.hasProof}
              style={[
                styles.pickOutline,
                { flex:1, opacity: (!selected || selectedCoupon?.hasProof) ? 0.5 : 1 }
              ]}
            >
              <Text style={{ color: '#0F172A', fontWeight:'900' }}>Kamera</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ position:'relative', marginTop:6 }}>
            <Image source={{ uri: img.uri }} style={{ width:'100%', height:220, borderRadius:12 }} />
            <TouchableOpacity onPress={() => setImg(null)} style={styles.remove}>
              <Text style={{ color:'#fff', fontWeight:'900' }}>Sil</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Gönder */}
        {!!selectedCoupon?.hasProof && (
          <Text style={{ marginTop: 10, color: '#0F766E', fontWeight: '800' }}>
            Bu kupon için kanıt zaten gönderilmiş. Yeni kanıt eklenemez.
          </Text>
        )}

        <TouchableOpacity
          onPress={submit}
          disabled={!img || !selected || sending || !!selectedCoupon?.hasProof}
          style={[
            styles.submit,
            { opacity: (!img || !selected || sending || selectedCoupon?.hasProof) ? 0.6 : 1 }
          ]}
        >
          {sending ? <ActivityIndicator color="#fff" /> : <Text style={{ color:'#fff', fontWeight:'900' }}>Kanıtı Gönder</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  heroTag: { color: BRAND, fontWeight: '900' },
  heroDot: { marginHorizontal: 6, color: '#C2410C', fontWeight: '900' },
  heroTop: { color: '#9A3412', fontWeight: '900' },
  heroTitle: { fontSize: 22, fontWeight: '900', color: INK },
  heroSub:   { color: MUTED, marginTop: 4 },
  heroStats: { flexDirection:'row', gap: 8, marginTop: 10, alignItems:'center' },
  statPill: {
    flexDirection:'row', alignItems:'center', gap: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: '#FFF',
    borderRadius: 12, borderWidth: 1, borderColor: BORDER
  },
  statNum: { fontWeight:'900', color: BRAND },
  statLabel: { color: '#7C2D12', fontWeight: '800' },

  blockTitle:{ marginTop:10, fontWeight:'900', color: INK },

  input:{ borderWidth:1, borderColor:'#ddd', borderRadius:12, padding:12, backgroundColor:'#fff' },

  card:{
    width:190, minHeight:88,
    borderWidth:1, borderColor:'#eee',
    borderRadius:12, padding:12,
    justifyContent:'center', backgroundColor:'#fafafa',
    shadowColor:'#000', shadowOpacity:0.05, shadowRadius:4, elevation:1
  },
  cardActive:{ backgroundColor:SOFT, borderColor:BRAND },
  cardTitle:{ fontWeight:'900', color: '#333' },

  empty:{
    backgroundColor: SOFT,
    borderWidth:1, borderColor:BORDER,
    padding:12, borderRadius:12, marginTop:8
  },

  pick:{
    marginTop:6,
    borderWidth:2, borderColor:BRAND, borderStyle:'dashed',
    borderRadius:12, paddingVertical:16, alignItems:'center'
  },
  pickOutline:{
    marginTop:6,
    borderWidth:2, borderColor:'#E5E7EB',
    borderRadius:12, paddingVertical:16, alignItems:'center',
    backgroundColor:'#FFF'
  },
  remove:{
    position:'absolute', right:10, bottom:10,
    backgroundColor:'#E53935', paddingHorizontal:10, paddingVertical:8, borderRadius:10
  },

  label:{ marginTop:14, fontWeight:'900' },
  hint:{ color:'#888', marginTop:4, marginBottom:6, fontSize:12 },

  submit:{ marginTop:16, backgroundColor:BRAND, borderRadius:12, padding:14, alignItems:'center' },
});
