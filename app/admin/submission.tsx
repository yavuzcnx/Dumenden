'use client';
import { publicUrl } from '@/lib/storage';
import { supabase } from '@/lib/supabaseClient';
import { useI18n } from '@/lib/i18n';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert, FlatList, Image, RefreshControl, Text, TouchableOpacity, View,
} from 'react-native';

const BUCKET = 'Media';  
/* ----------------- Types ----------------- */
type CouponSubmission = {
  id: string;
  user_id: string;
  title: string;
  category: string;
  description: string | null;
  image_path: string | null;
  closing_date: string;
  yes_price: number | null;
  no_price: number | null;
  created_at: string;
  users?: { full_name: string | null; is_plus: boolean | null } | null;
};

type ProofRow = {
  id: string;
  coupon_id: string;
  title: string | null;
  media_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_by: string | null;
  created_at: string;
  users?: { full_name: string | null } | null;
  coupons?: { title: string } | null;
};

/* --------- Helpers --------- */
const resolveStorageUrl = (raw?: string | null) => {
  if (!raw) return null;
  if (raw.startsWith('http')) return raw;
  const clean = raw.replace(/^\/+/, '');
  return supabase.storage.from(BUCKET).getPublicUrl(clean).data.publicUrl;
};

/* --------------- Component --------------- */
export default function AdminSubmissions() {
  const router = useRouter();
  const { t, numberLocale } = useI18n();
  const [tab, setTab] = useState<'coupons' | 'proofs'>('coupons');

  const [couponRows, setCouponRows] = useState<CouponSubmission[]>([]);
  const [proofRows, setProofRows] = useState<ProofRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /* --- Admin Check --- */
  const checkAdmin = useCallback(async () => {
    const { data: au } = await supabase.auth.getUser();
    const uid = au?.user?.id;
    if (!uid) return false;
    const { data } = await supabase.from('admins').select('user_id').eq('user_id', uid).maybeSingle();
    return !!data;
  }, []);

  /* --- Kuponları Yükle --- */
const loadCoupons = useCallback(async () => {
  const { data, error } = await supabase
    .from('coupon_submissions')
    .select(`
      id, user_id, title, category, description, image_path,
      closing_date, yes_price, no_price, created_at,
      users ( full_name, is_plus )
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throw error;

  // 🟢 users array → tek object
  const normalized: CouponSubmission[] = (data ?? []).map((r: any) => ({
    id: r.id,
    user_id: r.user_id,
    title: r.title,
    category: r.category,
    description: r.description ?? null,
    image_path: r.image_path ?? null,
    closing_date: r.closing_date,
    yes_price: r.yes_price,
    no_price: r.no_price,
    created_at: r.created_at,
    users: Array.isArray(r.users) ? r.users[0] : r.users ?? null,
  }));

  // 🟠 PLUS olanları üste sırala
  const sorted = normalized.sort((a, b) => {
    const ap = a.users?.is_plus ? 1 : 0;
    const bp = b.users?.is_plus ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  setCouponRows(sorted);
}, []);
  /* --- Kanıtları Yükle --- */
  const loadProofs = useCallback(async () => {
    const { data, error } = await supabase
      .from('coupon_proofs')
      .select(`
        id, coupon_id, title, media_url, status, created_by, created_at,
        users:created_by(full_name),
        coupons:coupon_id(title)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) throw error;
    setProofRows((data ?? []) as any);
  }, []);

  /* --- Hepsini Yükle --- */
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadCoupons(), loadProofs()]);
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? t('adminSubmission.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [loadCoupons, loadProofs]);

  useEffect(() => {
    (async () => {
      const ok = await checkAdmin();
      if (!ok) {
        Alert.alert(t('adminSubmission.noAccessTitle'), t('adminSubmission.noAccessBody'));
        router.replace('/login');
        return;
      }
      await loadAll();

      const ch1 = supabase
        .channel('rt-coupon-submissions')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'coupon_submissions' }, loadCoupons)
        .subscribe();

      const ch2 = supabase
        .channel('rt-coupon-proofs')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'coupon_proofs' }, loadProofs)
        .subscribe();

      return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
    })();
  }, [checkAdmin, loadAll, loadCoupons, loadProofs, router]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  /* ----------------- Actions ----------------- */
  const approveCoupon = async (it: CouponSubmission) => {
    try {
      const isStillOpen = new Date(it.closing_date).getTime() > Date.now();

      const { data: created, error: e1 } = await supabase
        .from('coupons')
        .insert({
          title: it.title,
          description: it.description,
          category: it.category,
          closing_date: it.closing_date,
          yes_price: it.yes_price,
          no_price: it.no_price,
          is_user_generated: true,
          is_open: isStillOpen,
          author_id: it.user_id,
          created_by: it.user_id,
          published_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (e1 || !created) throw e1;

      if (it.image_path) {
        const finalUrl = resolveStorageUrl(it.image_path);
        if (finalUrl) {
          await supabase.from('coupons').update({ image_url: finalUrl }).eq('id', created.id);
        }
      }

      await supabase
        .from('coupon_submissions')
        .update({ status: 'approved', approved_coupon_id: created.id })
        .eq('id', it.id);

      setCouponRows(prev => prev.filter(r => r.id !== it.id));
      Alert.alert(t('adminSubmission.approveCouponTitle'), t('adminSubmission.approveCouponBody'));
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message ?? t('adminSubmission.approveFailed'));
    }
  };

  const rejectCoupon = async (id: string) => {
    await supabase.from('coupon_submissions').update({ status: 'rejected' }).eq('id', id);
    setCouponRows(prev => prev.filter(r => r.id !== id));
  };

  const approveProof = async (p: ProofRow) => {
    await supabase.from('coupon_proofs').update({ status: 'approved' }).eq('id', p.id);
    setProofRows(prev => prev.filter(r => r.id !== p.id));
    Alert.alert(t('adminSubmission.approveProofTitle'), t('adminSubmission.approveProofBody'));
  };

  const rejectProof = async (id: string) => {
    await supabase.from('coupon_proofs').update({ status: 'rejected' }).eq('id', id);
    setProofRows(prev => prev.filter(r => r.id !== id));
  };

  /* ----------------- UI ----------------- */
  const Tab = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <TouchableOpacity onPress={onPress}
      style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, backgroundColor: active ? '#FF6B00' : '#eee' }}>
      <Text style={{ color: active ? '#fff' : '#333', fontWeight: '800' }}>{label}</Text>
    </TouchableOpacity>
  );

  const CouponItem = ({ item }: { item: CouponSubmission }) => {
    const thumb = item.image_path ? (publicUrl(item.image_path) as string) : null;
    return (
      <View style={{ borderWidth: 1, borderColor: '#eee', borderRadius: 16, padding: 14, gap: 10, marginHorizontal: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontWeight: '900' }}>{item.users?.full_name ?? t('common.user')}</Text>
        {item.users?.is_plus && (
          <View style={{ backgroundColor: '#FFE8D6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }}>
            <Text style={{ color: '#FF6B00', fontWeight: '900' }}>{t('adminSubmission.plusBadge')}</Text>
          </View>
        )}
        </View>

        <View style={{ height: 180, backgroundColor: '#f2f3f5', borderRadius: 12, overflow: 'hidden' }}>
          {thumb ? <Image source={{ uri: thumb }} style={{ width: '100%', height: '100%' }} /> : null}
        </View>

        <Text style={{ fontWeight: '900', fontSize: 18 }}>{item.title}</Text>
        <Text style={{ color: '#666' }}>
          {item.category} • {t('adminSubmission.closingLabel')} {new Date(item.closing_date).toLocaleString(numberLocale)}
        </Text>
        <Text>{t('adminSubmission.oddsLine', { yes: item.yes_price ?? '-', no: item.no_price ?? '-' })}</Text>
        {!!item.description && <Text style={{ color: '#444' }}>{item.description}</Text>}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <TouchableOpacity onPress={() => approveCoupon(item)}
            style={{ flex: 1, backgroundColor: '#16a34a', padding: 12, borderRadius: 10, flexDirection: 'row',
                     alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800' }}>{t('adminSubmission.actions.approve')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => rejectCoupon(item.id)}
            style={{ flex: 1, backgroundColor: '#ef4444', padding: 12, borderRadius: 10, flexDirection: 'row',
                     alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Ionicons name="close-circle" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800' }}>{t('adminSubmission.actions.reject')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const ProofItem = ({ item }: { item: ProofRow }) => {
    const thumb = resolveStorageUrl(item.media_url);
    return (
      <View style={{ borderWidth: 1, borderColor: '#eee', borderRadius: 16, padding: 14, gap: 10, marginHorizontal: 12 }}>
        <Text style={{ fontWeight: '900' }}>{item.coupons?.title ?? t('adminSubmission.couponFallback')}</Text>
        <View style={{ height: 200, backgroundColor: '#f2f3f5', borderRadius: 12, overflow: 'hidden' }}>
          {thumb ? <Image source={{ uri: thumb }} style={{ width: '100%', height: '100%' }} /> : null}
        </View>
        {!!item.title && <Text style={{ fontWeight: '700' }}>{item.title}</Text>}
        <Text style={{ color: '#666' }}>
          {t('adminSubmission.sentBy', { name: item.users?.full_name || t('common.user'), date: new Date(item.created_at).toLocaleString(numberLocale) })}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <TouchableOpacity onPress={() => approveProof(item)}
            style={{ flex: 1, backgroundColor: '#16a34a', padding: 12, borderRadius: 10, flexDirection: 'row',
                     alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800' }}>{t('adminSubmission.actions.approve')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => rejectProof(item.id)}
            style={{ flex: 1, backgroundColor: '#ef4444', padding: 12, borderRadius: 10, flexDirection: 'row',
                     alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Ionicons name="close-circle" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800' }}>{t('adminSubmission.actions.reject')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  /* === Ekran === */
  return (
    <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: 56 }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8, marginRight: 8 }}>
          <Ionicons name="arrow-back" size={24} color="#FF6B00" />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '900', color: '#FF6B00' }}>{t('adminSubmission.title')}</Text>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 }}>
        <Tab label={t('adminSubmission.tabs.coupons')} active={tab === 'coupons'} onPress={() => setTab('coupons')} />
        <Tab label={t('adminSubmission.tabs.proofs')} active={tab === 'proofs'} onPress={() => setTab('proofs')} />
      </View>

      {/* Listeler */}
      {tab === 'coupons' ? (
        <FlatList<CouponSubmission>
          data={couponRows}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ paddingBottom: 24, gap: 16 }}
          renderItem={({ item }) => <CouponItem item={item} />}
          ListEmptyComponent={!loading ? (
            <Text style={{ textAlign: 'center', color: '#888', marginTop: 24 }}>{t('adminSubmission.emptyCoupons')}</Text>
          ) : null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      ) : (
        <FlatList<ProofRow>
          data={proofRows}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ paddingBottom: 24, gap: 16 }}
          renderItem={({ item }) => <ProofItem item={item} />}
          ListEmptyComponent={!loading ? (
            <Text style={{ textAlign: 'center', color: '#888', marginTop: 24 }}>{t('adminSubmission.emptyProofs')}</Text>
          ) : null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
    </View>
  );
}
