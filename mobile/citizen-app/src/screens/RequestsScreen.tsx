import React, { useState } from 'react';

import PickupCard from '../components/PickupCard';
import { useApi } from '../core/hooks';
import { useNav } from '../core/nav';
import { space } from '../core/theme';
import type { Pickup } from '../core/types';
import { Button, Chip, Empty, ErrorBox, Row, Screen } from '../core/ui';

const FILTERS = {
  active: { label: 'Active', match: ['pending', 'scheduled', 'in_progress'] },
  done: { label: 'Collected', match: ['collected'] },
  closed: { label: 'Cancelled', match: ['cancelled', 'missed'] },
  all: { label: 'All', match: null },
} as const;
type F = keyof typeof FILTERS;

export default function RequestsScreen() {
  const nav = useNav();
  const [filter, setFilter] = useState<F>('active');
  const { data, error, loading, refreshing, reload } = useApi<Pickup[]>('/requests/mine', 20000);
  const m = FILTERS[filter].match as readonly string[] | null;
  const list = (data ?? []).filter((p) => !m || m.includes(p.status));

  return (
    <Screen title="My pickups" refreshing={refreshing} onRefresh={reload} right={<Button title="New" icon="add" small onPress={() => nav.push('NewRequest')} />}>
      <Row style={{ flexWrap: 'wrap', marginBottom: space.md }} gap={6}>
        {(Object.keys(FILTERS) as F[]).map((k) => (
          <Chip key={k} label={FILTERS[k].label} active={filter === k} onPress={() => setFilter(k)} />
        ))}
      </Row>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!loading && list.length === 0 && <Empty title="Nothing here yet" text="Your pickup requests will show up here." />}
      {list.map((p) => (
        <PickupCard key={p.id} p={p} />
      ))}
    </Screen>
  );
}
