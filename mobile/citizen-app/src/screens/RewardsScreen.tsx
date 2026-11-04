import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';

import { useAuth } from '../core/auth';
import { dateTime } from '../core/format';
import { useApi } from '../core/hooks';
import { t } from '../core/i18n';
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
  { icon: 'checkmark-done', title: 'rw.w1', pts: '+10' },
  { icon: 'layers', title: 'rw.w2', pts: '+5' },
  { icon: 'time', title: 'rw.w3', pts: '+5' },
  { icon: 'scale', title: 'rw.w4', pts: '+5' },
];

const LEVELS = [
  { key: 'rw.level.0', min: 0, icon: 'leaf-outline' },
  { key: 'rw.level.1', min: 100, icon: 'leaf' },
  { key: 'rw.level.2', min: 300, icon: 'shield-checkmark' },
  { key: 'rw.level.3', min: 700, icon: 'trophy' },
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
      refreshing={refreshing}
      onRefresh={() => {
        reload();
        refreshUser();
      }}
      hero={
        <View>
          <Text style={[font.h1, { color: colors.white }]}>{t('rw.title')}</Text>
          <Row style={{ marginTop: space.lg, justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontWeight: '800', fontSize: 12, letterSpacing: 1 }}>{t(level.key).toUpperCase()}</Text>
              <Text style={{ color: colors.white, fontSize: 40, fontWeight: '800', letterSpacing: -1 }}>{t('rw.credits', { n: credits })}</Text>
            </View>
            <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={level.icon as any} size={34} color={colors.white} />
            </View>
          </Row>
          <View style={{ height: 8, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 4, marginTop: space.md }}>
            <View style={{ height: 8, width: `${Math.min(100, progress * 100)}%`, backgroundColor: colors.white, borderRadius: 4 }} />
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.88)', marginTop: 6, fontSize: 13 }}>{next ? t('rw.toNext', { n: next.min - credits, level: t(next.key) }) : t('rw.top')}</Text>
        </View>
      }
    >
      <Card>
        <Row style={{ justifyContent: 'space-between' }} gap={space.md}>
          <View style={{ flex: 1 }}>
            <Text style={font.h3}>{t('rw.reliability')}</Text>
            <Text style={[font.small, { marginTop: 2 }]}>{t('rw.reliabilityBody')}</Text>
          </View>
          <Text style={{ fontSize: 28, fontWeight: '800', color: reliability >= 80 ? colors.success : colors.warning }}>{reliability}%</Text>
        </Row>
      </Card>

      <Section title={t('rw.how')}>
        <Card style={{ paddingVertical: space.sm }}>
          {WAYS.map((w, i) => (
            <Row key={i} style={{ paddingVertical: 8 }} gap={space.md}>
              <IconCircle icon={w.icon as any} color={colors.accentDark} soft={colors.accentSoft} size={36} />
              <Text style={[font.body, { flex: 1 }]}>{t(w.title)}</Text>
              <Text style={{ fontWeight: '800', color: colors.accentDark }}>{w.pts}</Text>
            </Row>
          ))}
        </Card>
      </Section>

      <Section title={t('rw.history')}>
        {data && data.length === 0 && <Empty icon="gift-outline" title={t('rw.none')} text={t('rw.noneBody')} />}
        {(data ?? []).map((tx) => (
          <Card key={tx.id} style={{ paddingVertical: space.md }}>
            <Row>
              <Ionicons name="add-circle" size={22} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={[font.body, { fontWeight: '600' }]}>{tx.reason}</Text>
                <Text style={font.small}>
                  {tx.request_id ? `${t('rw.pickup', { id: tx.request_id })} · ` : ''}
                  {dateTime(tx.created_at)}
                </Text>
              </View>
              <View style={{ backgroundColor: colors.successSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
                <Text style={{ color: colors.success, fontWeight: '800' }}>+{tx.points}</Text>
              </View>
            </Row>
          </Card>
        ))}
      </Section>
    </Screen>
  );
}
