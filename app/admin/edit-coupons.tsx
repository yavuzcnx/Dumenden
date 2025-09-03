'use client';

import type { Line, Market } from '@/components/MarketCard';
import { supabase } from '@/lib/supabaseClient';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const toNum = (v: string) => {
  const n = parseFloat((v || '').replace(',', '.'));
  return isNaN(n) ? undefined : n;
};
const toOdds = (v?: number) => {
  if (v == null) return '';
  if (v > 0 && v < 1) return (1 / Math.max(0.01, v)).toFixed(2);
  return String(v);
};

export default function EditCoupons() {
  const router = useRouter();

  const [items, setItems] = useState<Market[]>([]);
  const [editing, setEditing] = useState<string | number | null>(null);

  // form
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Gündem');
  const [description, setDescription] = useState('');
  const [closingDate, setClosingDate] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [liquidity, setLiquidity] = useState('0');
  const [isOpen, setIsOpen] = useState(true);
  const [marketType, setMarketType] = useState<'binary' | 'multi'>('binary');

  const [yesOdds, setYesOdds] = useState('1.50');
  const [noOdds, setNoOdds] = useState('1.50');

  const [lines, setLines] = useState<{ name: string; yesOdds: string; noOdds: string }[]>([]);

  const fetchAll = async () => {
    const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
    if (!error) setItems((data ?? []) as unknown as Market[]);
  };
  useEffect(() => { fetchAll(); }, []);

  // 🔴 canlı dinleyici
  useEffect(() => {
    const ch = supabase.channel('coupons-live')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'coupons' },
        (payload: any) => {
          setItems(prev => {
            const arr = [...prev];
            const row = payload.new ?? payload.old;

            if (payload.eventType === 'INSERT') {
              // en üste ekle
              if (!arr.find(x => x.id === row.id)) return [row as Market, ...arr];
              return arr;
            }
            if (payload.eventType === 'UPDATE') {
              return arr.map(x => (x.id === row.id ? (row as Market) : x));
            }
            if (payload.eventType === 'DELETE') {
              return arr.filter(x => x.id !== row.id);
            }
            return arr;
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, []);

  const startEdit = (it: Market) => {
    setEditing(it.id);
    setTitle(it.title ?? '');
    setCategory(it.category ?? 'Gündem');
    setDescription((it as any).description ?? '');
    setClosingDate(it.closing_date ? new Date(it.closing_date) : null);
    setImageUrl(it.image_url ?? '');
    setProofUrl((it as any).proof_url ?? '');
    setLiquidity(String(it.liquidity ?? 0));
    setIsOpen(!!it.is_open);
    setMarketType((it.market_type as any) ?? 'binary');

    setYesOdds(toOdds(it.yes_price));
    setNoOdds(toOdds(it.no_price));
    const ls = (it.lines ?? []).map((l: Line) => ({
      name: l.name, yesOdds: toOdds(l.yesPrice), noOdds: toOdds(l.noPrice),
    }));
    setLines(ls);
  };

  const addLine = () => setLines([...lines, { name: '', yesOdds: '', noOdds: '' }]);
  const delLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));
  const setLine = (i: number, key: 'name' | 'yesOdds' | 'noOdds', v: string) => {
    const c = [...lines]; (c[i] as any)[key] = v; setLines(c);
  };

  const save = async () => {
    if (!editing) return;

    const payload: any = {
      title, category, description,
      image_url: imageUrl, proof_url: proofUrl,
      liquidity: Number(liquidity || '0'),
      is_open: isOpen,
      market_type: marketType,
    };
    if (closingDate) payload.closing_date = closingDate.toISOString();

    if (marketType === 'binary') {
      const y = toNum(yesOdds); const n = toNum(noOdds);
      if (!y || !n || y <= 1 || n <= 1) return Alert.alert('Hata', 'YES/NO oranları 1.01 ve üzeri olmalı.');
      payload.yes_price = y; payload.no_price = n;
    } else {
      const prepared = lines
        .filter(l => l.name && toNum(l.yesOdds) && toNum(l.noOdds))
        .map(l => ({ name: l.name.trim(), yesPrice: toNum(l.yesOdds)!, noPrice: toNum(l.noOdds)! }));
      if (prepared.length === 0) return Alert.alert('Hata', 'En az bir satır ekleyin.');
      payload.lines = prepared;
    }

    const { error } = await supabase.from('coupons').update(payload).eq('id', editing);
    if (error) Alert.alert('Hata', error.message);
    else setEditing(null);
  };

  const remove = async (id: string | number) => {
    const { error } = await supabase.from('coupons').delete().eq('id', id);
    if (error) Alert.alert('Hata', error.message);
  };

  const renderItem = ({ item }: { item: Market }) => (
    <View style={styles.card}>
      {editing === item.id ? (
        <>
          <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholder="Başlık" />
          <TextInput value={category} onChangeText={setCategory} style={styles.input} placeholder="Kategori" />
          <TextInput value={description} onChangeText={setDescription} style={[styles.input, { height: 80 }]} multiline placeholder="Açıklama" />

          <TouchableOpacity onPress={() => setShowPicker(true)} style={styles.input}>
            <Text>Kapanış: {closingDate ? closingDate.toLocaleString() : '—'}</Text>
          </TouchableOpacity>
          {showPicker && (
            <DateTimePicker
              value={closingDate ?? new Date()}
              mode="datetime"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(e: DateTimePickerEvent, d?: Date) => { setShowPicker(false); if (d) setClosingDate(d); }}
            />
          )}

          <TextInput value={imageUrl} onChangeText={setImageUrl} style={styles.input} placeholder="Görsel URL" />
          <TextInput value={proofUrl} onChangeText={setProofUrl} style={styles.input} placeholder="Kanıt URL" />

          <View style={styles.row}>
            <TextInput value={liquidity} onChangeText={setLiquidity} keyboardType="numeric" style={[styles.input, { flex: 1 }]} placeholder="Likidite" />
            <TouchableOpacity onPress={() => setIsOpen(!isOpen)} style={[styles.toggle, isOpen ? styles.on : styles.off]}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>{isOpen ? 'Açık' : 'Kapalı'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.row}>
            {(['binary', 'multi'] as const).map(t => (
              <TouchableOpacity key={t} onPress={() => setMarketType(t)} style={[styles.switchBtn, marketType === t && styles.switchBtnActive]}>
                <Text style={[styles.switchText, marketType === t && styles.switchTextActive]}>{t === 'binary' ? 'Binary' : 'Multi'}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {marketType === 'binary' ? (
            <View style={styles.row}>
              <TextInput value={yesOdds} onChangeText={setYesOdds} keyboardType="default" style={[styles.input, { flex: 1 }]} placeholder="YES (odds)" />
              <TextInput value={noOdds}  onChangeText={setNoOdds}  keyboardType="default" style={[styles.input, { flex: 1 }]} placeholder="NO (odds)" />
            </View>
          ) : (
            <>
              {lines.map((l, i) => (
                <View key={i} style={styles.lineRow}>
                  <TextInput value={l.name} onChangeText={v => setLine(i, 'name', v)} style={[styles.input, { flex: 1 }]} placeholder="Aday" />
                  <TextInput value={l.yesOdds} onChangeText={v => setLine(i, 'yesOdds', v)} keyboardType="default" style={[styles.input, { width: 110 }]} placeholder="YES" />
                  <TextInput value={l.noOdds}  onChangeText={v => setLine(i,  'noOdds', v)} keyboardType="default" style={[styles.input, { width: 110 }]} placeholder="NO" />
                  <TouchableOpacity onPress={() => delLine(i)} style={styles.trash}><Ionicons name="trash" size={18} color="#fff" /></TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity onPress={addLine} style={styles.addLine}><Ionicons name="add" size={18} color="#fff" /><Text style={{ color: '#fff', fontWeight: 'bold' }}>Satır Ekle</Text></TouchableOpacity>
            </>
          )}

          <View style={styles.row}>
            <TouchableOpacity onPress={save} style={[styles.btn, { backgroundColor: '#388E3C' }]}><Text style={styles.btnText}>Kaydet</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setEditing(null)} style={[styles.btn, { backgroundColor: '#757575' }]}><Text style={styles.btnText}>Vazgeç</Text></TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.meta}>Kategori: {item.category} • Likidite: {(item.liquidity ?? 0).toLocaleString('tr-TR')} XP • {item.is_open ? 'Açık' : 'Kapalı'}</Text>
          <View style={styles.row}>
            <TouchableOpacity onPress={() => startEdit(item)} style={[styles.btn, { backgroundColor: '#1976D2' }]}><Text style={styles.btnText}>Düzenle</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => remove(item.id)} style={[styles.btn, { backgroundColor: '#E53935' }]}><Text style={styles.btnText}>Sil</Text></TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', padding: 20 }}>
      <TouchableOpacity style={{ position: 'absolute', top: 50, left: 20 }} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#FF6B00" />
      </TouchableOpacity>
      <Text style={styles.header}>Marketleri Düzenle</Text>
      <FlatList data={items} renderItem={renderItem} keyExtractor={(it) => String(it.id)} contentContainerStyle={{ paddingBottom: 40 }} />
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
  toggle: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10 }, on: { backgroundColor: '#43A047' }, off: { backgroundColor: '#9E9E9E' },
  btn: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 10 }, btnText: { color: '#fff', fontWeight: 'bold' },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  trash: { backgroundColor: '#E53935', padding: 10, borderRadius: 10 },
  addLine: { backgroundColor: '#1976D2', padding: 12, borderRadius: 10, alignItems: 'center', flexDirection: 'row', gap: 6, alignSelf: 'flex-start' },
  switchBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#eee' },
  switchBtnActive: { backgroundColor: '#FF6B00' },
  switchText: { color: '#333', fontWeight: '700' },
  switchTextActive: { color: '#fff' },
});
