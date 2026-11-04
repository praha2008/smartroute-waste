import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';

import { useAuth } from '../core/auth';
import { dateTime } from '../core/format';
import { useApi } from '../core/hooks';
import { colors, font, radius, space } from '../core/theme';
import { Card, Empty, IconCircle, Row, Screen, Section } from '../core/ui';

interface Tx {
  id: number;
  request_id: number | null;
  points: number;
  reason: string;
  created_at: string;
}

const WAYS = [
  { icon: 'checkmark-done', title: 'Every completed pickup', pts: '+10' },
  { icon: 'layers', title: 'Segregated waste (not mixed)', pts: '+5' },
  { icon: 'time', title: 'Choose "Low" urgency — lets trucks batch pickups', pts: '+5' },
  { icon: 'scale', title: 'Estimate within 25% of actual weight', pts: '+5' },
];

const LEVELS = [
  { name: 'Seedling', min: 0 },
  { name: 'Sapling', min: 100 },
  { name: 'Green Guardian', min: 300 },
  { name: 'Eco Champion', min: 700 },
];

export default function RewardsScreen() {
  const { user, refreshUser } = useAuth();
  const { data, refreshing, reload } = useApi<Tx[]>('/auth/me/credits');
  const credits = user?.green_credits ?? 0;
  const level = [...LEVELS].reverse().find((l) => credits >= l.min) ?? LEVELS[0];
  const next = LEVELS.find((l) => l.min > credits);
  const progress = next ? (credits - level.min) / (next.min - level.min) : 1;
  const reliability = Math.round((user?.reliability ?? 1) * 100);

  return (
    <Screen
      title="Rewards"
      refreshing={refreshing}
      onRefresh={() => {
        reload();
        refreshUser();
      }}
    >
      <Card style={{ backgroundColor: colors.accent, borderColor: colors.accent }}>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontWeight: '700', fontSize: 12, letterSpacing: 1 }}>{level.name.toUpperCase()}</Text>
        <Text style={{ color: '#fff', fontSize: 38, fontWeight: '800' }}>{credits} credits</Text>
        <View style={{ height: 8, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 4, marginTop: space.md }}>
          <View style={{ height: 8, width: `${Math.min(100, progress * 100)}%`, backgroundColor: '#fff', borderRadius: 4 }} />
        </View>
        <Text style={{ color: 'rgba(255,255,255,0.85)', marginTop: 6, fontSize: 13 }}>
          {next ? `${next.min - credits} more to reach ${next.name}` : 'Top level reached!'}
        </Text>
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={font.h3}>Estimate reliability</Text>
            <Text style={font.small}>How close your kg estimates are to the weighed amount. Higher = trucks plan better.</Text>
          </View>
          <Text style={{ fontSize: 26, fontWeight: '800', color: reliability >= 80 ? colors.success : colors.warning }}>{reliability}%</Text>
        </Row>
      </Card>

      <Section title="How to earn">
        <Card>
          {WAYS.map((w, i) => (
            <Row key={i} style={{ paddingVertical: 8 }} gap={space.md}>
              <IconCircle icon={w.icon as any} color={colors.accentDark} soft={colors.accentSoft} size={34} />
              <Text style={[font.body, { flex: 1 }]}>{w.title}</Text>
              <Text style={{ fontWeight: '800', color: colors.accentDark }}>{w.pts}</Text>
            </Row>
          ))}
        </Card>
      </Section>

      <Section title="History">
        {data && data.length === 0 && <Empty icon="gift-outline" title="No credits yet" text="Complete your first pickup to start earning." />}
        {(data ?? []).map((t) => (
          <Card key={t.id} style={{ paddingVertical: space.md }}>
            <Row>
              <Ionicons name="add-circle" size={20} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={[font.body, { fontWeight: '600' }]}>{t.reason}</Text>
                <Text style={font.small}>
                  {t.request_id ? `Pickup #${t.request_id} · ` : ''}
                  {dateTime(t.created_at)}
                </Text>
              </View>
              <View style={{ backgroundColor: colors.successSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
                <Text style={{ color: colors.success, fontWeight: '800' }}>+{t.points}</Text>
              </View>
            </Row>
          </Card>
        ))}
      </Section>
    </Screen>
  );
}
