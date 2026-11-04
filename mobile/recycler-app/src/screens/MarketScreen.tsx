import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import LotCard from '../components/LotCard';
import { useAuth } from '../core/auth';
import { inr, kg } from '../core/format';
import { useApi } from '../core/hooks';
import { t } from '../core/i18n';
import MapView, { MapMarker } from '../core/MapView';
import { useNav } from '../core/nav';
import { colors, font, space } from '../core/theme';
import type { Lot } from '../core/types';
import { Chip, Empty, ErrorBox, HeroStat, Row, Screen, Segmented, Skeleton } from '../core/ui';
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
    if (user?.lat && user.lng) m.push({ id: 'yard', lat: user.lat, lng: user.lng, kind: 'home', color: '#C16A00', title: t('mk.yard') });
    return m;
  }, [lots, user]);

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={reload}
      hero={
        <View>
          <Text style={[font.h1, { color: colors.white }]}>{t('mk.title')}</Text>
          {user?.organization ? <Text style={{ color: 'rgba(255,255,255,0.88)', fontWeight: '600' }}>{user.organization}</Text> : null}
          <Row style={{ marginTop: space.lg }}>
            <HeroStat label={t('mk.lots')} value={lots.length} />
            <HeroStat label={t('mk.weight')} value={kg(totalKg)} />
            <HeroStat label={t('mk.value')} value={inr(totalValue)} />
          </Row>
        </View>
      }
    >
      <Row style={{ marginBottom: space.md, justifyContent: 'space-between' }}>
        <Row gap={6}>
          <Chip label={t('mk.all')} active={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label={wasteMeta('recyclable').short} icon="refresh-circle" active={filter === 'recyclable'} onPress={() => setFilter('recyclable')} />
          <Chip label={wasteMeta('e_waste').short} icon="hardware-chip" active={filter === 'e_waste'} onPress={() => setFilter('e_waste')} />
        </Row>
      </Row>
      <Segmented value={view} onChange={setView} options={[{ value: 'list', label: t('mk.list') }, { value: 'map', label: t('mk.map') }]} />
      <Text style={[font.small, { marginVertical: space.md }]}>{t('mk.explain')}</Text>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {view === 'map' ? (
        <MapView
          markers={markers}
          height={460}
          onMarkerPress={(id) => {
            const lot = lots.find((l) => l.id === id);
            if (lot) nav.push('Lot', { lot });
          }}
        />
      ) : (
        <>
          {loading && !data && <Skeleton height={100} count={3} />}
          {!loading && lots.length === 0 && <Empty icon="cube-outline" title={t('mk.none')} text={t('mk.noneBody')} />}
          {lots.map((l) => (
            <LotCard key={l.id} lot={l} />
          ))}
        </>
      )}
    </Screen>
  );
}
