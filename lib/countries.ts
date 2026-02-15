import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type CountryCode = 'TR' | 'DE' | 'US';

export type CountryOption = {
  code: CountryCode;
  nameKey: string;
};

export const COUNTRIES: CountryOption[] = [
  { code: 'TR', nameKey: 'countries.tr' },
  { code: 'DE', nameKey: 'countries.de' },
  { code: 'US', nameKey: 'countries.us' },
];

const STORAGE_KEY = 'selected_country';

export const flagEmoji = (code: string) => {
  if (!code || code.length !== 2) return '';
  const base = 0x1f1e6;
  const chars = code.toUpperCase().split('');
  return String.fromCodePoint(base + chars[0].charCodeAt(0) - 65, base + chars[1].charCodeAt(0) - 65);
};

const normalizeCountry = (raw?: string | null): CountryCode => {
  const upper = (raw || '').toUpperCase();
  const match = COUNTRIES.find((c) => c.code === upper);
  return match?.code ?? 'TR';
};

const getDeviceRegion = () => {
  try {
    const locale = Intl?.DateTimeFormat?.().resolvedOptions()?.locale || '';
    const match = locale.match(/[-_](\w{2})/);
    return match?.[1]?.toUpperCase() || null;
  } catch {
    return null;
  }
};

const getDefaultCountry = () => normalizeCountry(getDeviceRegion());

export function useCountry() {
  const [country, setCountryState] = useState<CountryCode>('TR');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        const next = stored ? normalizeCountry(stored) : getDefaultCountry();
        if (!stored) await AsyncStorage.setItem(STORAGE_KEY, next);
        if (alive) setCountryState(next);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const setCountry = useCallback(async (code: CountryCode) => {
    setCountryState(code);
    await AsyncStorage.setItem(STORAGE_KEY, code);
  }, []);

  const option = useMemo(() => COUNTRIES.find((c) => c.code === country) ?? COUNTRIES[0], [country]);

  return { country, setCountry, ready, option };
}

