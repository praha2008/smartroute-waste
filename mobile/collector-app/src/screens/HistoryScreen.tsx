import React from 'react';
import { Text, View } from 'react-native';

import { dateTime, kg, km } from '../core/format';
import { useApi } from '../core/hooks';
import { font, space } from '../core/theme';
import type { Route } from '../core/types';
import { Card, Empty, ErrorBox, Row, Screen } from '../core/ui';

export default function HistoryScreen() {
  const { data, error, loading, refreshing, reload } = useApi<Route[]>('/collector/history');
  return (
    <Screen title="Route history" refreshing={refreshing} onRefresh={reload}>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!loading && (data ?? []).length === 0 && !error && <Empty icon="time-outline" title="No completed routes yet" />}
      {(data ?? []).map((r) => {
        const done = r.stops.filter((s) => s.status === 'done');
        const collected = done.reduce((a, s) => a + (s.request.actual_kg ?? 0), 0);
        return (
          <Card key={r.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={font.h3}>Route #{r.id}</Text>
              <Text style={font.small}>{dateTime(r.completed_at)}</Text>
            </Row>
            <Row style={{ marginTop: space.md, justifyContent: 'space-between' }}>
              <View>
                <Text style={font.h3}>
                  {done.length}/{r.stops.length}
                </Text>
                <Text style={font.small}>pickups</Text>
              </View>
              <View>
                <Text style={font.h3}>{kg(collected)}</Text>
                <Text style={font.small}>collected</Text>
              </View>
              <View>
                <Text style={font.h3}>{km(r.total_km)}</Text>
                <Text style={font.small}>distance</Text>
              </View>
            </Row>
          </Card>
        );
      })}
    </Screen>
  );
}
