import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { api } from '../core/api';
import { useAuth } from '../core/auth';
import { clock, kg, km } from '../core/format';
import { useApi } from '../core/hooks';
import { t } from '../core/i18n';
import MapView, { MapLine, MapMarker } from '../core/MapView';
import { useNav } from '../core/nav';
import { colors, font, radius, space } from '../core/theme';
import type { Route, Stop, Vehicle } from '../core/types';
import { Badge, Button, Card, Empty, ErrorBox, HeroStat, IconCircle, Row, Screen, Section, Skeleton, Stat } from '../core/ui';
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
            {stop.request.requester_name ?? `#${stop.request.id}`}
          </Text>
          <Text style={font.small} numberOfLines={1}>
            {w.short} · {kg(stop.request.est_kg)} · {stop.request.address ?? ''}
          </Text>
        </View>
        {stop.status === 'pending' ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[font.small, { fontWeight: '700', color: colors.text }]}>{clock(stop.eta)}</Text>
            {late ? <Text style={{ color: colors.danger, fontSize: 11, fontWeight: '700' }}>{t('rt.late')}</Text> : <Text style={font.small}>{km(stop.leg_km)}</Text>}
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
    m.push({ id: 'depot', lat: v.depot_lat, lng: v.depot_lng, kind: 'depot', color: '#15201B', title: 'Depot' });
    if (v.cur_lat && v.cur_lng && route.status === 'active') m.push({ id: 'truck', lat: v.cur_lat, lng: v.cur_lng, kind: 'truck', color: colors.accent });
    const pending = route.stops.filter((s) => s.status === 'pending');
    const start: [number, number] = route.status === 'active' && v.cur_lat && v.cur_lng ? [v.cur_lat, v.cur_lng] : [v.depot_lat, v.depot_lng];
    const l: MapLine[] = [
      { points: [start, ...pending.map((s) => [s.request.lat, s.request.lng] as [number, number]), [v.depot_lat, v.depot_lng]], color: colors.accent },
    ];
    return { markers: m, lines: l };
  }, [route]);


  const act = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      await fn();
      await reload();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setBusy(false);
    }
  };

  const hero = (
    <View>
      <Text style={styles.heroSmall}>{t('rt.hello', { name: user?.name.split(' ')[0] ?? '' })} 👋</Text>
      <Text style={[font.h1, { color: colors.white }]}>{route ? (route.status === 'active' ? t('rt.inProgress') : t('rt.ready')) : t('rt.today')}</Text>
      {data?.vehicle && (
        <Row style={{ marginTop: space.sm }} gap={6}>
          <View style={styles.vehPill}>
            <Ionicons name="bus" size={14} color={colors.white} />
            <Text style={{ color: colors.white, fontWeight: '800', fontSize: 12 }}>{data.vehicle.reg_no}</Text>
          </View>
          <Text style={styles.heroSmall} numberOfLines={1}>
            {data.vehicle.name} · {t('rt.capacity', { kg: kg(data.vehicle.capacity_kg) })}
          </Text>
        </Row>
      )}
      {route && (
        <Row style={{ marginTop: space.lg }}>
          <HeroStat label={t('rt.stopsDone')} value={`${route.stops.filter((s) => s.status !== 'pending').length}/${route.stops.length}`} />
          <HeroStat label={t('rt.distance')} value={km(route.total_km)} />
          <HeroStat label={t('rt.load')} value={kg(route.total_kg)} />
        </Row>
      )}
    </View>
  );

  if (loading && !data) {
    return (
      <Screen hero={hero}>
        <Skeleton height={120} count={3} />
      </Screen>
    );
  }

  if (!data?.vehicle) {
    return (
      <Screen onRefresh={reload} refreshing={refreshing} hero={hero}>
        {error ? <ErrorBox message={error} onRetry={reload} /> : <Empty icon="bus-outline" title={t('rt.noVehicle')} text={t('rt.noVehicleBody')} />}
      </Screen>
    );
  }

  const today = data.today;
  if (!route) {
    return (
      <Screen onRefresh={reload} refreshing={refreshing} hero={hero}>
        <Row>
          <Stat label={t('rt.routesDone')} value={today.routes} icon="flag" />
          <Stat label={t('rt.pickups')} value={today.stops_done} icon="checkmark-done" tint={colors.success} />
          <Stat label={t('rt.collected')} value={kg(today.kg)} icon="scale" tint={colors.warning} />
        </Row>
        <Empty icon="map-outline" title={t('rt.noRoute')} text={t('rt.noRouteBody')} action={<Button title={t('common.refresh')} icon="refresh" variant="secondary" onPress={reload} />} />
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
      hero={hero}
      footer={
        route.status === 'planned' ? (
          <Button title={t('rt.start', { n: route.stops.length })} icon="play" loading={busy} onPress={() => act(() => api.post(`/collector/route/${route.id}/start`))} />
        ) : next ? (
          <Row>
            <Button title={t('rt.navigate')} icon="navigate" variant="secondary" style={{ flex: 1 }} onPress={() => openNavigation(next.request.lat, next.request.lng)} />
            <Button title={t('rt.openStop', { n: next.seq })} icon="arrow-forward" style={{ flex: 1.4 }} onPress={() => nav.push('Stop', { stop: next, routeId: route.id })} />
          </Row>
        ) : undefined
      }
    >
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Badge label={statusMeta(route.status).label} color={statusMeta(route.status).color} soft={statusMeta(route.status).soft} />
          <Text style={font.small}>{t('rt.route', { id: route.id })}</Text>
        </Row>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
        </View>
        {route.status === 'active' && (
          <Text style={[font.small, { marginTop: 6 }]}>
            {t('rt.truckLoad', { kg: kg(loadKg), pct: loadPct.toFixed(0) })}
          </Text>
        )}
      </Card>

      <MapView markers={markers} lines={lines} height={280} onMarkerPress={(id) => {
        const s = route.stops.find((x) => x.id === id);
        if (s && route.status === 'active' && s.status === 'pending') nav.push('Stop', { stop: s, routeId: route.id });
      }} />

      {next && route.status === 'active' && (
        <Section title={t('rt.next')}>
          <Card onPress={() => nav.push('Stop', { stop: next, routeId: route.id })} style={{ borderColor: colors.accent, borderWidth: 2 }}>
            <Row gap={space.md}>
              <IconCircle icon={wasteMeta(next.request.waste_type).icon as any} color={wasteMeta(next.request.waste_type).color} soft={wasteMeta(next.request.waste_type).soft} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={font.h3}>{next.request.requester_name}</Text>
                <Text style={font.small}>{next.request.address}</Text>
                <Text style={[font.small, { color: colors.accentDark, fontWeight: '700', marginTop: 2 }]}>
                  {wasteMeta(next.request.waste_type).short} · {kg(next.request.est_kg)} · {clock(next.eta)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.textFaint} />
            </Row>
          </Card>
        </Section>
      )}

      <Section title={t('rt.allStops', { n: route.stops.length })}>
        {route.stops.map((s) => (
          <StopRow
            key={s.id}
            stop={s}
            next={route.status === 'active' && s.id === next?.id}
            onPress={() => {
              if (route.status !== 'active') return Alert.alert(t('rt.startFirst'));
              if (s.status === 'pending') nav.push('Stop', { stop: s, routeId: route.id });
            }}
          />
        ))}
      </Section>

      {route.status === 'active' && (
        <Button
          title={t('rt.endEarly')}
          variant="danger"
          icon="stop-circle"
          style={{ marginTop: space.lg }}
          onPress={() =>
            Alert.alert(t('rt.endQ'), t('rt.endBody', { n: pending.length }), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('rt.endEarly'), style: 'destructive', onPress: () => act(() => api.post(`/collector/route/${route.id}/complete`)) },
            ])
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  seq: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  heroSmall: { color: 'rgba(255,255,255,0.88)', fontSize: 13, fontWeight: '600', flexShrink: 1 },
  vehPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  big: { fontSize: 22, fontWeight: '800', color: colors.text },
  bar: { height: 8, backgroundColor: colors.accentSoft, borderRadius: radius.pill, marginTop: space.md, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: colors.accent, borderRadius: radius.pill },
});
