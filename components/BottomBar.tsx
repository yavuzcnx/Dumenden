// components/BottomBar.tsx
import { BAR_MARGIN, BAR_MIN_HEIGHT, FAB_SIZE } from '@/components/ui/layout';
import { usePlus } from '@/src/contexts/hooks/usePlus';
import type { Href } from 'expo-router';
import { usePathname, useRouter } from 'expo-router';
import { memo, useMemo } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BRAND = '#FF6B00';
const INACTIVE = '#666';
const RING = 2; // turuncu halka kalınlığı

type ItemProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

const Item = ({ label, active, onPress }: ItemProps) => (
  <Pressable onPress={onPress} android_ripple={{ color: '#eee' }} style={styles.item} hitSlop={8}>
    <Text style={[styles.itemText, { color: active ? BRAND : INACTIVE }]}>{label}</Text>
  </Pressable>
);

function BottomBar() {
  const ins = useSafeAreaInsets();
  const pathname = usePathname() ?? '';
  const { isPlus } = usePlus();
  const router = useRouter();

  // replace -> push (geri jesti için önemli)
  const go = (path: Href) => {
    const next = typeof path === 'string' ? path : (path.pathname ?? '');
    if (pathname === next) return;
    router.push(path);
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

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <View style={containerStyle}>
        <Item label="Ana Sayfa" active={pathname === '/home'} onPress={() => go('/home' as Href)} />
        <Item label="Keşfet" active={pathname === '/explore'} onPress={() => go('/explore' as Href)} />

        {/* Orta FAB */}
        <Pressable
          onPress={() =>
            go((isPlus ? '/plus' : '/(modals)/plus-paywall') as Href)
          }
          android_ripple={{ color: '#ffe4d1', borderless: true, radius: FAB_SIZE / 2 }}
          style={styles.fab}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isPlus ? 'Dümenci Merkezi' : 'Dümenciye Katıl'}
        >
          <View style={styles.fabClip}>
            <Image source={require('@/assets/images/dumendenci.png')} style={styles.fabImg} />
          </View>
        </Pressable>

        <Item label="Market" active={pathname === '/market'} onPress={() => go('/market' as Href)} />
        <Item label="Vitrin" active={pathname === '/vitrin'} onPress={() => go('/vitrin' as Href)} />
      </View>
    </View>
  );
}

export default memo(BottomBar);

const styles = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, bottom: 0 },
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
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    overflow: 'visible',
  },
  item: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  itemText: { fontWeight: '800', fontSize: 13, includeFontPadding: false },

  // Dış: çerçeve + gölge
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
