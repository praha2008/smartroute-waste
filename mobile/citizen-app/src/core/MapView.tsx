/**
 * Real Google Maps (native SDK via react-native-maps) — the same map, gestures, labels and
 * 3D buildings as the Google Maps app.
 *
 * Features: markers (numbered pins, truck, home, depot, dot), polylines, auto-fit, tap-to-pick,
 * and a "picker" mode that reports the map centre while the user drags (used by LocationPicker
 * with a fixed pin on top, like Uber / Rapido).
 *
 * APK builds need an Android Maps key in app.json (node set-maps-key.js <KEY>); Expo Go works without one.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import RNMapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';

import { colors, radius } from './theme';

export interface MapMarker {
  id: string | number;
  lat: number;
  lng: number;
  color?: string;
  label?: string; // short text inside the pin (e.g. stop number)
  title?: string; // callout text
  kind?: 'pin' | 'truck' | 'home' | 'dot' | 'depot';
}

export interface MapLine {
  points: [number, number][];
  color?: string;
  dashed?: boolean;
}

export interface MapHandle {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
}

interface Props {
  center?: [number, number];
  zoom?: number;
  markers?: MapMarker[];
  lines?: MapLine[];
  fit?: boolean;
  style?: ViewStyle;
  height?: number | '100%';
  rounded?: boolean;
  interactive?: boolean;
  /** report the centre while the user pans (for a fixed centre pin) */
  picker?: boolean;
  /** show the blue "you are here" dot */
  showUser?: boolean;
  onPress?: (lat: number, lng: number) => void;
  onMarkerPress?: (id: string | number) => void;
  onMoveStart?: () => void;
  onCenter?: (lat: number, lng: number) => void;
}

const VELLORE: [number, number] = [12.9165, 79.1325];

function regionFor([lat, lng]: [number, number], zoom = 14): Region {
  const d = 360 / Math.pow(2, zoom);
  return { latitude: lat, longitude: lng, latitudeDelta: d, longitudeDelta: d };
}

/** Custom marker view. Android needs tracksViewChanges on for the first frames, then off for speed. */
function Pin({ m, onPress }: { m: MapMarker; onPress?: (id: string | number) => void }) {
  const [track, setTrack] = useState(true);
  useEffect(() => {
    setTrack(true);
    const tm = setTimeout(() => setTrack(false), 600);
    return () => clearTimeout(tm);
  }, [m.color, m.label, m.kind]);
  const kind = m.kind ?? 'pin';
  const c = m.color ?? colors.accent;
  let body: React.ReactNode;
  if (kind === 'pin') {
    body = (
      <View style={styles.pinWrap}>
        <View style={[styles.pin, { backgroundColor: c }]}>
          <Text style={styles.pinText} numberOfLines={1}>
            {m.label ?? ''}
          </Text>
        </View>
        <View style={[styles.pinTip, { borderTopColor: c }]} />
      </View>
    );
  } else if (kind === 'dot') {
    body = <View style={[styles.dot, { backgroundColor: c }]} />;
  } else {
    const glyph = kind === 'truck' ? '🚛' : kind === 'home' ? '🏠' : '🏢';
    body = (
      <View style={[styles.round, { borderColor: c }]}>
        <Text style={{ fontSize: 18 }}>{glyph}</Text>
      </View>
    );
  }
  return (
    <Marker
      coordinate={{ latitude: m.lat, longitude: m.lng }}
      anchor={kind === 'pin' ? { x: 0.5, y: 1 } : { x: 0.5, y: 0.5 }}
      tracksViewChanges={track}
      title={m.title}
      zIndex={kind === 'truck' ? 10 : 1}
      onPress={() => onPress?.(m.id)}
    >
      {body}
    </Marker>
  );
}

const MapView = forwardRef<MapHandle, Props>(function MapView(
  { center, zoom, markers, lines, fit = true, style, height = 260, rounded = true, interactive = true, picker, showUser, onPress, onMarkerPress, onMoveStart, onCenter },
  ref,
) {
  const map = useRef<RNMapView>(null);
  const [ready, setReady] = useState(false);
  const fitted = useRef(false);
  const moving = useRef(false);
  const initial = useMemo(() => regionFor(center ?? VELLORE, zoom ?? 14), []); // eslint-disable-line react-hooks/exhaustive-deps
  const ms = markers ?? [];
  const ls = lines ?? [];

  const coords = useMemo(() => {
    const pts = ms.map((m) => ({ latitude: m.lat, longitude: m.lng }));
    ls.forEach((l) => l.points.forEach(([la, ln]) => pts.push({ latitude: la, longitude: ln })));
    return pts;
  }, [ms, ls]);

  // auto-fit once, when the map is ready and there is something to show
  useEffect(() => {
    if (!ready || !fit || fitted.current || !coords.length) return;
    fitted.current = true;
    if (coords.length === 1) map.current?.animateCamera({ center: coords[0], zoom: Math.max(zoom ?? 15, 15) }, { duration: 0 });
    else map.current?.fitToCoordinates(coords, { edgePadding: { top: 60, right: 50, bottom: 60, left: 50 }, animated: false });
  }, [ready, fit, coords, zoom]);

  // follow `center` changes for non-fitting maps (e.g. a small preview map)
  const centerKey = center ? `${center[0].toFixed(6)},${center[1].toFixed(6)}` : '';
  useEffect(() => {
    if (!ready || fit || picker || !center) return;
    map.current?.animateCamera({ center: { latitude: center[0], longitude: center[1] }, ...(zoom ? { zoom } : {}) }, { duration: 300 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, centerKey]);

  useImperativeHandle(ref, () => ({
    flyTo: (lat, lng, z) => map.current?.animateCamera({ center: { latitude: lat, longitude: lng }, zoom: z ?? 17 }, { duration: 700 }),
  }));

  return (
    <View style={[styles.wrap, rounded && styles.rounded, { height: height as any }, style]}>
      <RNMapView
        ref={map}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={initial}
        onMapReady={() => setReady(true)}
        liteMode={!interactive}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={interactive}
        pitchEnabled={interactive}
        toolbarEnabled={false}
        showsUserLocation={!!showUser}
        showsMyLocationButton={false}
        showsCompass={false}
        showsBuildings
        moveOnMarkerPress={false}
        onPress={(e) => onPress?.(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
        onRegionChange={(_r, details) => {
          if (!picker) return;
          if (!moving.current && details?.isGesture !== false) {
            moving.current = true;
            onMoveStart?.();
          }
        }}
        onRegionChangeComplete={(r) => {
          if (!picker) return;
          moving.current = false;
          onCenter?.(r.latitude, r.longitude);
        }}
      >
        {ls
          .filter((l) => l.points.length > 1)
          .map((l, i) => (
            <Polyline
              key={`l${i}`}
              coordinates={l.points.map(([la, ln]) => ({ latitude: la, longitude: ln }))}
              strokeColor={l.color ?? colors.accent}
              strokeWidth={l.dashed ? 3 : 5}
              lineDashPattern={l.dashed ? [8, 8] : undefined}
              lineCap="round"
              lineJoin="round"
            />
          ))}
        {ms.map((m) => (
          <Pin key={String(m.id)} m={m} onPress={onMarkerPress} />
        ))}
      </RNMapView>
    </View>
  );
});

export default MapView;

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#E8ECEA' },
  rounded: { borderRadius: radius.lg },
  pinWrap: { alignItems: 'center' },
  pin: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: 6,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#fff',
  },
  pinText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  pinTip: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', marginTop: -1 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2.5, borderColor: '#fff' },
  round: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
});
