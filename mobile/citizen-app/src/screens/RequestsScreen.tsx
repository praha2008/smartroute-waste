import React, { useState } from 'react';

import PickupCard from '../components/PickupCard';
import { useApi } from '../core/hooks';
import { t } from '../core/i18n';
import { useNav } from '../core/nav';
import { space } from '../core/theme';
import type { Pickup } from '../core/types';
import { Button, Chip, Empty, ErrorBox, Row, Screen, Skeleton } from '../core/ui';

const FILTERS = {
  active: { label: 'pickups.active', match: ['pending', 'scheduled', 'in_progress'] },
  done: { label: 'pickups.collected', match: ['collected'] },
  closed: { label: 'pickups.cancelled', match: ['cancelled', 'missed'] },
  all: { label: 'pickups.all', match: null },
} as const;
type F = keyof typeof FILTERS;

export default function RequestsScreen() {
  const nav = useNav();
  const [filter, setFilter] = useState<F>('active');
  const { data, error, loading, refreshing, reload } = useApi<Pickup[]>('/requests/mine', 20000);
  const m = FILTERS[filter].match as readonly string[] | null;
  const list = (data ?? []).filter((p) => !m || m.includes(p.status));
  const count = (f: F) => {
    const mm = FILTERS[f].match as readonly string[] | null;
    return (data ?? []).filter((p) => !mm || mm.includes(p.status)).length;
  };

  return (
    <Screen title={t('pickups.title')} refreshing={refreshing} onRefresh={reload} right={<Button title={t('pickups.new')} icon="add" small onPress={() => nav.push('NewRequest')} />}>
      <Row style={{ flexWrap: 'wrap', marginBottom: space.md }} gap={6}>
        {(Object.keys(FILTERS) as F[]).map((k) => (
          <Chip key={k} label={`${t(FILTERS[k].label)}${data ? ` · ${count(k)}` : ''}`} active={filter === k} onPress={() => setFilter(k)} />
        ))}
      </Row>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Skeleton height={86} count={4} />}
      {!loading && list.length === 0 && <Empty icon="file-tray-outline" title={t('pickups.empty')} text={t('pickups.emptyBody')} />}
      {list.map((p) => (
        <PickupCard key={p.id} p={p} />
      ))}
    </Screen>
  );
}
