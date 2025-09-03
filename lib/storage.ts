// lib/storage.ts
import { supabase } from '@/lib/supabaseClient';
import { decode as atob } from 'base-64';
import * as FileSystem from 'expo-file-system';

export const MEDIA_BUCKET = 'Media'; // <-- bucket adı birebir aynı, büyük/küçük harf önemli

const guessExt = (uri: string) => {
  const raw = uri.split('?')[0].split('#')[0];
  const ext = raw.includes('.') ? raw.slice(raw.lastIndexOf('.') + 1).toLowerCase() : 'jpg';
  return ext === 'jpeg' ? 'jpg' : ext;
};
const contentType = (ext: string) =>
  ext === 'jpg' ? 'image/jpeg' : ext === 'heic' ? 'image/heic' : `image/${ext}`;

/** RN’de 0-byte sorununu engelleyerek Storage’a yükler. */
export async function uploadImage(localUri: string, destPath: string) {
  const ext = guessExt(localUri);
  const ct = contentType(ext);
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(destPath, bytes, {
    contentType: ct,
    upsert: false,
  });
  if (error) throw error;
  return destPath;
}

/** path → public URL (path zaten https ise olduğu gibi döner) */
export function publicUrl(path?: string | null) {
  if (!path) return null as any;
  if (String(path).startsWith('http')) return path;
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(String(path)).data.publicUrl;
}
