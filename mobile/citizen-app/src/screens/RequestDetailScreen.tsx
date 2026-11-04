import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';

import { api, fileUrl } from '../core/api';
import { useAuth } from '../core/auth';
import { clock, dateTime, kg, timeUntil } from '../core/format';
import { useApi } from '../core/hooks';
import MapView, { MapMarker } from '../core/MapView';
import { Params } from '../core/nav';
import { colors, font, radius, space } from '../core/theme';
import type { Pickup } from '../core/types';
import { Badge, Button, Card, ErrorBox, KeyValue, Loading, Row, Screen, Section } from '../core/ui';
import { URGENCY, Urgency, statusMeta, wasteMeta } from '../core/waste';

const STEPS = [
  { key: 'pending', label: 'Request received', icon: 'checkmark' },
  { key: 'scheduled', label: 'Added to a truck route', icon: 'git-network' },
  { key: 'in_progress', label: 'Truck on the way', icon: 'bus' },
  { key: 'collected', label: 'Collected', icon: 'checkmark-done' },
] as const;

export default function RequestDetailScreen({ params }: { params: Params }) {
  const { refreshUser } = useAuth();
  const { data: p, error, loading, reload, refreshing, setData } = useApi<Pickup>(`/requests/${params.id}`, 10000);
  const [cancelling, setCancelling] = useState(false);

  const markers = useMemo<MapMarker[]>(() => {
    if (!p) return [];
    const m: MapMarker[] = [{ id: 'home', lat: p.lat, lng: p.lng, kind: 'home', color: colors.accent, title: 'Pickup point' }];
    if (p.vehicle?.cur_lat && p.vehicle.cur_lng && p.status === 'in_progress') {
      m.push({ id: 'truck', lat: p.vehicle.cur_lat, lng: p.vehicle.cur_lng, kind: 'truck', color: '#6A1B9A', title: p.vehicle.name });
    }
    return m;
  }, [p]);

  if (loading) return <Loading />;
  if (!p) return <Screen title="Pickup" back>{error ? <ErrorBox message={error} onRetry={reload} /> : null}</Screen>;

  const w = wasteMeta(p.waste_type);
  const s = statusMeta(p.status);
  const stepIndex = STEPS.findIndex((x) => x.key === p.status);
  const closed = ['cancelled', 'missed'].includes(p.status);

  const cancel = () =>
    Alert.alert('Cancel this pickup?', undefined, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel pickup',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            setData(await api.post<Pickup>(`/requests/${p.id}/cancel`));
          } catch (e: any) {
            Alert.alert('Could not cancel', e.message);
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);

  return (
    <Screen
      title={`Pickup #${p.id}`}
      subtitle={w.label}
      back
      refreshing={refreshing}
      onRefresh={() => {
        reload();
        refreshUser();
      }}
    >
      {params.fresh && p.status === 'pending' && (
        <Card style={{ backgroundColor: colors.accentSoft, borderColor: colors.accentSoft }}>
          <Row>
            <Ionicons name="checkmark-circle" size={22} color={colors.accentDark} />
            <Text style={{ flex: 1, color: colors.accentDark, fontWeight: '600' }}>
              Request sent! We'll group it with nearby pickups and assign a truck.
            </Text>
          </Row>
        </Card>
      )}

      {p.status === 'in_progress' && (
        <View style={styles.eta}>
          <Ionicons name="bus" size={28} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>
              {p.eta ? `Arriving around ${clock(p.eta)}` : 'Truck is on the way'}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)' }}>
              {p.vehicle?.name} · {p.stops_before ? `${p.stops_before} stops before you` : 'You are next!'}
            </Text>
          </View>
        </View>
      )}

      <MapView markers={markers} height={200} center={[p.lat, p.lng]} zoom={15} />

      <Card style={{ marginTop: space.md }}>
        <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
          <Text style={font.h3}>Status</Text>
          <Badge label={s.label} color={s.color} soft={s.soft} />
        </Row>
        {closed ? (
          <Text style={font.small}>{p.skip_reason || `This pickup was ${p.status}.`}</Text>
        ) : (
          STEPS.map((st, i) => {
            const done = i <= stepIndex;
            return (
              <Row key={st.key} style={{ alignItems: 'flex-start' }} gap={space.md}>
                <View style={{ alignItems: 'center' }}>
                  <View style={[styles.stepDot, { backgroundColor: done ? colors.accent : colors.border }]}>
                    <Ionicons name={st.icon as any} size={14} color="#fff" />
                  </View>
                  {i < STEPS.length - 1 && <View style={[styles.stepLine, { backgroundColor: i < stepIndex ? colors.accent : colors.border }]} />}
                </View>
                <View style={{ flex: 1, paddingTop: 3 }}>
                  <Text style={[font.body, { fontWeight: done ? '700' : '400', color: done ? colors.text : colors.textFaint }]}>{st.label}</Text>
                  <Text style={[font.small, { fontSize: 12 }]}>
                    {st.key === 'pending' && dateTime(p.created_at)}
                    {st.key === 'scheduled' && p.scheduled_at ? dateTime(p.scheduled_at) : ''}
                    {st.key === 'collected' && p.collected_at ? dateTime(p.collected_at) : ''}
                  </Text>
                </View>
              </Row>
            );
          })
        )}
        {p.skip_reason && p.status === 'pending' && (
          <Text style={[font.small, { color: colors.warning, marginTop: space.sm }]}>Last attempt: {p.skip_reason}. It's back in the queue.</Text>
        )}
      </Card>

      {p.status === 'collected' && (
        <Card style={{ backgroundColor: colors.successSoft, borderColor: colors.successSoft }}>
          <Row>
            <Ionicons name="gift" size={22} color={colors.success} />
            <Text style={{ flex: 1, color: colors.success, fontWeight: '700' }}>
              You earned {p.credits_awarded} green credits for this pickup
            </Text>
          </Row>
        </Card>
      )}

      <Section title="Details">
        <Card>
          <KeyValue label="Waste type" value={w.label} />
          <KeyValue label="Estimated" value={kg(p.est_kg)} />
          {p.actual_kg !== null && <KeyValue label="Actual (weighed)" value={kg(p.actual_kg)} />}
          <KeyValue label="Urgency" value={URGENCY[p.urgency as Urgency]?.label ?? p.urgency} />
          {!closed && p.status !== 'collected' && <KeyValue label="Target pickup" value={`${dateTime(p.sla_deadline)} (${timeUntil(p.sla_deadline)})`} />}
          {p.address ? <KeyValue label="Address" value={p.address} /> : null}
          {p.notes ? <KeyValue label="Notes" value={p.notes} /> : null}
        </Card>
      </Section>

      {(p.photo_url || p.proof_photo_url) && (
        <Section title="Photos">
          <Row>
            {p.photo_url && <Image source={{ uri: fileUrl(p.photo_url) }} style={styles.photo} />}
            {p.proof_photo_url && <Image source={{ uri: fileUrl(p.proof_photo_url) }} style={styles.photo} />}
          </Row>
        </Section>
      )}

      {['pending', 'scheduled'].includes(p.status) && (
        <Button title="Cancel pickup" variant="danger" icon="close-circle" onPress={cancel} loading={cancelling} style={{ marginTop: space.xl }} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  eta: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: '#6A1B9A', borderRadius: radius.lg, padding: space.lg, marginBottom: space.md },
  stepDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepLine: { width: 2, height: 26 },
  photo: { flex: 1, height: 140, borderRadius: radius.md, backgroundColor: colors.border },
});
