import React from 'react';
import { Text, View } from 'react-native';

import { inr, kg, km, timeAgo } from '../core/format';
import { useNav } from '../core/nav';
import { colors, font, space } from '../core/theme';
import type { Lot } from '../core/types';
import { Badge, Card, IconCircle, Row } from '../core/ui';
import { statusMeta, wasteMeta } from '../core/waste';

export default function LotCard({ lot }: { lot: Lot }) {
  const nav = useNav();
  const w = wasteMeta(lot.material);
  const s = statusMeta(lot.status);
  return (
    <Card onPress={() => nav.push('Lot', { lot })}>
      <Row gap={space.md}>
        <IconCircle icon={w.icon as any} color={w.color} soft={w.soft} size={46} />
        <View style={{ flex: 1 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={font.h3}>
              {kg(lot.kg)} {w.short}
            </Text>
            <Text style={{ fontWeight: '800', fontSize: 16, color: colors.accentDark }}>{inr(lot.total_value)}</Text>
          </Row>
          <Text style={[font.small, { marginTop: 2 }]}>
            {lot.ward ?? 'Vellore'} · {lot.distance_km !== null ? `${km(lot.distance_km)} away` : ''} · {timeAgo(lot.created_at)}
          </Text>
          <Row style={{ marginTop: 6, justifyContent: 'space-between' }}>
            <Badge label={s.label} color={s.color} soft={s.soft} />
            <Text style={font.small}>₹{lot.price_per_kg}/kg</Text>
          </Row>
        </View>
      </Row>
    </Card>
  );
}
