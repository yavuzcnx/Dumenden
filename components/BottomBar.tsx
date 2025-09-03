// components/BottomBar.tsx
import { usePlus } from '@/app/hooks/userPlus';
import { BAR_MARGIN, BAR_MIN_HEIGHT, FAB_SIZE } from '@/components/ui/layout';
import type { Href } from 'expo-router';
import { usePathname, useRouter } from 'expo-router';
import React, { memo, useMemo } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BRAND = '#FF6B00';
const INACTIVE = '#666';

function BottomBar() {
  const ins = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const { isPlus } = usePlus();

  const go = (path: Href) => {
    const cur = pathname ?? '';
    const next = typeof path === 'string' ? path : (path.pathname ?? '');
    if (cur === next) return;
    router.replace(path);
  };

  const containerStyle = useMemo(
    () => [
      styles.container,
      {
        left: BAR_MARGIN + ins.left,
        right: BAR_MARGIN + ins.right,
        bottom: Math.max(ins.bottom, BAR_MARGIN),
        minHeight: BAR_MIN_HEIGHT,
      },
    ],
    [ins],
  );

  const Item = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress} android_ripple={{ color: '#eee' }} style={styles.item} hitSlop={8}>
      <Text style={[styles.itemText, { color: active ? BRAND : INACTIVE }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
      <View style={containerStyle}>
        <Item label="Ana Sayfa" active={pathname === '/home'} onPress={() => go('/home' as Href)} />
        <Item label="Keşfet" active={pathname === '/explore'} onPress={() => go('/explore' as Href)} />

        {/* Orta kaptan FAB – halka dış katmanda, clip iç katmanda */}
       <Pressable
  onPress={() => go(isPlus ? ('/plus' as Href) : ('/(modals)/plus-paywall' as Href))}
  android_ripple={{ color: '#ffe4d1', borderless: true, radius: FAB_SIZE / 2 }}
  style={styles.fab}
  hitSlop={8}
>
  <View style={styles.fabClip}>
    <Image
      source={require('@/assets/images/dumendenci.png')}
      style={styles.fabImg}
    />
  </View>
</Pressable>   {/*  ← KAPANIŞ BURADA TAM OLSUN */}
        <Item label="Market" active={pathname === '/market'} onPress={() => go('/market' as Href)} />
        <Item label="Vitrin" active={pathname === '/vitrin'} onPress={() => go('/vitrin' as Href)} />
      </View>
    </View>
  );
}

export default memo(BottomBar);

const RING = 2; // turuncu halkanın kalınlığı

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#eee',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    overflow: 'visible',
  },
  item: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  itemText: { fontWeight: '800', fontSize: 13, includeFontPadding: false },

  // DIŞ: çerçeve + gölge (overflow YOK → Android'de halka kaybolmaz)
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: '#fff',
    borderWidth: RING,
    borderColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -FAB_SIZE / 2,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 10 },
    }),
  },
  // İÇ: sadece clip
  fabClip: {
    width: FAB_SIZE - RING * 2,
    height: FAB_SIZE - RING * 2,
    borderRadius: (FAB_SIZE - RING * 2) / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  fabImg: { width: '92%', height: '92%', resizeMode: 'contain' },
});
