import React, { useState } from 'react';

import LotCard from '../components/LotCard';
import { useApi } from '../core/hooks';
import { t } from '../core/i18n';
import { space } from '../core/theme';
import type { Lot } from '../core/types';
import { Empty, ErrorBox, Screen, Segmented } from '../core/ui';
import { View } from 'react-native';

export default function MyLotsScreen() {
  const [tab, setTab] = useState<'claimed' | 'picked'>('claimed');
  const { data, error, loading, refreshing, reload } = useApi<Lot[]>('/recycler/lots/mine');
  const lots = (data ?? []).filter((l) => l.status === tab);
  return (
    <Screen title={t('my.title')} refreshing={refreshing} onRefresh={reload}>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'claimed', label: t('my.toPick') }, { value: 'picked', label: t('my.completed') }]} />
      <View style={{ height: space.md }} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!loading && lots.length === 0 && (
        <Empty icon="cube-outline" title={tab === 'claimed' ? t('my.noneToPick') : t('my.noneDone')} text={tab === 'claimed' ? t('my.noneToPickBody') : undefined} />
      )}
      {lots.map((l) => (
        <LotCard key={l.id} lot={l} />
      ))}
    </Screen>
  );
}
