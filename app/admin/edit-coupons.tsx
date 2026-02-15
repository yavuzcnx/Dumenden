// app/admin/edit-coupons.tsx
'use client';

import CountryPickerModal from '@/components/CountryPickerModal';
import { COUNTRIES, CountryCode } from '@/lib/countries';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabaseClient';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

/* ---------------- helpers ---------------- */
const toNum  = (v: string) => { const n = parseFloat((v || '').replace(',', '.')); return isNaN(n) ? undefined : n; };
const toOdds = (v?: number) => { if (v == null) return ''; if (v > 0 && v < 1) return (1 / Math.max(0.01, v)).toFixed(2); return String(v); };

// tek nokta / 2 ondalık (1 → "1", 12 → "12", 1.234 → "1.23", "1.." → "1.")
const fmtOddsInput = (raw: string) => {
  let s = (raw || '').replace(',', '.').replace(/[^0-9.]/g, '');
  const parts = s.split('.');
  if (parts.length > 2) s = parts[0] + '.' + parts.slice(1).join('');
  const [i, d] = s.split('.');
  if (d?.length > 2) s = `${i}.${d.slice(0, 2)}`;
  return s;
};

// payout rpc (geriye uyumlu)
async function callPayoutRPC(couponId: string | number) {
  let { data, error } = await supabase.rpc('payout_coupon', { p_coupon_id: couponId });
  if (error && /does not exist/i.test(error.message)) {
    const r2 = await supabase.rpc('payout_coupon_v2', { p_coupon_id: couponId });
    data = r2.data; error = r2.error;
  }
  if (error) throw error;
  return data as any;
}

// paid_out_at bekleme (maks 12 sn)
async function waitForPaidOut(id: string|number, tries=24, delay=500) {
  for (let i=0;i<tries;i++){
    const { data, error } = await supabase.from('coupons').select('paid_out_at').eq('id', id).single();
    if (!error && data?.paid_out_at) return true;
    await new Promise(r=>setTimeout(r, delay));
  }
  return false;
}

// sadece kuponu sil (geçmiş tekiller kalsın)
async function deleteCouponOnly(id: string | number) {
  const { error } = await supabase.from('coupons').delete().eq('id', id);
  if (error) throw error;
}

/* ---------------- types (sade) ---------------- */
type Market = {
  id: string | number;
  title: string;
  description?: string | null;
  category?: string | null;
  country_code?: string | null;
  closing_date?: string | null;
  image_url?: string | null;
  proof_url?: string | null;
  is_open?: boolean | null;
  yes_price?: number | null;
  no_price?: number | null;
  liquidity?: number | null;
  result?: 'YES' | 'NO' | null;
  paid_out_at?: string | null;
};

export default function EditCoupons() {
  const { t, numberLocale } = useI18n();
  const [items, setItems] = useState<Market[]>([]);
  const [editing, setEditing] = useState<string | number | null>(null);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Gündem');
  const [description, setDescription] = useState('');
  const [closingDate, setClosingDate] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [liquidity, setLiquidity] = useState('0');
  const [isOpen, setIsOpen] = useState(true);
  const [yesOdds, setYesOdds] = useState('1.50');
  const [noOdds, setNoOdds] = useState('1.50');
  const [countryCode, setCountryCode] = useState<CountryCode>('TR');
  const [countryModal, setCountryModal] = useState(false);
  const selectedCountry = COUNTRIES.find((c) => c.code === countryCode) ?? COUNTRIES[0];

  const [winner, setWinner] = useState<'YES' | 'NO' | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchAll = async () => {
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return Alert.alert(t('common.error'), error.message);
    setItems((data ?? []) as unknown as Market[]);
  };
  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    const ch = supabase
      .channel('coupons-live-bin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coupons' }, (payload: any) => {
        setItems(prev => {
          const arr = [...prev];
          const row = payload.new ?? payload.old;
          if (payload.eventType === 'INSERT')  return arr.find(x => (x as any).id === row.id) ? arr : [row as Market, ...arr];
          if (payload.eventType === 'UPDATE')  return arr.map(x => ((x as any).id === row.id ? (row as Market) : x));
          if (payload.eventType === 'DELETE')  return arr.filter(x => (x as any).id !== row.id);
          return arr;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const startEdit = (it: any) => {
    setEditing(it.id);
    setTitle(it.title ?? '');
    setCategory(it.category ?? 'Gündem');
    setDescription(it.description ?? '');
    setClosingDate(it.closing_date ? new Date(it.closing_date) : null);
    setImageUrl(it.image_url ?? '');
    setProofUrl(it.proof_url ?? '');
    setCountryCode((it.country_code as CountryCode) ?? 'TR');
    setLiquidity(String(it.liquidity ?? 0));
    setIsOpen(!!it.is_open);
    setYesOdds(toOdds(it.yes_price));
    setNoOdds(toOdds(it.no_price));
    setWinner(null);
  };

  const save = async () => {
    if (!editing) return;

    const y = toNum(yesOdds); const n = toNum(noOdds);
    if (!y || !n || y <= 1.01 || n <= 1.01) {
      return Alert.alert(t('common.error'), t('adminAdd.oddsError'));
    }

    const payload: any = {
      title, category, description,
      country_code: countryCode,
      image_url: imageUrl, proof_url: proofUrl,
      liquidity: Number.isFinite(Number(liquidity)) ? Number(liquidity) : 0,
      is_open: isOpen,
      yes_price: y, no_price: n,
      // binary olduğu için lines yok
      lines: null,
      market_type: 'binary',
    };
    if (closingDate) payload.closing_date = closingDate.toISOString();

    const { error } = await supabase.from('coupons').update(payload).eq('id', editing);
    if (error) Alert.alert(t('common.error'), error.message);
    else setEditing(null);
  };

  const remove = async (id: string | number) => {
    try {
      setBusy(true);
      await deleteCouponOnly(id);
      setItems(prev => prev.filter((x: any) => String(x.id) !== String(id)));
      if (String(editing) === String(id)) setEditing(null);
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? t('adminEdit.deleteFailed'));
    } finally {
      setBusy(false);
    }
  };

  const current    = useMemo(() => items.find(x => String((x as any).id) === String(editing)) as any, [items, editing]);
  const canResolve = useMemo(() => !!current && !current?.result, [current]);
  const canPayout  = useMemo(() => !!current && !!current?.result && !current?.paid_out_at, [current]);

  /** ====== BINARY: Sonuçla → Payout → Sil ====== */
 const resolveNow = async () => {
  if (!current) return;
  if (!winner) return Alert.alert(t('adminEdit.missingTitle'), t('adminEdit.selectWinner'));

  try {
    setBusy(true);

    // 1) sonucu yaz + payout tetikle
    const { error } = await supabase.rpc('resolve_and_payout', {
      p_coupon_id: current.id,
      p_result: winner,
      p_proof_url: null
    });
    if (error) throw error;

    // 2) garanti payout (bazı backendlerde resolve otomatik tetiklemeyebiliyor)
    try { await callPayoutRPC(current.id); } catch {}

    // 3) paid_out_at bekle
    const paid = await waitForPaidOut(current.id, 24, 500);
    if (!paid) {
      return Alert.alert(t('common.warning'), t('adminEdit.payoutWaitWarn'));
    }

    // 4) ❌ silme yerine arşivle / kapat
    const { error: archiveErr } = await supabase
      .from('coupons')
      .update({ is_open: false, archived: true })
      .eq('id', current.id);
    if (archiveErr) throw archiveErr;

    Alert.alert(t('common.ok'), t('adminEdit.payoutDone'));
    setEditing(null);
    setItems(prev => prev.map(it => String(it.id) === String(current.id)
      ? { ...it, is_open: false, archived: true, result: winner, paid_out_at: new Date().toISOString() }
      : it
    ));
  } catch (e:any) {
    Alert.alert(t('common.error'), e?.message || t('adminEdit.resolveFail'));
  } finally {
    setBusy(false);
  }
};

/** Yalnız payout + arşivle (sonuç önceden verilmişse) */
const payoutNow = async () => {
  if (!current) return;
  try {
    setBusy(true);
    await callPayoutRPC(current.id);
    const paid = await waitForPaidOut(current.id, 24, 500);
    if (!paid) return Alert.alert(t('common.warning'), t('adminEdit.payoutWaitWarnShort'));

    // ❌ Silme yok, arşivle
    const { error: archiveErr } = await supabase
      .from('coupons')
      .update({ is_open: false, archived: true })
      .eq('id', current.id);
    if (archiveErr) throw archiveErr;

    Alert.alert(t('common.ok'), t('adminEdit.payoutDoneArchive'));
    setEditing(null);
    setItems(prev => prev.map(it => String(it.id) === String(current.id)
      ? { ...it, is_open: false, archived: true, paid_out_at: new Date().toISOString() }
      : it
    ));
  } catch (e:any) {
    Alert.alert(t('common.error'), e?.message ?? t('adminEdit.payoutFailed'));
  } finally {
    setBusy(false);
  }
};

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      {editing === item.id ? (
        <>
          <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholder={t('adminEdit.titlePlaceholder')} />
          <TextInput value={category} onChangeText={setCategory} style={styles.input} placeholder={t('adminEdit.categoryPlaceholder')} />
          <TouchableOpacity onPress={() => setCountryModal(true)} style={styles.input}>
            <Text style={{ fontWeight: '700', color: '#333' }}>
              {t('adminAdd.countryLabel')}: <Text style={{ fontWeight: '900', color: '#FF6B00' }}>{t(selectedCountry.nameKey)} ({countryCode})</Text>
            </Text>
          </TouchableOpacity>
          <TextInput value={description} onChangeText={setDescription} style={[styles.input, { height: 80 }]} multiline placeholder={t('adminEdit.descriptionPlaceholder')} />

          <TouchableOpacity onPress={() => setShowPicker(true)} style={styles.input}>
            <Text>{t('adminAdd.closingLabel')}: {closingDate ? closingDate.toLocaleString() : t('common.dash')}</Text>
          </TouchableOpacity>
          {showPicker && (
            <DateTimePicker
              value={closingDate ?? new Date()}
              mode="datetime"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(_e: DateTimePickerEvent, d?: Date) => { setShowPicker(false); if (d) setClosingDate(d); }}
            />
          )}

          <TextInput value={imageUrl} onChangeText={setImageUrl} style={styles.input} placeholder={t('adminEdit.imageUrlPlaceholder')} />
          <TextInput value={proofUrl} onChangeText={setProofUrl} style={styles.input} placeholder={t('adminEdit.proofUrlPlaceholder')} />

          <View style={styles.row}>
            <TextInput value={liquidity} onChangeText={setLiquidity} keyboardType="numeric" style={[styles.input, { flex: 1 }]} placeholder={t('adminAdd.liquidityPlaceholder')} />
            <TouchableOpacity onPress={() => setIsOpen(!isOpen)} style={[styles.toggle, isOpen ? styles.on : styles.off]}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>{isOpen ? t('common.open') : t('common.closed')}</Text>
            </TouchableOpacity>
          </View>

          {/* BINARY oranları */}
          <View style={styles.row}>
            <TextInput
              value={yesOdds}
              onChangeText={(v) => setYesOdds(fmtOddsInput(v))}
              style={[styles.input, { flex: 1 }]}
              placeholder={t('adminEdit.yesOddsPlaceholder')}
            />
            <TextInput
              value={noOdds}
              onChangeText={(v) => setNoOdds(fmtOddsInput(v))}
              style={[styles.input, { flex: 1 }]}
              placeholder={t('adminEdit.noOddsPlaceholder')}
            />
          </View>

          <View style={{ height: 1, backgroundColor: '#eee', marginVertical: 8 }} />
          <Text style={{ fontWeight: '900', marginBottom: 4 }}>{t('adminEdit.resultPayoutTitle')}</Text>
          <Text style={{ color: '#666', marginBottom: 6 }}>
            {t('adminAdd.closingLabel')}: {item.closing_date?.split('T')?.[0] ?? t('common.dash')} • {t('adminEdit.statusLabel')}:{' '}
            {item.result ? t('adminEdit.resultLabel', { result: item.result }) : t('adminEdit.notResolved')}
            {item.paid_out_at ? ` • ${t('adminEdit.paidOut')}` : ''}
          </Text>

          {!item.result && (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['YES', 'NO'] as const).map(opt => (
                  <TouchableOpacity key={opt} onPress={() => setWinner(opt)}
                    style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1,
                      borderColor: winner === opt ? '#FF6B00' : '#ddd', backgroundColor: winner === opt ? '#FFEEE2' : '#fff' }}>
                    <Text style={{ fontWeight: '800', color: winner === opt ? '#FF6B00' : '#333' }}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity disabled={busy || !winner} onPress={resolveNow}
                style={{ backgroundColor: (!winner || busy) ? '#f3a774' : '#FF6B00', padding: 12, borderRadius: 10, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '900' }}>
                  {busy ? t('common.processing') : t('adminEdit.resolveAndPayout')}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {!!item.result && !item.paid_out_at && (
            <TouchableOpacity disabled={busy} onPress={payoutNow}
              style={{ marginTop: 8, backgroundColor: busy ? '#9ccc65' : '#22c55e', padding: 12, borderRadius: 10, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '900' }}>
                {busy ? t('common.processing') : t('adminEdit.payoutOnly')}
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.row}>
            <TouchableOpacity onPress={save} style={[styles.btn, { backgroundColor: '#388E3C' }]}>
              <Text style={styles.btnText}>{t('common.save')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditing(null)} style={[styles.btn, { backgroundColor: '#757575' }]}>
              <Text style={styles.btnText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.meta}>
            {t('adminAdd.categoryLabel')}: {item.category} • {t('adminAdd.countryLabel')}: {item.country_code ?? 'TR'} • {t('adminAdd.liquidityLabel')}:{' '}
            {(item.liquidity ?? 0).toLocaleString(numberLocale)} XP • {item.is_open ? t('common.open') : t('common.closed')}
            {' '}• {item.result ? t('adminEdit.resultLabel', { result: item.result }) : t('adminEdit.notResolved')} {item.paid_out_at ? `• ${t('adminEdit.paidOut')}` : ''}
          </Text>
          <View style={styles.row}>
            <TouchableOpacity onPress={() => startEdit(item)} style={[styles.btn, { backgroundColor: '#1976D2' }]}>
              <Text style={styles.btnText}>{t('common.edit')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => remove(item.id)} style={[styles.btn, { backgroundColor: '#E53935' }]}>
              <Text style={styles.btnText}>{t('common.delete')}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', padding: 16 }}>
      <TouchableOpacity style={{ position: 'absolute', top: 50, left: 20 }} onPress={() => fetchAll()}>
        <Ionicons name="refresh" size={24} color="#FF6B00" />
      </TouchableOpacity>
      <Text style={styles.header}>{t('adminEdit.header')}</Text>

      <FlatList
        data={items}
        keyExtractor={(i:any) => String(i.id)}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 40 }}
      />

      <CountryPickerModal
        visible={countryModal}
        value={countryCode}
        onClose={() => setCountryModal(false)}
        onSelect={(code) => {
          setCountryModal(false);
          setCountryCode(code);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 22, fontWeight: 'bold', color: '#FF6B00', textAlign: 'center', marginBottom: 16 },
  card: { backgroundColor: '#fafafa', borderRadius: 12, padding: 14, marginBottom: 12 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  meta: { fontSize: 12, color: '#666', marginTop: 8 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 10, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 6 },
  toggle: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10 },
  on: { backgroundColor: '#43A047' },
  off: { backgroundColor: '#9E9E9E' },
  btn: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: 'bold' },
});
