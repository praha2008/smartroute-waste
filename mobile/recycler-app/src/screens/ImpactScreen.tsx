import React from 'react';
import { Text, View } from 'react-native';

import { inr, kg } from '../core/format';
import { useApi } from '../core/hooks';
import { colors, font, radius, space } from '../core/theme';
import { Card, Row, Screen, Section, Stat } from '../core/ui';
import { wasteMeta } from '../core/waste';

interface Stats {
  available_lots: number;
  available_kg: number;
  claimed: number;
  picked: number;
  kg_recovered: number;
  kg_by_material: Record<string, number>;
  value_inr: number;
}

export default function ImpactScreen() {
  const { data, refreshing, reload } = useApi<Stats>('/recycler/stats');
  const total = data ? Object.values(data.kg_by_material).reduce((a, b) => a + b, 0) || 1 : 1;
  return (
    <Screen title="Your impact" refreshing={refreshing} onRefresh={reload}>
      <Card style={{ backgroundColor: colors.accent, borderColor: colors.accent }}>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontWeight: '700', fontSize: 12, letterSpacing: 1 }}>MATERIAL RECOVERED</Text>
        <Text style={{ color: '#fff', fontSize: 38, fontWeight: '800' }}>{kg(data?.kg_recovered ?? 0)}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.85)' }}>
          ≈ {kg((data?.kg_recovered ?? 0) * 1.9)} CO₂ avoided vs landfill
        </Text>
      </Card>
      <Row>
        <Stat label="Lots completed" value={data?.picked ?? '–'} icon="checkmark-done" />
        <Stat label="To pick up" value={data?.claimed ?? '–'} icon="time" />
        <Stat label="Purchased" value={inr(data?.value_inr ?? 0)} icon="cash" />
      </Row>
      <Section title="By material">
        <Card>
          {data && Object.keys(data.kg_by_material).length === 0 && <Text style={font.small}>No completed lots yet.</Text>}
          {data &&
            Object.entries(data.kg_by_material).map(([m, v]) => {
              const w = wasteMeta(m);
              return (
                <View key={m} style={{ marginBottom: space.md }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text style={[font.body, { fontWeight: '600' }]}>{w.label}</Text>
                    <Text style={font.small}>{kg(v)}</Text>
                  </Row>
                  <View style={{ height: 8, backgroundColor: w.soft, borderRadius: radius.pill, marginTop: 6 }}>
                    <View style={{ height: 8, width: `${(v / total) * 100}%`, backgroundColor: w.color, borderRadius: radius.pill }} />
                  </View>
                </View>
              );
            })}
        </Card>
      </Section>
      <Section title="City market right now">
        <Card>
          <Text style={font.body}>
            {data?.available_lots ?? 0} lots · {kg(data?.available_kg ?? 0)} waiting to be claimed
          </Text>
        </Card>
      </Section>
    </Screen>
  );
}
