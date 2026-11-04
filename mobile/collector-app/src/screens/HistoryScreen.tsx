import React from 'react';
import { Text, View } from 'react-native';

import { dateTime, kg, km } from '../core/format';
import { useApi } from '../core/hooks';
import { t } from '../core/i18n';
import { font, space } from '../core/theme';
import type { Route } from '../core/types';
import { Card, Empty, ErrorBox, Row, Screen, Skeleton } from '../core/ui';

export default function HistoryScreen() {
  const { data, error, loading, refreshing, reload } = useApi<Route[]>('/collector/history');
  return (
    <Screen title={t('hist.title')} refreshing={refreshing} onRefresh={reload}>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Skeleton height={110} count={3} />}
      {!loading && (data ?? []).length === 0 && !error && <Empty icon="time-outline" title={t('hist.none')} />}
      {(data ?? []).map((r) => {
        const done = r.stops.filter((s) => s.status === 'done');
        const collected = done.reduce((a, s) => a + (s.request.actual_kg ?? 0), 0);
        return (
          <Card key={r.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={font.h3}>{t('rt.route', { id: r.id })}</Text>
              <Text style={font.small}>{dateTime(r.completed_at)}</Text>
            </Row>
            <Row style={{ marginTop: space.md, justifyContent: 'space-between' }}>
              <View>
                <Text style={font.h3}>
                  {done.length}/{r.stops.length}
                </Text>
                <Text style={font.small}>{t('hist.pickups')}</Text>
              </View>
              <View>
                <Text style={font.h3}>{kg(collected)}</Text>
                <Text style={font.small}>{t('hist.collected')}</Text>
              </View>
              <View>
                <Text style={font.h3}>{km(r.total_km)}</Text>
                <Text style={font.small}>{t('hist.distance')}</Text>
              </View>
            </Row>
          </Card>
        );
      })}
    </Screen>
  );
}
