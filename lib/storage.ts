// @/lib/storage.ts
import { supabase } from '@/lib/supabaseClient';
import * as ImageManipulator from 'expo-image-manipulator';
// SDK 54: legacy FS ile base64 okuma stabil
import { decode as atob } from 'base-64';
import * as FSLegacy from 'expo-file-system/legacy';

const DEFAULT_BUCKET = 'Media'; // 🔑 senin projeye göre varsayılan

type ContentType = 'image/jpeg' | 'image/png' | 'image/webp';

type UploadOpts = {
  bucket?: string;      // varsayılan: DEFAULT_BUCKET
  contentType?: string; // varsayılan: 'image/jpeg'
  upsert?: boolean;     // varsayılan: false
};

// ---- yardımcılar ----
const guessExt = (uri: string) => {
  const raw = uri.split(/[?#]/)[0];
  const e = raw.includes('.') ? raw.slice(raw.lastIndexOf('.') + 1).toLowerCase() : 'jpg';
  return e === 'jpeg' ? 'jpg' : e;
};

const ct = (ext: string): ContentType =>
  ext === 'jpg'  ? 'image/jpeg' :
  ext === 'png'  ? 'image/png'  :
  ext === 'webp' ? 'image/webp' :
                   'image/jpeg';

// HEIC/HEIF → JPEG ve ph:// → file:// normalizasyonu
async function normalizeToJpeg(uri: string): Promise<{ uri: string; contentType: ContentType }> {
  const ext = guessExt(uri);
  if (ext === 'heic' || ext === 'heif' || ext === 'heix' || ext === 'hevc' || uri.startsWith('ph://')) {
    const out = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return { uri: out.uri, contentType: 'image/jpeg' };
  }
  return { uri, contentType: ct(ext) };
}

/**
 * localUri: file:// veya ph://
 * destPath: Supabase Storage yolun (ör: "submissions/<uid>/file.jpg")
 */
export async function uploadImage(localUri: string, destPath: string, opts: UploadOpts = {}) {
  const bucket = opts.bucket ?? DEFAULT_BUCKET;

  // 1) HEIC/HEIF ve ph:// kaynakları normalize et
  const norm = await normalizeToJpeg(localUri);

  // 2) Base64 oku (legacy API)
  const b64 = await FSLegacy.readAsStringAsync(norm.uri, { encoding: 'base64' });

  // 3) base64 -> Uint8Array
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  // 4) Yükle
  const { error } = await supabase.storage
    .from(bucket)
    .upload(destPath, bytes, {
      contentType: opts.contentType ?? norm.contentType ?? 'image/jpeg',
      upsert: opts.upsert ?? false,
    });

  if (error) throw error;
  return destPath;
}

// ---- URL helper'ları ----

// Public bucket ise direkt public URL üretir
export function publicUrl(path: string, bucket = DEFAULT_BUCKET): string {
  if (!path) return '';
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl ?? '';
}

// Private bucket ise imzalı URL üret
export async function signedUrl(
  path: string,
  bucket = DEFAULT_BUCKET,
  expiresIn = 60 * 60 // 1 saat
): Promise<string> {
  if (!path) return '';
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data?.signedUrl ?? '';
}

// Opsiyonel: tek fonksiyonla çöz (public tercih; isterse imzalı)
export async function resolveUrl(
  path: string,
  options?: { bucket?: string; preferSigned?: boolean; expiresIn?: number }
): Promise<string> {
  const bucket = options?.bucket ?? DEFAULT_BUCKET;
  if (options?.preferSigned) {
    return signedUrl(path, bucket, options?.expiresIn ?? 3600);
  }
  // public dene; boş dönerse imzalıya düş
  const pub = publicUrl(path, bucket);
  if (pub) return pub;
  return signedUrl(path, bucket, options?.expiresIn ?? 3600);
}

// Opsiyonel: silme helper'ı
export async function deleteImage(path: string, bucket = DEFAULT_BUCKET) {
  if (!path) return;
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}
