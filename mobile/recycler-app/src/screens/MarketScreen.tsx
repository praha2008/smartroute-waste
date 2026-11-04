import React, { useMemo, useState } from 'react';
import { Text } from 'react-native';

import LotCard from '../components/LotCard';
import { useAuth } from '../core/auth';
import { inr, kg } from '../core/format';
import { useApi } from '../core/hooks';
import MapView, { MapMarker } from '../core/MapView';
import { useNav } from '../core/nav';
import { font, space } from '../core/theme';
import type { Lot } from '../core/types';
import { Chip, Empty, ErrorBox, Row, Screen, Segmented, Stat } from '../core/ui';
import { wasteMeta } from '../core/waste';

type Filter = 'all' | 'recyclable' | 'e_waste';

export default function MarketScreen() {
  const { user } = useAuth();
  const nav = useNav();
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<'list' | 'map'>('list');
  const { data, error, loading, refreshing, reload } = useApi<Lot[]>(`/recycler/lots${filter === 'all' ? '' : `?material=${filter}`}`, 30000);
  const lots = data ?? [];
  const totalKg = lots.reduce((a, l) => a + l.kg, 0);
  const totalValue = lots.reduce((a, l) => a + l.total_value, 0);

  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = lots.map((l) => ({ id: l.id, lat: l.lat, lng: l.lng, color: wasteMeta(l.material).color, label: String(Math.round(l.kg)), title: `${kg(l.kg)} ${wasteMeta(l.material).short} · ${inr(l.total_value)}` }));
    if (user?.lat && user.lng) m.push({ id: 'yard', lat: user.lat, lng: user.lng, kind: 'home', color: '#C16A00', title: 'Your yard' });
    return m;
  }, [lots, user]);

  return (
    <Screen title="Marketplace" subtitle={user?.organization ?? undefined} refreshing={refreshing} onRefresh={reload}>
      <Row>
        <Stat label="Lots available" value={lots.length} icon="cube" />
        <Stat label="Total weight" value={kg(totalKg)} icon="scale" />
        <Stat label="Market value" value={inr(totalValue)} icon="cash" />
      </Row>
      <Row style={{ marginTop: space.lg, marginBottom: space.md, justifyContent: 'space-between' }}>
        <Row gap={6}>
          <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="Dry recyclable" active={filter === 'recyclable'} onPress={() => setFilter('recyclable')} />
          <Chip label="E-waste" active={filter === 'e_waste'} onPress={() => setFilter('e_waste')} />
        </Row>
      </Row>
      <Segmented value={view} onChange={setView} options={[{ value: 'list', label: 'List' }, { value: 'map', label: 'Map' }]} />
      <Text style={[font.small, { marginVertical: space.md }]}>Lots are created automatically when a truck collects segregated recyclables. Claim one to buy it.</Text>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {view === 'map' ? (
        <MapView
          markers={markers}
          height={420}
          onMarkerPress={(id) => {
            const lot = lots.find((l) => l.id === id);
            if (lot) nav.push('Lot', { lot });
          }}
        />
      ) : (
        <>
          {!loading && lots.length === 0 && <Empty icon="cube-outline" title="No lots right now" text="New lots appear as soon as trucks collect recyclables." />}
          {lots.map((l) => (
            <LotCard key={l.id} lot={l} />
          ))}
        </>
      )}
    </Screen>
  );
}
