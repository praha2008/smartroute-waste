import React, { useState } from 'react';

import LotCard from '../components/LotCard';
import { useApi } from '../core/hooks';
import { space } from '../core/theme';
import type { Lot } from '../core/types';
import { Empty, ErrorBox, Screen, Segmented } from '../core/ui';
import { View } from 'react-native';

export default function MyLotsScreen() {
  const [tab, setTab] = useState<'claimed' | 'picked'>('claimed');
  const { data, error, loading, refreshing, reload } = useApi<Lot[]>('/recycler/lots/mine');
  const lots = (data ?? []).filter((l) => l.status === tab);
  return (
    <Screen title="My lots" refreshing={refreshing} onRefresh={reload}>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'claimed', label: 'To pick up' }, { value: 'picked', label: 'Completed' }]} />
      <View style={{ height: space.md }} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!loading && lots.length === 0 && (
        <Empty icon="cube-outline" title={tab === 'claimed' ? 'Nothing to pick up' : 'No completed lots yet'} text={tab === 'claimed' ? 'Claim lots from the Market tab.' : undefined} />
      )}
      {lots.map((l) => (
        <LotCard key={l.id} lot={l} />
      ))}
    </Screen>
  );
}
