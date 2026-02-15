// components/CartRibbon.tsx
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/lib/i18n';

const ORANGE = '#FF6B00';
const BORDER = '#F2D9C8';
const BG = '#FFFFFF';

type Props = {
  count: number;
  totalXp: number;
  onPress: () => void;
  /** Orta turuncu + butonun DIŞ çapı (halo dâhil) */
  fabDiameter?: number;
  /** Alt tab bar yüksekliği (üstünden başla) */
  tabBarTop?: number;
  /** Tab barın İÇİNE ne kadar girsin (negatif = barın içine göm) */
  overlap?: number;
};

export default function CartRibbon({
  count,
  totalXp,
  onPress,
  fabDiameter = 92,
  tabBarTop = 80,
  overlap = -20,       // önceki -34'tü; biraz yukarı aldık
}: Props) {
  const ins = useSafeAreaInsets();
  const visible = count > 0;
  const { t, numberLocale } = useI18n();

  const y = useRef(new Animated.Value(60)).current;
  const op = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(y, {
        toValue: visible ? 0 : 60,
        duration: 220,
        easing: visible ? Easing.out(Easing.quad) : Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(op, {
        toValue: visible ? 1 : 0,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible]);

  if (!visible && Platform.OS === 'android') return null;

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.wrap,
        {
          bottom: (ins.bottom || 12) + tabBarTop + overlap,
          transform: [{ translateY: y }],
          opacity: op,
        },
      ]}
    >
      <View style={styles.card}>
        {/* Sol */}
        <Pressable onPress={onPress} style={styles.side} android_ripple={{ color: '#0000000f' }}>
          <View style={styles.badge}><Text style={styles.badgeTxt}>🧺</Text></View>
          <Text style={styles.bold}>{t('cart.couponCount', { count })}</Text>
        </Pressable>

        {/* Sağ */}
        <Pressable onPress={onPress} style={[styles.side, { justifyContent: 'flex-end' }]} android_ripple={{ color: '#0000000f' }}>
          <Text style={styles.muted}>{t('cart.total')}</Text>
          <Text style={styles.total}>
            {totalXp.toLocaleString(numberLocale)} <Text style={{ fontWeight: '900' }}>XP</Text>
          </Text>
        </Pressable>

        {/* ÜST ÇENTİK (sadece maske; kenar çizgisi ve gölge YOK) */}
        <View
          pointerEvents="none"
          style={[
            styles.notchClip,
            {
              width: fabDiameter,
              height: fabDiameter / 2,
              left: '50%',
              marginLeft: -fabDiameter / 2,
              top: 0,
            },
          ]}
        >
          <View
            style={{
              position: 'absolute',
              width: fabDiameter,
              height: fabDiameter,
              borderRadius: fabDiameter / 2,
              top: -fabDiameter / 2, // yalnız alt yarısı görünür
              backgroundColor: BG,    // çizgi/gölge yok -> tertemiz
            }}
          />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // tab bar ve + ÜSTTE kalsın → ribbon alttan akıyor
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 0,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: BG,
    borderRadius: 18,
    borderWidth: 2,         // dikiş inceltildi
 borderColor: '#FF6B00',
    overflow: 'hidden',
    paddingHorizontal: 12,    // incelttik
    paddingBottom: 8,         // incelttik
    paddingTop: 10,           // incelttik (önce 48'di)
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#ff7010ff',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },

  notchClip: {
    position: 'absolute',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },

  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#FFF2E8', borderWidth: 1, borderColor: '#ff6200ff',
    alignItems: 'center', justifyContent: 'center',
  },
  badgeTxt: { color: ORANGE, fontWeight: '900' },
  bold: { fontWeight: '800' },
  muted: { color: '#6B7280', marginRight: 6, fontWeight: '700' },
  total: { color: ORANGE, fontWeight: '800' },
});
