import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';

function sOrNull(v: any) {
  const s = (v ?? '').toString().trim();
  return s ? s : null;
}

function normalizeBirthDate(v?: string | null) {
  if (!v) return null;
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(v)) return v.replace(/\./g, '-');
  return v;
}

/**
 * Girişten hemen sonra çağır:
 * - users: yoksa INSERT, varsa patch
 * - xp_wallets: yoksa INSERT (balance=200), varsa DOKUNMA
 * - registerDraft temizliği
 */
export async function ensureBootstrapAndProfile() {
  console.log("Bootstrap başlatılıyor...");
  
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    console.log("Bootstrap: Kullanıcı yok veya hata:", error);
    return;
  }

  try {
    // 1. Metadata veya Draft Verisini Topla
    const md = user.user_metadata ?? {};
    
    // Google'dan gelen isim (bazen full_name, bazen name, bazen user_name olarak gelir)
    let full_name = sOrNull(md.full_name) || sOrNull(md.name) || sOrNull(md.user_name);
    let phone_number = sOrNull(md.phone_number);
    let birth_date = normalizeBirthDate(md.birth_date);

    // Eğer metadata boşsa ve email varsa, local storage'daki draft'a bak (Email kaydı için)
    if (!full_name && !phone_number && !birth_date && user.email) {
      try {
        const raw = await AsyncStorage.getItem(`registerDraft:${user.email.toLowerCase()}`);
        if (raw) {
          const p = JSON.parse(raw);
          full_name = sOrNull(p.full_name) || full_name;
          phone_number = sOrNull(p.phone_number) || phone_number;
          birth_date = normalizeBirthDate(p.birth_date) || birth_date;
        }
      } catch (e) {
        console.warn("Draft okuma hatası:", e);
      }
    }

    // İsim hala yoksa mailin başını al (örn: ahmet@gmail.com -> ahmet)
    if (!full_name && user.email) {
      full_name = user.email.split('@')[0];
    }

    console.log("Bootstrap: Kullanıcı verileri hazırlanıyor...", { id: user.id, full_name });

    // 2. USERS Tablosunu Kontrol Et / Güncelle
    const { data: uRow, error: uError } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (uError) console.error("Users tablosu sorgu hatası:", uError);

    if (!uRow) {
      console.log("Bootstrap: Users kaydı yok, oluşturuluyor...");
      const { error: insertError } = await supabase.from('users').insert([{
        id: user.id,
        full_name: full_name,
        phone_number: phone_number,
        birth_date: birth_date,
        // xp ve is_plus varsayılan değerlerle veritabanında oluşur
      }]);
      
      if (insertError) console.error("Users insert hatası:", insertError);
    } else {
      // Varsa ve yeni veri geldiyse güncelle (opsiyonel)
      const patch: Record<string, any> = {};
      if (full_name) patch.full_name = full_name;
      if (phone_number) patch.phone_number = phone_number;
      if (birth_date) patch.birth_date = birth_date;
      
      if (Object.keys(patch).length > 0) {
        await supabase.from('users').update(patch).eq('id', user.id);
      }
    }

    // 3. XP WALLETS (Cüzdan) Kontrolü
    const { data: wRow, error: wError } = await supabase
      .from('xp_wallets')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (wError) console.error("Wallet sorgu hatası:", wError);

    if (!wRow) {
      console.log("Bootstrap: Cüzdan yok, oluşturuluyor (200 XP)...");
      const { error: wInsertError } = await supabase.from('xp_wallets').insert([
        { 
          user_id: user.id, 
          balance: 200 // Hoşgeldin Bonusu 🎁
        }
      ]);
      if (wInsertError) console.error("Wallet insert hatası:", wInsertError);
    } else {
        console.log("Bootstrap: Cüzdan zaten var.");
    }

    // 4. Temizlik
    if (user.email) {
      try { await AsyncStorage.removeItem(`registerDraft:${user.email.toLowerCase()}`); } catch {}
    }

    console.log("Bootstrap: İşlem tamamlandı.");

  } catch (err) {
    console.error("Bootstrap GENEL HATA:", err);
  }
}