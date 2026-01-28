'use client';

import { publicUrl, uploadImage } from '@/lib/storage';
import { supabase } from '@/lib/supabaseClient';
import { Ionicons } from '@expo/vector-icons';
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
  StatusBar,
  StyleSheet,
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
        is_user_generated, created_by, is_open,
        coupon_proofs:coupon_proofs!coupon_proofs_coupon_id_fkey (id, media_url, status),
        coupon_submissions!coupon_submissions_approved_coupon_id_fkey(image_path)
      `
      )
      .eq('created_by', me)
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

  // 🔥 KANITLI ÖDEME FONKSİYONU (Aynen korundu)
  const resolveNow = async () => {
    if (!selected) return Alert.alert('Eksik', 'Bir kupon seç.');
    if (!winner) return Alert.alert('Eksik', 'Kazananı seç (YES/NO).');

    const hasApprovedProof = selected.coupon_proofs?.some(p => p.status === 'approved');
    const userIsUploading = !!localUri;

    if (!hasApprovedProof && !userIsUploading) {
        Alert.alert(
            "Kanıt Gerekli 🛑", 
            "Ödeme dağıtmak için ONAYLI bir kanıtın olmalı. Lütfen 'Kanıt Ekle' butonuna basıp bir görsel yükle."
        );
        return;
    }

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

      Alert.alert('Başarılı', 'İşlem tamamlandı.');
      
      setSelected(null);
      setWinner(null);
      setLocalUri(null);
      load(q);

    } catch (e: any) {
      let msg = e.message;
      if (msg.includes('Kanıt yüklendi')) {
          msg = "Kanıtın yüklendi ve onaya gönderildi. Admin onaylayınca tekrar gelip 'Sonuçla' diyebilirsin.";
          setLocalUri(null); 
      } else if (msg.includes('Kanıt olmadan')) {
          msg = "Onaylı kanıt bulunamadı! Lütfen kanıt yükle.";
      }
      Alert.alert('Bilgi', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FAFAFA' }}>
      <StatusBar barStyle="dark-content" />
      
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View>
          <Text style={styles.headerTitle}>Kazananı Belirle</Text>
          <Text style={styles.headerSub}>Açık kuponlarını sonuçlandır ve dağıt</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{openCount}</Text>
        </View>
      </View>

      {/* SEARCH */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" style={{ marginLeft: 10 }} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Kupon ara..."
          placeholderTextColor="#999"
          style={styles.searchInput}
        />
      </View>

      {/* CONTENT */}
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {(!me || items.length === 0) && (
          <View style={styles.emptyState}>
            {!me ? <ActivityIndicator color={ORANGE} /> : <Text style={styles.emptyText}>Sonuçlanacak kupon yok.</Text>}
          </View>
        )}

        {/* CAROUSEL LIST */}
        {!!items.length && (
          <View>
            <Text style={styles.sectionTitle}>Kuponların</Text>
            <FlatList
              data={items}
              keyExtractor={(i) => String(i.id)}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
              renderItem={({ item }) => {
                const active = selected?.id === item.id;
                return (
                  <TouchableOpacity
                    onPress={() => setSelected(item)}
                    activeOpacity={0.9}
                    style={[
                      styles.couponCard,
                      active && styles.couponCardActive
                    ]}
                  >
                    {item.image_url ? (
                      <Image source={{ uri: item.image_url }} style={styles.cardImage} />
                    ) : (
                      <View style={[styles.cardImage, { backgroundColor: '#eee' }]} />
                    )}
                    
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.8)']}
                      style={styles.cardGradient}
                    />

                    <View style={styles.cardContent}>
                      <View style={[styles.statusBadge, { backgroundColor: item.is_open ? '#22c55e' : '#64748B' }]}>
                        <Text style={styles.statusText}>{item.is_open ? 'AÇIK' : 'KAPALI'}</Text>
                      </View>
                      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                      <Text style={styles.cardDate}>{item.closing_date?.split('T')[0]}</Text>
                    </View>

                    {active && (
                      <View style={styles.activeBorder} />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        )}

        {/* SELECTED DETAIL & ACTIONS */}
        {selected ? (
          <View style={styles.detailSection}>
            <Text style={styles.detailTitle}>Sonuçlandır: <Text style={{fontWeight:'400'}}>{selected.title}</Text></Text>
            
            {/* ONAYLI KANITLAR */}
            {!!selected.coupon_proofs?.some(p => p.status === 'approved') && (
              <View style={styles.proofBox}>
                  <Text style={styles.proofTitle}>✅ Onaylı Kanıt Mevcut</Text>
                  <FlatList
                    data={selected.coupon_proofs?.filter((p) => p.status === 'approved')}
                    keyExtractor={(p) => p.id}
                    horizontal
                    renderItem={({ item }) => (
                      <Image source={{ uri: item.media_url || '' }} style={styles.proofThumb} />
                    )}
                  />
              </View>
            )}

            {!selected.result && (
              <View style={styles.actionBox}>
                <Text style={styles.actionLabel}>Kazanan Taraf</Text>
                <View style={styles.winnerRow}>
                  {(['YES', 'NO'] as const).map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => setWinner(opt)}
                      style={[
                        styles.winnerBtn,
                        winner === opt && (opt === 'YES' ? styles.winnerBtnYes : styles.winnerBtnNo)
                      ]}
                    >
                      <Text style={[
                        styles.winnerText,
                        winner === opt && { color: '#fff' }
                      ]}>{opt}</Text>
                      {winner === opt && <Ionicons name="checkmark-circle" size={20} color="#fff" style={{marginLeft: 6}} />}
                    </TouchableOpacity>
                  ))}
                </View>

                {/* KANIT EKLEME */}
                <TouchableOpacity
                  onPress={() => router.push(`/plus/proofs?coupon=${selected?.id}`)}
                  style={styles.addProofBtn}
                >
                  <Ionicons name="camera" size={20} color="#fff" style={{marginRight: 8}} />
                  <Text style={styles.btnText}>Kanıt Ekle / Yönet</Text>
                </TouchableOpacity>

                {/* SONUÇLA */}
                <TouchableOpacity
                  disabled={!winner || busy}
                  onPress={resolveNow}
                  style={[
                    styles.resolveBtn,
                    (!winner || busy) && { opacity: 0.6, backgroundColor: '#ccc' }
                  ]}
                >
                  {busy ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Ionicons name="flash" size={20} color="#fff" style={{marginRight: 8}} />
                      <Text style={styles.btnText}>Sonuçla & Öde</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.selectHint}>
            <Ionicons name="arrow-up-circle-outline" size={48} color="#ddd" />
            <Text style={{color:'#999', marginTop: 8}}>Yukarıdan bir kupon seç</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // HEADER
  header: { paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#fff', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '900', color: ORANGE },
  headerSub: { fontSize: 13, color: '#666', marginTop: 2 },
  badge: { backgroundColor: '#FFF3E0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  badgeText: { color: ORANGE, fontWeight: '900', fontSize: 16 },

  // SEARCH
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 16, borderRadius: 12, borderWidth: 1, borderColor: '#eee', paddingVertical: 2 },
  searchInput: { flex: 1, paddingVertical: 12, paddingHorizontal: 10, fontSize: 15, color: '#333' },

  // LIST
  sectionTitle: { fontSize: 18, fontWeight: '800', marginLeft: 16, marginBottom: 12, color: '#333' },
  couponCard: { width: 160, height: 220, borderRadius: 16, marginRight: 12, overflow: 'hidden', backgroundColor: '#fff', elevation: 3, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6 },
  couponCardActive: { transform: [{ scale: 1.05 }], borderWidth: 2, borderColor: ORANGE },
  cardImage: { width: '100%', height: '100%' },
  cardGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 120 },
  cardContent: { position: 'absolute', bottom: 12, left: 12, right: 12 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginBottom: 6 },
  statusText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  cardTitle: { color: '#fff', fontWeight: '800', fontSize: 14, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 3 },
  cardDate: { color: '#ddd', fontSize: 11, marginTop: 4 },
  activeBorder: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 3, borderColor: ORANGE, borderRadius: 16 },

  // DETAIL
  detailSection: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 20, padding: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  detailTitle: { fontSize: 18, fontWeight: '800', color: '#333', marginBottom: 16 },
  proofBox: { backgroundColor: '#F0FDF4', padding: 12, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#DCFCE7' },
  proofTitle: { color: GREEN, fontWeight: '800', marginBottom: 8, fontSize: 13 },
  proofThumb: { width: 60, height: 60, borderRadius: 8, marginRight: 8, borderWidth: 1, borderColor: '#fff' },
  
  actionBox: { gap: 12 },
  actionLabel: { fontSize: 14, fontWeight: '700', color: '#666', marginBottom: 4 },
  winnerRow: { flexDirection: 'row', gap: 12 },
  winnerBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#eee', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', backgroundColor: '#F9FAFB' },
  winnerBtnYes: { backgroundColor: GREEN, borderColor: GREEN },
  winnerBtnNo: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  winnerText: { fontWeight: '900', fontSize: 16, color: '#333' },

  addProofBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, backgroundColor: '#334155', marginTop: 8 },
  resolveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, backgroundColor: ORANGE, marginTop: 4, shadowColor: ORANGE, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // EMPTY
  emptyState: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: '#999', fontSize: 16 },
  selectHint: { alignItems: 'center', marginTop: 40, padding: 20 },
});