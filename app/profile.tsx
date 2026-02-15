'use client';

import { supabase } from '@/lib/supabaseClient';
import { useBlocks } from '@/lib/blocks';
import LanguageSelector from '@/components/LanguageSelector';
import { useI18n } from '@/lib/i18n';
import { AttStatus, getATTStatus, openATTSettings, requestATT } from '@/src/contexts/lib/att';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
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
const ONBOARDING_HOME_KEY = 'onboarding_home_v1';

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
  const { t, language, setLanguage, numberLocale } = useI18n();

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
  const [languageOpen, setLanguageOpen] = useState(false);
  const [attStatus, setAttStatus] = useState<AttStatus>('unavailable');
  // logout ayrı state (saving ile karışmasın)
const [logoutLoading, setLogoutLoading] = useState(false);


  // password change
  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  // stats
  const [playsCount, setPlaysCount] = useState<number>(0);
  const [topCategory, setTopCategory] = useState<string>(t('common.na'));

  // XP — tek kaynak: xp_wallets.balance
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [loadingData, setLoadingData] = useState(true);
  const { blockedIds, unblockUser } = useBlocks();
  const [blockedUsers, setBlockedUsers] = useState<Array<{ id: string; full_name: string | null; avatar_url: string | null }>>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);

  // Fotoğraf yüklenirken veri çekmeyi engelle
  const isUploadingRef = useRef(false);

  /** ---------- helpers ---------- **/
  const handleShowTutorial = useCallback(async () => {
    await AsyncStorage.removeItem(ONBOARDING_HOME_KEY);
    Alert.alert(t('common.success'), t('profile.showTutorialReady'), [
      { text: t('common.ok'), onPress: () => router.push('/home') },
    ]);
  }, [router, t]);
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
            const k = (r.category ?? t('common.other')) as string;
            map[k] = (map[k] ?? 0) + 1;
          }
          let best = t('common.other'),
            bestN = 0;
          Object.entries(map).forEach(([k, v]) => {
            if (v > bestN) {
              best = k;
              bestN = v;
            }
          });
          setTopCategory(best);
        } else setTopCategory(t('common.na'));
      } catch {
        setTopCategory(t('common.na'));
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

  const refreshAttStatus = useCallback(async () => {
    const status = await getATTStatus();
    setAttStatus(status);
  }, []);

  useEffect(() => {
    refreshAttStatus().catch(() => {});
  }, [refreshAttStatus]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshAttStatus().catch(() => {});
    });
    return () => {
      try {
        sub.remove();
      } catch {}
    };
  }, [refreshAttStatus]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!blockedIds.length) {
        setBlockedUsers([]);
        setBlockedLoading(false);
        return;
      }
      setBlockedLoading(true);
      const { data } = await supabase
        .from('users')
        .select('id, full_name, avatar_url')
        .in('id', blockedIds);
      if (!alive) return;
      setBlockedUsers((data ?? []) as any[]);
      setBlockedLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [blockedIds.join('|')]);

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

      Alert.alert(t('common.success'), t('profile.avatarUpdated'));
    } catch (e: any) {
      console.error('Yükleme hatası:', e);
      Alert.alert(t('common.error'), t('profile.avatarUpdateFail'));
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

      Alert.alert(t('common.success'), t('profile.saveSuccess'));
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? t('profile.saveFail'));
    } finally {
      setSaving(false);
    }
  };

  /** ---------- change password ---------- **/
  const changePassword = async () => {
    if (!newPw || newPw.length < 8) {
      Alert.alert(t('common.warning'), t('profile.passwordTooShort'));
      return;
    }
    if (newPw !== newPw2) {
      Alert.alert(t('common.warning'), t('profile.passwordMismatch'));
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
      Alert.alert(t('common.ok'), t('profile.passwordChanged'));
    } catch (e: any) {
      setPwSaving(false);
      Alert.alert(t('common.error'), e?.message ?? t('profile.passwordChangeFail'));
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
    Alert.alert(t('common.error'), t('profile.logoutFail'));
  } finally {
    setLogoutLoading(false);
  }
};


  const handleDeleteAccount = async () => {
    Alert.alert(
      t('profile.deleteTitle'),
      t('profile.deleteBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.deleteConfirm'),
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
              Alert.alert(t('common.error'), t('profile.deleteFail'));
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
        <Text style={styles.brand}>{t('app.name')}</Text>
      </View>

      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('profile.title')}</Text>
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
              <Text style={styles.changeBtnTxt}>{t('common.change')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.nameTxt}>{fullName || t('profile.unnamedUser')}</Text>
        <Text style={styles.emailTxt}>{email || t('common.na')}</Text>
      </View>

      {/* LEVEL / XP */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={styles.cardTitle}>{t('profile.level', { level: lvl })}</Text>
          <Text style={styles.cardSub}>{xp.toLocaleString(numberLocale)} XP</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.cardHint}>{t('profile.nextLevel', { xp: need })}</Text>
      </View>

      {/* STATS */}
      <View style={styles.rowCards}>
        <View style={styles.miniCard}>
          <Text style={styles.miniVal}>{playsCount}</Text>
          <Text style={styles.miniLbl}>{t('profile.playedCoupons')}</Text>
        </View>
        <View style={styles.miniCard}>
          <Text style={styles.miniVal}>{topCategory}</Text>
          <Text style={styles.miniLbl}>{t('profile.topCategory')}</Text>
        </View>
        <View style={styles.miniCard}>
          <Text style={styles.miniVal}>{isPlus ? t('common.yes') : t('common.no')}</Text>
          <Text style={styles.miniLbl}>{t('profile.plusMember')}</Text>
        </View>
      </View>

      {/* INFO */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('profile.infoTitle')}</Text>

        <Field label={t('profile.fullName')} value={fullName} editable={showEdit} onChange={setFullName} />
        <Field label={t('profile.phone')} value={phone} editable={showEdit} onChange={setPhone} keyboardType="phone-pad" />
        <Field label={t('profile.birthDate')} value={birth} editable={showEdit} onChange={setBirth} />
        <Field label={t('profile.bio')} value={bio} editable={showEdit} onChange={setBio} multiline />

        <View style={{ height: 8 }} />
        <TouchableOpacity
          onPress={() => setShowEdit((v) => !v)}
          style={[styles.actionBtn, { backgroundColor: showEdit ? '#F3F4F6' : ORANGE }]}
        >
          <Text style={[styles.actionTxt, { color: showEdit ? TEXT : '#fff' }]}>
            {showEdit ? t('profile.closeEdit') : t('profile.editProfile')}
          </Text>
        </TouchableOpacity>

        {showEdit && (
          <TouchableOpacity
            onPress={save}
            disabled={saving}
            style={[styles.actionBtn, { backgroundColor: '#16a34a' }]}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={[styles.actionTxt, { color: '#fff' }]}>{t('common.save')}</Text>}
          </TouchableOpacity>
        )}
      </View>

      {/* PREFERENCES */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('profile.preferences')}</Text>
        <TouchableOpacity onPress={() => setLanguageOpen(true)} style={styles.inline}>
          <Text style={styles.inlineLbl}>{t('profile.language')}</Text>
          <Text style={{ color: TEXT, fontWeight: '800' }}>
            {language === 'tr' ? t('languages.tr') : t('languages.en')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleShowTutorial} style={styles.inline}>
          <Text style={styles.inlineLbl}>{t('profile.showTutorial')}</Text>
          <View style={styles.inlineChip}>
            <Text style={styles.inlineChipText}>{t('profile.showTutorialAction')}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={async () => {
            const status = await getATTStatus();
            if (status === 'denied' || status === 'restricted' || status === 'authorized') {
              await openATTSettings();
              return;
            }
            const next = await requestATT();
            setAttStatus(next);
          }}
          style={styles.inline}
          disabled={attStatus === 'unavailable'}
        >
          <Text style={styles.inlineLbl}>{t('profile.trackingPermission')}</Text>
          <Text style={{ color: TEXT, fontWeight: '800' }}>
            {t(`profile.trackingStatus.${attStatus}`)}
          </Text>
        </TouchableOpacity>
      </View>

      {/* BLOCKED USERS */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('profile.blockedUsersTitle')}</Text>
        {blockedLoading ? (
          <View style={{ paddingVertical: 8 }}>
            <ActivityIndicator color={ORANGE} />
          </View>
        ) : blockedUsers.length === 0 ? (
          <Text style={styles.cardHint}>{t('profile.blockedUsersEmpty')}</Text>
        ) : (
          blockedUsers.map((u) => (
            <View key={u.id} style={styles.blockedRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                {u.avatar_url ? (
                  <Image source={{ uri: u.avatar_url }} style={styles.blockedAvatar} />
                ) : (
                  <View style={styles.blockedAvatarFallback}>
                    <Text style={{ color: '#999', fontWeight: '900' }}>
                      {(u.full_name || t('profile.unnamedUser')).trim()[0]?.toUpperCase() || t('common.userInitial')}
                    </Text>
                  </View>
                )}
                <Text style={styles.blockedName} numberOfLines={1}>
                  {u.full_name || t('profile.unnamedUser')}
                </Text>
              </View>
              <TouchableOpacity onPress={() => unblockUser(u.id)} style={styles.unblockBtn}>
                <Text style={styles.unblockTxt}>{t('profile.unblock')}</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* SECURITY */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('profile.securityTitle')}</Text>
        <View style={styles.inline}>
          <Text style={styles.inlineLbl}>{t('profile.notifications')}</Text>
          <Switch
            value={notifOn}
            onValueChange={setNotifOn}
            thumbColor={notifOn ? ORANGE : '#9CA3AF'}
            trackColor={{ false: '#E5E7EB', true: '#FED7AA' }}
          />
        </View>

        {!pwOpen ? (
          <TouchableOpacity onPress={() => setPwOpen(true)} style={[styles.actionBtn, { backgroundColor: '#334155' }]}>
            <Text style={[styles.actionTxt, { color: '#fff' }]}>{t('profile.changePassword')}</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TextInput
              value={newPw}
              onChangeText={setNewPw}
              placeholder={t('profile.newPassword')}
              placeholderTextColor={MUTED}
              secureTextEntry
              style={styles.input}
            />
            <TextInput
              value={newPw2}
              onChangeText={setNewPw2}
              placeholder={t('profile.newPasswordRepeat')}
              placeholderTextColor={MUTED}
              secureTextEntry
              style={styles.input}
            />
            <TouchableOpacity onPress={changePassword} disabled={pwSaving} style={[styles.actionBtn, { backgroundColor: '#16a34a' }]}>
              {pwSaving ? <ActivityIndicator color="#fff" /> : <Text style={[styles.actionTxt, { color: '#fff' }]}>{t('common.confirm')}</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPwOpen(false)} disabled={pwSaving} style={[styles.actionBtn, { backgroundColor: '#F3F4F6' }]}>
              <Text style={[styles.actionTxt, { color: TEXT }]}>{t('common.cancel')}</Text>
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
    <Text style={[styles.actionTxt, { color: '#fff' }]}>{t('profile.logout')}</Text>
  )}
</TouchableOpacity>
      </View>

      {/* BADGES */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('profile.badgesTitle')}</Text>
        <View style={styles.badges}>
          <Badge text={t('profile.badgeFirstCoupon')} active={playsCount >= 1} />
          <Badge text={t('profile.badge100xp')} active={xp >= 100} />
          <Badge text={t('profile.badgeCaptain')} active={xp >= 1000} />
          <Badge text={t('profile.badgePlusElite')} active={isPlus} />
        </View>
      </View>

      {/* AWARDS */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('profile.awardsTitle')}</Text>
        <Text style={styles.cardSub}>
          {t('profile.collected', {
            count: Number(playsCount >= 1) + Number(xp >= 100) + Number(xp >= 1000) + Number(isPlus),
            total: 4,
          })}
        </Text>
        <View style={{ height: 10 }} />
        <View style={styles.badges}>
          <Badge text={t('profile.badgeFirstCoupon')} active={playsCount >= 1} />
          <Badge text={t('profile.badge100xp')} active={xp >= 100} />
          <Badge text={t('profile.badgeCaptain')} active={xp >= 1000} />
          <Badge text={t('profile.badgePlusElite')} active={isPlus} />
        </View>
        <Text style={styles.cardHint}>{t('profile.comingSoon')}</Text>
      </View>

      {/* SHORTCUTS */}
      <View style={styles.rowCards}>
        <Shortcut title={t('profile.myCoupons')} onPress={() => router.push('/my-bets')} />
        <Shortcut title={t('tabs.market')} onPress={() => router.push('/market')} />
        <Shortcut title={t('tabs.explore')} onPress={() => router.push('/explore')} />
      </View>

      {/* FAQ */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('profile.faqTitle')}</Text>
        <Accordion
          q={t('profile.faq.q1')}
          a={t('profile.faq.a1')}
        />
        <Accordion
          q={t('profile.faq.q2')}
          a={t('profile.faq.a2')}
        />
        <Accordion
          q={t('profile.faq.q3')}
          a={t('profile.faq.a3')}
        />
        <Accordion
          q={t('profile.faq.q4')}
          a={t('profile.faq.a4')}
        />
        <Accordion
          q={t('profile.faq.q5')}
          a={t('profile.faq.a5')}
        />
        <Accordion
          q={t('profile.faq.q6')}
          a={t('profile.faq.a6')}
        />
      </View>

      {/* PROCEDURES */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('profile.proceduresTitle')}</Text>
        <Text style={styles.cardBody}>
          <Text style={{ fontWeight: '800' }}>{t('profile.procedure1Title')}</Text> {t('profile.procedure1Body')}
        </Text>
        <Text style={styles.cardBody}>
          <Text style={{ fontWeight: '800' }}>{t('profile.procedure2Title')}</Text> {t('profile.procedure2Body')}
        </Text>
        <Text style={styles.cardBody}>
          <Text style={{ fontWeight: '800' }}>{t('profile.procedure3Title')}</Text> {t('profile.procedure3Body')}
        </Text>
        <Text style={styles.cardBody}>
          <Text style={{ fontWeight: '800' }}>{t('profile.procedure4Title')}</Text> {t('profile.procedure4Body')}
        </Text>
      </View>

      <TouchableOpacity onPress={handleDeleteAccount} style={styles.deleteLinkWrap}>
        <Text style={styles.deleteLinkText}>{t('profile.deleteLink')}</Text>
      </TouchableOpacity>

      <LanguageSelector
        visible={languageOpen}
        value={language}
        onClose={() => setLanguageOpen(false)}
        onSelect={(lang) => {
          setLanguageOpen(false);
          void setLanguage(lang);
        }}
      />
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
  const { t } = useI18n();
  if (!editable) {
    return (
      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldValue}>{value?.length ? value : t('common.na')}</Text>
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
  inlineChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#FFF2E8',
    borderWidth: 1,
    borderColor: '#FFD6B8',
  },
  inlineChipText: { color: ORANGE, fontWeight: '900' },

  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 8,
  },
  blockedAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#eee' },
  blockedAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BORDER,
  },
  blockedName: { fontWeight: '800', color: TEXT, flexShrink: 1 },
  unblockBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  unblockTxt: { color: '#111', fontWeight: '800' },

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
