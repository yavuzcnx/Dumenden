'use client';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
// 🔥 DÜZELTME: Pressable buraya eklendi
import { Alert, FlatList, Pressable, Text, TouchableOpacity, View } from 'react-native';

type Row = {
  id: string;
  title: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  closing_date: string;
  category: string;
};

const BRAND = '#FF6B00';
const TABS = [
  { key: 'all', label: 'Tümü' },
  { key: 'pending', label: 'Beklemede' },
  { key: 'approved', label: 'Onaylandı' },
  { key: 'rejected', label: 'Reddedildi' },
  { key: 'withdrawn', label: 'Kaldırılan' }
] as const;

type TabKey = typeof TABS[number]['key'];

export default function ManageMySubmissions() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('all');
  const [rows, setRows] = useState<Row[]>([]);
  const [uid, setUid] = useState<string | null>(null);

  // -------------------------
  // LOAD USER & SUBMISSIONS
  // -------------------------
  const load = useCallback(async () => {
    if (!uid) return;

    let q = supabase
      .from('coupon_submissions')
      .select('id,title,status,closing_date,category')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    if (tab !== 'all') q = q.eq('status', tab);

    const { data, error } = await q;
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }

    setRows((data ?? []) as Row[]);
  }, [uid, tab]);

  useEffect(() => {
    (async () => {
      const { data: au } = await supabase.auth.getUser();
      setUid(au?.user?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // -------------------------
  // STATUS BADGES
  // -------------------------
  const tag = (s: Row['status']) => {
    switch (s) {
      case 'approved':
        return { label: 'Onaylandı', bg: '#E8F5E9', fg: '#1B5E20' };
      case 'rejected':
        return { label: 'Reddedildi', bg: '#FFEBEE', fg: '#B71C1C' };
      case 'withdrawn':
        return { label: 'Kaldırıldı', bg: '#ECEFF1', fg: '#455A64' };
      default:
        return { label: 'Beklemede', bg: '#FFF8E1', fg: '#8D6E63' };
    }
  };

  // -------------------------
  // DELETE FUNCTION (FIXED: HEM SUBMISSION HEM EXPLORE SİLİNİR)
 
  const deleteSubmission = async (id: string, status: string) => {
    Alert.alert(
      "Kuponu Sil", 
      "Bu kuponu tamamen silmek istediğine emin misin?", 
      [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Kökten Sil",
        style: "destructive",
        onPress: async () => {
          try {
            // 1. Veritabanından sil (Senin RPC fonksiyonun)
            const { error } = await supabase.rpc('delete_my_coupon', { target_id: id });

            if (error) {
                console.error("RPC Hatası:", error);
                throw new Error(error.message);
            }

            // 2. 🔥 ÖNEMLİ: Listeyi RAM'den manuel temizle (Anlık tepki için)
            setRows(prevRows => {
                // Debug için konsola yazalım, ID eşleşiyor mu görelim
                console.log("Silinmeye çalışılan ID:", id);
                console.log("Listedeki satır sayısı (Önce):", prevRows.length);
                const newRows = prevRows.filter(r => r.id !== id);
                console.log("Listedeki satır sayısı (Sonra):", newRows.length);
                return newRows;
            });

            // 3. 🔥 DAHA ÖNEMLİ: Veritabanından son halini çekip listeyi zorla yenile!
            // (Eğer manuel silme çalışmazsa bu kesin çalışır çünkü veritabanı artık boş)
            await load(); 

            Alert.alert("Başarılı", "Kupon yok edildi.");

          } catch (err: any) {
            Alert.alert("Hata", err.message || "Silme işlemi başarısız.");
          }
        }
      }
    ]);
  };

  const Item = ({ item }: { item: Row }) => {
    const t = tag(item.status);
    const canEdit = item.status === 'pending';

    return (
      <View style={{
        borderWidth: 1,
        borderColor: '#eee',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontWeight: '900', flex: 1 }} numberOfLines={1}>{item.title}</Text>

          <View style={{
            backgroundColor: t.bg,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 8,
            marginLeft: 8
          }}>
            <Text style={{ color: t.fg, fontWeight: '800', fontSize: 12 }}>{t.label}</Text>
          </View>
        </View>

        <Text style={{ color: '#666', marginTop: 4 }}>
          {item.category} • Kapanış: {new Date(item.closing_date).toLocaleString()}
        </Text>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>

          {/* ------------------- */}
          {/* Düzenle */}
          {/* ------------------- */}
          <TouchableOpacity
            disabled={!canEdit}
            onPress={() =>
              router.push({
                pathname: '/user-edit-coupon',
                params: { id: item.id }
              })
            }
            style={{
              flex: 1,
              backgroundColor: canEdit ? '#e0e0e0' : '#f5f5f5',
              padding: 10,
              borderRadius: 10,
            }}>
            <Text style={{ textAlign:'center', fontWeight:'800', color: canEdit ? '#000' : '#aaa' }}>
              Düzenle
            </Text>
          </TouchableOpacity>

          {/* ------------------- */}
          {/* Kanıt Ekle */}
          {/* ------------------- */}
          <TouchableOpacity
            onPress={() => router.push(`/plus/proofs?coupon=${item.id}`)}
            style={{
              flex: 1,
              backgroundColor: BRAND,
              padding: 10,
              borderRadius: 10
            }}>
            <Text style={{ textAlign: 'center', color: '#fff', fontWeight: '900' }}>
              Kanıt Ekle
            </Text>
          </TouchableOpacity>

          {/* ------------------- */}
          {/* Sil */}
          {/* ------------------- */}
          <TouchableOpacity
            // 🔥 Statüyü de gönderiyoruz ki ana tablodan da silebilsin
            onPress={() => deleteSubmission(item.id, item.status)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: '#ef4444'
            }}>
            <Text style={{ color: '#fff', fontWeight: '900' }}>Sil</Text>
          </TouchableOpacity>

        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 8 }}>
        <Text style={{
          fontSize: 22,
          fontWeight: '900',
          color: BRAND,
          marginBottom: 10
        }}>
          Kuponlarım
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TABS.map(t => (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 12,
                backgroundColor: tab === t.key ? BRAND : '#eee'
              }}
            >
              <Text style={{
                color: tab === t.key ? '#fff' : '#333',
                fontWeight: '700'
              }}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(x) => x.id}
        renderItem={Item}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        ListEmptyComponent={
          <Text style={{
            textAlign: 'center',
            color: '#888',
            marginTop: 24
          }}>
            Bu kategoride önerin yok.
          </Text>
        }
      />
    </View>
  );
}