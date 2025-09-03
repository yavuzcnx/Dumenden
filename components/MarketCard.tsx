'use client';

import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

/** ---------- Types ---------- */
export type Line = {
  name: string;
  /** odds (decimal). Eski kayıt 0–1 ise normalize edilir. */
  yesPrice?: number;
  noPrice?: number;
};

export type Market = {
  id: string | number;
  title: string;
  description?: string;            // ✅ açıklama
  category?: string;
  closing_date?: string;
  market_type?: 'binary' | 'multi';
  /** odds (decimal). Eski kayıt 0–1 ise normalize edilir. */
  yes_price?: number;
  no_price?: number;
  lines?: Line[];
  image_url?: string | null;
  is_open?: boolean;
  liquidity?: number;
};

type Props = {
  item: Market;
  /** slider kartı için hafif büyük görünüm */
  compact?: boolean;
  onPress: () => void;
  onTapYes: (m: Market, label: string, price: number) => void;
  onTapNo: (m: Market, label: string, price: number) => void;
  timeLeftLabel: string;
  urgent?: boolean;
  disabled?: boolean;
};

/** --- helpers --- */
const normOdds = (v?: number) => {
  if (v == null) return undefined;
  if (v > 0 && v < 1) return +(1 / Math.max(0.01, v)).toFixed(2);
  return +(+v).toFixed(2);
};
const payout = (stake: number, odds: number) => Math.round(stake * odds);
const StakePreview = 100;

/** Geçerli satırlar (isim + odds) */
const getValidLines = (item: Market) => {
  const ls = (item.lines ?? []).map((l) => ({
    ...l,
    yesPrice: normOdds(l.yesPrice),
    noPrice: normOdds(l.noPrice),
  }));
  return ls.filter(
    (l) =>
      !!l.name &&
      typeof l.yesPrice === 'number' &&
      typeof l.noPrice === 'number' &&
      l.yesPrice! >= 1.01 &&
      l.noPrice! >= 1.01
  );
};

export default function MarketCard({
  item,
  compact,
  onPress,
  onTapYes,
  onTapNo,
  timeLeftLabel,
  urgent,
  disabled,
}: Props) {
  const yOdds = normOdds(item.yes_price);
  const nOdds = normOdds(item.no_price);

  const validLines = getValidLines(item);
  const isMulti = (item.market_type === 'multi' && validLines.length > 0) || validLines.length > 0;
  const isBinary = !isMulti;

  // kart ve sabit kısımların yükseklikleri — slider bir tık daha büyük
  const CARD_H = compact ? 276 : 256;
  const PILL_ROW_H = 92;
  const DESC_H = 40;

  const pill = (label: 'Yes' | 'No', odds?: number, tap?: () => void) => {
    const bg = label === 'Yes' ? '#e9f0ff' : '#fde9f1';
    const tx = label === 'Yes' ? '#2657ff' : '#d0146a';
    const dis = disabled || !odds || odds < 1.01;

    return (
      <TouchableOpacity
        disabled={dis}
        onPress={tap}
        style={[styles.pill, { backgroundColor: bg, opacity: dis ? 0.35 : 1 }]}
        activeOpacity={0.8}
      >
        <Text style={[styles.pillTitle, { color: tx }]}>{label}</Text>
        <Text style={styles.pillSub}>
          {StakePreview} XP → {odds ? payout(StakePreview, odds) : '—'} XP
        </Text>
        <Text style={styles.pillOdds}>{odds ? `${odds.toFixed(2)}x` : ''}</Text>
      </TouchableOpacity>
    );
  };

  const Header = (
    <View style={styles.headerRow}>
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, { backgroundColor: '#eee' }]} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={[styles.sub, urgent && !disabled ? styles.subUrgent : undefined]}>
          {item.category ?? '—'} • {timeLeftLabel}
          {disabled ? ' • Süre doldu' : ''}
        </Text>
      </View>
      {disabled && (
        <View style={styles.badgeOff}>
          <Text style={styles.badgeOffTxt}>Kapalı</Text>
        </View>
      )}
    </View>
  );

  /** +N daha rozeti (multi > 2 satır) */
  const ExtraBadge = ({ count }: { count: number }) =>
    count > 0 ? (
      <View style={styles.moreBadge}>
        <Text style={styles.moreBadgeTxt}>+{count} daha</Text>
      </View>
    ) : null;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={[
        styles.card,
        { minHeight: CARD_H, overflow: 'hidden' },
      ]}
    >
      {Header}

      {isBinary ? (
        <>
          <View style={[styles.pillRow, { height: PILL_ROW_H }]}>
            {pill('Yes', yOdds, () => onTapYes(item, 'YES/NO', yOdds!))}
            {pill('No', nOdds, () => onTapNo(item, 'YES/NO', nOdds!))}
          </View>

          {/* açıklama alanı (sabit yükseklik) */}
          <View style={{ minHeight: DESC_H, justifyContent: 'center' }}>
            {item.description ? (
              <Text style={styles.desc} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
          </View>
        </>
      ) : (
        <>
          {(validLines.slice(0, 2) as Line[]).map((l, idx) => (
            <View key={`${item.id}-row-${idx}`} style={[styles.pillRow, { height: PILL_ROW_H }]}>
              {pill('Yes', l.yesPrice, () => onTapYes(item, l.name, l.yesPrice!))}
              {pill('No', l.noPrice, () => onTapNo(item, l.name, l.noPrice!))}
            </View>
          ))}

          {/* açıklama alanı (sabit yükseklik) */}
          <View style={{ minHeight: DESC_H, justifyContent: 'center' }}>
            {item.description ? (
              <Text style={styles.desc} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
          </View>

          <ExtraBadge count={Math.max(0, validLines.length - 2)} />
        </>
      )}

      <Text style={styles.liq}>
        {(item.liquidity ?? 0).toLocaleString('tr-TR')} XP likidite
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  thumb: { width: 56, height: 56, borderRadius: 12 },
  title: { fontSize: 18, fontWeight: '900' },
  sub: { color: '#777', marginTop: 2 },
  subUrgent: { color: '#b71c1c', fontWeight: '700' },
  badgeOff: { backgroundColor: '#e0e0e0', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  badgeOffTxt: { fontWeight: '800', color: '#757575' },

  pillRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  pill: {
    flex: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  pillTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  pillSub: { color: '#555', fontWeight: '600' },
  pillOdds: { color: '#999', marginTop: 4, fontWeight: '700' },

  // açıklama
  desc: {
    textAlign: 'center',
    color: '#666',
    fontSize: 13,
    fontWeight: '500',
  },

  moreBadge: {
    position: 'absolute',
    right: 16,
    bottom: 54,
    backgroundColor: '#FF6B00',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  moreBadgeTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },

  liq: { marginTop: 10, color: '#9e9e9e', fontWeight: '600' },
});
