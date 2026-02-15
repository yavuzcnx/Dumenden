'use client';

import { Ionicons } from '@expo/vector-icons';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useI18n } from '@/lib/i18n';

const ORANGE = '#FF6B00';

export default function AdminLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const onLanding = pathname?.startsWith('/admin/landing');

  return (
    <View style={{ flex: 1 }}>
      {/* Tüm admin sayfalarında header'ı kapat */}
      <Stack screenOptions={{ headerShown: false }} />

      {/* Admin landing'e dön FAB (landing'de gizli) */}
      {!onLanding && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.replace('/admin/landing')}
          activeOpacity={0.85}
          accessibilityLabel={t('adminLayout.homeLabel')}
        >
          <Ionicons name="home" size={26} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
});
