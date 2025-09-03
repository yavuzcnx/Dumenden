// app/CouponDetail.tsx
'use client';

import { BAR_MARGIN, BAR_MIN_HEIGHT } from '@/components/ui/layout';
import { supabase } from '@/lib/supabaseClient';
import { decode as atob } from 'base-64';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Platform,
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
const LOGO = null as unknown as number; // istersen kendi logonu bağla

/** ========= UTILS ========= */
const cacheBust = (u: string) => (u.includes('?') ? `${u}&t=${Date.now()}` : `${u}?t=${Date.now()}`);
const urlCache = new Map<string, string>();

async function resolveUrl(raw?: string | null): Promise<string | null> {
  if (!raw) return null;
  if (raw.startsWith('http')) {
    if (urlCache.has(raw)) return urlCache.get(raw)!;
    const u = cacheBust(raw);
    urlCache.set(raw, u);
    return u;
  }
  if (urlCache.has(raw)) return urlCache.get(raw)!;

  const pub = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(raw).data?.publicUrl ?? null;
  let url: string | null = pub;
  if (!url) {
    const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(raw, 60 * 60);
    url = data?.signedUrl ?? null;
  }
  if (url) {
    const u = cacheBust(url);
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
const contentType = (ext: string) =>
  ext === 'jpg' ? 'image/jpeg' : ext === 'heic' ? 'image/heic' : `image/${ext}`;

async function uploadToMediaBucket(uri: string, path: string) {
  const ext = guessExt(uri);
  const ct = contentType(ext);
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: ct });
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
  const pad = (n: number) => (n < 10 ? `0${n}` : n);
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
type Coupon = {
  id: string;
  title: string;
  closing_date: string;
  description?: string;
  image_url?: string | null;
  yes_price?: number;
  no_price?: number;
  category?: string;
  is_open?: boolean | null;
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

/** ========= SCREEN ========= */
export default function CouponDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const couponId = (Array.isArray(id) ? id[0] : id || '').toString();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  /** keyboard push */
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s1 = Keyboard.addListener(showEvt, (e) => setKb(e.endCoordinates?.height ?? 0));
    const s2 = Keyboard.addListener(hideEvt, () => setKb(0));
    return () => {
      s1.remove();
      s2.remove();
    };
  }, []);

  /** me */
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

  /** coupon */
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  useEffect(() => {
    if (!couponId) return;
    let alive = true;
    (async () => {
      const { data } = await supabase.from('coupons').select('*').eq('id', couponId).single();
      if (alive && data) setCoupon(data as any);
    })();
    const ch = supabase
      .channel(`coupon-${couponId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'coupons', filter: `id=eq.${couponId}` },
        (payload) => {
          // @ts-ignore
          if (payload?.eventType === 'DELETE') {
            Alert.alert('Bilgi', 'Bu market kaldırıldı.');
            router.back();
          } else if ((payload as any)?.new) {
            setCoupon((payload as any).new as Coupon);
          }
        }
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [couponId, router]);

  /** comments + reactions */
  const [comments, setComments] = useState<VComment[]>([]);
  const [countsMap, setCountsMap] = useState<Map<string, Counts>>(new Map());
  const listRef = useRef<FlatList<any>>(null);
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
    const { data } = await supabase
      .from('v_comments')
      .select('*')
      .eq('coupon_id', couponId)
      .order('created_at', { ascending: true });
    const rows = (data ?? []) as VComment[];
    setComments(rows);
    setRefreshing(false);
    await fetchCounts(rows.map((r) => r.id), me?.id);
  }, [couponId, fetchCounts, me?.id]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // realtime comments only
  useEffect(() => {
    if (!couponId) return;
    const ch = supabase
      .channel(`comments-${couponId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: `coupon_id=eq.${couponId}` },
        async (payload) => {
          const row = payload.new as any;
          const { data: meta } = await supabase
            .from('users')
            .select('full_name, avatar_url')
            .eq('id', row.user_id)
            .single();
          setComments((prev) => (prev.some((x) => x.id === row.id) ? prev : [...prev, { ...row, ...meta }]));
          fetchCounts([row.id], me?.id);
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'comments', filter: `coupon_id=eq.${couponId}` },
        (payload) => {
          const delId = (payload.old as any).id as string;
          setComments((prev) => prev.filter((c) => c.id !== delId));
          setCountsMap((prev) => {
            const n = new Map(prev);
            n.delete(delId);
            return n;
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [couponId, fetchCounts, me?.id]);

  /** toggle like/dislike (optimistic + rollback) */
  const toggleReaction = async (commentId: string, type: Reaction) => {
    if (!me?.id) return Alert.alert('Giriş gerekli', 'Beğenmek için giriş yap.');

    const current = countsMap.get(commentId)?.my ?? null;

    // optimistic UI
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
        await supabase
          .from('comments_likes')
          .upsert({ comment_id: commentId, user_id: me.id, type }, { onConflict: 'comment_id,user_id' });
      }
    } catch (e: any) {
      await fetchCounts([commentId], me.id);
    }
  };

  /** compose */
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<VComment | null>(null);
  const [commentImageLocal, setCommentImageLocal] = useState<string | null>(null);
  const [commentImagePath, setCommentImagePath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const pickCommentImage = async () => {
    Keyboard.dismiss();
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return Alert.alert('İzin gerekli', 'Fotoğraf galerisine erişim izni ver.');
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: (ImagePicker as any).MediaType ? [(ImagePicker as any).MediaType.Images] : ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.9,
    });
    if (res.canceled) return;
    const asset = res.assets?.[0];
    if (!asset?.uri) return;
    setCommentImageLocal(asset.uri);
    setUploading(true);
    try {
      const ext = guessExt(asset.uri);
      const path = `comments/${couponId}/${uid()}.${ext}`;
      const stored = await uploadToMediaBucket(asset.uri, path);
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
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 0);
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

  /** tree */
  const tree = useMemo(() => {
    const roots: VComment[] = [];
    const children = new Map<string, VComment[]>();
    comments.forEach((c) => {
      if (c.parent_id) {
        const arr = children.get(c.parent_id) ?? [];
        arr.push(c);
        children.set(c.parent_id, arr);
      } else roots.push(c);
    });
    return { roots, children };
  }, [comments]);

  /** similar coupons (altta, PLUS filtreli) */
  const [similar, setSimilar] = useState<Coupon[]>([]);
  useEffect(() => {
    let on = true;
    (async () => {
      if (!coupon?.category) return setSimilar([]);
      const { data } = await supabase
        .from('coupons')
        .select(`
          id, title, closing_date, image_url, yes_price, no_price, category,
          users!inner ( is_plus )
        `)
        .neq('id', couponId)
        .eq('category', coupon.category)
        .eq('users.is_plus', false) // PLUS değil
        .order('created_at', { ascending: false })
        .limit(3);
      if (on) setSimilar((data ?? []) as any);
    })();
    return () => {
      on = false;
    };
  }, [coupon?.category, couponId]);

  /** ===== RENDER ===== */
  const HeaderCard = () => (
    <View style={[styles.card, { marginHorizontal: 16 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <AsyncThumb path={coupon?.image_url ?? null} style={styles.hero} />
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={styles.title}>{coupon?.title}</Text>
          <Text style={styles.meta}>
            {coupon?.category ? `${coupon.category} • ` : ''}Kapanış: {coupon?.closing_date?.split('T')[0]}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 16 }}>
        <View style={[styles.pill, { backgroundColor: '#2E7D32' }]}>
          <Text style={styles.pillTxt}>YES {coupon?.yes_price?.toFixed(2)}</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: '#C62828' }]}>
          <Text style={styles.pillTxt}>NO {coupon?.no_price?.toFixed(2)}</Text>
        </View>
      </View>

      <Text style={styles.payoutRow}>
        YES ≈ {Math.round((coupon?.yes_price || 0) * 100)} XP / NO ≈ {Math.round((coupon?.no_price || 0) * 100)} XP
      </Text>

      {!!coupon?.description && (
        <View style={styles.ruleBox}>
          <Text style={styles.ruleTitle}>Kurallar / Özet</Text>
          <Text style={{ color: '#333' }}>{coupon.description}</Text>
        </View>
      )}
    </View>
  );

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
          onPress={() => router.push(`/CouponDetail?id=${s.id}`)}
          style={styles.simRow}
          activeOpacity={0.8}
        >
          <AsyncThumb path={s.image_url ?? null} style={styles.simThumb} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ fontWeight: '800' }}>{s.title}</Text>
            <Text style={{ color: '#777', marginTop: 2 }}>Kapanış: {s.closing_date?.split('T')[0]}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: '#2E7D32', fontWeight: '900' }}>{s.yes_price?.toFixed(2)}</Text>
            <Text style={{ color: '#C62828', fontWeight: '900', marginTop: 4 }}>{s.no_price?.toFixed(2)}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </>
  );

  const CommentItem = ({ c, depth = 0 }: { c: VComment; depth?: number }) => {
    const counts = countsMap.get(c.id) || { likes: 0, dislikes: 0, my: null };
    return (
      <View style={[styles.commentRow, { marginLeft: depth ? 12 : 0 }]}>
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

          {!!c.content && <Text style={styles.commentText}>{c.content}</Text>}

          {c.image_url && (
            <View style={{ marginTop: 8 }}>
              <AsyncCommentImage path={c.image_url} onPress={(u) => setPreviewUrl(u)} />
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 16, marginTop: 8, alignItems: 'center' }}>
            <TouchableOpacity onPress={() => setReplyTo(c)}>
              <Text style={styles.link}>Cevapla</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => toggleReaction(c.id, 'like')}>
              <Text
                style={[
                  styles.link,
                  { color: '#D32F2F', fontWeight: counts.my === 'like' ? '900' : '800' },
                ]}
              >
                ❤️ {counts.likes}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => toggleReaction(c.id, 'dislike')}>
              <Text
                style={[
                  styles.link,
                  { color: '#F9A825', fontWeight: counts.my === 'dislike' ? '900' : '800' },
                ]}
              >
                👎 {counts.dislikes}
              </Text>
            </TouchableOpacity>

            {me?.id === c.user_id && (
              <TouchableOpacity onPress={() => deleteComment(c)}>
                <Text style={[styles.link, { color: '#E53935' }]}>Sil</Text>
              </TouchableOpacity>
            )}
          </View>

          {(tree.children.get(c.id) ?? []).map((ch) => (
            <CommentItem key={ch.id} c={ch} depth={depth + 1} />
          ))}
        </View>
      </View>
    );
  };

  // composer’ı alt barın üstüne cuk oturtmak için offset
  const bottomOffset = Math.max(insets.bottom, BAR_MARGIN) + BAR_MIN_HEIGHT + 8;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        data={tree.roots}
        keyExtractor={(it) => it.id}
        keyboardShouldPersistTaps="handled"
        onRefresh={loadComments}
        refreshing={refreshing}
        contentContainerStyle={{
          // liste sonuna bar + composer kadar yer bırak
          paddingBottom: (kb ? kb : bottomOffset) + 92,
        }}
        ListHeaderComponent={
          <>
            <TouchableOpacity onPress={() => router.back()} style={{ padding: 16 }}>
              <Text style={{ color: BRAND, fontWeight: '800' }}>← Geri</Text>
            </TouchableOpacity>

            <HeaderCard />

            <SectionTag title="Yorumlar" />
            {tree.roots.length === 0 && (
              <View style={styles.emptyHint}>
                <View style={[styles.avatar, { backgroundColor: '#eee', marginRight: 10 }]} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800' }}>{me?.name || 'Sen'}</Text>
                  <Text style={{ color: '#666', marginTop: 2 }}>İlk yorumu sen yaz! Foto da ekleyebilirsin 🧡</Text>
                </View>
              </View>
            )}
          </>
        }
        renderItem={({ item }) => <CommentItem c={item} />}
        ListFooterComponent={<SimilarBlock />}
        showsVerticalScrollIndicator={false}
      />

      {/* COMPOSER — alt barın üstüne dock */}
      <View
        style={[
          styles.composerDock,
          { bottom: kb ? kb : bottomOffset },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          {me?.avatar ? (
            <Image source={{ uri: me.avatar }} style={styles.avatarMe} />
          ) : (
            <View style={[styles.avatarMe, { backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontWeight: '800', color: '#888' }}>
                {(me?.name ?? 'S')[0]?.toUpperCase?.() ?? 'S'}
              </Text>
            </View>
          )}

          <View style={{ flex: 1 }}>
            <TextInput
              value={newComment}
              onChangeText={setNewComment}
              placeholder="Yorumunu yaz…"
              style={styles.input}
              placeholderTextColor="#999"
              multiline
            />

            {replyTo && (
              <View style={styles.replyBar}>
                <Text style={{ fontWeight: '700' }}>Cevaplanan: {replyTo.full_name || 'Anonim'}</Text>
                <TouchableOpacity onPress={() => setReplyTo(null)}>
                  <Text style={{ color: '#E53935', fontWeight: '700' }}>İptal</Text>
                </TouchableOpacity>
              </View>
            )}

            {commentImageLocal ? (
              <View style={{ marginTop: 8, alignItems: 'flex-start' }}>
                <Image source={{ uri: commentImageLocal }} style={{ width: 120, height: 120, borderRadius: 8 }} />
                <TouchableOpacity onPress={clearCommentImage} style={{ marginTop: 6 }}>
                  <Text style={{ color: '#E53935', fontWeight: '800' }}>Fotoğrafı kaldır</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity disabled={uploading} onPress={pickCommentImage} style={{ marginTop: 8 }}>
                <Text style={{ color: '#3D5AFE', fontWeight: '800' }}>{uploading ? 'Yükleniyor…' : 'Fotoğraf ekle'}</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            onPress={sendComment}
            style={styles.sendFab}
            disabled={uploading || (!newComment.trim() && !commentImagePath)}
          >
            <Text style={{ color: '#fff', fontWeight: '900' }}>Gönder</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* IMAGE PREVIEW */}
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

      <SpinnerLogo visible={uploading} />
    </View>
  );
}

/** ========= STYLES ========= */
const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  hero: { width: 64, height: 64, borderRadius: 12 },
  title: { fontSize: 20, fontWeight: '900' },
  meta: { color: '#666', marginTop: 6 },
  pill: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  pillTxt: { color: '#fff', fontWeight: '900' },
  payoutRow: { textAlign: 'center', fontWeight: '900', color: '#666', marginTop: 10 },

  ruleBox: {
    backgroundColor: BRAND_FAINT,
    borderWidth: 1,
    borderColor: '#FFD8B2',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  ruleTitle: { fontWeight: '900', color: BRAND, marginBottom: 6 },

  sectionTag: {
    backgroundColor: BRAND_FAINT,
    borderWidth: 1,
    borderColor: '#FFD8B2',
    marginHorizontal: 16,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  sectionTagTxt: { fontWeight: '900', color: BRAND, fontSize: 16 },

  simRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  simThumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: '#eee' },

  commentRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  commentUser: { fontWeight: '800' },
  commentText: { color: '#333', marginTop: 2 },

  avatarMe: { width: 36, height: 36, borderRadius: 18 },

  // composer: alt barın üstüne dock
  composerDock: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eee',
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 8 },
    }),
  },

  input: {
    borderWidth: 1,
    borderColor: BRAND,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    minHeight: 42,
    backgroundColor: '#fff',
  },
  sendFab: {
    backgroundColor: BRAND,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },

  link: { color: '#3D5AFE', fontWeight: '800' },
  replyBar: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  emptyHint: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
  },

  spinnerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
