'use client';

import { BAR_MARGIN, BAR_MIN_HEIGHT } from '@/components/ui/layout';
import { supabase } from '@/lib/supabaseClient';
import { Ionicons } from '@expo/vector-icons';
import { decode as atob } from 'base-64';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** ========= THEME / CONST ========= */
const BRAND = '#FF6B00';
const BRAND_FAINT = '#FFF2E6';
const MEDIA_BUCKET = 'Media';
const LOGO = null as unknown as number;

/** ========= UTILS ========= */
const cacheBust = (u: string) => (u?.includes('?') ? `${u}&t=${Date.now()}` : `${u}?t=${Date.now()}`);
const urlCache = new Map<string, string>();

async function resolveUrl(raw?: string | null): Promise<string | null> {
  if (!raw) return null;
  if (raw.startsWith('http')) return raw;
  if (urlCache.has(raw)) return urlCache.get(raw)!;
  const cleanPath = raw.replace(/^\/+/, '');
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(cleanPath);
  if (data?.publicUrl) {
    const u = cacheBust(data.publicUrl);
    urlCache.set(raw, u);
    return u;
  }
  return null;
}

const guessExt = (uri: string) => {
  const raw = uri.split('?')[0].split('#')[0];
  const ext = raw.includes('.') ? raw.substring(raw.lastIndexOf('.') + 1).toLowerCase() : 'jpg';
  return ext === 'jpeg' ? 'jpg' : ext;
};
const contentType = (ext: string) => (ext === 'jpg' ? 'image/jpeg' : ext === 'heic' ? 'image/heic' : `image/${ext}`);

const b64ToBytes = (b64: string) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function uploadToMediaBucketBase64(base64: string, path: string, mime: string) {
  const bytes = b64ToBytes(base64);
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw error;
  return path;
}
const uid = () => Math.random().toString(36).slice(2);

function formatWhen(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'az önce';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa`;
  const day = Math.floor(h / 24);
  if (day < 7) return `${day} gün`;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** ========= TYPES ========= */
type VComment = {
  id: string;
  user_id: string;
  coupon_id: string;
  content: string;
  created_at: string;
  parent_id?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  image_url?: string | null;
};
type Line = { name: string; yesPrice?: number; noPrice?: number; imageUrl?: string | null };
type Coupon = {
  id: string;
  title: string;
  closing_date: string;
  description?: string;
  image_url?: string | null;
  yes_price?: number | null;
  no_price?: number | null;
  category?: string;
  is_open?: boolean | null;
  market_type?: 'binary' | 'multi' | null;
  lines?: Line[] | null;
};
type Reaction = 'like' | 'dislike';
type Counts = { likes: number; dislikes: number; my?: Reaction | null };

/** ========= SMALL COMPONENTS ========= */
const AsyncThumb = ({ path, style }: { path?: string | null; style: any }) => {
  const [u, setU] = useState<string | null>(null);
  useEffect(() => {
    (async () => setU(await resolveUrl(path)))();
  }, [path]);
  if (!u) return <View style={[style, { backgroundColor: '#eee' }]} />;
  return <Image source={{ uri: u }} style={style} />;
};

const AsyncCommentImage = ({ path, onPress }: { path: string; onPress?: (url: string) => void }) => {
  const [u, setU] = useState<string | null>(null);
  useEffect(() => {
    (async () => setU(await resolveUrl(path)))();
  }, [path]);
  if (!u) return null;
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => onPress?.(u)}>
      <Image source={{ uri: u }} style={{ width: 240, height: 240, borderRadius: 10 }} />
    </TouchableOpacity>
  );
};

const SpinnerLogo = ({ visible }: { visible: boolean }) => {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [visible]);
  if (!visible || !LOGO) return null;
  const rot = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <View style={styles.spinnerWrap}>
      <Animated.Image source={LOGO} style={{ width: 42, height: 42, transform: [{ rotate: rot }] }} />
      <Text style={{ color: '#fff', fontWeight: '800', marginTop: 8 }}>Yükleniyor…</Text>
    </View>
  );
};

/** ========= HELPERS ========= */
type AnyLine = Record<string, any>;
const getLineImageRaw = (l: AnyLine): string | null => {
  return (
    (typeof l.imageUrl === 'string' && l.imageUrl) ||
    (typeof l.image_url === 'string' && l.image_url) ||
    (typeof l.image === 'string' && l.image) ||
    (typeof l.photo === 'string' && l.photo) ||
    (typeof l.avatar === 'string' && l.avatar) ||
    null
  );
};
const normalizeLines = (rows: AnyLine[] | null | undefined): Line[] => {
  if (!Array.isArray(rows)) return [];
  return rows.map((l) => ({
    name: l.name ?? l.label ?? '',
    yesPrice: typeof l.yesPrice === 'number' ? l.yesPrice : typeof l.yes_price === 'number' ? l.yes_price : undefined,
    noPrice: typeof l.noPrice === 'number' ? l.noPrice : typeof l.no_price === 'number' ? l.no_price : undefined,
    imageUrl: getLineImageRaw(l) ?? null,
  }));
};
const resolveLinesImages = async (lines: Line[]): Promise<Line[]> => {
  const out = await Promise.all(
    lines.map(async (l) => {
      const resolved = await resolveUrl(l.imageUrl);
      return { ...l, imageUrl: resolved ? cacheBust(resolved) : null };
    })
  );
  return out;
};
const isPlusLike = (c: any) =>
  !!(c?.is_plus || c?.plus_only || c?.require_plus || (typeof c?.tier === 'string' && c.tier.toLowerCase() === 'plus'));
const isHomeLike = (c: any) => c?.source === 'home' || c?.show_on_home === true || c?.in_home_feed === true || c?.admin === true;

/** ========= SCREEN ========= */
export default function CouponDetail() {
  const { id, src } = useLocalSearchParams<{ id: string; src?: string }>();
  const couponId = (Array.isArray(id) ? id[0] : id || '').toString();
  const source = (Array.isArray(src) ? src[0] : src) || '';
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [me, setMe] = useState<{ id: string; name: string; avatar?: string | null } | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data?.user;
      if (!u) return;
      const { data: prof } = await supabase.from('users').select('id, full_name, avatar_url').eq('id', u.id).single();
      if (prof) setMe({ id: prof.id, name: prof.full_name ?? 'Kullanıcı', avatar: prof.avatar_url });
    })();
    const sub = supabase.auth.onAuthStateChange(async () => {
      const { data } = await supabase.auth.getUser();
      const u = data?.user;
      if (!u) return;
      const { data: prof } = await supabase.from('users').select('id, full_name, avatar_url').eq('id', u.id).single();
      if (prof) setMe({ id: prof.id, name: prof.full_name ?? 'Kullanıcı', avatar: prof.avatar_url });
    });
    return () => sub.data.subscription.unsubscribe();
  }, []);

  /** coupon + lines */
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  useEffect(() => {
    if (!couponId) return;
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from('coupons')
        .select(
          `
          id, title, closing_date, description, image_url, yes_price, no_price, category, is_open, market_type, lines,
          coupon_submissions(image_path)
        `
        )
        .eq('id', couponId)
        .single();

      if (error || !data) return;

      const submissionPath = (data as any).coupon_submissions?.[0]?.image_path;
      const rawImage = submissionPath || (data as any).image_url;

      const resolvedHero = await resolveUrl(rawImage ?? null);
      const rawLines = normalizeLines((data as any).lines);
      const lines = await resolveLinesImages(rawLines);

      if (alive) {
        setCoupon({ ...(data as any), image_url: resolvedHero ?? null, lines });
      }
    })();

    const ch = supabase
      .channel(`coupon-${couponId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coupons', filter: `id=eq.${couponId}` }, async (payload) => {
        const fresh: any = (payload as any)?.new;
        if (!fresh) return;
        const hero = await resolveUrl(fresh.image_url ?? null);
        const norm = normalizeLines(fresh.lines);
        const resolved = await resolveLinesImages(norm);
        setCoupon((prev) => ({ ...(prev ?? ({} as any)), ...fresh, image_url: hero ?? prev?.image_url ?? null, lines: resolved }));
      })
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [couponId]);

  /** comments + reactions */
  const [comments, setComments] = useState<VComment[]>([]);
  const [countsMap, setCountsMap] = useState<Map<string, Counts>>(new Map());
  const [expandedRoot, setExpandedRoot] = useState<Set<string>>(new Set());
  const toggleRoot = (id: string) =>
    setExpandedRoot((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const listRef = useRef<FlatList<any>>(null);
  const inputRef = useRef<TextInput>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCounts = useCallback(async (ids: string[], myId?: string | null) => {
    if (ids.length === 0) return;
    const { data } = await supabase.from('comments_likes').select('comment_id,type,user_id').in('comment_id', ids);
    const next = new Map<string, Counts>();
    ids.forEach((i) => next.set(i, { likes: 0, dislikes: 0, my: null }));
    (data || []).forEach((r: any) => {
      const c = next.get(r.comment_id)!;
      if (r.type === 'like') c.likes += 1;
      else if (r.type === 'dislike') c.dislikes += 1;
      if (r.user_id === myId) c.my = r.type;
    });
    setCountsMap(next);
  }, []);

  const loadComments = useCallback(async () => {
    if (!couponId) return;
    setRefreshing(true);
    const { data } = await supabase.from('v_comments').select('*').eq('coupon_id', couponId).order('created_at', { ascending: true });
    const rows = (data ?? []) as VComment[];
    setComments(rows);
    setRefreshing(false);
    await fetchCounts(
      rows.map((r) => r.id),
      me?.id
    );
  }, [couponId, fetchCounts, me?.id]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // realtime comments only
  useEffect(() => {
    if (!couponId) return;
    const ch = supabase
      .channel(`comments-${couponId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `coupon_id=eq.${couponId}` }, async (payload) => {
        const row = payload.new as any;
        const { data: meta } = await supabase.from('users').select('full_name, avatar_url').eq('id', row.user_id).single();
        setComments((prev) => (prev.some((x) => x.id === row.id) ? prev : [...prev, { ...row, ...meta }]));
        fetchCounts([row.id], me?.id);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'comments', filter: `coupon_id=eq.${couponId}` }, (payload) => {
        const delId = (payload.old as any).id as string;
        setComments((prev) => prev.filter((c) => c.id !== delId));
        setCountsMap((prev) => {
          const n = new Map(prev);
          n.delete(delId);
          return n;
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [couponId, fetchCounts, me?.id]);

  const toggleReaction = async (commentId: string, type: Reaction) => {
    if (!me?.id) return Alert.alert('Giriş gerekli', 'Beğenmek için giriş yap.');
    const current = countsMap.get(commentId)?.my ?? null;
    setCountsMap((prev) => {
      const next = new Map(prev);
      const c = next.get(commentId) || { likes: 0, dislikes: 0, my: null };
      if (current === type) {
        if (type === 'like') c.likes = Math.max(0, c.likes - 1);
        else c.dislikes = Math.max(0, c.dislikes - 1);
        c.my = null;
      } else {
        if (current === 'like') c.likes = Math.max(0, c.likes - 1);
        if (current === 'dislike') c.dislikes = Math.max(0, c.dislikes - 1);
        if (type === 'like') c.likes += 1;
        else c.dislikes += 1;
        c.my = type;
      }
      next.set(commentId, c);
      return next;
    });
    try {
      if (current === type) {
        await supabase.from('comments_likes').delete().eq('comment_id', commentId).eq('user_id', me.id);
      } else {
        await supabase.from('comments_likes').upsert({ comment_id: commentId, user_id: me.id, type }, { onConflict: 'comment_id,user_id' });
      }
    } catch {
      await fetchCounts([commentId], me?.id);
    }
  };

  /** compose */
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<VComment | null>(null);
  const [commentImageLocal, setCommentImageLocal] = useState<string | null>(null);
  const [commentImagePath, setCommentImagePath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [reportingComment, setReportingComment] = useState<VComment | null>(null);
  const [reportSending, setReportSending] = useState(false);

  const pickCommentImage = async () => {
    Keyboard.dismiss();
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return Alert.alert('İzin gerekli', 'Fotoğraf galerisine erişim izni ver.');
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });
    if (res.canceled) return;
    const asset = res.assets?.[0];
    if (!asset?.uri) return;
    setCommentImageLocal(asset.uri);
    setUploading(true);
    try {
      const ext = guessExt(asset.uri);
      const mime = contentType(ext);
      if (!asset.base64) throw new Error('Seçilen görselde base64 verisi yok.');
      const path = `comments/${couponId}/${uid()}.${ext}`;
      const stored = await uploadToMediaBucketBase64(asset.base64, path, mime);
      setCommentImagePath(stored);
    } catch (e: any) {
      Alert.alert('Yükleme hatası', e?.message || 'Görsel yüklenemedi.');
      setCommentImageLocal(null);
      setCommentImagePath(null);
    } finally {
      setUploading(false);
    }
  };
  const clearCommentImage = () => {
    setCommentImageLocal(null);
    setCommentImagePath(null);
  };

  const sendComment = async () => {
    const text = newComment.trim();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return Alert.alert('Giriş gerekli', 'Yorum yazmak için giriş yap.');
    if (!text && !commentImagePath) return;

    const payload: any = { user_id: user.id, coupon_id: couponId, content: text || '' };
    if (replyTo) payload.parent_id = replyTo.id;
    if (commentImagePath) payload.image_url = commentImagePath;

    const { data: inserted, error } = await supabase
      .from('comments')
      .insert([payload])
      .select('id, user_id, coupon_id, content, created_at, parent_id, image_url')
      .single();
    if (error) return Alert.alert('Hata', error.message);

    setComments((prev) => [...prev, { ...inserted!, full_name: me?.name, avatar_url: me?.avatar }]);
    setCountsMap((prev) => {
      const next = new Map(prev);
      next.set(inserted!.id, { likes: 0, dislikes: 0, my: undefined });
      return next;
    });

    setNewComment('');
    setReplyTo(null);
    clearCommentImage();
    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const deleteComment = async (c: VComment) => {
    if (!me || me.id !== c.user_id) return;
    setComments((prev) => prev.filter((x) => x.id !== c.id));
    setCountsMap((prev) => {
      const n = new Map(prev);
      n.delete(c.id);
      return n;
    });
    const { error } = await supabase.from('comments').delete().eq('id', c.id).eq('user_id', me.id);
    if (error) {
      Alert.alert('Silinemedi', error.message);
      loadComments();
    }
  };

  /** ====== FLAT THREAD ====== */
  const { roots, childrenByRoot, byId } = useMemo(() => {
    const map = new Map<string, VComment>();
    comments.forEach((c) => map.set(c.id, c));
    const findRoot = (c: VComment): VComment => {
      let cur: VComment = c;
      while (cur.parent_id && map.get(cur.parent_id)) cur = map.get(cur.parent_id)!;
      return cur;
    };
    const rootArr: VComment[] = [];
    const children = new Map<string, VComment[]>();
    comments.forEach((c) => {
      const root = c.parent_id ? findRoot(c) : c;
      if (c.id === root.id) rootArr.push(c);
      else {
        const arr = children.get(root.id) ?? [];
        arr.push(c);
        children.set(root.id, arr);
      }
    });
    rootArr.sort((a, b) => a.created_at.localeCompare(b.created_at));
    Array.from(children.values()).forEach((arr) => arr.sort((a, b) => a.created_at.localeCompare(b.created_at)));
    return { roots: rootArr, childrenByRoot: children, byId: map };
  }, [comments]);

  /** ========== BENZER KUPONLAR ========== */
  const [similar, setSimilar] = useState<Coupon[]>([]);
  useEffect(() => {
    let on = true;
    const shuffle = <T,>(arr: T[]) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    const nowIso = new Date().toISOString();
    const notThis = (c: any) => String(c?.id) !== String(couponId);
    const active = (c: any) => c?.is_open !== false && (!c?.closing_date || c.closing_date > nowIso);
    (async () => {
      try {
        const baseFields =
          'id, title, closing_date, image_url, yes_price, no_price, category, is_open, market_type, lines, is_plus, plus_only, require_plus, tier, source, show_on_home, in_home_feed, admin';
        let homeRows: any[] = [];
        try {
          const { data } = await supabase.from('v_home_coupons').select(baseFields).gt('closing_date', nowIso).order('created_at', { ascending: false });
          homeRows = (data ?? []) as any[];
        } catch {
          homeRows = [];
        }
        if (homeRows.length === 0) {
          const { data } = await supabase.from('coupons').select(baseFields).gt('closing_date', nowIso).eq('is_open', true).order('created_at', { ascending: false });
          homeRows = (data ?? []) as any[];
          homeRows = homeRows.filter(isHomeLike);
        }
        let pool = homeRows.filter(notThis).filter(active).filter((c) => !isPlusLike(c));
        let backup: any[] = [];
        if (pool.length < 3) {
          const { data } = await supabase.from('coupons').select(baseFields).gt('closing_date', nowIso).eq('is_open', true).order('created_at', { ascending: false });
          backup = ((data ?? []) as any[]).filter(notThis).filter(active).filter((c) => !isPlusLike(c));
        }
        const first = shuffle([...pool]).slice(0, 3);
        const need = 3 - first.length;
        const extra = need > 0 ? shuffle(backup.filter((b) => !first.some((f) => String(f.id) === String(b.id)))).slice(0, need) : [];
        const picked = [...first, ...extra].slice(0, 3);
        if (on) setSimilar(picked as Coupon[]);
      } catch {
        if (on) setSimilar([]);
      }
    })();
    return () => {
      on = false;
    };
  }, [couponId]);

  /** ===== RENDER ===== */
  const Pill = ({ label, color, children }: { label: string; color: 'yes' | 'no'; children?: any }) => (
    <View style={[styles.pill, { backgroundColor: color === 'yes' ? '#EAF1FF' : '#FDEAF1' }]}>
      <Text style={[styles.pillTxt, { color: color === 'yes' ? '#2A55FF' : '#D0146A' }]}>{label}</Text>
      {children}
    </View>
  );

  const LinesBlock = () => {
    const lines = coupon?.lines ?? [];
    if (!lines.length) return null;
    return (
      <View style={{ marginTop: 12 }}>
        {lines.map((l, idx) => {
          const y = typeof l.yesPrice === 'number' ? Math.max(1.01, l.yesPrice) : undefined;
          const n = typeof l.noPrice === 'number' ? Math.max(1.01, l.noPrice) : undefined;
          return (
            <View key={`${coupon?.id}-line-${idx}`} style={styles.lineRow}>
              {l.imageUrl ? <Image source={{ uri: l.imageUrl }} style={styles.lineAvatar} /> : <View style={[styles.lineAvatar, { backgroundColor: '#eee' }]} />}
              <Text style={styles.lineName} numberOfLines={1}>
                {l.name}
              </Text>
              <View style={{ flex: 1 }} />
              <Pill label={`Yes ${y?.toFixed(2) ?? '-'}`} color="yes" />
              <Pill label={`No ${n?.toFixed(2) ?? '-'}`} color="no" />
            </View>
          );
        })}
      </View>
    );
  };

  const HeaderCard = () => {
    const isMulti = coupon?.market_type === 'multi' && (coupon?.lines?.length ?? 0) > 0;
    const y = coupon?.yes_price ? Math.max(1.01, coupon.yes_price) : undefined;
    const n = coupon?.no_price ? Math.max(1.01, coupon.no_price) : undefined;
    return (
      <View style={[styles.card, { marginHorizontal: 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {coupon?.image_url ? <Image source={{ uri: coupon.image_url }} style={styles.hero} /> : <View style={[styles.hero, { backgroundColor: '#eee' }]} />}
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={styles.title}>{coupon?.title}</Text>
            <Text style={styles.meta}>
              {coupon?.category ? `${coupon.category} • ` : ''}Kapanış: {coupon?.closing_date?.split('T')[0]}
            </Text>
          </View>
        </View>
        {!isMulti && (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 14 }}>
              <Pill label={`Yes ${y?.toFixed(2) ?? '-'}`} color="yes" />
              <Pill label={`No ${n?.toFixed(2) ?? '-'}`} color="no" />
            </View>
            <Text style={styles.payoutRow}>YES ≈ {Math.round((y || 0) * 100)} XP • NO ≈ {Math.round((n || 0) * 100)} XP</Text>
          </>
        )}
        {isMulti && <LinesBlock />}
        {!!coupon?.description && (
          <View style={styles.ruleBox}>
            <Text style={styles.ruleTitle}>Kurallar / Özet</Text>
            <Text style={{ color: '#333' }}>{coupon.description}</Text>
          </View>
        )}
        <Text style={{ color: '#888', marginTop: 10 }}>Topluluk kurallarına aykırı içerikleri bildirebilirsin.</Text>
      </View>
    );
  };

  const SectionTag = ({ title }: { title: string }) => (
    <View style={styles.sectionTag}>
      <Text style={styles.sectionTagTxt}>{title}</Text>
    </View>
  );

  const SimilarBlock = () => (
    <>
      <SectionTag title="Benzer Kuponlar" />
      {similar.map((s) => (
        <TouchableOpacity
          key={s.id}
          onPress={() => router.push({ pathname: '/CouponDetail', params: { id: s.id, src: source } })}
          style={styles.simRow}
          activeOpacity={0.85}
        >
          <AsyncThumb path={s.image_url ?? null} style={styles.simThumb} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ fontWeight: '800' }} numberOfLines={2}>
              {s.title}
            </Text>
            <Text style={{ color: '#777', marginTop: 2 }}>Kapanış: {s.closing_date?.split('T')[0]}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', width: 64 }}>
            <Text style={{ color: '#2E7D32', fontWeight: '900' }}>{s.yes_price?.toFixed(2)}</Text>
            <Text style={{ color: '#C62828', fontWeight: '900', marginTop: 4 }}>{s.no_price?.toFixed(2)}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </>
  );

  const submitReport = async (reason: string) => {
    if (!reportingComment) return;
    setReportSending(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        Alert.alert('Giriş gerekli', 'Şikayet etmek için giriş yap.');
        setReportSending(false);
        return;
      }
      await supabase.from('comment_reports').insert({ comment_id: reportingComment.id, reporter_id: uid, reason, extra: null });
      Alert.alert('Teşekkürler', 'Şikayetin alındı.');
      setReportingComment(null);
    } catch (e: any) {
      Alert.alert('Hata', e?.message ?? 'Şikayet kaydedilemedi');
    } finally {
      setReportSending(false);
    }
  };
  const reportComment = (c: VComment) => {
    setReportingComment(c);
  };

  const CommentRow = ({ c, isChild }: { c: VComment; isChild: boolean }) => {
    const counts = countsMap.get(c.id) || { likes: 0, dislikes: 0, my: null };
    const parent = c.parent_id ? byId.get(c.parent_id) : undefined;
    return (
      <View style={[styles.commentRow, { marginLeft: isChild ? 44 : 0 }]}>
        {c.avatar_url ? (
          <Image source={{ uri: c.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontWeight: '800', color: '#888' }}>{(c.full_name ?? 'A').slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.commentUser}>{c.full_name || 'Anonim'}</Text>
            <Text style={{ color: '#888' }}>• {formatWhen(c.created_at)}</Text>
          </View>
          {!!c.content && (
            <Text style={styles.commentText}>
              {isChild && parent?.full_name ? <Text style={{ color: '#3D5AFE', fontWeight: '800' }}>@{parent.full_name} </Text> : null}
              {c.content}
            </Text>
          )}
          {c.image_url && (
            <View style={{ marginTop: 8 }}>
              <AsyncCommentImage path={c.image_url} onPress={(u) => setPreviewUrl(u)} />
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 8, alignItems: 'center' }}>
            <TouchableOpacity
              onPress={() => {
                setReplyTo(c);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
            >
              <Text style={styles.link}>Cevapla</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => toggleReaction(c.id, 'like')}>
              <Text style={[styles.link, { color: '#D32F2F', fontWeight: counts.my === 'like' ? '900' : '800' }]}>❤️ {counts.likes}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => toggleReaction(c.id, 'dislike')}>
              <Text style={[styles.link, { color: '#F9A825', fontWeight: counts.my === 'dislike' ? '900' : '800' }]}>👎 {counts.dislikes}</Text>
            </TouchableOpacity>
            {me?.id === c.user_id && (
              <TouchableOpacity onPress={() => deleteComment(c)}>
                <Text style={[styles.link, { color: '#E53935' }]}>Sil</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => reportComment(c)}>
              <Text style={[styles.link, { color: '#888' }]}>…</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const Thread = ({ root }: { root: VComment }) => {
    const replies = childrenByRoot.get(root.id) ?? [];
    const opened = expandedRoot.has(root.id);
    const visible = opened ? replies : replies.slice(0, 2);
    return (
      <>
        <CommentRow c={root} isChild={false} />
        {visible.map((r) => (
          <CommentRow key={r.id} c={r} isChild={true} />
        ))}
        {replies.length > 2 && (
          <TouchableOpacity onPress={() => toggleRoot(root.id)} style={{ marginLeft: 44, marginTop: 6 }}>
            <Text style={[styles.link, { color: '#666' }]}>{opened ? 'Yanıtları gizle' : `Yanıtları göster (${replies.length - 2})`}</Text>
          </TouchableOpacity>
        )}
      </>
    );
  };

  const bottomOffset = Math.max(insets.bottom, BAR_MARGIN) + BAR_MIN_HEIGHT + 8;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <FlatList
          ref={listRef}
          data={roots}
          keyExtractor={(it) => it.id}
          keyboardShouldPersistTaps="handled"
          onRefresh={loadComments}
          refreshing={refreshing}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: bottomOffset + 120 }}
          ListHeaderComponent={
            <>
              <View style={{ height: 10 }} />
              <HeaderCard />
              <SectionTag title="Yorumlar" />
              {roots.length === 0 && (
                <View style={styles.emptyHint}>
                  {me?.avatar ? (
                    <Image source={{ uri: me.avatar }} style={[styles.avatar, { marginRight: 10 }]} />
                  ) : (
                    <View style={[styles.avatar, { backgroundColor: '#eee', marginRight: 10, alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ fontWeight: '800', color: '#888' }}>{(me?.name ?? 'S')[0]?.toUpperCase?.() ?? 'S'}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800' }}>{me?.name || 'Sen'}</Text>
                    <Text style={{ color: '#666', marginTop: 2 }}>İlk yorumu sen yaz! </Text>
                  </View>
                </View>
              )}
            </>
          }
          renderItem={({ item }) => <Thread root={item} />}
          ListFooterComponent={<SimilarBlock />}
          showsVerticalScrollIndicator={false}
        />

        {/* composer: sistem resize ile yukarı kalkacak */}
        <View
          style={[
            styles.modernComposer,
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              paddingBottom: bottomOffset,
            },
          ]}
        >
          {(replyTo || commentImageLocal) && (
            <View style={styles.composerPreviewContainer}>
              {replyTo && (
                <View style={styles.replyPreview}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: BRAND, fontWeight: '800' }}>Yanıtlanıyor: {replyTo.full_name}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 12, color: '#444', marginTop: 2 }}>
                      {replyTo.content}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setReplyTo(null)}>
                    <Ionicons name="close-circle" size={20} color="#999" />
                  </TouchableOpacity>
                </View>
              )}

              {commentImageLocal && (
                <View style={styles.imagePreview}>
                  <Image source={{ uri: commentImageLocal }} style={{ width: 48, height: 48, borderRadius: 8 }} />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#333' }}>Fotoğraf eklendi</Text>
                    <TouchableOpacity onPress={clearCommentImage}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#E53935', marginTop: 2 }}>Kaldır</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          <View style={styles.composerInputRow}>
            <TouchableOpacity onPress={pickCommentImage} disabled={uploading} style={styles.iconButton}>
              {uploading ? (
                <Animated.View>
                  <Ionicons name="sync" size={24} color="#888" />
                </Animated.View>
              ) : (
                <Ionicons name="camera-outline" size={26} color="#444" />
              )}
            </TouchableOpacity>

            <View style={styles.inputContainer}>
              <TextInput
                ref={inputRef}
                value={newComment}
                onChangeText={setNewComment}
                placeholder="Bir şeyler yaz..."
                placeholderTextColor="#999"
                multiline
                style={styles.modernInput}
              />
            </View>

            <TouchableOpacity
              disabled={uploading || (!newComment.trim() && !commentImagePath)}
              onPress={sendComment}
              style={[styles.sendButtonCircle, { backgroundColor: newComment.trim() || commentImagePath ? BRAND : '#F0F2F5' }]}
            >
              <Ionicons name="arrow-up" size={20} color={newComment.trim() || commentImagePath ? '#fff' : '#BBB'} />
            </TouchableOpacity>
          </View>
        </View>

        {/* IMAGE PREVIEW MODAL */}
        <Modal visible={!!previewUrl} transparent animationType="fade" onRequestClose={() => setPreviewUrl(null)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' }}>
            {previewUrl && (
              <TouchableOpacity
                style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}
                activeOpacity={1}
                onPress={() => setPreviewUrl(null)}
              >
                <Image source={{ uri: previewUrl }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
              </TouchableOpacity>
            )}
          </View>
        </Modal>

        {/* REPORT MODAL */}
        <Modal visible={!!reportingComment} transparent animationType="fade" onRequestClose={() => { if (!reportSending) setReportingComment(null); }}>
          <Pressable onPress={() => { if (!reportSending) setReportingComment(null); }} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
            <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '86%', borderRadius: 16, backgroundColor: '#fff', padding: 16 }}>
              <Text style={{ fontWeight: '900', fontSize: 18, marginBottom: 4 }}>Bu yorumu bildir</Text>
              {reportingComment?.content ? <Text style={{ color: '#555', marginBottom: 12 }} numberOfLines={3}>“{reportingComment.content}”</Text> : null}
              <Text style={{ color: '#777', marginBottom: 10 }}>Sebep seç:</Text>
              {['Hakaret/nefret', 'Spam', 'Yasadışı içerik', 'Yanlış bilgi'].map((reason) => (
                <TouchableOpacity key={reason} disabled={reportSending} onPress={() => submitReport(reason)} style={{ paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: '#eee', marginBottom: 8, backgroundColor: '#fafafa' }}>
                  <Text style={{ fontWeight: '800', color: '#333' }}>{reason}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity disabled={reportSending} onPress={() => { if (!reportSending) setReportingComment(null); }} style={{ marginTop: 8, paddingVertical: 10, borderRadius: 10, alignItems: 'center' }}>
                <Text style={{ fontWeight: '800', color: '#666' }}>Vazgeç</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        <SpinnerLogo visible={uploading} />
      </View>
    </KeyboardAvoidingView>
  );
}

/** ========= STYLES ========= */
const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 14, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  hero: { width: 64, height: 64, borderRadius: 12 },
  title: { fontSize: 20, fontWeight: '900' },
  meta: { color: '#666', marginTop: 6 },
  pill: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },
  pillTxt: { fontWeight: '900' },
  payoutRow: { textAlign: 'center', fontWeight: '900', color: '#666', marginTop: 10 },
  ruleBox: { backgroundColor: BRAND_FAINT, borderWidth: 1, borderColor: '#FFD8B2', borderRadius: 12, padding: 12, marginTop: 12 },
  ruleTitle: { fontWeight: '900', color: BRAND, marginBottom: 6 },
  sectionTag: { backgroundColor: BRAND_FAINT, borderWidth: 1, borderColor: '#FFD8B2', marginHorizontal: 16, marginTop: 14, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 },
  sectionTagTxt: { fontWeight: '900', color: BRAND, fontSize: 16 },
  simRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#fff' },
  simThumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: '#eee' },
  commentRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  commentUser: { fontWeight: '800' },
  commentText: { color: '#333', marginTop: 2 },
  avatarMe: { width: 36, height: 36, borderRadius: 18 },
  link: { color: '#3D5AFE', fontWeight: '800' },
  emptyHint: { marginHorizontal: 16, marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#eee', flexDirection: 'row', alignItems: 'center' },
  spinnerWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee', marginBottom: 8 },
  lineAvatar: { width: 36, height: 36, borderRadius: 18 },
  lineName: { fontWeight: '800', maxWidth: 140 },

  modernComposer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  composerPreviewContainer: {
    marginBottom: 8,
    gap: 8,
  },
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F9FC',
    padding: 8,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: BRAND,
  },
  imagePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F9FC',
    padding: 8,
    borderRadius: 12,
  },
  composerInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  inputContainer: {
    flex: 1,
    backgroundColor: '#F0F2F5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 4,
    minHeight: 40,
    justifyContent: 'center',
  },
  modernInput: {
    color: '#000',
    fontSize: 15,
    maxHeight: 100,
    paddingTop: 10,
    paddingBottom: 10,
  },
  sendButtonCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
});
