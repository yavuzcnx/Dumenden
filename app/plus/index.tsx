import { supabase } from '@/lib/supabaseClient';
import { usePlus } from '@/src/contexts/hooks/usePlus';
import { Ionicons } from '@expo/vector-icons'; // İkonlar için ekledim
import { LinearGradient } from 'expo-linear-gradient'; // Gradient için
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BRAND  = '#FF6B00';
const SOFT   = '#FFF2E8';
const BORDER = '#F2D9C8';

const MASCOT_SRC = require('@/assets/images/dumendenci.png');

type Quota = { used_last7: number; remaining_last7: number };

export default function PlusHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  // 🔥 Animasyon değeri
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  // 🔥 ARTIK PAYWALL KONTROLÜ YOK - Direkt Giriş
  const { isPlus, loading } = usePlus(); 

  const [busy, setBusy] = useState(true);
  const [user, setUser] = useState<{ name: string; xp: number; avatar?: string | null }>({
    name: 'Kullanıcı',
    xp: 0
  });
  const [quota, setQuota] = useState<Quota | null>(null);

  useEffect(() => {
    // Sayfa açılış animasyonu
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true })
    ]).start();

    (async () => {
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id;
      if (!uid) { setBusy(false); return; }

      // 1. Kullanıcı verisi
      const { data } = await supabase
        .from('users')
        .select('full_name,xp,avatar_url')
        .eq('id', uid)
        .single();

      setUser({
        name: (data?.full_name || 'Kullanıcı').trim(),
        xp: data?.xp ?? 0,
        avatar: data?.avatar_url ?? null,
      });

      // 2. Kota verisi
      try {
          const { data: q } = await supabase.rpc('my_submission_quota');
          if (q) {
            const row = Array.isArray(q) ? q[0] : q;
            setQuota({
                used_last7: row.used_last7 ?? 0,
                remaining_last7: row.remaining_last7 ?? 0
            });
          }
      } catch (e) {
          console.log('Quota error', e);
      }

      setBusy(false);
    })();
  }, []);

  if (loading || busy) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={BRAND} size="large" />
      </SafeAreaView>
    );
  }

  /* ---- ROUTES ---- */
  const goCreate   = () => router.push('/(modals)/create');
  const goManage   = () => router.push('/plus/manage');
  const goProof    = () => router.push('/plus/proofs');
  const goResolve  = () => router.push('/plus/resolve');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FAFAFA' }}>
      <ScrollView 
        contentContainerStyle={{ 
            paddingHorizontal: 16, 
            paddingBottom: 40,
            paddingTop: Platform.OS === 'android' ? (insets.top + 16) : 16 
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          
          {/* MODERN HEADER */}
          <LinearGradient
            colors={['#ffffff', '#FFF8F3']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerCard}
          >
            <View style={styles.mascotWrap}>
              <Image source={MASCOT_SRC} style={styles.mascot} />
              <View style={styles.badge}><Ionicons name="star" size={12} color="#fff" /></View>
            </View>
            
            <View style={{ flex:1, justifyContent:'center' }}>
              <Text style={styles.roleTitle}>DÜMENCİ PANELİ</Text>
              <Text style={styles.userName} numberOfLines={1}>{user.name}</Text>
              
              <View style={styles.xpRow}>
                <Ionicons name="flash" size={14} color={BRAND} />
                <Text style={styles.xpText}>{user.xp.toLocaleString('tr-TR')} XP</Text>
              </View>
            </View>
          </LinearGradient>

          {/* KOTA DURUMU (ÖNEMLİ) */}
          <View style={styles.quotaSection}>
            <View style={styles.quotaHeader}>
              <Text style={styles.sectionTitle}>Haftalık Gönderim Hakkın</Text>
              <Ionicons name="information-circle-outline" size={20} color="#999" />
            </View>
            
            <View style={styles.quotaBarBg}>
              <View 
                style={[
                  styles.quotaBarFill, 
                  { width: `${((quota?.used_last7 ?? 0) / 5) * 100}%` }
                ]} 
              />
            </View>
            
            <View style={styles.quotaInfo}>
              <Text style={styles.quotaText}>
                <Text style={{color:BRAND, fontWeight:'900'}}>{quota?.remaining_last7 ?? 0}</Text> hakkın kaldı
              </Text>
              <Text style={styles.quotaUsed}>
                {quota?.used_last7 ?? 0}/5 kullanıldı
              </Text>
            </View>
          </View>

          {/* KISAYOLLAR */}
          <View style={styles.actionGrid}>
            <ActionButton 
              title="Kupon Ekle" 
              desc="Yeni tahmin oluştur" 
              icon="add-circle" 
              color={BRAND} 
              onPress={goCreate} 
              isPrimary
            />
            <ActionButton 
              title="Yönet" 
              desc="Kuponlarını düzenle" 
              icon="settings-sharp" 
              color="#333" 
              onPress={goManage} 
            />
            <ActionButton 
              title="Kanıt Ekle" 
              desc="Sonuç kanıtı yükle" 
              icon="image" 
              color="#333" 
              onPress={goProof} 
            />
            <ActionButton 
              title="Sonuçlandır" 
              desc="Kazananı belirle" 
              icon="checkmark-done-circle" 
              color="#333" 
              onPress={goResolve} 
            />
          </View>

          {/* Diğer İşlemler */}
          <Text style={[styles.sectionTitle, { marginTop: 24, marginBottom: 12 }]}>Geçmiş</Text>
          <TouchableOpacity 
            style={styles.historyBtn}
            onPress={() => router.push('/my-bets')}
            activeOpacity={0.8}
          >
            <View style={styles.historyIconBox}>
              <Ionicons name="time" size={24} color="#555" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.historyTitle}>Oynadıklarım</Text>
              <Text style={styles.historyDesc}>Geçmiş tahminlerini incele</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>

        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---- SEXY COMPONENTS ---- */

function ActionButton({ title, desc, icon, color, onPress, isPrimary = false }: any) {
  return (
    <TouchableOpacity 
      style={[
        styles.actionCard, 
        isPrimary && styles.actionCardPrimary
      ]} 
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={[styles.iconCircle, isPrimary ? {backgroundColor:'rgba(255,255,255,0.2)'} : {backgroundColor:'#F5F5F5'}]}>
        <Ionicons name={icon} size={24} color={isPrimary ? '#fff' : color} />
      </View>
      <View>
        <Text style={[styles.actionTitle, isPrimary && {color:'#fff'}]}>{title}</Text>
        <Text style={[styles.actionDesc, isPrimary && {color:'rgba(255,255,255,0.8)'}]}>{desc}</Text>
      </View>
    </TouchableOpacity>
  );
}

/* ---- STYLES ---- */

const styles = StyleSheet.create({
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#eee',
    // Hafif gölge
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  mascotWrap: {
    position: 'relative',
    marginRight: 16,
  },
  mascot: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: '#FFF',
    backgroundColor: '#FFEAD1',
  },
  badge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: BRAND,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  roleTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#999',
    letterSpacing: 1,
    marginBottom: 4,
  },
  userName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#222',
    marginBottom: 6,
  },
  xpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOFT,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  xpText: {
    fontSize: 13,
    fontWeight: '800',
    color: BRAND,
    marginLeft: 4,
  },

  /* KOTA */
  quotaSection: {
    marginBottom: 24,
  },
  quotaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#222',
  },
  quotaBarBg: {
    height: 10,
    backgroundColor: '#EEE',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 8,
  },
  quotaBarFill: {
    height: '100%',
    backgroundColor: BRAND,
    borderRadius: 5,
  },
  quotaInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quotaText: {
    fontSize: 14,
    color: '#555',
    fontWeight: '600',
  },
  quotaUsed: {
    fontSize: 14,
    color: '#999',
    fontWeight: '600',
  },

  /* AKSİYONLAR */
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    width: '48%', // İki kolonlu
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#eee',
    // Gölge
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 2,
    minHeight: 110,
    justifyContent: 'space-between',
  },
  actionCardPrimary: {
    backgroundColor: BRAND,
    borderColor: BRAND,
    width: '100%', // Kupon ekle tam genişlik olsun
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 80,
    marginBottom: 4,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#222',
    marginBottom: 2,
  },
  actionDesc: {
    fontSize: 12,
    color: '#777',
    fontWeight: '500',
  },

  /* GEÇMİŞ BUTONU */
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#eee',
  },
  historyIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#222',
  },
  historyDesc: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
});