import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';

import { clock, kg, timeAgo } from '../core/format';
import { useNav } from '../core/nav';
import { colors, font, space } from '../core/theme';
import type { Pickup } from '../core/types';
import { Badge, Card, IconCircle, Row } from '../core/ui';
import { statusMeta, wasteMeta } from '../core/waste';

export default function PickupCard({ p }: { p: Pickup }) {
  const nav = useNav();
  const w = wasteMeta(p.waste_type);
  const s = statusMeta(p.status);
  return (
    <Card onPress={() => nav.push('RequestDetail', { id: p.id })}>
      <Row gap={space.md}>
        <IconCircle icon={w.icon as any} color={w.color} soft={w.soft} />
        <View style={{ flex: 1 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={font.h3}>{w.short}</Text>
            <Badge label={s.label} color={s.color} soft={s.soft} />
          </Row>
          <Text style={[font.small, { marginTop: 2 }]}>
            #{p.id} · {kg(p.actual_kg ?? p.est_kg)} · {timeAgo(p.created_at)}
          </Text>
          {p.status === 'in_progress' && p.eta ? (
            <Row style={{ marginTop: 6 }} gap={4}>
              <Ionicons name="bus" size={14} color={colors.accent} />
              <Text style={{ color: colors.accentDark, fontWeight: '700', fontSize: 13 }}>
                Arriving around {clock(p.eta)}
                {p.stops_before ? ` · ${p.stops_before} stops before you` : ''}
              </Text>
            </Row>
          ) : null}
          {p.status === 'collected' && p.credits_awarded ? (
            <Text style={{ color: colors.success, fontWeight: '700', fontSize: 13, marginTop: 6 }}>+{p.credits_awarded} green credits</Text>
          ) : null}
        </View>
      </Row>
    </Card>
  );
}
