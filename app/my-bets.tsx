'use client';

import { resolveStorageUrlSmart } from '@/lib/resolveStorageUrlSmart';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabaseClient';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ------------ Types ------------- */
type BetStatus = 'open' | 'won' | 'lost' | 'refunded';
type Side = 'YES' | 'NO';

type CouponLite = {
  id: string;
  title: string;
  image_url: string | null;
  closing_date: string | null;
  result: Side | null;
};

type SingleBet = {
  id: string;
  coupon_id: string;
  side: Side;
  stake: number;
  price: number;
  payout: number | null;
  status: BetStatus;
  created_at: string;
  coupon?: CouponLite; // kupon silinmişse undefined gelebilir
};

type TabKey = 'all' | 'singles';

/* ============== Page ============== */
export default function MyBets() {
  const { t, numberLocale } = useI18n();
  const [tab, setTab] = useState<TabKey>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [singles, setSingles] = useState<SingleBet[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) { setSingles([]); setLoading(false); return; }

    const { data: sData } = await supabase
      .from('coupon_bets')
      .select(`
        id, coupon_id, side, stake, price, payout, status, created_at,
        coupons:coupons ( id, title, image_url, closing_date, result )
      `)
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    const sList: SingleBet[] = await Promise.all(
      (sData ?? []).map(async (r: any) => {
        const cRaw = Array.isArray(r.coupons) ? r.coupons[0] : r.coupons;
        const coupon: CouponLite | undefined = cRaw
          ? {
              id: String(cRaw.id),
              title: String(cRaw.title ?? ''),
              image_url: (await resolveStorageUrlSmart(cRaw.image_url ?? null)) ?? null,
              closing_date: cRaw.closing_date ?? null,
              result: (cRaw.result ?? null) as Side | null,
            }
          : undefined;

        return {
          id: String(r.id),
          coupon_id: String(r.coupon_id),
          side: r.side as Side,
          stake: Number(r.stake),
          price: Number(r.price),
          payout: r.payout === null ? null : Number(r.payout),
          status: (r.status ?? 'open') as BetStatus,
          created_at: r.created_at,
          coupon,
        };
      })
    );

    setSingles(sList);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? '';

      const chBets = supabase
        .channel('rt-bets-singles')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'coupon_bets', filter: `user_id=eq.${uid}` },
          () => load()
        )
        .subscribe();

      const chCoupons = supabase
        .channel('rt-coupons-results')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'coupons' },
          () => load()
        )
        .subscribe();

      return () => {
        try { supabase.removeChannel(chBets); } catch {}
        try { supabase.removeChannel(chCoupons); } catch {}
      };
    })();
  }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const renderSingle = ({ item }: { item: SingleBet }) => {
    let s: BetStatus | 'open' = item.status;

    if (s === 'open' && item.coupon?.result) {
      s = item.coupon.result === item.side ? 'won' : 'lost';
    }

    const pot = Math.round(item.stake * Math.max(1, item.price));
    const chip = chipInfo(s);

    let paid = 0;
    if (s === 'won') {
      paid = typeof item.payout === 'number' ? item.payout : pot;
    } else if (s === 'refunded') {
      paid = typeof item.payout === 'number' ? item.payout : item.stake;
    } else if (s === 'lost') {
      paid = 0;
    }

    const couponDeleted = !item.coupon;
    const title = item.coupon?.title || t('myBets.deletedCoupon', { id: item.coupon_id });

    return (
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Image
            source={item.coupon?.image_url ? { uri: item.coupon.image_url } : undefined}
            style={styles.thumb}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.meta}>
              {t('myBets.betLine', { side: item.side, stake: formatXP(item.stake), odds: item.price.toFixed(2) })}
            </Text>
            <Text style={styles.meta}>{t('myBets.potentialLine', { amount: formatXP(pot) })}</Text>

            {s !== 'open' && (
              <Text style={[styles.meta, { fontWeight: '800' }]}>
                {t('myBets.paidLine', { amount: formatXP(paid) })}
              </Text>
            )}
          </View>

          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <View style={[styles.chip, { backgroundColor: chip.bg }]}>
              <Text style={styles.chipText}>{chip.label}</Text>
            </View>
            {couponDeleted && (
              <View style={[styles.chip, { backgroundColor: '#6b7280' }]}>
                <Text style={styles.chipText}>{t('myBets.deleted')}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex:1, backgroundColor:'#fff' }}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('myBets.title')}</Text>
      </View>

      <View style={styles.tabs}>
        {[{ k: 'all', label: t('categories.all') }, { k: 'singles', label: t('myBets.singlesTab') }].map(x => (
          <TouchableOpacity key={x.k}
            onPress={() => setTab(x.k as TabKey)}
            style={[styles.tabBtn, tab===x.k && styles.tabBtnActive]}>
            <Text style={[styles.tabTxt, tab===x.k && styles.tabTxtActive]}>{x.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop:24 }} />
      ) : (
        <FlatList
          data={singles}
          keyExtractor={(it) => it.id}
          renderItem={renderSingle}
          contentContainerStyle={{ padding:16, paddingBottom:24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF6B00" />}
          ListEmptyComponent={<Text style={styles.empty}>{t('myBets.empty')}</Text>}
        />
      )}
    </View>
  );
}

/* -------------- Styles -------------- */
const styles = StyleSheet.create({
  header:{ paddingTop:56, paddingBottom:12, paddingHorizontal:16, borderBottomWidth:1, borderColor:'#f1f1f1', backgroundColor:'#fff' },
  headerTitle:{ fontSize:22, fontWeight:'900', color:'#111' },

  tabs:{ flexDirection:'row', gap:8, paddingHorizontal:16, paddingTop:10 },
  tabBtn:{ paddingVertical:8, paddingHorizontal:14, borderRadius:12, backgroundColor:'#eee' },
  tabBtnActive:{ backgroundColor:'#FF6B00' },
  tabTxt:{ color:'#333', fontWeight:'700' },
  tabTxtActive:{ color:'#fff' },

  card:{ backgroundColor:'#fff', borderWidth:1, borderColor:'#eee', borderRadius:16, padding:12, marginTop:12,
         shadowColor:'#000', shadowOpacity:0.05, shadowRadius:6, elevation:1 },
  thumb:{ width:68, height:68, borderRadius:12, backgroundColor:'#f1f1f1' },

  title:{ fontSize:15, fontWeight:'900', color:'#111', marginBottom:2 },
  meta:{ color:'#666', marginTop:1 },

  chip:{ paddingHorizontal:10, height:32, borderRadius:16, alignItems:'center', justifyContent:'center' },
  chipText:{ color:'#fff', fontWeight:'900' },

  empty:{ textAlign:'center', marginTop:24, color:'#999' },
});
  const chipInfo = (s: BetStatus | 'open') => {
    switch (s) {
      case 'won': return { label: t('myBets.statusWon'), bg: '#16a34a' };
      case 'lost': return { label: t('myBets.statusLost'), bg: '#dc2626' };
      case 'refunded': return { label: t('myBets.statusRefunded'), bg: '#0ea5e9' };
      default: return { label: t('myBets.statusOpen'), bg: '#9ca3af' };
    }
  };
  const formatXP = (n: number) =>
    new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 0 }).format(n);
