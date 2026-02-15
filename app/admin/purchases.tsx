// app/admin/AdminPurchases.tsx
'use client';

import { supabase } from '@/lib/supabaseClient';
import { useI18n } from '@/lib/i18n';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Linking,
  Pressable, RefreshControl, StyleSheet,
  Text, TextInput, TouchableOpacity, View
} from 'react-native';

/* ================== Types ================== */
type Status =
  | 'all'
  | 'new'
  | 'contacted'
  | 'preparing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

type Purchase = {
  id: string;
  user_id: string;
  reward_id: string;
  qty?: number | null;
  quantity?: number | null;
  price_xp: number;
  total_xp: number;
  status: Status;
  contact: any;              // { full_name, phone, email, address, note? }
  created_at: string;
  notes?: string | null;     // admin'in müşteriye göndereceği not (outbound)
  admin_notes?: string | null;
  tracking_code?: string | null;
};

type Reward = { id: string; name: string; image_url: string | null };

/* ================== Theme ================== */
const C = {
  orange: '#FF6B00',
  ink: '#0F172A',
  text: '#111827',
  muted: '#6B7280',
  muted2: '#9CA3AF',
  line: '#E7EAF0',
  card: '#FFFFFF',
  bg: '#F8F9FB',
};

const STATUS_COL: Record<Exclude<Status, 'all'>, string> = {
  new: '#F59E0B',
  contacted: '#0284C7',
  preparing: '#8B5CF6',
  shipped: '#2563EB',
  delivered: '#16A34A',
  cancelled: '#DC2626',
  refunded: '#64748B',
};
const STATUS_COL_FULL: Record<Status, string> = { all: C.orange, ...STATUS_COL };

// akış sırası
const PIPELINE: Exclude<Status, 'all' | 'cancelled' | 'refunded'>[] = [
  'new',
  'contacted',
  'preparing',
  'shipped',
  'delivered',
];
const NEXT = (s: Status): Exclude<Status, 'all'> | null => {
  const i = PIPELINE.indexOf(s as any);
  return i >= 0 && i < PIPELINE.length - 1 ? PIPELINE[i + 1] : null;
};

/* ============== RLS-safe Notification (RPC) ============== */
async function sendUserNotification(
  user_id: string,
  title: string,
  body: string,
  payload: Record<string, any> = {},
  type: 'system' | 'order' | 'shipping' | 'message' = 'order'
) {
  const { error } = await supabase.rpc('admin_notify', {
    p_user_id: user_id,
    p_title: title,
    p_body: body,
    p_payload: payload,
    p_type: type,
  });
  if (error) throw error;
}
/* ================== Screen ================== */
export default function AdminPurchases() {
  const { t, numberLocale } = useI18n();
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [rewards, setRewards] = useState<Record<string, Reward>>({});
  const [filter, setFilter] = useState<Status>('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const statusLabel = useMemo(() => {
    const map: Record<Status, string> = {
      all: t('adminPurchases.status.all'),
      new: t('adminPurchases.status.new'),
      contacted: t('adminPurchases.status.contacted'),
      preparing: t('adminPurchases.status.preparing'),
      shipped: t('adminPurchases.status.shipped'),
      delivered: t('adminPurchases.status.delivered'),
      cancelled: t('adminPurchases.status.cancelled'),
      refunded: t('adminPurchases.status.refunded'),
    };
    return (s: Status) => map[s] ?? s;
  }, [t]);

  const fetchAll = async () => {
    setLoading(true);
    const [pRes, rRes] = await Promise.all([
      supabase
        .from('reward_purchases')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('rewards').select('id,name,image_url'),
    ]);
    if (pRes.error) {
      Alert.alert(t('common.error'), pRes.error.message);
      setLoading(false);
      return;
    }
    setPurchases((pRes.data ?? []) as Purchase[]);
    const m: Record<string, Reward> = {};
    (rRes.data ?? []).forEach((r: any) => (m[r.id] = r));
    setRewards(m);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    const ch = supabase
      .channel('rt-purchases')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reward_purchases' },
        () => fetchAll()
      )
      .subscribe();
    return () => {
      try { supabase.removeChannel(ch); } catch {}
    };
  }, []);

  // Üst tarafı sade: 4 grup = Gelenler / Operasyon / Tamamlanan / Sorunlar
  const buckets = useMemo(
    () => ({
      inbox: ['new', 'contacted'] as Status[],
      ops: ['preparing', 'shipped'] as Status[],
      done: ['delivered'] as Status[],
      issues: ['cancelled', 'refunded'] as Status[],
    }),
    []
  );

  const counts = useMemo(() => {
    const m = { all: purchases.length } as Record<Status, number>;
    (['new','contacted','preparing','shipped','delivered','cancelled','refunded'] as const).forEach(
      (s) => { m[s] = purchases.filter((p) => p.status === s).length; }
    );
    return m;
  }, [purchases]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return purchases.filter((p) => {
      if (filter !== 'all' && p.status !== filter) return false;
      if (!q) return true;
      const rw = rewards[p.reward_id];
      const hay = [
        p.id,
        p.tracking_code,
        p.notes,
        p.admin_notes,
        (p.contact?.note ?? ''),
        (p.contact?.notes ?? ''),
        p.status,
        rw?.name,
        JSON.stringify(p.contact || {}),
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [purchases, filter, search, rewards]);

  /* ============== Mutations ============== */
  const setStatus = async (row: Purchase, status: Exclude<Status, 'all'>) => {
    const prev = row.status;

    // optimistic UI
    setPurchases((list) => list.map((x) => (x.id === row.id ? { ...x, status } : x)));

    const { error } = await supabase
      .from('reward_purchases')
      .update({ status })
      .eq('id', row.id);

    if (error) {
      // rollback
      setPurchases((list) => list.map((x) => (x.id === row.id ? { ...x, status: prev } : x)));
      Alert.alert(t('common.error'), error.message);
      return;
    }

    // Bildirim başlıkları
    const titles: Record<Exclude<Status, 'all'>, string> = {
      new: 'Sipariş alındı',
      contacted: 'Siparişiniz için sizinle iletişime geçiyoruz',
      preparing: 'Siparişiniz hazırlanıyor',
      shipped: 'Siparişiniz kargoda',
      delivered: 'Teslim edildi 🎉',
      cancelled: 'Siparişiniz iptal edildi',
      refunded: 'İade tamamlandı',
    };

    try {
    await sendUserNotification(
  row.user_id,                      // reward_purchases tablosundaki gerçek kullanıcı id
  t('adminPurchases.notifications.contactTitle'),
  t('adminPurchases.notifications.contactBody'),
  { purchase_id: row.id, status: 'contacted' },
  'order'                           // veya 'system' / 'shipping' / 'message'
);
    } catch (e: any) {
      Alert.alert(t('adminPurchases.notificationErrorTitle'), e.message);
    }
  };

  const saveField = async <
    K extends 'tracking_code' | 'notes' | 'admin_notes'
  >(
    row: Purchase,
    field: K,
    value: string,
    sendNotif = false
  ) => {
    const prev = (row as any)[field] || '';

    // optimistic
    setPurchases((list) =>
      list.map((x) => (x.id === row.id ? ({ ...x, [field]: value } as any) : x))
    );

    const { error } = await supabase
      .from('reward_purchases')
      .update({ [field]: value } as any)
      .eq('id', row.id);

    if (error) {
      // rollback
      setPurchases((list) =>
        list.map((x) => (x.id === row.id ? ({ ...x, [field]: prev } as any) : x))
      );
      Alert.alert(t('common.error'), error.message);
      return;
    }

    if (sendNotif && field !== 'admin_notes' && value.trim()) {
      try {
        const title =
          field === 'tracking_code' ? t('adminPurchases.notifications.trackingTitle') : t('adminPurchases.notifications.noteTitle');
        const body =
          field === 'tracking_code' ? t('adminPurchases.notifications.trackingBody', { code: value }) : value.trim();
        await sendUserNotification(row.user_id, title, body, {
          purchase_id: row.id,
          [field]: value,
        });
      } catch (e: any) {
        Alert.alert(t('adminPurchases.notificationErrorTitle'), e.message);
      }
    }

    Alert.alert(t('adminPurchases.savedTitle'));
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      {/* ------------ FILTERS (sadeleştirilmiş) ------------ */}
      <Text style={styles.sectionHead}>{t('adminPurchases.sections.inbox')}</Text>
      <View style={styles.filterRow}>
        {(['all', ...buckets.inbox] as Status[]).map((s) => {
          const col = STATUS_COL_FULL[s];
          const sel = filter === s;
          return (
            <Pressable
              key={s}
              onPress={() => setFilter(s)}
              style={[styles.chip, sel && { borderColor: col, backgroundColor: `${col}22` }]}
            >
              <Text style={[styles.chipText, sel && { color: col }]}>
                {statusLabel(s)} ({counts[s] ?? 0})
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionHead}>{t('adminPurchases.sections.ops')}</Text>
      <View style={styles.filterRow}>
        {buckets.ops.map((s) => {
          const col = STATUS_COL_FULL[s];
          const sel = filter === s;
          return (
            <Pressable
              key={s}
              onPress={() => setFilter(s)}
              style={[styles.chip, sel && { borderColor: col, backgroundColor: `${col}22` }]}
            >
              <Text style={[styles.chipText, sel && { color: col }]}>
                {statusLabel(s)} ({counts[s] ?? 0})
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionHead}>{t('adminPurchases.sections.done')}</Text>
      <View style={styles.filterRow}>
        {buckets.done.map((s) => {
          const col = STATUS_COL_FULL[s];
          const sel = filter === s;
          return (
            <Pressable
              key={s}
              onPress={() => setFilter(s)}
              style={[styles.chip, sel && { borderColor: col, backgroundColor: `${col}22` }]}
            >
              <Text style={[styles.chipText, sel && { color: col }]}>
                {statusLabel(s)} ({counts[s] ?? 0})
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionHead}>{t('adminPurchases.sections.issues')}</Text>
      <View style={styles.filterRow}>
        {buckets.issues.map((s) => {
          const col = STATUS_COL_FULL[s];
          const sel = filter === s;
          return (
            <Pressable
              key={s}
              onPress={() => setFilter(s)}
              style={[styles.chip, sel && { borderColor: col, backgroundColor: `${col}22` }]}
            >
              <Text style={[styles.chipText, sel && { color: col }]}>
                {statusLabel(s)} ({counts[s] ?? 0})
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        placeholder={t('adminPurchases.searchPlaceholder')}
        value={search}
        onChangeText={setSearch}
        style={[styles.input, { marginTop: 12, marginBottom: 8 }]}
      />

      {/* ------------ LIST ------------ */}
      <FlatList
        data={visible}
        keyExtractor={(i) => i.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchAll().finally(() => setRefreshing(false));
            }}
          />
        }
        renderItem={({ item }) => {
          const rw = rewards[item.reward_id];
          return (
            <PurchaseCard
              row={item}
              reward={rw}
              statusLabel={statusLabel}
              onSave={(field, value, notify) => saveField(item, field as any, value, notify)}
              onAdvance={() => {
                const n = NEXT(item.status);
                if (n) setStatus(item, n);
              }}
              onSet={(s) => setStatus(item, s)}
              onContactAndComplete={() => setStatus(item, 'delivered')}
            />
          );
        }}
      />
    </View>
  );
}

/* ================== Card ================== */
function PurchaseCard({
  row,
  reward,
  onSave,
  onAdvance,
  onSet,
  onContactAndComplete,
  statusLabel,
}: {
  row: Purchase;
  reward?: Reward;
  onSave: (
    field: 'tracking_code' | 'notes' | 'admin_notes',
    value: string,
    notify?: boolean
  ) => void;
  onAdvance: () => void;
  onSet: (s: Exclude<Status, 'all'>) => void;
  onContactAndComplete: () => void; // İletişime geç → Tamamla (delivered)
  statusLabel: (s: Status) => string;
}) {
  const { t, numberLocale } = useI18n();
  const qty = row.quantity ?? row.qty ?? 1;
  const c = row.contact || {};

  const [trk, setTrk] = useState(row.tracking_code ?? '');
  const [note, setNote] = useState(row.notes ?? '');
  const [admin, setAdmin] = useState(row.admin_notes ?? '');

  useEffect(() => { setTrk(row.tracking_code ?? ''); }, [row.tracking_code]);
  useEffect(() => { setNote(row.notes ?? ''); }, [row.notes]);
  useEffect(() => { setAdmin(row.admin_notes ?? ''); }, [row.admin_notes]);

  const next = NEXT(row.status);
  const nextLabel: Record<string, string> = {
    contacted: t('adminPurchases.next.contacted'),
    preparing: t('adminPurchases.next.preparing'),
    shipped: t('adminPurchases.next.shipped'),
    delivered: t('adminPurchases.next.delivered'),
  };

  const formNote = (c?.note || c?.notes || '').toString();

  return (
    <View style={styles.card}>
      {/* header */}
      <View style={styles.headRow}>
        <View style={styles.thumb}>
          {!!reward?.image_url && (
            <Image source={{ uri: reward.image_url }} style={{ width: '100%', height: '100%' }} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {reward?.name ?? t('adminPurchases.rewardFallback')}
          </Text>
          <Text style={styles.sub}>
            {t('adminPurchases.itemLine', {
              qty,
              price: row.price_xp.toLocaleString(numberLocale),
              total: row.total_xp.toLocaleString(numberLocale),
            })}
          </Text>
          <Text style={styles.time}>{new Date(row.created_at).toLocaleString(numberLocale)}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{statusLabel(row.status)}</Text>
        </View>
      </View>

      {/* iletişim */}
      <View style={styles.contact}>
        <Text style={styles.blockTitle}>{t('adminPurchases.contact.title')}</Text>
        <Text><Text style={styles.muted}>{t('adminPurchases.contact.name')}:</Text> {c.full_name || t('common.na')}</Text>
        <Text><Text style={styles.muted}>{t('adminPurchases.contact.phone')}:</Text> {c.phone || t('common.na')}</Text>
        <Text><Text style={styles.muted}>{t('adminPurchases.contact.email')}:</Text> {c.email || t('common.na')}</Text>
        <Text numberOfLines={3}><Text style={styles.muted}>{t('adminPurchases.contact.address')}:</Text> {c.address || t('common.na')}</Text>

        {!!formNote && (
          <View style={{ marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA' }}>
            <Text style={{ fontWeight: '900', color: '#9A3412', marginBottom: 4 }}>{t('adminPurchases.formNoteTitle')}</Text>
            <Text style={{ color: '#7C2D12' }}>{formNote}</Text>
          </View>
        )}

        <View style={styles.row}>
          <Btn label={t('adminPurchases.actions.call')} onPress={() => c.phone && Linking.openURL(`tel:${c.phone}`)} />
          <Btn
            label={t('adminPurchases.actions.sms')}
            color="#0284C7"
            onPress={() => c.phone && Linking.openURL(`sms:${c.phone}`)}
          />
          <Btn
            label={t('adminPurchases.actions.email')}
            color={C.orange}
            onPress={() => c.email && Linking.openURL(`mailto:${c.email}`)}
          />
        </View>
      </View>

      {/* kargo takip */}
      <Text style={styles.blockLabel}>{t('adminPurchases.trackingTitle')}</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder={t('adminPurchases.trackingPlaceholder')}
          value={trk}
          onChangeText={setTrk}
        />
        <Btn
          label={t('common.save')}
          color={C.orange}
          onPress={() => onSave('tracking_code', trk.trim(), true)}
        />
      </View>

      {/* notlar (müşteriye giden) */}
      <Text style={styles.blockLabel}>{t('adminPurchases.customerNoteTitle')}</Text>
      <TextInput
        style={styles.input}
        placeholder={t('adminPurchases.customerNotePlaceholder')}
        value={note}
        onChangeText={setNote}
      />
      <View style={{ height: 8 }} />
      <Btn label={t('adminPurchases.actions.sendToCustomer')} color="#0F766E" onPress={() => onSave('notes', note, true)} />

      {/* admin not */}
      <Text style={[styles.blockLabel, { marginTop: 16 }]}>{t('adminPurchases.adminNoteTitle')}</Text>
      <TextInput
        style={styles.input}
        placeholder={t('adminPurchases.adminNotePlaceholder')}
        value={admin}
        onChangeText={setAdmin}
      />
      <View style={{ height: 8 }} />
      <Btn label={t('common.save')} color="#374151" onPress={() => onSave('admin_notes', admin)} />

      {/* hızlı aksiyonlar */}
      <View style={{ height: 12 }} />
      {/* 1) “İletişime geçildi → Tamamla” (senin isteğin) */}
      {(row.status === 'new' || row.status === 'contacted') && (
        <TouchableOpacity
          onPress={onContactAndComplete}
          style={[styles.primary, { backgroundColor: STATUS_COL.delivered, marginBottom: 8 }]}
        >
          <Text style={styles.primaryText}>{t('adminPurchases.actions.contactAndComplete')}</Text>
        </TouchableOpacity>
      )}

      {/* 2) Normal akış ilerlet */}
      {!!next && (
        <TouchableOpacity
          onPress={onAdvance}
          style={[styles.primary, { backgroundColor: STATUS_COL[next] }]}
        >
          <Text style={styles.primaryText}>{nextLabel[next]}</Text>
        </TouchableOpacity>
      )}

      {/* sorun durumları */}
      <View style={[styles.rowWrap, { marginTop: 10 }]}>
        <Pressable
          onPress={() => onSet('cancelled')}
          style={[
            styles.statusChip,
            { borderColor: STATUS_COL.cancelled, backgroundColor: STATUS_COL.cancelled + '1A' },
          ]}
        >
          <Text style={{ color: STATUS_COL.cancelled, fontWeight: '900' }}>{statusLabel('cancelled')}</Text>
        </Pressable>
        <Pressable
          onPress={() => onSet('refunded')}
          style={[
            styles.statusChip,
            { borderColor: STATUS_COL.refunded, backgroundColor: STATUS_COL.refunded + '1A' },
          ]}
        >
          <Text style={{ color: STATUS_COL.refunded, fontWeight: '900' }}>{statusLabel('refunded')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* small button */
function Btn({
  label,
  onPress,
  color = '#111827',
}: {
  label: string;
  onPress: () => void;
  color?: string;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.btn, { backgroundColor: color }]}>
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ================== Styles (8/12/16/24 ritmi) ================== */
const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  page: { flex: 1, backgroundColor: C.bg, padding: 16 },

  sectionHead: { fontWeight: '900', color: C.ink, marginTop: 4, marginBottom: 6 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },

  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  chipText: { fontWeight: '900', color: C.text },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  blockLabel: { fontWeight: '900', color: C.ink, marginTop: 12, marginBottom: 6 },

  card: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    backgroundColor: C.card,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  headRow: { flexDirection: 'row', gap: 12 },
  thumb: {
    width: 74,
    height: 74,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#EEE',
  },
  title: { fontSize: 18, fontWeight: '900', color: C.ink },
  sub: { color: C.muted, marginTop: 2 },
  time: { color: C.muted2, marginTop: 2 },

  contact: {
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#EEF2F7',
  },
  blockTitle: { fontWeight: '900', marginBottom: 8, color: C.ink },
  muted: { color: C.muted },

  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 },
  btnText: { color: '#fff', fontWeight: '900' },

  statusChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, backgroundColor: '#fff' },
  primary: { paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '900' },

  badge: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 6,
  },
  badgeText: { fontWeight: '900', fontSize: 12, color: '#374151' },
});
