// app/_layout.tsx
import BottomBar from '@/components/BottomBar';
import { Slot, usePathname } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  const pathname = usePathname();

  // Bar’ın görünmemesi gereken rotalar:
  const hideOn = [
    '/login', '/register', '/splash',
    '/(modals)/create', '/(modals)/plus-paywall',
    '/admin', '/edit-coupons'
  ];
  const hide = hideOn.some((p) => pathname?.startsWith(p));

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1 }}>
        <Slot />
        {!hide && <BottomBar />}
      </View>
    </SafeAreaProvider>
  );
}
