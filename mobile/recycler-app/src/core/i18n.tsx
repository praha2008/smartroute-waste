/**
 * Tiny i18n: English + Tamil. `t('key', {n: 3})` anywhere; <LanguageProvider> re-renders the app
 * when the language changes. The choice is saved on the phone (and on the user's account).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { STRINGS } from './strings';

export type Lang = 'en' | 'ta';
const KEY = 'smartroute.lang';
let current: Lang = 'en';

export function getLang(): Lang {
  return current;
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const entry = STRINGS[key];
  let s = entry ? entry[current] ?? entry.en : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

interface LangState {
  lang: Lang;
  chosen: boolean; // has the user picked a language yet (first launch shows the picker)
  ready: boolean;
  setLang: (l: Lang) => Promise<void>;
}

const Ctx = createContext<LangState>({ lang: 'en', chosen: true, ready: true, setLang: async () => {} });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  const [chosen, setChosen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      let saved: string | null = null;
      try {
        saved = await AsyncStorage.getItem(KEY);
      } catch {
        /* ignore */
      }
      const device = Localization.getLocales?.()[0]?.languageCode === 'ta' ? 'ta' : 'en';
      const l = (saved === 'ta' || saved === 'en' ? saved : device) as Lang;
      current = l;
      setLangState(l);
      setChosen(!!saved);
      setReady(true);
    })();
  }, []);

  const setLang = useCallback(async (l: Lang) => {
    current = l;
    setLangState(l);
    setChosen(true);
    try {
      await AsyncStorage.setItem(KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  return <Ctx.Provider value={{ lang, chosen, ready, setLang }}>{children}</Ctx.Provider>;
}

export function useLang() {
  return useContext(Ctx);
}
