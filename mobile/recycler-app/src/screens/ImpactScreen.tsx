import React from 'react';
import { Text, View } from 'react-native';

import { inr, kg } from '../core/format';
import { useApi } from '../core/hooks';
import { t } from '../core/i18n';
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
    <Screen
      refreshing={refreshing}
      onRefresh={reload}
      hero={
        <View>
          <Text style={[font.h1, { color: colors.white }]}>{t('imp.title')}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontWeight: '800', fontSize: 12, letterSpacing: 1, marginTop: space.lg }}>{t('imp.recovered').toUpperCase()}</Text>
          <Text style={{ color: '#fff', fontSize: 40, fontWeight: '800', letterSpacing: -1 }}>{kg(data?.kg_recovered ?? 0)}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.88)' }}>{t('imp.co2', { kg: kg((data?.kg_recovered ?? 0) * 1.9) })}</Text>
        </View>
      }
    >
      <Row>
        <Stat label={t('imp.lotsDone')} value={data?.picked ?? '–'} icon="checkmark-done" />
        <Stat label={t('imp.toPick')} value={data?.claimed ?? '–'} icon="time" tint={colors.info} />
        <Stat label={t('imp.purchased')} value={inr(data?.value_inr ?? 0)} icon="cash" tint={colors.success} />
      </Row>
      <Section title={t('imp.byMaterial')}>
        <Card>
          {data && Object.keys(data.kg_by_material).length === 0 && <Text style={font.small}>{t('imp.noneDone')}</Text>}
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
      <Section title={t('imp.market')}>
        <Card>
          <Text style={font.body}>
            {t('imp.marketBody', { n: data?.available_lots ?? 0, kg: kg(data?.available_kg ?? 0) })}
          </Text>
        </Card>
      </Section>
    </Screen>
  );
}
