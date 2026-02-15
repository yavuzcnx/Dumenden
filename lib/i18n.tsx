import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import en from '@/locales/en.json';
import tr from '@/locales/tr.json';

export type LanguageCode = 'en' | 'tr';

type TranslationDict = Record<string, string | TranslationDict>;

type I18nContextValue = {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
  ready: boolean;
  numberLocale: string;
};

const STORAGE_KEY = 'app_language';

const DICTS: Record<LanguageCode, TranslationDict> = {
  en: en as TranslationDict,
  tr: tr as TranslationDict,
};

const getDeviceLocale = () => {
  try {
    const locale = Intl?.DateTimeFormat?.().resolvedOptions()?.locale;
    return typeof locale === 'string' ? locale : 'en-US';
  } catch {
    return 'en-US';
  }
};

const normalizeLanguage = (raw?: string | null): LanguageCode =>
  (raw || '').toLowerCase().startsWith('tr') ? 'tr' : 'en';

const getNumberLocale = (lang: LanguageCode) => (lang === 'tr' ? 'tr-TR' : 'en-US');

const getValue = (dict: TranslationDict, key: string): string | undefined => {
  const parts = key.split('.');
  let node: any = dict;
  for (const part of parts) {
    if (!node || typeof node !== 'object' || !(part in node)) return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
};

const interpolate = (template: string, params?: Record<string, string | number>) => {
  if (!params) return template;
  let out = template;
  Object.entries(params).forEach(([k, v]) => {
    out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  });
  return out;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        const next = stored ? normalizeLanguage(stored) : normalizeLanguage(getDeviceLocale());
        if (!stored) await AsyncStorage.setItem(STORAGE_KEY, next);
        if (alive) setLanguageState(next);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const setLanguage = useCallback(async (lang: LanguageCode) => {
    setLanguageState(lang);
    await AsyncStorage.setItem(STORAGE_KEY, lang);
  }, []);

  const dict = DICTS[language] ?? DICTS.en;
  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const raw = getValue(dict, key) ?? key;
      return interpolate(raw, params);
    },
    [dict],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      t,
      ready,
      numberLocale: getNumberLocale(language),
    }),
    [language, setLanguage, t, ready],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}

