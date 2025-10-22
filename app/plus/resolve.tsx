'use client';

import { publicUrl, uploadImage } from '@/lib/storage';
import { supabase } from '@/lib/supabaseClient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Coupon = {
  id: string;
  title: string;
  closing_date: string;
  image_url: string | null;
  result: 'YES' | 'NO' | null;
  paid_out_at: string | null;
  created_by?: string | null;
  author_id?: string | null;
  is_user_generated?: boolean | null;
  is_open?: boolean | null;
  coupon_proofs?: { id: string; media_url: string | null; status: string }[];
  coupon_submissions?: { image_path: string | null }[];
};

const ORANGE = '#FF6B00';
const GREEN = '#22c55e';
const BUCKET = 'Media';
const uid = () => Math.random().toString(36).slice(2);
const { width } = Dimensions.get('window');

const resolveUrl = (raw?: string | null) => {
  if (!raw) return null;
  const s = String(raw);
  if (s.startsWith('http')) return s;
  return publicUrl(s, BUCKET);
};

async function callPayoutRPC(couponId: string) {
  let { data, error } = await supabase.rpc('payout_coupon', { p_coupon_id: couponId });
  if (error && /function .*payout_coupon.* does not exist/i.test(error.message)) {
    const r2 = await supabase.rpc('payout_coupon_v2', { p_coupon_id: couponId });
    if (r2.error) throw r2.error;
    return r2.data as any;
  }
  if (error) throw error;
  return data as any;
}
const extractStatus = (res: any) => (Array.isArray(res) ? res[0]?.status : res?.status) as string | undefined;

export default function PlusResolve() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [me, setMe] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Coupon[]>([]);
  const [selected, setSelected] = useState<Coupon | null>(null);
  const [winner, setWinner] = useState<'YES' | 'NO' | null>(null);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openCount = useMemo(() => items.filter((c) => c.is_open && !c.result).length, [items]);
  const payoutCount = useMemo(() => items.filter((c) => !!c.result && !c.paid_out_at).length, [items]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMe(data?.user?.id ?? null);
    })();
  }, []);

  const load = async (term = '') => {
    if (!me) return;

    let base = supabase
      .from('coupons')
      .select(
        `
        id, title, closing_date, result, paid_out_at, image_url, created_at,
        is_user_generated, created_by, author_id, is_open,
        coupon_proofs:coupon_proofs!coupon_proofs_coupon_id_fkey (id, media_url, status),
        coupon_submissions!coupon_submissions_approved_coupon_id_fkey(image_path)
      `
      )
      .or(`created_by.eq.${me},author_id.eq.${me}`)
      .eq('is_user_generated', true)
      .or('and(is_open.eq.true,result.is.null),and(result.not.is.null,paid_out_at.is.null)')
      .order('created_at', { ascending: false })
      .limit(300);

    if (term.trim()) base = base.ilike('title', `%${term.trim()}%`);

    const { data, error } = await base;
    if (error) {
      Alert.alert('Hata', error.message);
      setItems([]);
      return;
    }

    const list = (data ?? []) as unknown as Coupon[];
    list.forEach((c) => {
      const subImg = c.coupon_submissions?.[0]?.image_path ?? null;
      c.image_url = resolveUrl(c.image_url) || resolveUrl(subImg);
      if (c.coupon_proofs) {
        c.coupon_proofs = c.coupon_proofs.map((p) => ({ ...p, media_url: resolveUrl(p.media_url) }));
      }
    });

    setItems(list);

    if (selected && !list.find((x) => x.id === selected.id)) {
      setSelected(null);
      setWinner(null);
      setLocalUri(null);
    }
  };

  useEffect(() => {
    if (me) load();
  }, [me]);
  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return Alert.alert('İzin gerekli', 'Galeriden seçim izni ver.');
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.9,
    });
    if (res.canceled) return;
    const a = res.assets?.[0];
    if (a?.uri) setLocalUri(a.uri);
  };

  const resolveNow = async () => {
    if (!selected) return Alert.alert('Eksik', 'Bir kupon seç.');
    if (!winner) return Alert.alert('Eksik', 'Kazananı seç (YES/NO).');

    try {
      setBusy(true);
      let proofUrl: string | null = null;
      if (localUri) {
        const path = `proofs/${selected.id}/${uid()}.jpg`;
        await uploadImage(localUri, path, { bucket: BUCKET, contentType: 'image/jpeg' });
        proofUrl = publicUrl(path, BUCKET);
      }

      const { data, error } = await supabase.rpc('resolve_and_payout', {
        p_coupon_id: selected.id,
        p_result: winner,
        p_proof_url: proofUrl,
      });
      if (error) throw error;

      const s = extractStatus(data);
      const paidMsg = s === 'paid' ? 'Ödemeler dağıtıldı.' : s === 'already_paid' ? 'Zaten ödenmişti.' : 'İşlem tamam.';
      Alert.alert('Tamam', `Sonuç “${winner}” olarak işaretlendi. ${paidMsg}`);

      setSelected(null);
      setWinner(null);
      setLocalUri(null);
      load(q);
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Sonuç/payout başarısız');
    } finally {
      setBusy(false);
    }
  };

  const payoutNow = async () => {
    if (!selected) return;
    try {
      setBusy(true);
      const data = await callPayoutRPC(selected.id);
      const s = extractStatus(data);
      const msg = s === 'already_paid' ? 'Zaten ödenmiş.' : 'Ödemeler dağıtıldı.';
      Alert.alert('Tamam', msg);
      load(q);
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Payout başarısız');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FFF7F0', paddingTop: Math.max(insets.top, 8) }}>
      {/* HEADER */}
      <LinearGradient
        colors={['#FFE3D0', '#FFF0E6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top, 8),
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderColor: '#F3D9C7',
          shadowColor: '#FF6B00',
          shadowOpacity: 0.08,
          shadowRadius: 8,
          elevation: 3,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 28, fontWeight: '900', color: ORANGE }}>Kazananı Belirle</Text>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#FFEBDD',
                borderWidth: 1,
                borderColor: '#FFD4B8',
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
              }}
            >
              <Ionicons name="trophy-outline" size={14} color={ORANGE} style={{ marginRight: 4 }} />
              <Text style={{ color: '#0F172A', fontWeight: '900' }}>{openCount}</Text>
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#EAFDF4',
                borderWidth: 1,
                borderColor: '#C9F3DB',
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
              }}
            >
              <Ionicons name="cash-outline" size={14} color="#059669" style={{ marginRight: 4 }} />
              <Text style={{ color: '#0F172A', fontWeight: '900' }}>{payoutCount}</Text>
            </View>
          </View>
        </View>

        {/* Arama kutusu */}
        <View
          style={{
            marginTop: 10,
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: '#F5CDB7',
            backgroundColor: '#FFF9F4',
            borderRadius: 12,
            paddingHorizontal: 10,
          }}
        >
          <Ionicons name="search" size={18} color="#9CA3AF" />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Başlıkta ara…"
            placeholderTextColor="#9CA3AF"
            style={{ flex: 1, paddingVertical: 10, marginLeft: 6 }}
          />
        </View>
      </LinearGradient>

      {/* CONTENT */}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 180 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {(!me || items.length === 0) && (
          <View style={{ alignItems: 'center', marginTop: 20 }}>
            {!me ? <ActivityIndicator /> : <Text style={{ color: '#666' }}>Uygun kupon bulunamadı.</Text>}
          </View>
        )}

        {!!items.length && (
          <FlatList
            data={items}
            keyExtractor={(i) => String(i.id)}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ maxHeight: 220 }}
            contentContainerStyle={{ paddingRight: 8 }}
            renderItem={({ item }) => {
              const active = selected?.id === item.id;
              return (
                <TouchableOpacity
                  onPress={() => setSelected(item)}
                  style={{
                    width: Math.min(0.82 * width, 520),
                    marginRight: 12,
                    padding: 12,
                    borderRadius: 16,
                    borderWidth: 2,
                    borderColor: active ? ORANGE : '#F0E4DA',
                    backgroundColor: '#fff',
                    shadowColor: '#000',
                    shadowOpacity: 0.06,
                    shadowRadius: 8,
                    elevation: 2,
                  }}
                >
                  {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={{ width: '100%', height: 140, borderRadius: 12 }} />
                  ) : (
                    <View style={{ width: '100%', height: 140, borderRadius: 12, backgroundColor: '#eee' }} />
                  )}

                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                    <Text style={{ fontWeight: '900', fontSize: 16, flex: 1 }} numberOfLines={1}>
                      {item.title}
                    </Text>

                    <View
                      style={{
                        backgroundColor: item.is_open ? '#E6F6FF' : '#F1F5F9',
                        borderWidth: 1,
                        borderColor: item.is_open ? '#B3E0FF' : '#E5E7EB',
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 999,
                      }}
                    >
                      <Text style={{ color: '#374151', fontWeight: '800', fontSize: 12 }}>
                        {item.is_open ? 'Açık' : 'Kapalı'}
                      </Text>
                    </View>
                  </View>

                  <Text style={{ color: '#6B7280', marginTop: 2 }}>
                    Kapanış: {item.closing_date?.split('T')[0]}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        )}

        <View style={{ height: 1, backgroundColor: '#EFE4DA', marginVertical: 14 }} />

        {selected ? (
          <View style={{ gap: 10 }}>
            <Text style={{ fontWeight: '900', fontSize: 18 }}>Seçilen: {selected.title}</Text>
            <Text style={{ color: '#666' }}>
              {(selected.is_open ? 'Açık' : 'Kapalı')} • {selected.result ? `Sonuç: ${selected.result}` : 'Sonuçlanmadı'}{' '}
              {selected.paid_out_at ? '• Ödendi' : ''}
            </Text>

            {!!selected.coupon_proofs?.length && (
              <FlatList
                data={selected.coupon_proofs.filter((p) => p.status === 'approved')}
                keyExtractor={(p) => p.id}
                horizontal
                contentContainerStyle={{ paddingVertical: 6 }}
                renderItem={({ item }) => (
                  <Image
                    source={{ uri: item.media_url || '' }}
                    style={{ width: 120, height: 90, borderRadius: 10, marginRight: 8, backgroundColor: '#eee' }}
                  />
                )}
              />
            )}

            {!selected.result && (
              <>
                <Text style={{ fontWeight: '800', marginTop: 2 }}>Kazananı Seç</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  {(['YES', 'NO'] as const).map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => setWinner(opt)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor: winner === opt ? ORANGE : '#E5E7EB',
                        backgroundColor: winner === opt ? '#FFEEE2' : '#fff',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontWeight: '900', color: winner === opt ? ORANGE : '#111827' }}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  onPress={pickImage}
                  style={{
                    backgroundColor: '#3D5AFE',
                    padding: 14,
                    borderRadius: 12,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '900' }}>
                    {localUri ? 'Kanıtı Değiştir' : 'Kanıt Görseli Ekle (Opsiyonel)'}
                  </Text>
                </TouchableOpacity>

                {!!localUri && (
                  <Image
                    source={{ uri: localUri }}
                    style={{ width: '100%', height: 180, borderRadius: 12, marginTop: 8 }}
                  />
                )}

                <TouchableOpacity
                  disabled={!winner || busy}
                  onPress={resolveNow}
                  style={{
                    backgroundColor: !winner || busy ? '#f3a774' : ORANGE,
                    padding: 14,
                    borderRadius: 12,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '900' }}>
                    {busy ? 'İşleniyor…' : 'Sonuçla & Öde'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {!!selected.result && !selected.paid_out_at && (
              <TouchableOpacity
                disabled={busy}
                onPress={payoutNow}
                style={{ backgroundColor: busy ? '#9ccc65' : GREEN, padding: 14, borderRadius: 12, alignItems: 'center' }}
              >
                <Text style={{ color: '#fff', fontWeight: '900' }}>{busy ? 'İşleniyor…' : 'Ödemeyi Dağıt'}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <Text style={{ color: '#777' }}>Bir kupon seçin.</Text>
        )}
      </ScrollView>
    </View>
  );
}
