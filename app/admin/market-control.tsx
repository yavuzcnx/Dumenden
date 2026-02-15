import { uploadImage } from "@/lib/storage"; // 🔥 Senin projedeki upload fonksiyonu
import { supabase } from "@/lib/supabaseClient";
import { useI18n } from '@/lib/i18n';
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

const COLORS = {
  bg: "#121212",
  card: "#1E1E1E",
  primary: "#FF6B00",
  text: "#FFFFFF",
  subText: "#A0A0A0",
  success: "#4CAF50",
  danger: "#F44336",
  border: "#333333",
};

export default function MarketControl() {
  const { t, numberLocale } = useI18n();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<any>(null);
  const [uploading, setUploading] = useState(false);

  // Form State
  const [message, setMessage] = useState("");
  const [bgImage, setBgImage] = useState<string | null>(null); 
  
  const [dateParts, setDateParts] = useState({
    day: "", month: "", year: "", hour: "", minute: ""
  });

  // 1. Veriyi Çek
  async function loadStatus() {
    setLoading(true);
    const { data, error } = await supabase.from("market_status").select("*").maybeSingle();

    if (error) {
      Alert.alert(t('common.error'), error.message);
      setLoading(false);
      return;
    }

    if (!data) {
      await supabase.from("market_status").insert([{ is_open: true }]);
      await loadStatus();
      return;
    }

    setStatus(data);
    setMessage(data.close_message || t('adminMarketControl.defaultCloseMessage'));
    setBgImage(data.bg_image || null);

    if (data.reopen_at) {
      const d = new Date(data.reopen_at);
      setDateParts({
        day: String(d.getDate()).padStart(2, '0'),
        month: String(d.getMonth() + 1).padStart(2, '0'),
        year: String(d.getFullYear()),
        hour: String(d.getHours()).padStart(2, '0'),
        minute: String(d.getMinutes()).padStart(2, '0'),
      });
    } else {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        setDateParts({
            day: String(d.getDate()).padStart(2, '0'),
            month: String(d.getMonth() + 1).padStart(2, '0'),
            year: String(d.getFullYear()),
            hour: "12",
            minute: "00",
          });
    }
    setLoading(false);
  }

  useEffect(() => {
    loadStatus();
  }, []);

  // Görsel Seçme
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.8,
    });

    if (!result.canceled) {
        setBgImage(result.assets[0].uri); // Geçici olarak ekranda göster
    }
  };

  // Yardımcı: Storage'a Yükleme
  const handleUpload = async (localUri: string) => {
      try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error(t('adminMarketControl.sessionMissing'));

          const fileName = `market-bg-${Date.now()}.jpg`;
          // Dosya yolunu 'market' klasörüne atıyoruz
          const destPath = `market/${fileName}`; 
          
          // Senin lib/storage.ts içindeki fonksiyonu kullanıyoruz
          // bucket adı genelde 'Media' veya 'images' olur, seninkine göre 'Media' varsayıyorum.
          await uploadImage(localUri, destPath, { bucket: 'Media', contentType: 'image/jpeg' });
          
          // Public URL al
          const { data } = supabase.storage.from('Media').getPublicUrl(destPath);
          return data.publicUrl;
      } catch (error: any) {
          console.log("Upload Error:", error);
          throw error;
      }
  };

  // Güncelleme Fonksiyonu
  async function updateStatus(updates: any) {
    if (!status?.id) return;

    setLoading(true);
    const { error } = await supabase
      .from("market_status")
      .update(updates)
      .eq("id", status.id);

    setLoading(false);

    if (error) {
      Alert.alert(t('common.error'), error.message);
    } else {
      Alert.alert(t('common.success'), t('adminMarketControl.statusUpdated'));
      await loadStatus();
    }
  }

  const handleOpenMarket = () => {
    Alert.alert(t('adminMarketControl.openConfirmTitle'), t('adminMarketControl.openConfirmBody'), [
        { text: t('common.cancel'), style: "cancel" },
        { 
            text: t('adminMarketControl.openConfirmAction'), 
            onPress: () => updateStatus({ is_open: true, close_message: null, reopen_at: null, bg_image: null }) 
        }
    ]);
  };

  const handleCloseMarket = async () => {
    const { day, month, year, hour, minute } = dateParts;
    let isoDate: string | null = null;
    
    if (day && month && year && hour && minute) {
        const d = new Date(`${year}-${month}-${day}T${hour}:${minute}:00`);
        if (!isNaN(d.getTime())) {
            isoDate = d.toISOString();
        } else {
            Alert.alert(t('common.error'), t('adminMarketControl.invalidDate'));
            return;
        }
    }

    // Görsel Yükleme İşlemi
    let finalBgImage = bgImage;
    
    // Eğer yeni bir görsel seçildiyse (dosya yolunda http yoksa yereldir)
    if (bgImage && !bgImage.startsWith('http')) {
        try {
            setUploading(true);
            // Yükle ve Public URL al
            finalBgImage = await handleUpload(bgImage);
            setUploading(false);
        } catch (e) {
            Alert.alert(t('common.error'), t('adminMarketControl.imageUploadError'));
            setUploading(false);
            return;
        }
    }

    updateStatus({
      is_open: false,
      close_message: message,
      reopen_at: isoDate,
      bg_image: finalBgImage
    });
  };

  if (loading) return <ActivityIndicator style={styles.center} size="large" color={COLORS.primary} />;

  const isOpen = status?.is_open;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 50 }}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('adminMarketControl.title')}</Text>
        <Text style={styles.subtitle}>{t('adminMarketControl.subtitle')}</Text>
      </View>

      <View style={[styles.card, { borderColor: isOpen ? COLORS.success : COLORS.danger, borderWidth: 1 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
                <Text style={styles.label}>{t('adminMarketControl.currentStatus')}</Text>
                <Text style={[styles.statusText, { color: isOpen ? COLORS.success : COLORS.danger }]}>
                    {isOpen ? t('adminMarketControl.openStatus') : t('adminMarketControl.closedStatus')}
                </Text>
            </View>
            <TouchableOpacity onPress={loadStatus} style={styles.refreshBtn}>
                <Ionicons name="refresh" size={20} color="#fff" />
            </TouchableOpacity>
        </View>
        {!isOpen && status.reopen_at && (
            <Text style={{ color: '#FF8A80', fontSize: 13, marginTop: 10 }}>
                📅 {t('adminMarketControl.reopenLabel')} {new Date(status.reopen_at).toLocaleString(numberLocale)}
            </Text>
        )}
      </View>

      {isOpen ? (
          <TouchableOpacity style={[styles.bigButton, { backgroundColor: COLORS.danger }]} onPress={() => setStatus({...status, is_open: false})}> 
              <Ionicons name="lock-closed" size={24} color="#fff" style={{ marginBottom: 5 }} />
              <Text style={styles.bigButtonText}>{t('adminMarketControl.closeButton')}</Text>
          </TouchableOpacity>
      ) : (
        <View>
            <Text style={styles.sectionTitle}>{t('adminMarketControl.closeSettingsTitle')}</Text>
            
            <View style={styles.card}>
                <Text style={styles.label}>{t('adminMarketControl.userMessageLabel')}</Text>
                <TextInput
                    style={styles.textArea}
                    value={message}
                    onChangeText={setMessage}
                    placeholder={t('adminMarketControl.userMessagePlaceholder')}
                    placeholderTextColor={COLORS.subText}
                    multiline
                />
            </View>

            <View style={styles.card}>
                <Text style={styles.label}>{t('adminMarketControl.autoOpenLabel')}</Text>
                <View style={styles.dateRow}>
                    <TextInput style={styles.dateInput} keyboardType="numeric" maxLength={2} value={dateParts.day} onChangeText={(t) => setDateParts({...dateParts, day: t})} placeholder={t('adminMarketControl.dateDay')} placeholderTextColor="#555"/>
                    <Text style={styles.slash}>/</Text>
                    <TextInput style={styles.dateInput} keyboardType="numeric" maxLength={2} value={dateParts.month} onChangeText={(t) => setDateParts({...dateParts, month: t})} placeholder={t('adminMarketControl.dateMonth')} placeholderTextColor="#555"/>
                    <Text style={styles.slash}>/</Text>
                    <TextInput style={[styles.dateInput, {width: 60}]} keyboardType="numeric" maxLength={4} value={dateParts.year} onChangeText={(t) => setDateParts({...dateParts, year: t})} placeholder={t('adminMarketControl.dateYear')} placeholderTextColor="#555"/>
                </View>
                <View style={[styles.dateRow, { marginTop: 15 }]}>
                    <TextInput style={styles.dateInput} keyboardType="numeric" maxLength={2} value={dateParts.hour} onChangeText={(t) => setDateParts({...dateParts, hour: t})} placeholder={t('adminMarketControl.timeHour')} placeholderTextColor="#555"/>
                    <Text style={styles.slash}>:</Text>
                    <TextInput style={styles.dateInput} keyboardType="numeric" maxLength={2} value={dateParts.minute} onChangeText={(t) => setDateParts({...dateParts, minute: t})} placeholder={t('adminMarketControl.timeMinute')} placeholderTextColor="#555"/>
                </View>
            </View>

            {/* GÖRSEL SEÇME ALANI */}
            <View style={styles.card}>
                <Text style={styles.label}>{t('adminMarketControl.backgroundLabel')}</Text>
                <TouchableOpacity onPress={pickImage} style={{ alignItems:'center', justifyContent:'center', height: 150, backgroundColor:'#2C2C2C', borderRadius: 8, marginTop: 8, overflow:'hidden' }}>
                    {bgImage ? (
                        <Image source={{ uri: bgImage }} style={{ width:'100%', height:'100%' }} resizeMode="cover" />
                    ) : (
                        <View style={{ alignItems:'center' }}>
                            <Ionicons name="image-outline" size={32} color="#666" />
                            <Text style={{ color:'#666', marginTop:5 }}>{t('adminMarketControl.pickImageHint')}</Text>
                        </View>
                    )}
                </TouchableOpacity>
                {bgImage && (
                    <TouchableOpacity onPress={() => setBgImage(null)} style={{ alignSelf:'flex-end', marginTop: 5 }}>
                        <Text style={{ color: COLORS.danger }}>{t('adminMarketControl.removeImage')}</Text>
                    </TouchableOpacity>
                )}
                <Text style={{ fontSize: 10, color: '#666', marginTop: 5 }}>{t('adminMarketControl.backgroundHint')}</Text>
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={handleCloseMarket} disabled={uploading}>
                {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{t('adminMarketControl.saveAndClose')}</Text>}
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={[styles.bigButton, { backgroundColor: COLORS.success, marginTop: 10 }]} onPress={handleOpenMarket}>
                <Ionicons name="lock-open" size={24} color="#fff" style={{ marginBottom: 5 }} />
                <Text style={styles.bigButtonText}>{t('adminMarketControl.openNow')}</Text>
            </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg, padding: 20 },
    center: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
    header: { marginBottom: 20, marginTop: 10 },
    title: { fontSize: 28, fontWeight: 'bold', color: COLORS.text },
    subtitle: { fontSize: 14, color: COLORS.subText, marginTop: 4 },
    card: { backgroundColor: COLORS.card, padding: 16, borderRadius: 12, marginBottom: 20 },
    label: { color: COLORS.subText, fontSize: 12, marginBottom: 6, textTransform: 'uppercase', fontWeight:'700' },
    statusText: { fontSize: 24, fontWeight: 'bold' },
    refreshBtn: { padding: 8, backgroundColor: '#333', borderRadius: 8 },
    bigButton: { padding: 20, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 },
    bigButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    bigButtonSubText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 },
    sectionTitle: { color: COLORS.text, fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
    textArea: { backgroundColor: '#2C2C2C', color: '#fff', borderRadius: 8, padding: 12, minHeight: 80, textAlignVertical: 'top' },
    dateRow: { flexDirection: 'row', alignItems: 'flex-end' },
    dateInputGroup: { alignItems: 'center' },
    dateLabel: { color: '#666', fontSize: 10, marginBottom: 4 },
    dateInput: { backgroundColor: '#2C2C2C', color: '#fff', fontSize: 18, fontWeight: 'bold', width: 50, height: 50, borderRadius: 8, textAlign: 'center' },
    slash: { color: '#666', fontSize: 24, marginHorizontal: 8, paddingBottom: 8 },
    saveButton: { backgroundColor: COLORS.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
    saveButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 30 },
});
