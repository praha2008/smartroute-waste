import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { api } from '../core/api';
import { useAuth } from '../core/auth';
import { clock, kg, km } from '../core/format';
import { useApi } from '../core/hooks';
import MapView, { MapLine, MapMarker } from '../core/MapView';
import { useNav } from '../core/nav';
import { colors, font, radius, space } from '../core/theme';
import type { Route, Stop, Vehicle } from '../core/types';
import { Badge, Button, Card, Empty, ErrorBox, IconCircle, Loading, Row, Screen, Section, Stat } from '../core/ui';
import { statusMeta, wasteMeta } from '../core/waste';
import { useLiveTracking } from '../tracking';

interface Me {
  vehicle: Vehicle | null;
  route: Route | null;
  today: { routes: number; stops_done: number; kg: number; km: number };
}

export function openNavigation(lat: number, lng: number) {
  const url = Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${lat},${lng}` : `google.navigation:q=${lat},${lng}`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`));
}

function StopRow({ stop, next, onPress }: { stop: Stop; next: boolean; onPress: () => void }) {
  const w = wasteMeta(stop.request.waste_type);
  const s = statusMeta(stop.status);
  const late = stop.status === 'pending' && new Date(stop.request.sla_deadline).getTime() < Date.now();
  return (
    <Card onPress={onPress} style={[{ paddingVertical: space.md }, next ? { borderColor: colors.accent, borderWidth: 2 } : {}]}>
      <Row gap={space.md}>
        <View style={[styles.seq, { backgroundColor: stop.status === 'pending' ? w.color : colors.border }]}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>{stop.seq}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[font.body, { fontWeight: '700' }]} numberOfLines={1}>
            {stop.request.requester_name ?? `Request #${stop.request.id}`}
          </Text>
          <Text style={font.small} numberOfLines={1}>
            {w.short} · {kg(stop.request.est_kg)} · {stop.request.address ?? ''}
          </Text>
        </View>
        {stop.status === 'pending' ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[font.small, { fontWeight: '700', color: colors.text }]}>{clock(stop.eta)}</Text>
            {late ? <Text style={{ color: colors.danger, fontSize: 11, fontWeight: '700' }}>SLA LATE</Text> : <Text style={font.small}>{km(stop.leg_km)}</Text>}
          </View>
        ) : (
          <Badge label={s.label} color={s.color} soft={s.soft} />
        )}
      </Row>
    </Card>
  );
}

export default function RouteScreen() {
  const { user } = useAuth();
  const nav = useNav();
  const { data, error, loading, refreshing, reload } = useApi<Me>('/collector/me', 20000);
  const [busy, setBusy] = useState(false);
  const route = data?.route ?? null;
  useLiveTracking(route?.status === 'active');

  const { markers, lines } = useMemo(() => {
    if (!route) return { markers: [] as MapMarker[], lines: [] as MapLine[] };
    const v = route.vehicle;
    const m: MapMarker[] = route.stops.map((s) => ({
      id: s.id,
      lat: s.request.lat,
      lng: s.request.lng,
      label: String(s.seq),
      color: s.status === 'pending' ? wasteMeta(s.request.waste_type).color : '#9AA5A0',
      title: `${s.seq}. ${s.request.requester_name ?? ''} · ${kg(s.request.est_kg)}`,
    }));
    m.push({ id: 'depot', lat: v.depot_lat, lng: v.depot_lng, kind: 'dot', color: '#15201B', title: 'Depot' });
    if (v.cur_lat && v.cur_lng && route.status === 'active') m.push({ id: 'truck', lat: v.cur_lat, lng: v.cur_lng, kind: 'truck', color: colors.accent });
    const pending = route.stops.filter((s) => s.status === 'pending');
    const start: [number, number] = route.status === 'active' && v.cur_lat && v.cur_lng ? [v.cur_lat, v.cur_lng] : [v.depot_lat, v.depot_lng];
    const l: MapLine[] = [
      { points: [start, ...pending.map((s) => [s.request.lat, s.request.lng] as [number, number]), [v.depot_lat, v.depot_lng]], color: colors.accent },
    ];
    return { markers: m, lines: l };
  }, [route]);

  if (loading) return <Loading text="Loading your route…" />;

  const act = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      await fn();
      await reload();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <>
      <Text style={font.small}>Hello {user?.name.split(' ')[0]},</Text>
      <Text style={font.h1}>{route ? (route.status === 'active' ? 'Route in progress' : 'Route ready') : 'Today'}</Text>
      {data?.vehicle && (
        <Row style={{ marginTop: space.sm }}>
          <Ionicons name="bus" size={16} color={colors.textMuted} />
          <Text style={font.small}>
            {data.vehicle.name} · {data.vehicle.reg_no} · {kg(data.vehicle.capacity_kg)} capacity
          </Text>
        </Row>
      )}
    </>
  );

  if (!data?.vehicle) {
    return (
      <Screen onRefresh={reload} refreshing={refreshing}>
        {header}
        {error ? <ErrorBox message={error} onRetry={reload} /> : <Empty icon="bus-outline" title="No vehicle assigned" text="Ask the admin to assign you a vehicle from the dashboard." />}
      </Screen>
    );
  }

  const today = data.today;
  if (!route) {
    return (
      <Screen onRefresh={reload} refreshing={refreshing}>
        {header}
        <Row style={{ marginTop: space.lg }}>
          <Stat label="Routes done" value={today.routes} icon="flag" />
          <Stat label="Pickups" value={today.stops_done} icon="checkmark-done" />
          <Stat label="Collected" value={kg(today.kg)} icon="scale" />
        </Row>
        <Empty icon="map-outline" title="No route assigned right now" text="When the control room plans routes, your next route appears here automatically." action={<Button title="Refresh" icon="refresh" variant="secondary" onPress={reload} />} />
      </Screen>
    );
  }

  const pending = route.stops.filter((s) => s.status === 'pending');
  const doneStops = route.stops.filter((s) => s.status === 'done');
  const next = pending[0];
  const loadKg = doneStops.reduce((a, s) => a + (s.request.actual_kg ?? 0), 0);
  const loadPct = Math.min(100, (loadKg / route.vehicle.capacity_kg) * 100);
  const progress = route.stops.length ? (route.stops.length - pending.length) / route.stops.length : 0;

  return (
    <Screen
      onRefresh={reload}
      refreshing={refreshing}
      footer={
        route.status === 'planned' ? (
          <Button title={`Start route · ${route.stops.length} stops`} icon="play" loading={busy} onPress={() => act(() => api.post(`/collector/route/${route.id}/start`))} />
        ) : next ? (
          <Row>
            <Button title="Navigate" icon="navigate" variant="secondary" style={{ flex: 1 }} onPress={() => openNavigation(next.request.lat, next.request.lng)} />
            <Button title={`Open stop ${next.seq}`} icon="arrow-forward" style={{ flex: 1.4 }} onPress={() => nav.push('Stop', { stop: next, routeId: route.id })} />
          </Row>
        ) : undefined
      }
    >
      {header}

      <Card style={{ marginTop: space.lg }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Badge label={statusMeta(route.status).label} color={statusMeta(route.status).color} soft={statusMeta(route.status).soft} />
          <Text style={font.small}>Route #{route.id}</Text>
        </Row>
        <Row style={{ marginTop: space.md, justifyContent: 'space-between' }}>
          <View>
            <Text style={styles.big}>{route.stops.length - pending.length}/{route.stops.length}</Text>
            <Text style={font.small}>stops done</Text>
          </View>
          <View>
            <Text style={styles.big}>{km(route.total_km)}</Text>
            <Text style={font.small}>planned distance</Text>
          </View>
          <View>
            <Text style={styles.big}>{kg(route.total_kg)}</Text>
            <Text style={font.small}>expected load</Text>
          </View>
        </Row>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
        </View>
        {route.status === 'active' && (
          <Text style={[font.small, { marginTop: 6 }]}>
            Truck load: {kg(loadKg)} ({loadPct.toFixed(0)}% of capacity)
          </Text>
        )}
      </Card>

      <MapView markers={markers} lines={lines} height={240} onMarkerPress={(id) => {
        const s = route.stops.find((x) => x.id === id);
        if (s && route.status === 'active' && s.status === 'pending') nav.push('Stop', { stop: s, routeId: route.id });
      }} />

      {next && route.status === 'active' && (
        <Section title="Next stop">
          <Card onPress={() => nav.push('Stop', { stop: next, routeId: route.id })} style={{ borderColor: colors.accent, borderWidth: 2 }}>
            <Row gap={space.md}>
              <IconCircle icon={wasteMeta(next.request.waste_type).icon as any} color={wasteMeta(next.request.waste_type).color} soft={wasteMeta(next.request.waste_type).soft} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={font.h3}>{next.request.requester_name}</Text>
                <Text style={font.small}>{next.request.address}</Text>
                <Text style={[font.small, { color: colors.accentDark, fontWeight: '700', marginTop: 2 }]}>
                  {wasteMeta(next.request.waste_type).short} · {kg(next.request.est_kg)} · ETA {clock(next.eta)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.textFaint} />
            </Row>
          </Card>
        </Section>
      )}

      <Section title={`All stops (${route.stops.length})`}>
        {route.stops.map((s) => (
          <StopRow
            key={s.id}
            stop={s}
            next={route.status === 'active' && s.id === next?.id}
            onPress={() => {
              if (route.status !== 'active') return Alert.alert('Start the route first');
              if (s.status === 'pending') nav.push('Stop', { stop: s, routeId: route.id });
            }}
          />
        ))}
      </Section>

      {route.status === 'active' && (
        <Button
          title="End route early"
          variant="danger"
          icon="stop-circle"
          style={{ marginTop: space.lg }}
          onPress={() =>
            Alert.alert('End route?', `${pending.length} remaining stops will go back to the queue for another truck.`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'End route', style: 'destructive', onPress: () => act(() => api.post(`/collector/route/${route.id}/complete`)) },
            ])
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  seq: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  big: { fontSize: 22, fontWeight: '800', color: colors.text },
  bar: { height: 8, backgroundColor: colors.accentSoft, borderRadius: radius.pill, marginTop: space.md, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: colors.accent, borderRadius: radius.pill },
});
