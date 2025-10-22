// lib/resolveStorageUrlSmart.ts
import { supabase } from '@/lib/supabaseClient';

// Hem 'Media' hem 'media' denenir (case-sensitive sorunları için)
const STORAGE_BUCKETS = ['Media', 'media'];

function cleanKey(raw: string) {
  return String(raw)
    .trim()
    // eğer tam public url gelmişse içinden key’i çek
    .replace(/^https?:\/\/\S+\/object\/public\//, '')
    // baştaki / ve 'public/' öneklerini temizle
    .replace(/^\/+/, '')
    .replace(/^public\//, '');
}

/** key veya url ver; public varsa onu, yoksa signed url üretir */
export async function resolveStorageUrlSmart(raw?: string | null) {
  if (!raw) return null;
  const s = String(raw);
  if (s.startsWith('http')) return encodeURI(s);

  const key = cleanKey(s);

  // 1) Public URL denemesi
  for (const b of STORAGE_BUCKETS) {
    const pub = supabase.storage.from(b).getPublicUrl(key).data?.publicUrl;
    if (pub) return encodeURI(pub);
  }
  // 2) Signed URL fallback
  for (const b of STORAGE_BUCKETS) {
    const { data, error } = await supabase.storage.from(b).createSignedUrl(key, 60 * 60 * 6);
    if (!error && data?.signedUrl) return encodeURI(data.signedUrl);
  }
  return null;
}
