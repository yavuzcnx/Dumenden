import { supabase } from '@/lib/supabaseClient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// --- DÜMENDEN KONSEPTİ (BEYAZ & TURUNCU) ---
const COLORS = {
  bg: '#F9FAFB',        // Hafif gri-beyaz arka plan
  card: '#FFFFFF',      // Bembeyaz kartlar
  primary: '#FF6B00',   // Dümenden Turuncusu
  text: '#111827',      // Koyu siyah/gri yazı
  subText: '#6B7280',   // Gri alt yazı
  danger: '#EF4444',    // Kırmızı (Silme)
  input: '#F3F4F6',     // Input arka planı
  border: '#E5E7EB',    // İnce kenarlıklar
  success: '#10B981',   // 🔥 EKLENDİ: Yeşil (Onaylı)
  warning: '#F59E0B',   // Sarı (Beklemede)
  modalOverlay: 'rgba(0,0,0,0.5)',
};

const { width } = Dimensions.get('window');
const COLUMNS = 2;
const CARD_WIDTH = (width - 48) / COLUMNS; 

type Proof = {
  id: string;
  title: string | null;
  media_url: string | null;
  status: 'approved' | 'pending';
  created_at: string;
  coupons?: { title: string } | null;
};

export default function AdminProofManage() {
  const router = useRouter();
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loading, setLoading] = useState(true);

  // Düzenleme Modalı
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedProof, setSelectedProof] = useState<Proof | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);

  // 1. Verileri Çek
  const fetchProofs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('coupon_proofs')
      .select(`
        *,
        coupons:coupon_id ( title )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.log('Fetch error:', error);
      Alert.alert('Hata', 'Veriler çekilemedi.');
    } else {
      setProofs((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProofs();
  }, []);

  // 2. Silme İşlemi
  const handleDelete = (item: Proof) => {
    Alert.alert(
      'Silinecek!',
      `"${item.title || 'Başlıksız'}" kanıtını silmek istediğine emin misin?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            setProofs((prev) => prev.filter((p) => p.id !== item.id));
            const { error } = await supabase.from('coupon_proofs').delete().eq('id', item.id);
            if (error) {
              Alert.alert('Hata', error.message);
              fetchProofs(); 
            }
          },
        },
      ]
    );
  };

  // 3. Düzenleme Başlat
  const openEdit = (item: Proof) => {
    setSelectedProof(item);
    setNewTitle(item.title || '');
    setEditModalVisible(true);
  };

  // 4. Kaydetme İşlemi
  const handleSave = async () => {
    if (!selectedProof) return;
    setSaving(true);

    const { error } = await supabase
      .from('coupon_proofs')
      .update({ title: newTitle })
      .eq('id', selectedProof.id);

    setSaving(false);
    setEditModalVisible(false);

    if (error) {
      Alert.alert('Hata', 'Güncellenemedi: ' + error.message);
    } else {
      setProofs((prev) =>
        prev.map((p) => (p.id === selectedProof.id ? { ...p, title: newTitle } : p))
      );
    }
  };

  // --- UI BİLEŞENLERİ ---

  const renderItem = ({ item }: { item: Proof }) => (
    <View style={styles.card}>
      {/* Görsel Alanı */}
      <View style={styles.imageContainer}>
        {item.media_url ? (
          <Image source={{ uri: item.media_url }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.placeholderImage}>
            <Ionicons name="image-outline" size={32} color="#ccc" />
          </View>
        )}
        
        {/* Durum Rozeti */}
        <View style={[styles.badge, { backgroundColor: item.status === 'approved' ? COLORS.success : COLORS.warning }]}>
            <Text style={styles.badgeText}>{item.status === 'approved' ? 'Onaylı' : 'Beklemede'}</Text>
        </View>
      </View>

      {/* İçerik */}
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title || 'Başlıksız Kanıt'}
        </Text>
        <Text style={styles.cardSub} numberOfLines={1}>
          Kupon: {item.coupons?.title || 'Silinmiş Kupon'}
        </Text>
        <Text style={styles.date}>
          {new Date(item.created_at).toLocaleDateString('tr-TR')}
        </Text>
      </View>

      {/* Aksiyon Butonları */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(item)}>
          <Ionicons name="create-outline" size={20} color="#4A90E2" />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item)}>
          <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View>
            <Text style={styles.headerTitle}>Kanıt Yönetimi</Text>
            <Text style={styles.headerSub}>Vitrin Düzenle & Sil</Text>
        </View>
        <TouchableOpacity onPress={() => { setLoading(true); fetchProofs(); }} style={styles.iconBtn}>
             <Ionicons name="refresh" size={20} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={proofs}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          numColumns={COLUMNS}
          columnWrapperStyle={{ justifyContent: 'space-between' }}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ color: '#999' }}>Hiç kanıt bulunamadı.</Text>
            </View>
          }
        />
      )}

      {/* DÜZENLEME MODALI */}
      <Modal visible={editModalVisible} transparent animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Kanıtı Düzenle</Text>
            
            <Text style={styles.label}>Görünen Başlık</Text>
            <TextInput
              style={styles.input}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Başlık girin..."
              placeholderTextColor="#999"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.cancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Kaydet</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: 16, paddingTop: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 50 },
  
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, justifyContent:'space-between' },
  iconBtn: { padding: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth:1, borderColor: COLORS.border },
  headerTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text, textAlign: 'center' },
  headerSub: { fontSize: 12, color: COLORS.subText, textAlign: 'center' },

  card: {
    width: CARD_WIDTH,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  imageContainer: { height: 140, backgroundColor: '#F3F4F6', position: 'relative' },
  image: { width: '100%', height: '100%' },
  placeholderImage: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#eee' },
  
  badge: { position:'absolute', top:8, right:8, paddingHorizontal:8, paddingVertical:4, borderRadius:8 },
  badgeText: { color:'#fff', fontSize:10, fontWeight:'bold' },

  cardContent: { padding: 10 },
  cardTitle: { color: COLORS.text, fontWeight: 'bold', fontSize: 14, marginBottom: 4 },
  cardSub: { color: COLORS.subText, fontSize: 10, marginBottom: 6 },
  date: { color: '#999', fontSize: 10 },

  actions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    height: 40,
  },
  actionBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  divider: { width: 1, backgroundColor: COLORS.border, height: '100%' },

  // Modal Stilleri
  modalContainer: { flex: 1, backgroundColor: COLORS.modalOverlay, justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalTitle: { color: COLORS.text, fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  label: { color: COLORS.subText, fontSize: 12, marginBottom: 6, fontWeight: '700' },
  input: { backgroundColor: COLORS.input, color: COLORS.text, borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 20, borderWidth: 1, borderColor: COLORS.border },
  modalButtons: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, backgroundColor: '#f3f4f6', padding: 14, borderRadius: 10, alignItems: 'center' },
  cancelText: { color: '#333', fontWeight: 'bold' },
  saveBtn: { flex: 1, backgroundColor: COLORS.primary, padding: 14, borderRadius: 10, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: 'bold' },
});