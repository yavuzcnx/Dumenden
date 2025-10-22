'use client';

import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

/** ---------- Types ---------- */
export type Line = {
  name: string;
  /** odds (decimal). Eski kayıt 0–1 ise normalize edilir. */
  yesPrice?: number;
  noPrice?: number;
  /** aday görseli (public url) */
  imageUrl?: string | null;
};

export type Market = {
  id: string | number;
  title: string;
  description?: string;
  category?: string;
  closing_date?: string;
  market_type?: 'binary' | 'multi';
  /** odds (decimal). Eski kayıt 0–1 ise normalize edilir. */
  yes_price?: number | null;
  no_price?: number | null;
  lines?: Line[] | null;
  image_url?: string | null;
  is_open?: boolean;
  liquidity?: number | null;
};

type Props = {
  item: Market;
  compact?: boolean;
  onPress: () => void;
  onTapYes: (m: Market, label: string, price: number) => void;
  onTapNo: (m: Market, label: string, price: number) => void;
  timeLeftLabel: string;
  urgent?: boolean;
  disabled?: boolean;
};

/** --- helpers --- */
const normOdds = (v?: number | null) => {
  if (v == null) return undefined;
  if (v > 0 && v < 1) return +(1 / Math.max(0.01, v)).toFixed(2);
  return +(+v).toFixed(2);
};

const payout = (stake: number, odds: number) => Math.round(stake * odds);
const StakePreview = 100;

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
  const yOdds = normOdds(item.yes_price ?? undefined);
  const nOdds = normOdds(item.no_price ?? undefined);

  const validLines = getValidLines(item);
  const isMulti = (item.market_type === 'multi' && validLines.length > 0) || validLines.length > 0;
  const isBinary = !isMulti;

  const PILL_ROW_H = 92;
  const DESC_H = 40;

  const bigPill = (label: 'Yes' | 'No', odds?: number, tap?: () => void) => {
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

  const CandidateRow = ({ l }: { l: Line }) => {
    const disYes = disabled || !l.yesPrice || l.yesPrice < 1.01;
    const disNo = disabled || !l.noPrice || l.noPrice < 1.01;

    return (
      <View style={styles.candRow}>
        <View style={styles.candLeft}>
          {l.imageUrl ? (
            <Image source={{ uri: l.imageUrl }} style={styles.candAvatar} />
          ) : (
            <View style={[styles.candAvatar, { backgroundColor: '#eee' }]} />
          )}
          <Text numberOfLines={1} style={styles.candName}>
            {l.name}
          </Text>
        </View>

        <View style={styles.candChips}>
          <TouchableOpacity
            disabled={disYes}
            onPress={() => onTapYes(item, l.name, l.yesPrice!)}
            style={[styles.chip, styles.chipYes, disYes && styles.chipDisabled]}
            activeOpacity={0.85}
          >
            <Text style={styles.chipTxt}>Yes {l.yesPrice?.toFixed(2)}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={disNo}
            onPress={() => onTapNo(item, l.name, l.noPrice!)}
            style={[styles.chip, styles.chipNo, disNo && styles.chipDisabled]}
            activeOpacity={0.85}
          >
            <Text style={styles.chipTxt}>No {l.noPrice?.toFixed(2)}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={styles.card}>
      {Header}

      {isBinary ? (
        <>
          <View style={[styles.pillRow, { height: PILL_ROW_H }]}>
            {bigPill('Yes', yOdds, () => onTapYes(item, 'YES/NO', yOdds!))}
            {bigPill('No', nOdds, () => onTapNo(item, 'YES/NO', nOdds!))}
          </View>

          <View style={{ minHeight: DESC_H, justifyContent: 'center' }}>
            {item.description ? <Text style={styles.desc} numberOfLines={2}>{item.description}</Text> : null}
          </View>
        </>
      ) : (
        <>
          {validLines.map((l, idx) => (
            <CandidateRow key={`${item.id}-cand-${idx}`} l={l} />
          ))}
          <View style={{ minHeight: DESC_H, justifyContent: 'center' }}>
            {item.description ? <Text style={styles.desc} numberOfLines={2}>{item.description}</Text> : null}
          </View>
        </>
      )}

      <Text style={styles.liq}>{(item.liquidity ?? 0).toLocaleString('tr-TR')} XP likidite</Text>
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
    marginBottom: 12,
  },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  thumb: { width: 56, height: 56, borderRadius: 12 },
  title: { fontSize: 18, fontWeight: '900' },
  sub: { color: '#777', marginTop: 2 },
  subUrgent: { color: '#b71c1c', fontWeight: '700' },
  badgeOff: { backgroundColor: '#e0e0e0', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  badgeOffTxt: { fontWeight: '800', color: '#757575' },

  // binary pills
  pillRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  pill: { flex: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  pillTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  pillSub: { color: '#555', fontWeight: '600' },
  pillOdds: { color: '#999', marginTop: 4, fontWeight: '700' },

  // multi (Kalshi) rows
  candRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eee',
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginTop: 8,
    backgroundColor: '#fff',
  },
  candLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  candAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0f0f0' },
  candName: { fontWeight: '800', color: '#222', flexShrink: 1 },

  candChips: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12 },
  chipYes: { backgroundColor: '#e9f0ff' },
  chipNo: { backgroundColor: '#fde9f1' },
  chipDisabled: { opacity: 0.35 },
  chipTxt: { fontWeight: '900', color: '#333' },

  // açıklama
  desc: { textAlign: 'center', color: '#666', fontSize: 13, fontWeight: '500' },

  liq: { marginTop: 10, color: '#9e9e9e', fontWeight: '600' },
});
