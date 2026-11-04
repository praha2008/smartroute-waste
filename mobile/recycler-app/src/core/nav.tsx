/**
 * Tiny dependency-free navigator: bottom tabs + a push/pop stack on top.
 * Tab screens stay mounted (state is kept); pushed screens slide over them.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t as tr } from './i18n';
import { colors, shadow } from './theme';
import { haptic } from './haptics';

export type Params = Record<string, any>;
export type ScreenComponent = React.ComponentType<{ params: Params }>;

export interface TabDef {
  key: string;
  title: string; // translation key (or plain text)
  icon: keyof typeof Ionicons.glyphMap;
  component: ScreenComponent;
}

interface Entry {
  key: number;
  name: string;
  params: Params;
}

interface NavApi {
  push: (name: string, params?: Params) => void;
  pop: () => void;
  popToTop: () => void;
  replace: (name: string, params?: Params) => void;
  switchTab: (key: string) => void;
  tab: string;
}

const NavContext = createContext<NavApi | null>(null);
const FocusContext = createContext<boolean>(true);

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav outside Navigator');
  return ctx;
}

/** Like useNav, but returns null outside the Navigator (e.g. login / forced-password screens). */
export function useNavMaybe(): NavApi | null {
  return useContext(NavContext);
}

/** Runs `effect` every time the screen comes to the front (like react-navigation's useFocusEffect). */
export function useFocusEffect(effect: () => void | (() => void)) {
  const focused = useContext(FocusContext);
  const ref = useRef(effect);
  ref.current = effect;
  useEffect(() => {
    if (focused) return ref.current();
  }, [focused]);
}

export function useIsFocused() {
  return useContext(FocusContext);
}

let nextKey = 1;

function StackScreen({ entry, top, Component }: { entry: Entry; top: boolean; Component: ScreenComponent }) {
  const slide = useRef(new Animated.Value(Dimensions.get('window').width)).current;
  useEffect(() => {
    Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: true }).start();
  }, [slide]);
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.stackScreen, { transform: [{ translateX: slide }] }]}
      pointerEvents={top ? 'auto' : 'none'}
    >
      <FocusContext.Provider value={top}>
        <Component params={entry.params} />
      </FocusContext.Provider>
    </Animated.View>
  );
}

export function Navigator({ tabs, screens }: { tabs: TabDef[]; screens: Record<string, ScreenComponent> }) {
  const [tab, setTab] = useState(tabs[0].key);
  const [visited, setVisited] = useState<Set<string>>(new Set([tabs[0].key]));
  const [stack, setStack] = useState<Entry[]>([]);
  const insets = useSafeAreaInsets();

  const push = useCallback((name: string, params: Params = {}) => {
    setStack((s) => [...s, { key: nextKey++, name, params }]);
  }, []);
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const popToTop = useCallback(() => setStack([]), []);
  const replace = useCallback((name: string, params: Params = {}) => {
    setStack((s) => [...s.slice(0, -1), { key: nextKey++, name, params }]);
  }, []);
  const switchTab = useCallback((key: string) => {
    setStack([]);
    setTab(key);
    setVisited((v) => new Set(v).add(key));
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length) {
        pop();
        return true;
      }
      if (tab !== tabs[0].key) {
        switchTab(tabs[0].key);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, tab, tabs, pop, switchTab]);

  const api = useMemo(() => ({ push, pop, popToTop, replace, switchTab, tab }), [push, pop, popToTop, replace, switchTab, tab]);

  return (
    <NavContext.Provider value={api}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1 }}>
          {tabs.map((t) =>
            visited.has(t.key) ? (
              <View key={t.key} style={[StyleSheet.absoluteFill, { display: t.key === tab ? 'flex' : 'none' }]}>
                <FocusContext.Provider value={t.key === tab && stack.length === 0}>
                  <t.component params={{}} />
                </FocusContext.Provider>
              </View>
            ) : null,
          )}
        </View>
        <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          {tabs.map((t) => {
            const active = t.key === tab;
            return (
              <Pressable
                key={t.key}
                style={styles.tabItem}
                onPress={() => {
                  if (!active) haptic.tap();
                  switchTab(t.key);
                }}
                hitSlop={6}
              >
                <View style={[styles.tabPill, active && { backgroundColor: colors.accentSoft }]}>
                  <Ionicons
                    name={(active ? t.icon : `${String(t.icon).replace(/-outline$/, '')}-outline`) as any}
                    size={22}
                    color={active ? colors.accentDark : colors.textFaint}
                  />
                </View>
                <Text style={[styles.tabLabel, { color: active ? colors.accentDark : colors.textFaint, fontWeight: active ? '800' : '600' }]} numberOfLines={1}>
                  {tr(t.title)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {stack.map((entry, i) => {
          const Component = screens[entry.name];
          if (!Component) return null;
          return <StackScreen key={entry.key} entry={entry} top={i === stack.length - 1} Component={Component} />;
        })}
      </View>
    </NavContext.Provider>
  );
}

const styles = StyleSheet.create({
  stackScreen: { backgroundColor: colors.bg },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    paddingTop: 8,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    ...shadow,
    shadowOffset: { width: 0, height: -3 },
    elevation: 12,
  },
  tabItem: { flex: 1, alignItems: 'center', gap: 3 },
  tabPill: { paddingHorizontal: 20, paddingVertical: 5, borderRadius: 999 },
  tabLabel: { fontSize: 11 },
});
