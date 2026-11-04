import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import PickupCard from '../components/PickupCard';
import { useAuth } from '../core/auth';
import { kg } from '../core/format';
import { haptic } from '../core/haptics';
import { useApi } from '../core/hooks';
import { t } from '../core/i18n';
import { useNav } from '../core/nav';
import { colors, font, radius, shadow, space } from '../core/theme';
import type { Pickup } from '../core/types';
import { Button, Empty, ErrorBox, Row, Screen, Section, Skeleton, Stat } from '../core/ui';
import { WASTE, WASTE_ORDER } from '../core/waste';

interface Stats {
  total_requests: number;
  open_requests: number;
  collected: number;
  total_kg: number;
  kg_diverted_from_landfill: number;
  co2_saved_kg: number;
  green_credits: number;
}

export default function HomeScreen() {
  const { user, refreshUser } = useAuth();
  const nav = useNav();
  const reqs = useApi<Pickup[]>('/requests/mine', 15000);
  const stats = useApi<Stats>('/requests/stats');
  const active = (reqs.data ?? []).filter((r) => ['pending', 'scheduled', 'in_progress'].includes(r.status));
  const hour = new Date().getHours();
  const greet = hour < 12 ? t('home.morning') : hour < 17 ? t('home.afternoon') : t('home.evening');
  const credits = stats.data?.green_credits ?? user?.green_credits ?? 0;

  return (
    <Screen
      refreshing={reqs.refreshing}
      onRefresh={() => {
        reqs.reload();
        stats.reload();
        refreshUser();
      }}
      hero={
        <View>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greet}>{greet} 👋</Text>
              <Text style={[font.h1, { color: colors.white }]} numberOfLines={1}>
                {user?.name.split(' ')[0]}
              </Text>
            </View>
            <Pressable onPress={() => nav.switchTab('rewards')} style={styles.creditPill}>
              <Ionicons name="leaf" size={16} color={colors.white} />
              <Text style={{ color: colors.white, fontWeight: '800', fontSize: 16 }}>{credits}</Text>
            </Pressable>
          </Row>
          {user?.ward ? (
            <Row gap={4} style={{ marginTop: 6 }}>
              <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.85)" />
              <Text style={styles.greet}>{user.ward}, Vellore</Text>
            </Row>
          ) : null}
        </View>
      }
    >
      {/* big call to action */}
      <Pressable
        onPress={() => {
          haptic.press();
          nav.push('NewRequest');
        }}
        style={({ pressed }) => [styles.cta, pressed && { transform: [{ scale: 0.985 }] }]}
      >
        <View style={styles.ctaIcon}>
          <Ionicons name="add" size={30} color={colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[font.h2, { fontSize: 19 }]}>{t('home.request')}</Text>
          <Text style={font.small} numberOfLines={1}>
            {WASTE_ORDER.map((w) => WASTE[w].short).join(' · ')}
          </Text>
        </View>
        <Ionicons name="arrow-forward-circle" size={30} color={colors.accent} />
      </Pressable>

      <View style={styles.impact}>
        <Ionicons name="earth" size={22} color={colors.success} />
        <Text style={{ flex: 1, color: colors.success, fontWeight: '600', fontSize: 13 }}>
          {stats.data ? t('home.impact', { kg: kg(stats.data.kg_diverted_from_landfill), co2: kg(stats.data.co2_saved_kg) }) : t('common.loading')}
        </Text>
      </View>

      <Row style={{ marginTop: space.md }}>
        <Stat label={t('home.done')} value={stats.data?.collected ?? '–'} icon="checkmark-done" />
        <Stat label={t('home.handed')} value={stats.data ? kg(stats.data.total_kg) : '–'} icon="scale" tint={colors.info} />
        <Stat label={t('home.open')} value={stats.data?.open_requests ?? '–'} icon="time" tint={colors.warning} />
      </Row>

      <Section title={t('home.active')} action={active.length ? <Text style={[font.small, { fontWeight: '700' }]}>{active.length}</Text> : undefined}>
        {reqs.error && <ErrorBox message={reqs.error} onRetry={reqs.reload} />}
        {reqs.loading && !reqs.data && <Skeleton height={86} count={2} />}
        {!reqs.loading && active.length === 0 && !reqs.error && (
          <Empty icon="trash-bin-outline" title={t('home.none')} text={t('home.noneBody')} action={<Button title={t('home.request')} icon="add" onPress={() => nav.push('NewRequest')} />} />
        )}
        {active.map((p) => (
          <PickupCard key={p.id} p={p} />
        ))}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  greet: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600' },
  creditPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, height: 40, borderRadius: 20 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderRadius: radius.xl, padding: space.lg, ...shadow },
  ctaIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  impact: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.successSoft },
});
