/**
 * Full-screen location picker in the style of Uber / Rapido:
 *  - a fixed pin in the centre of the map; drag the map to move it
 *  - a search box with live suggestions (type "Katpadi station" → pick from the list)
 *  - an address card that updates when the map stops moving
 *  - a "my location" button
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, Keyboard, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { api } from './api';
import { getCurrentLocation } from './device';
import { t } from './i18n';
import MapView, { MapHandle } from './MapView';
import { colors, font, radius, shadow, space } from './theme';
import { haptic } from './haptics';
import { Button } from './ui';

export const VELLORE: [number, number] = [12.9165, 79.1325];

export interface PickedLocation {
  lat: number;
  lng: number;
  address: string;
  title?: string;
}

interface Suggestion {
  title: string;
  subtitle: string;
  lat: number;
  lng: number;
}

interface Props {
  visible: boolean;
  initial?: { lat: number; lng: number } | null;
  title?: string;
  onClose: () => void;
  onConfirm: (p: PickedLocation) => void;
}

export default function LocationPicker(props: Props) {
  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose} statusBarTranslucent>
      <SafeAreaProvider>{props.visible && <PickerBody {...props} />}</SafeAreaProvider>
    </Modal>
  );
}

function PickerBody({ initial, title, onClose, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  const map = useRef<MapHandle>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number }>(initial ?? { lat: VELLORE[0], lng: VELLORE[1] });
  const [addr, setAddr] = useState<{ title: string; subtitle: string } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [moving, setMoving] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const lift = useRef(new Animated.Value(0)).current;
  const reqId = useRef(0);
  const startCenter = useRef<[number, number]>(initial ? [initial.lat, initial.lng] : VELLORE).current;

  // if no starting point was given, jump to the phone's location
  useEffect(() => {
    if (!initial) locate(false);
    else resolve(initial.lat, initial.lng);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // debounced search-as-you-type
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = ++reqId.current;
    const timer = setTimeout(async () => {
      try {
        const r = await api.get<{ results: Suggestion[] }>(`/geo/search?q=${encodeURIComponent(q)}&lat=${center.lat}&lng=${center.lng}&limit=8`);
        if (id === reqId.current) setResults(r.results ?? []);
      } catch {
        if (id === reqId.current) setResults([]);
      } finally {
        if (id === reqId.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const animatePin = (up: boolean) => Animated.spring(lift, { toValue: up ? 1 : 0, useNativeDriver: true, speed: 30, bounciness: up ? 0 : 10 }).start();

  async function resolve(lat: number, lng: number) {
    setResolving(true);
    try {
      const r = await api.get<{ title: string; subtitle: string }>(`/geo/reverse?lat=${lat}&lng=${lng}`);
      setAddr({ title: r.title, subtitle: r.subtitle });
    } catch {
      setAddr({ title: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, subtitle: '' });
    } finally {
      setResolving(false);
    }
  }

  async function locate(showAlert = true) {
    setLocating(true);
    const p = await getCurrentLocation(showAlert);
    setLocating(false);
    if (p) {
      map.current?.flyTo(p.lat, p.lng, 17);
      haptic.tap();
    } else if (!initial) {
      resolve(center.lat, center.lng);
    }
  }

  function choose(s: Suggestion) {
    Keyboard.dismiss();
    setSearchOpen(false);
    setQuery('');
    setResults([]);
    setAddr({ title: s.title, subtitle: s.subtitle });
    map.current?.flyTo(s.lat, s.lng, 17);
    haptic.tap();
  }

  const pinY = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -14] });
  const shadowScale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="dark" />
      <MapView
        ref={map}
        height="100%"
        rounded={false}
        fit={false}
        picker
        center={startCenter}
        zoom={initial ? 17 : 14}
        style={StyleSheet.absoluteFill as any}
        onMoveStart={() => {
          setMoving(true);
          animatePin(true);
          if (searchOpen) {
            Keyboard.dismiss();
            setSearchOpen(false);
          }
        }}
        onCenter={(lat, lng) => {
          setMoving(false);
          animatePin(false);
          setCenter({ lat, lng });
          resolve(lat, lng);
        }}
      />

      {/* fixed centre pin */}
      <View pointerEvents="none" style={styles.pinWrap}>
        <Animated.View style={{ alignItems: 'center', transform: [{ translateY: pinY }] }}>
          <View style={styles.pinLabel}>
            <Text style={{ color: colors.white, fontSize: 12, fontWeight: '700' }}>{moving ? '…' : t('loc.title')}</Text>
          </View>
          <View style={styles.pinHead}>
            <View style={styles.pinDot} />
          </View>
          <View style={styles.pinStick} />
        </Animated.View>
        <Animated.View style={[styles.pinShadow, { transform: [{ scaleX: shadowScale }] }]} />
      </View>

      {/* top: back + search */}
      <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.searchBar}>
          <Pressable onPress={onClose} hitSlop={10} style={{ paddingRight: 6 }}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput
            value={query}
            onChangeText={(v) => {
              setQuery(v);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            placeholder={t('loc.search')}
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searching ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={20} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>

        {searchOpen && query.trim().length >= 2 && (
          <View style={styles.results}>
            {results.length === 0 && !searching ? (
              <Text style={[font.small, { padding: space.lg }]}>{t('loc.noResults')}</Text>
            ) : (
              <FlatList
                data={results}
                keyboardShouldPersistTaps="handled"
                keyExtractor={(r, i) => `${r.lat},${r.lng},${i}`}
                renderItem={({ item, index }) => (
                  <Pressable
                    onPress={() => choose(item)}
                    style={({ pressed }) => [styles.resultRow, index < results.length - 1 && styles.resultBorder, pressed && { backgroundColor: colors.field }]}
                  >
                    <View style={styles.resultIcon}>
                      <Ionicons name="location-outline" size={18} color={colors.accentDark} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[font.body, { fontWeight: '700' }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      {item.subtitle ? (
                        <Text style={[font.small, { fontSize: 12 }]} numberOfLines={1}>
                          {item.subtitle}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                )}
              />
            )}
          </View>
        )}
      </View>

      {/* my-location button */}
      <Pressable onPress={() => locate(true)} style={[styles.locBtn, { bottom: 210 + insets.bottom }]}>
        {locating ? <ActivityIndicator color={colors.accent} /> : <Ionicons name="locate" size={22} color={colors.accentDark} />}
      </Pressable>

      {/* bottom sheet */}
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
        <View style={styles.grabber} />
        <Text style={font.tiny}>{(title ?? t('loc.title')).toUpperCase()}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm, minHeight: 50 }}>
          <View style={[styles.resultIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="location" size={20} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            {resolving || moving || !addr ? (
              <Text style={[font.body, { color: colors.textFaint }]}>{t('loc.finding')}</Text>
            ) : (
              <>
                <Text style={[font.h3]} numberOfLines={1}>
                  {addr.title}
                </Text>
                {addr.subtitle ? (
                  <Text style={font.small} numberOfLines={2}>
                    {addr.subtitle}
                  </Text>
                ) : null}
              </>
            )}
          </View>
        </View>
        <Text style={[font.small, { fontSize: 12, marginTop: space.sm }]}>{t('loc.hint')}</Text>
        <Button
          title={t('loc.confirm')}
          icon="checkmark-circle"
          disabled={moving}
          style={{ marginTop: space.md }}
          onPress={() => {
            haptic.success();
            const address = addr ? [addr.title, addr.subtitle].filter(Boolean).join(', ') : `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`;
            onConfirm({ lat: center.lat, lng: center.lng, address, title: addr?.title });
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: space.md },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    height: 54,
    ...shadow,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 10 },
  results: { marginTop: space.sm, backgroundColor: colors.card, borderRadius: radius.lg, maxHeight: 340, overflow: 'hidden', ...shadow },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 12, paddingHorizontal: space.md },
  resultBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  resultIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.field, alignItems: 'center', justifyContent: 'center' },
  pinWrap: { position: 'absolute', left: 0, right: 0, top: '50%', alignItems: 'center', marginTop: -80 }, // tip of the stick = map centre
  pinLabel: { backgroundColor: colors.ink, paddingHorizontal: 10, height: 24, justifyContent: 'center', borderRadius: 8, marginBottom: 6 },
  pinHead: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.white, ...shadow },
  pinDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.white },
  pinStick: { width: 3, height: 16, backgroundColor: colors.accentDark, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  pinShadow: { width: 16, height: 5, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.28)', marginTop: 1 },
  locBtn: {
    position: 'absolute',
    right: space.lg,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    ...shadow,
    shadowOffset: { width: 0, height: -4 },
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: space.md },
});
