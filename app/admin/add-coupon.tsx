'use client';

import CountryPickerModal from '@/components/CountryPickerModal';
import { COUNTRIES, CountryCode } from '@/lib/countries';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabaseClient';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type MarketType = 'binary' | 'multi';
type Line = { name: string; yesOdds: string; noOdds: string; image?: string | null };

const MEDIA_BUCKET = 'Media';
const ORANGE = '#FF6B00';

/* ---------- helpers ---------- */
const toNum = (v: string) => {
  if (!v) return undefined;
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

// odds formatter: tek nokta, silinebilsin, '123' -> '1.23'
const fmtOddsInput = (raw: string) => {
  if (raw === '') return '';
  let s = raw.replace(',', '.').replace(/[^0-9.]/g, '');
  const firstDot = s.indexOf('.');

  if (firstDot >= 0) {
    // nokta var → yalnızca ilk nokta kalsın, 2 ondalık
    const head = s.slice(0, firstDot + 1);
    const tail = s.slice(firstDot + 1).replace(/\./g, '').slice(0, 2);
    return head + tail;
  }

  // nokta yok → 1 hane ise bırak; 2+ hane ise ilk haneden sonra nokta
  if (s.length === 1) return s;
  return `${s[0]}.${s.slice(1, 3)}`;
};

const guessExt = (uri: string) => {
  const raw = uri.split(/[?#]/)[0];
  const e = raw.includes('.') ? raw.slice(raw.lastIndexOf('.') + 1).toLowerCase() : 'jpg';
  return e === 'jpeg' ? 'jpg' : e;
};
const contentType = (ext: string) =>
  ext === 'jpg' ? 'image/jpeg' : ext === 'heic' ? 'image/heic' : `image/${ext}`;

async function uploadLocalImageToSupabase(
  localUri: string,
  path?: string,
  readErrorMessage?: string
) {
  const ext = guessExt(localUri);
  const key =
    path ?? `coupons/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext || 'jpg'}`;

  const res = await fetch(localUri);
  if (!res.ok) throw new Error(readErrorMessage || 'Image read failed');
  const buf = await res.arrayBuffer();

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(key, buf, { upsert: false, contentType: contentType(ext) });
  if (error) throw error;

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(key);
  return data.publicUrl ?? key;
}

/* ---------- component ---------- */
export default function AddCouponPage() {
  const router = useRouter();
  const { t } = useI18n();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Gündem');
  const [allCats, setAllCats] = useState<string[]>([
    'Gündem',
    'Spor',
    'Magazin',
    'Politika',
    'Absürt',
  ]);
  const [catModal, setCatModal] = useState(false);
  const [newCat, setNewCat] = useState('');

  const [description, setDescription] = useState('');
  const [closingDate, setClosingDate] = useState(new Date());

  // Android: date -> time adım adım
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  const [imageUrl, setImageUrl] = useState('');
  const [proofUrl, setProofUrl] = useState('');

  const [countryCode, setCountryCode] = useState<CountryCode>('TR');
  const [countryModal, setCountryModal] = useState(false);
  const selectedCountry = COUNTRIES.find((c) => c.code === countryCode) ?? COUNTRIES[0];

  const [liquidity, setLiquidity] = useState('0');
  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(false);

  const [marketType, setMarketType] = useState<MarketType>('binary');
  const [yesOdds, setYesOdds] = useState('1.50');
  const [noOdds, setNoOdds] = useState('1.50');
  const [lines, setLines] = useState<Line[]>([{ name: '', yesOdds: '', noOdds: '', image: null }]);

  // kategorileri çek (TS hatasız — JS'te tekilleştir)
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('coupons')
          .select('category')
          .neq('category', null);
        if (!error) {
          const fromDb = (data ?? [])
            .map((r: any) => String(r.category))
            .filter(Boolean);
          const set = new Set([...allCats, ...fromDb]);
          setAllCats(Array.from(set));
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const askGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert(t('adminAdd.permissionTitle'), t('adminAdd.permissionBody'));
      return false;
    }
    return true;
  };

  const pickImg = async (setter: (v: string) => void) => {
    if (!(await askGallery())) return;
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.9,
    });
    if (!r.canceled && r.assets?.length && r.assets[0].uri) setter(r.assets[0].uri);
  };

  const addLine = () =>
    setLines((x) => [...x, { name: '', yesOdds: '', noOdds: '', image: null }]);
  const removeLine = (i: number) => setLines((x) => x.filter((_, idx) => idx !== i));
  const setLine = (i: number, key: keyof Line, val: string) =>
    setLines((x) => {
      const c = [...x];
      (c[i] as any)[key] = val;
      return c;
    });

  const pickLineImage = async (i: number) => {
    if (!(await askGallery())) return;
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.9,
    });
    if (!r.canceled && r.assets?.length && r.assets[0].uri) {
      setLine(i, 'image', r.assets[0].uri);
    }
  };

  const addCategory = () => {
    const c = newCat.trim();
    if (!c) return;
    if (!allCats.includes(c)) setAllCats((a) => [...a, c]);
    setCategory(c);
    setNewCat('');
    setCatModal(false);
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        setLoading(false);
        Alert.alert(t('adminAdd.loginRequiredTitle'), t('adminAdd.loginRequiredBody'));
        return;
      }
      if (!countryCode) {
        setLoading(false);
        Alert.alert(t('common.error'), t('adminAdd.countryRequired'));
        return;
      }

      // local görselleri yükle
      let finalImageUrl = imageUrl;
      let finalProofUrl = proofUrl;
      if (finalImageUrl?.startsWith('file:')) {
        finalImageUrl = await uploadLocalImageToSupabase(
          finalImageUrl,
          undefined,
          t('adminAdd.imageReadFail')
        );
      }
      if (finalProofUrl?.startsWith('file:')) {
        finalProofUrl = await uploadLocalImageToSupabase(
          finalProofUrl,
          undefined,
          t('adminAdd.imageReadFail')
        );
      }

      const payload: any = {
        title: title.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
        country_code: countryCode,
        closing_date: closingDate.toISOString(),
        image_url: finalImageUrl || null,
        proof_url: finalProofUrl || null,
        liquidity: Number(liquidity || 0),
        is_open: isOpen,
        market_type: marketType,
        author_id: session.user.id,
        is_user_generated: false,
      };

      if (marketType === 'binary') {
        const y = toNum(yesOdds);
        const n = toNum(noOdds);
        if (!y || !n || y <= 1.01 || n <= 1.01) {
          setLoading(false);
          Alert.alert(t('common.error'), t('adminAdd.oddsError'));
          return;
        }
        payload.yes_price = y;
        payload.no_price = n;
      } else {
        // adaylar
        const prepared: Array<{
          name: string;
          yesPrice: number;
          noPrice: number;
          image_url: string | null;
        }> = [];

        for (const l of lines) {
          const ny = toNum(l.yesOdds);
          const nn = toNum(l.noOdds);
          if (!l.name || !ny || !nn) continue;

          let img = l.image || null;
          if (img?.startsWith('file:')) {
            img = await uploadLocalImageToSupabase(img, undefined, t('adminAdd.imageReadFail'));
          }

          prepared.push({
            name: l.name.trim(),
            yesPrice: ny,
            noPrice: nn,
            image_url: img,
          });
        }

        if (prepared.length === 0) {
          setLoading(false);
          Alert.alert(t('common.error'), t('adminAdd.candidateError'));
          return;
        }
        payload.lines = prepared;
      }

      const { error } = await supabase.from('coupons').insert([payload]);
      setLoading(false);

      if (error) {
        Alert.alert(t('common.error'), error.message);
      } else {
        Alert.alert(t('adminAdd.createSuccessTitle'), t('adminAdd.createSuccessBody'));
        router.replace('/admin/landing');
      }
    } catch (e: any) {
      setLoading(false);
      Alert.alert(t('common.error'), e?.message || t('adminAdd.submitFail'));
    }
  };

  // Android tarih/saat seçicisi
  const openAndroidPickers = () => setShowDate(true);
  const onDateChange = (_e: DateTimePickerEvent, d?: Date) => {
    setShowDate(false);
    if (!d) return;
    const base = new Date(d);
    base.setHours(closingDate.getHours(), closingDate.getMinutes(), 0, 0);
    setClosingDate(base);
    setShowTime(true);
  };
  const onTimeChange = (_e: DateTimePickerEvent, d?: Date) => {
    setShowTime(false);
    if (!d) return;
    const nd = new Date(closingDate);
    nd.setHours(d.getHours(), d.getMinutes(), 0, 0);
    setClosingDate(nd);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={ORANGE} />
        </TouchableOpacity>

        <Text style={styles.title}>{t('adminAdd.title')}</Text>

        {/* Tip seçimi */}
        <View style={styles.switchRow}>
          {(['binary', 'multi'] as MarketType[]).map((mode) => (
            <TouchableOpacity
              key={mode}
              onPress={() => setMarketType(mode)}
              style={[styles.switchBtn, marketType === mode && styles.switchBtnActive]}
            >
              <Text style={[styles.switchText, marketType === mode && styles.switchTextActive]}>
                {mode === 'binary' ? t('adminAdd.marketTypeBinary') : t('adminAdd.marketTypeMulti')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Başlık */}
        <TextInput placeholder={t('adminAdd.titlePlaceholder')} value={title} onChangeText={setTitle} style={styles.input} />

        {/* Kategori */}
        <TouchableOpacity onPress={() => setCatModal(true)} style={[styles.input, { paddingVertical: 14 }]}>
          <Text style={{ color: '#333', fontWeight: '700' }}>
            {t('adminAdd.categoryLabel')}: <Text style={{ fontWeight: '900', color: ORANGE }}>{category}</Text>
          </Text>
        </TouchableOpacity>

        {/* Country */}
        <TouchableOpacity onPress={() => setCountryModal(true)} style={[styles.input, { paddingVertical: 14 }]}>
          <Text style={{ color: '#333', fontWeight: '700' }}>
            {t('adminAdd.countryLabel')}:{' '}
            <Text style={{ fontWeight: '900', color: ORANGE }}>{t(selectedCountry.nameKey)} ({countryCode})</Text>
          </Text>
        </TouchableOpacity>

        {/* Kapanış */}
        {Platform.OS === 'android' ? (
          <>
            <TouchableOpacity onPress={openAndroidPickers} style={[styles.input, { paddingVertical: 14 }]}>
              <Text>{t('adminAdd.closingLabel')}: {closingDate.toLocaleString()}</Text>
            </TouchableOpacity>
            {showDate && (
              <DateTimePicker value={closingDate} mode="date" display="calendar" onChange={onDateChange} />
            )}
            {showTime && (
              <DateTimePicker value={closingDate} mode="time" is24Hour display="clock" onChange={onTimeChange} />
            )}
          </>
        ) : (
          <View style={{ overflow: 'hidden' }}>
            <Text style={{ marginBottom: 6, fontWeight: '700' }}>{t('adminAdd.closingLabel')}</Text>
            <DateTimePicker
              value={closingDate}
              mode="datetime"
              display="inline"
              style={{ height: 330 }}
              onChange={(_e: DateTimePickerEvent, d?: Date) => d && setClosingDate(d)}
            />
          </View>
        )}

        {/* Açıklama */}
        <TextInput
          placeholder={t('adminAdd.descriptionPlaceholder')}
          value={description}
          onChangeText={setDescription}
          multiline
          style={[styles.input, { height: 80 }]}
        />

        {/* Likidite + durum */}
        <View style={styles.row}>
          <TextInput
            placeholder={t('adminAdd.liquidityPlaceholder')}
            value={liquidity}
            onChangeText={(v) => setLiquidity(v.replace(/[^0-9]/g, ''))}
            keyboardType="numeric"
            style={[styles.input, { flex: 1 }]}
          />
          <TouchableOpacity
            onPress={() => setIsOpen((v) => !v)}
            style={[styles.toggle, isOpen ? styles.toggleOn : styles.toggleOff]}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>{isOpen ? t('common.open') : t('common.closed')}</Text>
          </TouchableOpacity>
        </View>

        {/* Ana görsel & kanıt */}
        <View style={styles.row}>
          <TouchableOpacity onPress={() => pickImg(setImageUrl)} style={styles.smallBtn}>
            <Text style={styles.btnText}>{t('adminAdd.pickImage')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => pickImg(setProofUrl)} style={styles.smallBtnAlt}>
            <Text style={styles.btnText}>{t('adminAdd.pickProof')}</Text>
          </TouchableOpacity>
        </View>
        {!!imageUrl && <Image source={{ uri: imageUrl }} style={styles.preview} />}

        {/* Odds / Adaylar */}
        {marketType === 'binary' ? (
          <>
            <Text style={styles.section}>{t('adminAdd.binaryOdds')}</Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder={t('adminAdd.yesOddsPlaceholder')}
                value={yesOdds}
                onChangeText={(v) => setYesOdds(fmtOddsInput(v))}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder={t('adminAdd.noOddsPlaceholder')}
                value={noOdds}
                onChangeText={(v) => setNoOdds(fmtOddsInput(v))}
                keyboardType="decimal-pad"
              />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.section}>{t('adminAdd.candidateRows')}</Text>
            {lines.map((l, i) => (
              <View key={i} style={styles.lineRow}>
                <Pressable onPress={() => pickLineImage(i)} style={styles.avatarPick}>
                  {l.image ? (
                    <Image source={{ uri: l.image }} style={styles.avatarImg} />
                  ) : (
                    <Ionicons name="image" size={18} color="#999" />
                  )}
                </Pressable>

                <TextInput
                  value={l.name}
                  onChangeText={(v) => setLine(i, 'name', v)}
                  placeholder={t('adminAdd.candidateName')}
                  style={[styles.input, { flex: 1 }]}
                />
                <TextInput
                  value={l.yesOdds}
                  onChangeText={(v) => setLine(i, 'yesOdds', fmtOddsInput(v))}
                  placeholder={t('adminAdd.yesOddsShort')}
                  keyboardType="decimal-pad"
                  style={[styles.input, { width: 110 }]}
                />
                <TextInput
                  value={l.noOdds}
                  onChangeText={(v) => setLine(i, 'noOdds', fmtOddsInput(v))}
                  placeholder={t('adminAdd.noOddsShort')}
                  keyboardType="decimal-pad"
                  style={[styles.input, { width: 110 }]}
                />
                <TouchableOpacity onPress={() => removeLine(i)} style={styles.trash}>
                  <Ionicons name="trash" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity onPress={addLine} style={styles.addLine}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.btnText}>{t('adminAdd.addCandidate')}</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={styles.submit} onPress={handleSubmit} disabled={loading}>
          <Text style={styles.submitText}>
            {loading ? t('adminAdd.saving') : t('adminAdd.submit')}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Kategori Modal */}
      <Modal visible={catModal} transparent animationType="fade">
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={{ fontWeight: '900', fontSize: 16, marginBottom: 10 }}>
              {t('adminAdd.categorySelect')}
            </Text>
            <ScrollView style={{ maxHeight: 260 }}>
              {allCats.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => {
                    setCategory(c);
                    setCatModal(false);
                  }}
                  style={styles.catItem}
                >
                  <Text
                    style={{
                      fontWeight: c === category ? '900' : '700',
                      color: c === category ? ORANGE : '#222',
                    }}
                  >
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ height: 1, backgroundColor: '#eee', marginVertical: 10 }} />
            <Text style={{ fontWeight: '800', marginBottom: 6 }}>{t('adminAdd.newCategory')}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                value={newCat}
                onChangeText={setNewCat}
                placeholder={t('adminAdd.categoryName')}
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
              />
              <TouchableOpacity onPress={addCategory} style={[styles.smallBtn, { paddingHorizontal: 14 }]}>
                <Text style={styles.btnText}>{t('common.add')}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setCatModal(false)} style={[styles.smallBtnAlt, { marginTop: 12 }]}>
              <Text style={styles.btnText}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <CountryPickerModal
        visible={countryModal}
        value={countryCode}
        onClose={() => setCountryModal(false)}
        onSelect={(code) => {
          setCountryModal(false);
          setCountryCode(code);
        }}
      />
    </KeyboardAvoidingView>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: '#fff', flexGrow: 1 },
  title: { fontSize: 22, fontWeight: 'bold', color: ORANGE, textAlign: 'center', marginBottom: 16 },
  input: {
    backgroundColor: '#f7f7f7',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  smallBtn: { backgroundColor: ORANGE, padding: 12, borderRadius: 10, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  smallBtnAlt: { backgroundColor: '#FF9800', padding: 12, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  preview: { width: '100%', height: 160, borderRadius: 12, marginBottom: 10 },
  section: { fontWeight: 'bold', marginTop: 10, marginBottom: 8 },
  switchRow: { flexDirection: 'row', gap: 8, marginBottom: 10, justifyContent: 'center' },
  switchBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#eee' },
  switchBtnActive: { backgroundColor: ORANGE },
  switchText: { color: '#333', fontWeight: '700' },
  switchTextActive: { color: '#fff' },
  toggle: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10 },
  toggleOn: { backgroundColor: '#43A047' },
  toggleOff: { backgroundColor: '#9E9E9E' },

  // aday satırı
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  avatarPick: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 36, height: 36, borderRadius: 18 },

  trash: { backgroundColor: '#E53935', padding: 10, borderRadius: 10 },
  addLine: { backgroundColor: '#1976D2', padding: 12, borderRadius: 10, alignItems: 'center', flexDirection: 'row', gap: 6, alignSelf: 'flex-start' },
  submit: { backgroundColor: ORANGE, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  backButton: { position: 'absolute', top: 50, left: 20, zIndex: 10 },

  // kategori modal
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 520, backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  catItem: { paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f2f2f2' },
});
