'use client';

import { supabase } from '@/lib/supabaseClient';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** ------------ theme ------------- **/
const ORANGE = '#FF6B00';
const BG = '#FFFFFF';
const CARD = '#FFFFFF';
const BORDER = '#E9E9E9';
const TEXT = '#111111';
const MUTED = '#6B7280';

type DBUser = {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  birth_date: string | null;
  created_at: string;
  is_plus: boolean | null;
  xp: number | null;
  avatar_url: string | null;
  avatar_path?: string | null;
  bio?: string | null;
};

function levelFromXp(xp: number) {
  const lvl = Math.floor(xp / 500) + 1;
  const cur = xp % 500;
  const pct = Math.min(100, Math.round((cur / 500) * 100));
  return { lvl, pct, need: 500 - cur };
}

export default function ProfilePage() {
  const router = useRouter();
  const ins = useSafeAreaInsets();

  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [dbu, setDbu] = useState<DBUser | null>(null);

  // closure bug için ref (kalsın)
  const authUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    authUserIdRef.current = authUserId;
  }, [authUserId]);

  // editable
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [birth, setBirth] = useState(''); // YYYY-MM-DD
  const [bio, setBio] = useState('');

  // Avatar URL anlık değişsin diye state
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const guessExt = (uri: string) => {
    const raw = uri.split(/[?#]/)[0];
    const e = raw.includes('.') ? raw.slice(raw.lastIndexOf('.') + 1).toLowerCase() : 'jpg';
    return e === 'jpeg' ? 'jpg' : e;
  };
  const contentType = (ext: string) =>
    ext === 'jpg' ? 'image/jpeg' : ext === 'heic' ? 'image/heic' : `image/${ext}`;

  // ui
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [notifOn, setNotifOn] = useState(true);
  // logout ayrı state (saving ile karışmasın)
const [logoutLoading, setLogoutLoading] = useState(false);


  // password change
  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  // stats
  const [playsCount, setPlaysCount] = useState<number>(0);
  const [topCategory, setTopCategory] = useState<string>('-');

  // XP — tek kaynak: xp_wallets.balance
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [loadingData, setLoadingData] = useState(true);

  // Fotoğraf yüklenirken veri çekmeyi engelle
  const isUploadingRef = useRef(false);

  /** ---------- helpers ---------- **/
  const computePublicUrl = (path?: string | null) => {
    if (!path) return null;
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return data?.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : null;
  };

  // Tek seferde veri yükleyici
  const loadAll = async (uid: string) => {
    if (isUploadingRef.current) return;
    if (!dbu) setLoadingData(true);

    try {
      // users
      const { data: row } = await supabase
        .from('users')
        .select('id, full_name, phone_number, birth_date, created_at, is_plus, xp, avatar_url, avatar_path, bio')
        .eq('id', uid)
        .maybeSingle();

      if (row) {
        setDbu(row as DBUser);
        setFullName(row.full_name ?? '');
        setPhone(row.phone_number ?? '');
        setBirth(row.birth_date ?? '');
        setBio(row.bio ?? '');

        let url = row.avatar_url;
        if (!url && row.avatar_path) {
          url = computePublicUrl(row.avatar_path);
        } else if (url) {
          if (!url.includes('?t=')) url = `${url}?t=${Date.now()}`;
        }
        setAvatarUrl(url ?? null);
      }

      // wallet
      const { data: w } = await supabase
        .from('xp_wallets')
        .select('balance')
        .eq('user_id', uid)
        .maybeSingle();
      if (typeof w?.balance === 'number') setWalletBalance(w.balance);

      // plays
      const { count: c1 } = await supabase
        .from('coupon_plays')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', uid);
      setPlaysCount(c1 ?? 0);

      // top category
      try {
        const { data: catRows } = await supabase
          .from('coupon_plays')
          .select('category')
          .eq('user_id', uid);

        if (catRows?.length) {
          const map: Record<string, number> = {};
          for (const r of catRows as any[]) {
            const k = (r.category ?? 'Diğer') as string;
            map[k] = (map[k] ?? 0) + 1;
          }
          let best = 'Diğer',
            bestN = 0;
          Object.entries(map).forEach(([k, v]) => {
            if (v > bestN) {
              best = k;
              bestN = v;
            }
          });
          setTopCategory(best);
        } else setTopCategory('-');
      } catch {
        setTopCategory('-');
      }
    } finally {
      setLoadingData(false);
    }
  };

  // Sayfaya odaklandığında yenile
  useFocusEffect(
    useCallback(() => {
      if (authUserId) {
        loadAll(authUserId);
      } else {
        supabase.auth.getUser().then(({ data }) => {
          if (data?.user?.id) {
            setAuthUserId(data.user.id);
            setEmail(data.user.email ?? '');
            loadAll(data.user.id);
          } else {
            // login’e atmayı _layout.tsx hallediyor
          }
        });
      }
    }, [authUserId])
  );

  /** ---------- init & realtime (SADECE WALLET REALTIME KALDI) ---------- **/
  useEffect(() => {
    let walletChannel: any;
    let alive = true;

    (async () => {
      const { data: s } = await supabase.auth.getSession();
      const user = s.session?.user;

      if (!alive) return;

      if (user) {
        setAuthUserId(user.id);
        setEmail(user.email ?? '');
        await loadAll(user.id);

        // realtime wallet balance
        walletChannel = supabase
          .channel('xp_wallets_changes')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'xp_wallets',
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              const bal = (payload.new as any)?.balance;
              if (typeof bal === 'number') setWalletBalance(bal);
            }
          )
          .subscribe();
      } else {
        setLoadingData(false);
      }
    })();

    return () => {
      alive = false;
      try {
        if (walletChannel) supabase.removeChannel(walletChannel);
      } catch {}
    };
  }, []);

  // XP artık cüzdandan
  const xp = walletBalance ?? 0;
  const isPlus = !!dbu?.is_plus;
  const { lvl, pct, need } = useMemo(() => levelFromXp(xp), [xp]);

  /** ---------- avatar upload ---------- **/
  const pickImage = async () => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.5,
      });

      if (r.canceled || r.assets.length === 0 || !authUserId) return;

      isUploadingRef.current = true;
      setUploading(true);

      const asset = r.assets[0];
      const ext = guessExt(asset.uri);
      const mime = contentType(ext);

      const timestamp = Date.now();
      const path = `${authUserId}/avatar_${timestamp}.${ext}`;

      const res = await fetch(asset.uri);
      const buf = await res.arrayBuffer();

      const { error: upErr } = await supabase.storage.from('avatars').upload(path, buf, {
        contentType: mime,
        upsert: false,
      });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const cleanUrl = urlData.publicUrl;
      const displayUrl = `${cleanUrl}?t=${timestamp}`;

      const { error: dbErr } = await supabase
        .from('users')
        .update({
          avatar_url: cleanUrl,
          avatar_path: path,
        })
        .eq('id', authUserId);
      if (dbErr) throw dbErr;

      setAvatarUrl(displayUrl);
      setDbu((prev) =>
        prev
          ? {
              ...prev,
              avatar_url: cleanUrl,
              avatar_path: path,
            }
          : prev
      );

      Alert.alert('Başarılı', 'Profil fotoğrafın güncellendi! ✅');
    } catch (e: any) {
      console.error('Yükleme hatası:', e);
      Alert.alert('Hata', 'Fotoğraf yüklenirken bir sorun oluştu.');
    } finally {
      setUploading(false);
      setTimeout(() => {
        isUploadingRef.current = false;
      }, 1000);
    }
  };

  /** ---------- save profile ---------- **/
  const save = async () => {
    if (!authUserId) return;
    setSaving(true);
    try {
      const patch: Partial<DBUser> = {
        full_name: fullName?.trim() || null,
        phone_number: phone?.trim() || null,
        birth_date: birth?.trim() || null,
        bio: bio?.trim() || null,
      };

      const { data: updated, error } = await supabase
        .from('users')
        .update(patch)
        .eq('id', authUserId)
        .select('*')
        .single();

      if (error) throw error;

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setShowEdit(false);
      setDbu(updated as DBUser);

      Alert.alert('Başarılı', 'Bilgilerin kaydedildi.');
    } catch (e: any) {
      Alert.alert('Hata', e?.message ?? 'Profil güncellenemedi.');
    } finally {
      setSaving(false);
    }
  };

  /** ---------- change password ---------- **/
  const changePassword = async () => {
    if (!newPw || newPw.length < 8) {
      Alert.alert('Uyarı', 'Şifre en az 8 karakter olmalı.');
      return;
    }
    if (newPw !== newPw2) {
      Alert.alert('Uyarı', 'Şifreler uyuşmuyor.');
      return;
    }

    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;

      setPwSaving(false);
      setPwOpen(false);
      setNewPw('');
      setNewPw2('');
      Alert.alert('Tamam', 'Şifren başarıyla değiştirildi.');
    } catch (e: any) {
      setPwSaving(false);
      Alert.alert('Hata', e?.message ?? 'Şifre değiştirilemedi.');
    }
  };

  /** ---------- sign out (KESİN FIX) ---------- **/
/** ---------- sign out (UI ayrı state) ---------- **/
const handleLogout = async () => {
  if (logoutLoading) return;
  setLogoutLoading(true);

  try {
    await supabase.auth.signOut();
    // router.replace('/login') YOK!
    // yönlendirmeyi _layout.tsx yapıyor
  } catch (e: any) {
    console.error('Logout hatası:', e?.message || e);
    Alert.alert('Hata', 'Çıkış yapılamadı. Tekrar dene.');
  } finally {
    setLogoutLoading(false);
  }
};


  const handleDeleteAccount = async () => {
    Alert.alert(
      'Hesabı Sil',
      'Bu işlem geri alınamaz. Hesabın ve ilişkili verilerin silinecek. Devam edelim mi?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, sil',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              const { error } = await supabase.functions.invoke('delete-account', {
                body: { confirm: true },
              });
              if (error) throw error;

              // signOut da yapmak daha güvenli
              await supabase.auth.signOut().catch(() => {});
            } catch (e: any) {
              console.error('Hesap silme hatası:', e?.message || e);
              Alert.alert('Hata', 'Hesap silinemedi. Lütfen tekrar dene veya destekle iletişime geç.');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  /** ---------- ui ---------- **/
  if (loadingData && !dbu) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={ORANGE} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BG }}
      contentContainerStyle={{ paddingBottom: ins.bottom + 140 }}
      keyboardShouldPersistTaps="handled"
      contentInset={{ bottom: ins.bottom + 40 }}
      scrollIndicatorInsets={{ bottom: ins.bottom + 40 }}
    >
      {/* TOP BAR */}
      <View style={styles.topbar}>
        <Text style={styles.brand}>DÜMENDEN</Text>
      </View>

      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.title}>Profil</Text>
      </View>

      {/* AVATAR */}
      <View style={{ alignItems: 'center', marginTop: -50 }}>
        <View style={styles.avatarBorder}>
          <View style={styles.avatarWrap}>
            {uploading ? (
              <ActivityIndicator color={ORANGE} />
            ) : (
              <TouchableOpacity onPress={pickImage} activeOpacity={0.85}>
                <Image
                  key={avatarUrl ?? 'default'}
                  source={avatarUrl ? { uri: avatarUrl } : require('@/assets/images/dumendenci.png')}
                  style={styles.avatar}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={pickImage} style={styles.changeBtn}>
              <Text style={styles.changeBtnTxt}>Değiştir</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.nameTxt}>{fullName || 'İsimsiz Dumenci'}</Text>
        <Text style={styles.emailTxt}>{email || '-'}</Text>
      </View>

      {/* LEVEL / XP */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={styles.cardTitle}>Seviye {lvl}</Text>
          <Text style={styles.cardSub}>{xp.toLocaleString('tr-TR')} XP</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.cardHint}>{`Sonraki seviye için ${need} XP`}</Text>
      </View>

      {/* STATS */}
      <View style={styles.rowCards}>
        <View style={styles.miniCard}>
          <Text style={styles.miniVal}>{playsCount}</Text>
          <Text style={styles.miniLbl}>Oynanan Kupon</Text>
        </View>
        <View style={styles.miniCard}>
          <Text style={styles.miniVal}>{topCategory}</Text>
          <Text style={styles.miniLbl}>En Çok Kategori</Text>
        </View>
        <View style={styles.miniCard}>
          <Text style={styles.miniVal}>{isPlus ? 'Evet' : 'Hayır'}</Text>
          <Text style={styles.miniLbl}>Plus Üye</Text>
        </View>
      </View>

      {/* INFO */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Bilgiler</Text>

        <Field label="İsim Soyisim" value={fullName} editable={showEdit} onChange={setFullName} />
        <Field label="Telefon" value={phone} editable={showEdit} onChange={setPhone} keyboardType="phone-pad" />
        <Field label="Doğum Tarihi (YYYY-AA-GG)" value={birth} editable={showEdit} onChange={setBirth} />
        <Field label="Bio" value={bio} editable={showEdit} onChange={setBio} multiline />

        <View style={{ height: 8 }} />
        <TouchableOpacity
          onPress={() => setShowEdit((v) => !v)}
          style={[styles.actionBtn, { backgroundColor: showEdit ? '#F3F4F6' : ORANGE }]}
        >
          <Text style={[styles.actionTxt, { color: showEdit ? TEXT : '#fff' }]}>
            {showEdit ? 'Düzenlemeyi Kapat' : 'Profili Düzenle'}
          </Text>
        </TouchableOpacity>

        {showEdit && (
          <TouchableOpacity
            onPress={save}
            disabled={saving}
            style={[styles.actionBtn, { backgroundColor: '#16a34a' }]}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={[styles.actionTxt, { color: '#fff' }]}>Kaydet</Text>}
          </TouchableOpacity>
        )}
      </View>

      {/* SECURITY */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Güvenlik</Text>
        <View style={styles.inline}>
          <Text style={styles.inlineLbl}>Bildirimler</Text>
          <Switch
            value={notifOn}
            onValueChange={setNotifOn}
            thumbColor={notifOn ? ORANGE : '#9CA3AF'}
            trackColor={{ false: '#E5E7EB', true: '#FED7AA' }}
          />
        </View>

        {!pwOpen ? (
          <TouchableOpacity onPress={() => setPwOpen(true)} style={[styles.actionBtn, { backgroundColor: '#334155' }]}>
            <Text style={[styles.actionTxt, { color: '#fff' }]}>Şifre Değiştir</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TextInput
              value={newPw}
              onChangeText={setNewPw}
              placeholder="Yeni şifre (min 8)"
              placeholderTextColor={MUTED}
              secureTextEntry
              style={styles.input}
            />
            <TextInput
              value={newPw2}
              onChangeText={setNewPw2}
              placeholder="Yeni şifre (tekrar)"
              placeholderTextColor={MUTED}
              secureTextEntry
              style={styles.input}
            />
            <TouchableOpacity onPress={changePassword} disabled={pwSaving} style={[styles.actionBtn, { backgroundColor: '#16a34a' }]}>
              {pwSaving ? <ActivityIndicator color="#fff" /> : <Text style={[styles.actionTxt, { color: '#fff' }]}>Onayla</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPwOpen(false)} disabled={pwSaving} style={[styles.actionBtn, { backgroundColor: '#F3F4F6' }]}>
              <Text style={[styles.actionTxt, { color: TEXT }]}>Vazgeç</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ÇIKIŞ */}
      <TouchableOpacity
  onPress={handleLogout}
  disabled={logoutLoading}
  style={[
    styles.actionBtn,
    { backgroundColor: '#dc2626', marginTop: 6, opacity: logoutLoading ? 0.6 : 1 },
  ]}
>
  {logoutLoading ? (
    <ActivityIndicator color="#fff" />
  ) : (
    <Text style={[styles.actionTxt, { color: '#fff' }]}>Çıkış Yap</Text>
  )}
</TouchableOpacity>
      </View>

      {/* BADGES */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Rozetler</Text>
        <View style={styles.badges}>
          <Badge text="İlk Kupon" active={playsCount >= 1} />
          <Badge text="100 XP" active={xp >= 100} />
          <Badge text="Kaptan Dumenci" active={xp >= 1000} />
          <Badge text="Plus Elit" active={isPlus} />
        </View>
      </View>

      {/* AWARDS */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Ödüllerim</Text>
        <Text style={styles.cardSub}>
          Toplanan: {Number(playsCount >= 1) + Number(xp >= 100) + Number(xp >= 1000) + Number(isPlus)} / 4
        </Text>
        <View style={{ height: 10 }} />
        <View style={styles.badges}>
          <Badge text="İlk Kupon" active={playsCount >= 1} />
          <Badge text="100 XP" active={xp >= 100} />
          <Badge text="Kaptan Dumenci" active={xp >= 1000} />
          <Badge text="Plus Elit" active={isPlus} />
        </View>
        <Text style={styles.cardHint}>Yakında: “Kanıt Ustası”, “Gündem Avcısı”, “Seri Yorumcu”…</Text>
      </View>

      {/* SHORTCUTS */}
      <View style={styles.rowCards}>
        <Shortcut title="Kuponlarım" onPress={() => router.push('/my-bets')} />
        <Shortcut title="Market" onPress={() => router.push('/market')} />
        <Shortcut title="Keşfet" onPress={() => router.push('/explore')} />
      </View>

      {/* FAQ */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sıkça Sorulan Sorular</Text>
        <Accordion
          q="Dümenden'deki kuponlar gerçek para mı?"
          a="Hayır. Dümenden tamamen eğlence ve sosyalleşme amaçlıdır. Kuponlar XP ile oynanır, gerçek para ile bahis oynanmaz ve gerçek para kazanılmaz."
        />
        <Accordion
          q="XP ne işe yarıyor, sıfırlanıyor mu?"
          a="XP; profil seviyeni, rozetlerini ve ilerlemeni temsil eder. Ödüller, rozetler, ileride gelecek özel özellikler XP’ye bağlıdır. Hesabını silmediğin sürece XP’in sıfırlanmaz."
        />
        <Accordion
          q="Kanıt eklemek zorunlu mu?"
          a="Hayır, zorunlu değil ama çok tavsiye ediyoruz. Kanıt eklenen kuponlar toplulukta daha güvenilir görünür, ileride 'Kanıt Ustası' gibi rozetler de bu sayede açılacak."
        />
        <Accordion
          q="Bir kupon tutmazsa hesabımdan ne eksiliyor?"
          a="Kupon tutmazsa sadece o kupona oynadığın XP düşer. Eksi bakiyeye düşmezsin, gerçek para kaybetmezsin. Dümenden'de amaç eğlence, sohbet ve mizah."
        />
        <Accordion
          q="Plus üyelik bana ne kazandırıyor?"
          a="Reklamsız deneyim, özel seçilmiş kuponlar, profilinde Plus rozeti, ileride gelecek kapalı beta özelliklere erken erişim ve daha fazlası."
        />
        <Accordion
          q="Şüpheli ya da rahatsız edici bir içerik görürsem ne yapmalıyım?"
          a="Kupon detayında veya yorumlarda 'Bildir' alanını kullanarak içeriği moderasyon ekibine iletebilirsin."
        />
      </View>

      {/* PROCEDURES */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Prosedürler</Text>
        <Text style={styles.cardBody}>
          <Text style={{ fontWeight: '800' }}>1. Kupon Yayınlama Süreci:</Text> Adminler veya yetkili içerik üreticileri
          tarafından eklenen kuponlar kontrol edilir.
        </Text>
        <Text style={styles.cardBody}>
          <Text style={{ fontWeight: '800' }}>2. Kanıt Kontrolü:</Text> Kanıtlar otomatik ve manuel kontrole tabidir.
        </Text>
        <Text style={styles.cardBody}>
          <Text style={{ fontWeight: '800' }}>3. Şikayet & İtiraz:</Text> “Bildir” veya destek kanallarını kullanabilirsin.
        </Text>
        <Text style={styles.cardBody}>
          <Text style={{ fontWeight: '800' }}>4. Topluluk Kuralları:</Text> Taciz, nefret söylemi vb. davranışlara tolerans yoktur.
        </Text>
      </View>

      <TouchableOpacity onPress={handleDeleteAccount} style={styles.deleteLinkWrap}>
        <Text style={styles.deleteLinkText}>Hesabımı Sil</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

/** ---------- small components ---------- **/
function Field({
  label,
  value,
  editable,
  onChange,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  editable: boolean;
  onChange: (t: string) => void;
  keyboardType?: any;
  multiline?: boolean;
}) {
  if (!editable) {
    return (
      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldValue}>{value?.length ? value : '-'}</Text>
      </View>
    );
  }
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor={MUTED}
        keyboardType={keyboardType}
        multiline={multiline}
        style={[styles.input, multiline && { height: 92, textAlignVertical: 'top' }]}
      />
    </View>
  );
}

function Badge({ text, active }: { text: string; active: boolean }) {
  return (
    <View style={[styles.badge, { opacity: active ? 1 : 0.4, borderColor: active ? ORANGE : BORDER }]}>
      <Text style={{ color: TEXT, fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

function Shortcut({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.shortcut} activeOpacity={0.85}>
      <Text style={{ color: TEXT, fontWeight: '900' }}>{title}</Text>
    </TouchableOpacity>
  );
}

function Accordion({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: BORDER, paddingVertical: 10 }}>
      <TouchableOpacity onPress={() => setOpen((v) => !v)} style={{ paddingVertical: 6 }} activeOpacity={0.8}>
        <Text style={{ color: TEXT, fontWeight: '800' }}>{q}</Text>
      </TouchableOpacity>
      {open && <Text style={styles.cardBody}>{a}</Text>}
    </View>
  );
}

/** ---------- styles ---------- **/
const styles = StyleSheet.create({
  topbar: {
    height: 52,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontStyle: 'italic',
  },

  header: {
    height: 90,
    backgroundColor: BG,
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  title: { fontSize: 28, fontWeight: '900', color: TEXT },

  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
  },
  inlineLbl: { color: TEXT, fontWeight: '800' },

  avatarBorder: {
    padding: 3,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: ORANGE,
    backgroundColor: '#fff',
    elevation: 4,
    shadowColor: ORANGE,
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },

  deleteLinkWrap: {
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  deleteLinkText: {
    fontSize: 12,
    color: '#9CA3AF',
    textDecorationLine: 'underline',
  },

  avatarWrap: {
    width: 150,
    height: 150,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#f2f2f2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: { width: 150, height: 150 },
  changeBtn: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.2)',
  },
  changeBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },

  nameTxt: { color: TEXT, fontSize: 18, fontWeight: '900', marginTop: 12 },
  emailTxt: { color: MUTED, marginTop: 4 },

  card: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 14,
    marginTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  cardTitle: { color: TEXT, fontWeight: '900', marginBottom: 8, fontSize: 16 },
  cardSub: { color: '#374151', fontWeight: '800' },
  cardHint: { color: MUTED, marginTop: 8, fontSize: 12 },
  cardBody: { color: TEXT, marginTop: 6, lineHeight: 20 },

  progressTrack: {
    height: 12,
    backgroundColor: '#F1F1F1',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: { height: 12, backgroundColor: ORANGE },

  rowCards: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  miniCard: {
    flex: 1,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
  },
  miniVal: { color: TEXT, fontWeight: '900', fontSize: 18 },
  miniLbl: { color: MUTED, marginTop: 4, fontSize: 12 },

  fieldRow: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
    backgroundColor: '#FFF',
  },
  fieldLabel: { color: '#374151', fontWeight: '800', marginBottom: 6 },
  fieldValue: { color: TEXT, fontWeight: '600' },

  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFF',
    color: TEXT,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    marginTop: 6,
  },

  actionBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  actionTxt: { color: TEXT, fontWeight: '900' },

  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: '#FFF',
  },

  shortcut: {
    flex: 1,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
});
