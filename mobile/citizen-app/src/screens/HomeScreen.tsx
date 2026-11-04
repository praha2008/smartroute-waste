import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../core/auth';
import { kg } from '../core/format';
import { useApi } from '../core/hooks';
import { useNav } from '../core/nav';
import { colors, font, radius, space } from '../core/theme';
import type { Pickup } from '../core/types';
import { Button, Empty, ErrorBox, Row, Screen, Section, Stat } from '../core/ui';
import PickupCard from '../components/PickupCard';

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
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <Screen
      refreshing={reqs.refreshing}
      onRefresh={() => {
        reqs.reload();
        stats.reload();
        refreshUser();
      }}
    >
      <Text style={font.small}>{greet},</Text>
      <Text style={font.h1}>{user?.name.split(' ')[0]}</Text>

      <View style={styles.hero}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={styles.heroLabel}>GREEN CREDITS</Text>
            <Text style={styles.heroValue}>{stats.data?.green_credits ?? user?.green_credits ?? 0}</Text>
          </View>
          <Ionicons name="leaf" size={44} color="rgba(255,255,255,0.25)" />
        </Row>
        <Text style={styles.heroSub}>
          {stats.data ? `${kg(stats.data.kg_diverted_from_landfill)} kept out of landfill · ${kg(stats.data.co2_saved_kg)} CO₂ saved` : ' '}
        </Text>
        <Pressable style={styles.heroBtn} onPress={() => nav.push('NewRequest')}>
          <Ionicons name="add-circle" size={22} color={colors.accentDark} />
          <Text style={{ color: colors.accentDark, fontWeight: '800', fontSize: 16 }}>Request a pickup</Text>
        </Pressable>
      </View>

      <Row style={{ marginTop: space.lg }}>
        <Stat label="Pickups done" value={stats.data?.collected ?? '–'} icon="checkmark-done" />
        <Stat label="Waste handed" value={stats.data ? kg(stats.data.total_kg) : '–'} icon="scale" />
        <Stat label="Open now" value={stats.data?.open_requests ?? '–'} icon="time" />
      </Row>

      <Section title="Active pickups" action={active.length ? <Text style={font.small}>{active.length}</Text> : undefined}>
        {reqs.error && <ErrorBox message={reqs.error} onRetry={reqs.reload} />}
        {!reqs.loading && active.length === 0 && !reqs.error && (
          <Empty
            icon="trash-bin-outline"
            title="No pickups in progress"
            text="Segregate your waste and request a pickup. We group nearby requests so trucks travel less."
            action={<Button title="Request pickup" icon="add" onPress={() => nav.push('NewRequest')} />}
          />
        )}
        {active.map((p) => (
          <PickupCard key={p.id} p={p} />
        ))}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: space.lg, backgroundColor: colors.accent, borderRadius: radius.lg + 4, padding: space.xl },
  heroLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  heroValue: { color: '#fff', fontSize: 40, fontWeight: '800', marginTop: 2 },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4 },
  heroBtn: {
    marginTop: space.lg,
    backgroundColor: '#fff',
    borderRadius: radius.md,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
