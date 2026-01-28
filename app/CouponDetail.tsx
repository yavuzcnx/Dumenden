'use client';

import { supabase } from '@/lib/supabaseClient';
import { Ionicons } from '@expo/vector-icons';
import { decode as atob } from 'base-64';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
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
      <Image source={{ uri: u }} style={{ width: '100%', height: 200, borderRadius: 12, marginTop: 8 }} resizeMode="cover" />
    </TouchableOpacity>
  );
};

const SpinnerLogo = ({ visible }: { visible: boolean }) => {
  if (!visible) return null;
  return (
    <View style={styles.spinnerWrap}>
      <ActivityIndicator size="large" color="#fff" />
      <Text style={{ color: '#fff', fontWeight: '800', marginTop: 12 }}>Yükleniyor...</Text>
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

  // 🔥 EKSİK OLAN ŞİKAYET FONKSİYONLARI EKLENDİ
  const reportComment = (c: VComment) => {
    setReportingComment(c);
  };

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
      await supabase.from('comment_reports').insert({ 
          comment_id: reportingComment.id, 
          reporter_id: uid, 
          reason, 
          extra: null 
      });
      Alert.alert('Teşekkürler', 'Şikayetin alındı.');
      setReportingComment(null);
    } catch (e: any) {
      Alert.alert('Hata', e?.message ?? 'Şikayet kaydedilemedi');
    } finally {
      setReportSending(false);
    }
  };

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

  /** ===== RENDER COMPONENTS ===== */
  
  // 🔥 SEXY HEADER (Hero Image + Gradient + Modern Info)
  const SexyHeader = () => {
    const isMulti = coupon?.market_type === 'multi' && (coupon?.lines?.length ?? 0) > 0;
    
    return (
      <View style={styles.headerContainer}>
          <View style={styles.heroWrapper}>
              {coupon?.image_url ? (
                  <Image source={{ uri: coupon.image_url }} style={styles.heroImage} resizeMode="cover" />
              ) : (
                  <View style={[styles.heroImage, { backgroundColor: '#ddd' }]} />
              )}
              {/* Karartma Gradyanı */}
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.heroGradient} />
              
              <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { top: insets.top + 10 }]}>
                  <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
          </View>

          <View style={styles.infoContainer}>
              <View style={styles.catBadge}>
                  <Text style={styles.catText}>{coupon?.category || 'Genel'}</Text>
              </View>
              <Text style={styles.couponTitle}>{coupon?.title}</Text>
              <Text style={styles.couponDate}>
                  <Ionicons name="time-outline" size={14} color="#ccc" /> Kapanış: {coupon?.closing_date?.split('T')[0]}
              </Text>
          </View>

          {!isMulti && (
            <View style={styles.oddsContainer}>
                <TouchableOpacity style={[styles.oddCard, { backgroundColor: '#E8F5E9', borderColor: '#C8E6C9' }]}>
                    <Text style={[styles.oddLabel, { color: '#2E7D32' }]}>YES</Text>
                    <Text style={[styles.oddValue, { color: '#1B5E20' }]}>{coupon?.yes_price?.toFixed(2)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.oddCard, { backgroundColor: '#FFEBEE', borderColor: '#FFCDD2' }]}>
                    <Text style={[styles.oddLabel, { color: '#C62828' }]}>NO</Text>
                    <Text style={[styles.oddValue, { color: '#B71C1C' }]}>{coupon?.no_price?.toFixed(2)}</Text>
                </TouchableOpacity>
            </View>
          )}

          {isMulti && <LinesBlock />}

          {!!coupon?.description && (
              <View style={styles.descContainer}>
                  <Text style={styles.descTitle}>Detaylar</Text>
                  <Text style={styles.descText}>{coupon.description}</Text>
              </View>
          )}
          
          <Text style={styles.communityNote}>Topluluk kurallarına aykırı içerikleri bildirebilirsin.</Text>
      </View>
    );
  };

  const LinesBlock = () => {
    const lines = coupon?.lines ?? [];
    if (!lines.length) return null;
    return (
      <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
        {lines.map((l, idx) => {
          const y = typeof l.yesPrice === 'number' ? Math.max(1.01, l.yesPrice) : undefined;
          const n = typeof l.noPrice === 'number' ? Math.max(1.01, l.noPrice) : undefined;
          return (
            <View key={`${coupon?.id}-line-${idx}`} style={styles.lineRow}>
              {l.imageUrl ? <Image source={{ uri: l.imageUrl }} style={styles.lineAvatar} /> : <View style={[styles.lineAvatar, { backgroundColor: '#eee' }]} />}
              <Text style={styles.lineName} numberOfLines={1}>{l.name}</Text>
              <View style={{ flex: 1 }} />
              <View style={[styles.miniPill, {backgroundColor:'#E8F5E9'}]}><Text style={{color:'#2E7D32', fontWeight:'800'}}>Y {y?.toFixed(2)}</Text></View>
              <View style={[styles.miniPill, {backgroundColor:'#FFEBEE'}]}><Text style={{color:'#C62828', fontWeight:'800'}}>N {n?.toFixed(2)}</Text></View>
            </View>
          );
        })}
      </View>
    );
  };

  const SimilarBlock = () => (
    <View style={{marginTop: 20, marginBottom: 20}}>
      <View style={styles.sectionHeader}>
         <Text style={styles.sectionTitle}>Benzer Kuponlar</Text>
      </View>
      {similar.map((s) => (
        <TouchableOpacity
          key={s.id}
          onPress={() => router.push({ pathname: '/CouponDetail', params: { id: s.id, src: source } })}
          style={styles.simRow}
          activeOpacity={0.85}
        >
          <AsyncThumb path={s.image_url ?? null} style={styles.simThumb} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontWeight: '800', fontSize:14 }} numberOfLines={2}>{s.title}</Text>
            <Text style={{ color: '#777', marginTop: 2, fontSize:12 }}>Kapanış: {s.closing_date?.split('T')[0]}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', width: 64 }}>
            <Text style={{ color: '#2E7D32', fontWeight: '900' }}>{s.yes_price?.toFixed(2)}</Text>
            <Text style={{ color: '#C62828', fontWeight: '900', marginTop: 4 }}>{s.no_price?.toFixed(2)}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );

  const CommentItem = ({ item, isChild }: { item: VComment, isChild: boolean }) => {
    const counts = countsMap.get(item.id) || { likes: 0, dislikes: 0, my: null };
    const parent = item.parent_id ? byId.get(item.parent_id) : undefined;

    return (
      <View style={[styles.commentItem, isChild && { paddingLeft: 40 }]}>
          <Image source={{ uri: item.avatar_url || 'https://via.placeholder.com/100' }} style={styles.commentAvatar} />
          <View style={styles.commentBubble}>
              <View style={styles.commentHeader}>
                  <Text style={styles.commentAuthor}>{item.full_name || 'Anonim'}</Text>
                  <Text style={styles.commentTime}>{formatWhen(item.created_at)}</Text>
              </View>
              <Text style={styles.commentContent}>
                 {isChild && parent ? <Text style={{color: BRAND, fontWeight:'800'}}>@{parent.full_name} </Text> : null}
                 {item.content}
              </Text>
              {item.image_url && <AsyncCommentImage path={item.image_url} onPress={(u) => setPreviewUrl(u)} />}
              
              <View style={styles.commentActions}>
                  <TouchableOpacity onPress={() => { setReplyTo(item); setTimeout(() => inputRef.current?.focus(), 0); }} style={styles.actionBtn}>
                      <Text style={styles.actionText}>Yanıtla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => toggleReaction(item.id, 'like')} style={{flexDirection:'row', alignItems:'center', gap:4}}>
                      <Ionicons name={counts.my === 'like' ? "heart" : "heart-outline"} size={16} color="#D32F2F" />
                      <Text style={[styles.actionText, {color:'#D32F2F'}]}>{counts.likes}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => toggleReaction(item.id, 'dislike')} style={{flexDirection:'row', alignItems:'center', gap:4}}>
                      <Ionicons name={counts.my === 'dislike' ? "thumbs-down" : "thumbs-down-outline"} size={16} color="#F9A825" />
                      <Text style={[styles.actionText, {color:'#F9A825'}]}>{counts.dislikes}</Text>
                  </TouchableOpacity>
                  {me?.id === item.user_id && (
                      <TouchableOpacity onPress={() => deleteComment(item)}>
                          <Text style={[styles.actionText, { color: '#E53935' }]}>Sil</Text>
                      </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => reportComment(item)}>
                      <Ionicons name="ellipsis-horizontal" size={16} color="#999" />
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
      <View>
        <CommentItem item={root} isChild={false} />
        {visible.map((r) => (
          <CommentItem key={r.id} item={r} isChild={true} />
        ))}
        {replies.length > 2 && (
          <TouchableOpacity onPress={() => toggleRoot(root.id)} style={{ marginLeft: 56, marginBottom: 10 }}>
            <Text style={{ color: '#666', fontWeight: '700', fontSize: 13 }}>
                {opened ? 'Yanıtları gizle' : `Diğer yanıtları gör (${replies.length - 2})`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const bottomPosition = keyboardVisible ? 0 : 90;
  const horizontalMargin = keyboardVisible ? 0 : 16;
  const borderRad = keyboardVisible ? 0 : 24;

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1, backgroundColor: '#F8F9FA' }} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0} 
    >
      <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
        <StatusBar barStyle="light-content" />
        <FlatList
          ref={listRef}
          data={roots}
          keyExtractor={(it) => it.id}
          keyboardShouldPersistTaps="handled"
          onRefresh={loadComments}
          refreshing={refreshing}
          contentContainerStyle={{ paddingBottom: 180 }}
          ListHeaderComponent={
            <>
              <SexyHeader />
              <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Yorumlar</Text></View>
              {roots.length === 0 && (
                <View style={styles.emptyHint}>
                  <Text style={{ color: '#666', fontStyle:'italic' }}>Henüz yorum yok. İlk sen yaz!</Text>
                </View>
              )}
            </>
          }
          renderItem={({ item }) => <Thread root={item} />}
          ListFooterComponent={<SimilarBlock />}
          showsVerticalScrollIndicator={false}
        />

        {/* COMPOSER */}
        <View
          style={[
            styles.sexyComposer,
            {
              position: 'absolute',
              left: horizontalMargin, 
              right: horizontalMargin,
              bottom: bottomPosition,
              borderRadius: borderRad,
              borderWidth: keyboardVisible ? 0 : 2, 
              borderColor: BRAND,
            },
          ]}
        >
          {(replyTo || commentImageLocal) && (
            <View style={styles.composerPreviewContainer}>
              {replyTo && (
                <View style={styles.replyPreview}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: BRAND, fontWeight: '800' }}>Yanıtlanıyor: {replyTo.full_name}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 12, color: '#444', marginTop: 2 }}>{replyTo.content}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setReplyTo(null)}>
                    <Ionicons name="close-circle" size={20} color="#999" />
                  </TouchableOpacity>
                </View>
              )}
              {commentImageLocal && (
                <View style={styles.imagePreview}>
                  <Image source={{ uri: commentImageLocal }} style={{ width: 40, height: 40, borderRadius: 8 }} />
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
              {uploading ? <ActivityIndicator color={BRAND} /> : <Ionicons name="camera" size={26} color="#666" />}
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
              style={[styles.sendButtonCircle, { backgroundColor: newComment.trim() || commentImagePath ? BRAND : '#FFE0B2' }]}
            >
              <Ionicons name="arrow-up" size={20} color={newComment.trim() || commentImagePath ? '#fff' : '#fff'} />
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
                <TouchableOpacity style={{position:'absolute', top:50, right:20}} onPress={()=>setPreviewUrl(null)}>
                    <Ionicons name="close" size={32} color="#fff" />
                </TouchableOpacity>
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

/** ========= SEXY STYLES ========= */
const styles = StyleSheet.create({
  // HEADER
  headerContainer: { backgroundColor: '#fff', borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden', marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  heroWrapper: { height: 280, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  heroGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 140 },
  backBtn: { position: 'absolute', left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  
  infoContainer: { padding: 20, marginTop: -60 },
  catBadge: { backgroundColor: BRAND, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginBottom: 8 },
  catText: { color: '#fff', fontWeight: '800', fontSize: 12, textTransform: 'uppercase' },
  couponTitle: { color: '#fff', fontSize: 24, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  couponDate: { color: '#eee', marginTop: 4, fontSize: 13, fontWeight: '600' },

  // ODDS
  oddsContainer: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 20 },
  oddCard: { flex: 1, padding: 16, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  oddLabel: { fontSize: 14, fontWeight: '900', marginBottom: 4 },
  oddValue: { fontSize: 22, fontWeight: '900' },

  // DESC & LINES
  descContainer: { paddingHorizontal: 20, paddingBottom: 10 },
  descTitle: { fontSize: 16, fontWeight: '800', color: '#333', marginBottom: 6 },
  descText: { fontSize: 14, color: '#666', lineHeight: 20 },
  communityNote: { paddingHorizontal: 20, paddingBottom: 20, color: '#999', fontSize: 12 },
  
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  lineAvatar: { width: 36, height: 36, borderRadius: 18 },
  lineName: { fontWeight: '800', maxWidth: 140, fontSize: 13, color:'#333' },
  miniPill: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },

  // COMMENTS & SECTION
  sectionHeader: { paddingHorizontal: 20, marginBottom: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#333' },
  emptyHint: { padding: 20, alignItems: 'center' },

  commentItem: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 12 },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10, marginTop: 4 },
  commentBubble: { flex: 1, backgroundColor: '#fff', borderRadius: 16, borderTopLeftRadius: 4, padding: 12, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 2 },
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  commentAuthor: { fontWeight: '800', color: '#333', fontSize: 13 },
  commentTime: { color: '#999', fontSize: 11 },
  commentContent: { color: '#444', fontSize: 14, lineHeight: 19 },
  commentActions: { flexDirection: 'row', marginTop: 8, gap: 16, alignItems: 'center' },
  actionBtn: {},
  actionText: { fontSize: 12, fontWeight: '700', color: '#666' },
  link: { color: '#666', fontWeight:'700' }, // toggleRoot için gerekli

  // SIMILAR
  simRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  simThumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: '#eee' },

  // COMPOSER (Floating & Sexy)
  sexyComposer: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 999,
  },
  composerPreviewContainer: { marginBottom: 8, gap: 8 },
  replyPreview: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF2E6', padding: 8, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: BRAND },
  imagePreview: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F7F9FC', padding: 8, borderRadius: 12 },
  composerInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  inputContainer: { flex: 1, backgroundColor: '#F7F7F7', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4, minHeight: 40, justifyContent: 'center' },
  modernInput: { color: '#000', fontSize: 15, maxHeight: 100, paddingTop: 10, paddingBottom: 10 },
  sendButtonCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },

  // MODAL & SPINNER
  spinnerWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
});