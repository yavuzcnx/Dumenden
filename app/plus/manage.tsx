'use client';
import { supabase } from '@/lib/supabaseClient';
import { useI18n } from '@/lib/i18n';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
// 🔥 DÜZELTME: Pressable buraya eklendi
import { Alert, FlatList, Pressable, Text, TouchableOpacity, View } from 'react-native';

type Row = {
  id: string;
  title: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  closing_date: string;
  category: string;
  approved_coupon_id?: string | null;
};

const BRAND = '#FF6B00';
const TABS = [
  { key: 'all', labelKey: 'plusManage.tabs.all' },
  { key: 'pending', labelKey: 'plusManage.tabs.pending' },
  { key: 'approved', labelKey: 'plusManage.tabs.approved' },
  { key: 'rejected', labelKey: 'plusManage.tabs.rejected' },
  { key: 'withdrawn', labelKey: 'plusManage.tabs.withdrawn' },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function ManageMySubmissions() {
  const router = useRouter();
  const { t, numberLocale } = useI18n();
  const [tab, setTab] = useState<TabKey>('all');
  const [rows, setRows] = useState<Row[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const showPayoutRequired = (couponId?: string | null) => {
    const actions: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: t('common.cancel'), style: 'cancel' },
    ];
    if (couponId) {
      actions.push({ text: t('plusManage.actions.addProof'), onPress: () => router.push(`/plus/proofs?coupon=${couponId}`) });
    }
    actions.push({ text: t('plusManage.actions.resolve'), onPress: () => router.push('/plus/resolve') });
    Alert.alert(
      t('plusManage.alerts.payoutRequiredTitle'),
      t('plusManage.alerts.payoutRequiredBody'),
      actions
    );
  };

  // -------------------------
  // LOAD USER & SUBMISSIONS
  // -------------------------
  const load = useCallback(async () => {
    if (!uid) return;

    let q = supabase
      .from('coupon_submissions')
      .select('id,title,status,closing_date,category,approved_coupon_id')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    if (tab !== 'all') q = q.eq('status', tab);

    const { data, error } = await q;
    if (error) {
      Alert.alert(t('common.error'), error.message);
      return;
    }

    setRows((data ?? []) as Row[]);
  }, [uid, tab]);

  useEffect(() => {
    (async () => {
      const { data: au } = await supabase.auth.getUser();
      setUid(au?.user?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // -------------------------
  // STATUS BADGES
  // -------------------------
  const tag = (s: Row['status']) => {
    switch (s) {
      case 'approved':
        return { label: t('plusManage.status.approved'), bg: '#E8F5E9', fg: '#1B5E20' };
      case 'rejected':
        return { label: t('plusManage.status.rejected'), bg: '#FFEBEE', fg: '#B71C1C' };
      case 'withdrawn':
        return { label: t('plusManage.status.withdrawn'), bg: '#ECEFF1', fg: '#455A64' };
      default:
        return { label: t('plusManage.status.pending'), bg: '#FFF8E1', fg: '#8D6E63' };
    }
  };

  // -------------------------
  // DELETE FUNCTION (FIXED: HEM SUBMISSION HEM EXPLORE SİLİNİR)
 
  const deleteSubmission = async (item: Row) => {
    let couponId = item.approved_coupon_id ?? null;
    let couponRow: { id?: string; result?: string | null; paid_out_at?: string | null } | null = null;

    try {
      if (!couponId && uid) {
        const { data, error } = await supabase
          .from('coupons')
          .select('id,result,paid_out_at')
          .eq('created_by', uid)
          .eq('title', item.title)
          .eq('closing_date', item.closing_date)
          .eq('is_user_generated', true)
          .maybeSingle();
        if (error) throw error;
        couponRow = data ?? null;
        couponId = data?.id ?? null;
      }

      if (couponId) {
        const { count, error: betErr } = await supabase
          .from('coupon_bets')
          .select('id', { count: 'exact', head: true })
          .eq('coupon_id', couponId);
        if (betErr) throw betErr;

        const betCount = count ?? 0;
        if (betCount > 0) {
          let paid = false;
          if (couponRow) {
            paid = !!couponRow.result && !!couponRow.paid_out_at;
          } else {
            const { data: cRow, error: cErr } = await supabase
              .from('coupons')
              .select('result, paid_out_at')
              .eq('id', couponId)
              .maybeSingle();
            if (cErr) throw cErr;
            paid = !!cRow?.result && !!cRow?.paid_out_at;
          }

          if (!paid) {
            Alert.alert(
              t('plusManage.alerts.payoutBeforeDeleteTitle'),
              t('plusManage.alerts.payoutBeforeDeleteBody', { count: betCount }),
              [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('plusManage.actions.addProof'), onPress: () => router.push(`/plus/proofs?coupon=${couponId}`) },
                { text: t('plusManage.actions.resolve'), onPress: () => router.push('/plus/resolve') },
              ]
            );
            return;
          }
        }
      }
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message ?? t('plusManage.alerts.checkFailed'));
      return;
    }

    Alert.alert(
      t('plusManage.alerts.deleteTitle'),
      t('plusManage.alerts.deleteBody'),
      [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('plusManage.actions.deleteHard'),
        style: 'destructive',
        onPress: async () => {
          try {
            // 1. Veritabanindan sil (Senin RPC fonksiyonun)
            const { error } = await supabase.rpc('delete_my_coupon', { target_id: item.id });
            if (error) {
              console.error('RPC Hatasi:', error);
              throw new Error(error.message);
            }

            // 3. Listeyi RAM'den manuel temizle (Anlik tepki icin)
            setRows(prevRows => {
                console.log('Silinmeye calisilan ID:', item.id);
                console.log('Listedeki satir sayisi (Once):', prevRows.length);
                const newRows = prevRows.filter(r => r.id !== item.id);
                console.log('Listedeki satir sayisi (Sonra):', newRows.length);
                return newRows;
            });

            // 4. Veritabanindan son halini cekip listeyi zorla yenile
            await load();

            Alert.alert(t('common.success'), t('plusManage.alerts.deleteSuccess'));

          } catch (err: any) {
            const msg = String(err?.message ?? '');
            if (/PAYOUT_REQUIRED/i.test(msg)) {
              showPayoutRequired(couponId);
              return;
            }
            if (/permission denied/i.test(msg) && /users/i.test(msg)) {
              Alert.alert(
                t('plusManage.alerts.permissionDeniedTitle'),
                t('plusManage.alerts.permissionDeniedBody')
              );
              return;
            }
            Alert.alert(t('common.error'), msg || t('plusManage.alerts.deleteFailed'));
          }
        }
      }
    ]);
  };

  const Item = ({ item }: { item: Row }) => {
    const t = tag(item.status);
    const canEdit = item.status === 'pending';

    return (
      <View style={{
        borderWidth: 1,
        borderColor: '#eee',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontWeight: '900', flex: 1 }} numberOfLines={1}>{item.title}</Text>

          <View style={{
            backgroundColor: t.bg,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 8,
            marginLeft: 8
          }}>
            <Text style={{ color: t.fg, fontWeight: '800', fontSize: 12 }}>{t.label}</Text>
          </View>
        </View>

        <Text style={{ color: '#666', marginTop: 4 }}>
          {item.category} • {t('plusManage.closingLabel', { date: new Date(item.closing_date).toLocaleString(numberLocale) })}
        </Text>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>

          {/* ------------------- */}
          {/* Düzenle */}
          {/* ------------------- */}
          <TouchableOpacity
            disabled={!canEdit}
            onPress={() =>
              router.push({
                pathname: '/user-edit-coupon',
                params: { id: item.id }
              })
            }
            style={{
              flex: 1,
              backgroundColor: canEdit ? '#e0e0e0' : '#f5f5f5',
              padding: 10,
              borderRadius: 10,
            }}>
            <Text style={{ textAlign:'center', fontWeight:'800', color: canEdit ? '#000' : '#aaa' }}>
              {t('common.edit')}
            </Text>
          </TouchableOpacity>

          {/* ------------------- */}
          {/* Kanıt Ekle */}
          {/* ------------------- */}
          <TouchableOpacity
            onPress={() => router.push(`/plus/proofs?coupon=${item.id}`)}
            style={{
              flex: 1,
              backgroundColor: BRAND,
              padding: 10,
              borderRadius: 10
            }}>
            <Text style={{ textAlign: 'center', color: '#fff', fontWeight: '900' }}>
              {t('plusManage.actions.addProof')}
            </Text>
          </TouchableOpacity>

          {/* ------------------- */}
          {/* Sil */}
          {/* ------------------- */}
          <TouchableOpacity
            // 🔥 Statüyü de gönderiyoruz ki ana tablodan da silebilsin
            onPress={() => deleteSubmission(item)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: '#ef4444'
            }}>
            <Text style={{ color: '#fff', fontWeight: '900' }}>{t('common.delete')}</Text>
          </TouchableOpacity>

        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 8 }}>
        <Text style={{
          fontSize: 22,
          fontWeight: '900',
          color: BRAND,
          marginBottom: 10
        }}>
          {t('plusManage.title')}
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TABS.map(t => (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 12,
                backgroundColor: tab === t.key ? BRAND : '#eee'
              }}
            >
              <Text style={{
                color: tab === t.key ? '#fff' : '#333',
                fontWeight: '700'
              }}>
                {t(t.labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(x) => x.id}
        renderItem={Item}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        ListEmptyComponent={
          <Text style={{
            textAlign: 'center',
            color: '#888',
            marginTop: 24
          }}>
            {t('plusManage.empty')}
          </Text>
        }
      />
    </View>
  );
}
