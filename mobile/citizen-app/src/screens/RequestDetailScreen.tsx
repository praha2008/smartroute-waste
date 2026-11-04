import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { api, fileUrl } from '../core/api';
import { useAuth } from '../core/auth';
import { clock, dateTime, kg, timeUntil } from '../core/format';
import { useApi } from '../core/hooks';
import { t } from '../core/i18n';
import MapView, { MapMarker } from '../core/MapView';
import { Params } from '../core/nav';
import { colors, font, radius, space } from '../core/theme';
import type { Pickup } from '../core/types';
import { Badge, Banner, Button, Card, ErrorBox, KeyValue, Loading, Photo, Row, Screen, Section } from '../core/ui';
import { URGENCY, Urgency, statusMeta, wasteMeta } from '../core/waste';

const STEPS = [
  { key: 'pending', label: 'det.s1', icon: 'checkmark' },
  { key: 'scheduled', label: 'det.s2', icon: 'git-network' },
  { key: 'in_progress', label: 'det.s3', icon: 'bus' },
  { key: 'collected', label: 'det.s4', icon: 'checkmark-done' },
] as const;

export default function RequestDetailScreen({ params }: { params: Params }) {
  const { refreshUser } = useAuth();
  const { data: p, error, loading, reload, refreshing, setData } = useApi<Pickup>(`/requests/${params.id}`, 10000);
  const [cancelling, setCancelling] = useState(false);

  const markers = useMemo<MapMarker[]>(() => {
    if (!p) return [];
    const m: MapMarker[] = [{ id: 'home', lat: p.lat, lng: p.lng, kind: 'home', color: colors.accent, title: t('loc.title') }];
    if (p.vehicle?.cur_lat && p.vehicle.cur_lng && p.status === 'in_progress') {
      m.push({ id: 'truck', lat: p.vehicle.cur_lat, lng: p.vehicle.cur_lng, kind: 'truck', color: '#6A1B9A', title: p.vehicle.name });
    }
    return m;
  }, [p]);

  if (loading) return <Loading />;
  if (!p) return <Screen title={t('det.title', { id: params.id })} back>{error ? <ErrorBox message={error} onRetry={reload} /> : null}</Screen>;

  const w = wasteMeta(p.waste_type);
  const s = statusMeta(p.status);
  const stepIndex = STEPS.findIndex((x) => x.key === p.status);
  const closed = ['cancelled', 'missed'].includes(p.status);

  const cancel = () =>
    Alert.alert(t('det.cancelQ'), undefined, [
      { text: t('det.keep'), style: 'cancel' },
      {
        text: t('det.cancel'),
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            setData(await api.post<Pickup>(`/requests/${p.id}/cancel`));
          } catch (e: any) {
            Alert.alert(t('det.cantCancel'), e.message);
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);

  return (
    <Screen
      title={t('det.title', { id: p.id })}
      subtitle={w.label}
      back
      refreshing={refreshing}
      onRefresh={() => {
        reload();
        refreshUser();
      }}
    >
      {params.fresh && p.status === 'pending' && (
        <View style={{ marginBottom: space.md }}>
          <Banner tone="success" text={t('det.sent')} />
        </View>
      )}

      {p.status === 'in_progress' && (
        <LinearGradient colors={['#7B2FBE', '#4A148C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.eta}>
          <View style={styles.etaIcon}>
            <Ionicons name="bus" size={26} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>
              {p.eta ? t('det.arriving', { time: clock(p.eta) }) : t('det.onTheWay')}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)' }}>
              {p.vehicle?.name} · {p.stops_before ? t('card.stopsBefore', { n: p.stops_before }) : t('det.youAreNext')}
            </Text>
          </View>
        </LinearGradient>
      )}

      <MapView markers={markers} height={200} center={[p.lat, p.lng]} zoom={15} />

      <Card style={{ marginTop: space.md }}>
        <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
          <Text style={font.h3}>{t('det.status')}</Text>
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
                  <Text style={[font.body, { fontWeight: done ? '700' : '400', color: done ? colors.text : colors.textFaint }]}>{t(st.label)}</Text>
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
        {p.status === 'pending' && !p.skip_reason && (
          <Text style={[font.small, { marginTop: space.sm }]}>
            {t('det.waiting', { time: dateTime(p.sla_deadline) })}
          </Text>
        )}
        {p.skip_reason && p.status === 'pending' && (
          <Text style={[font.small, { color: colors.warning, marginTop: space.sm }]}>{t('det.lastAttempt', { reason: p.skip_reason })}</Text>
        )}
      </Card>

      {p.status === 'collected' && (
        <View style={{ marginBottom: space.md }}>
          <Banner tone="success" icon="gift" text={t('det.earned', { n: p.credits_awarded })} />
        </View>
      )}

      <Section title={t('det.details')}>
        <Card>
          <KeyValue label={t('det.wasteType')} value={w.label} />
          <KeyValue label={t('det.estimated')} value={kg(p.est_kg)} />
          {p.actual_kg !== null && <KeyValue label={t('det.actual')} value={kg(p.actual_kg)} />}
          <KeyValue label={t('det.urgency')} value={URGENCY[p.urgency as Urgency]?.label ?? p.urgency} />
          {!closed && p.status !== 'collected' && <KeyValue label={t('det.target')} value={`${dateTime(p.sla_deadline)} (${timeUntil(p.sla_deadline)})`} />}
          {p.address ? <KeyValue label={t('det.address')} value={p.address} /> : null}
          {p.notes ? <KeyValue label={t('det.notes')} value={p.notes} /> : null}
        </Card>
      </Section>

      {(p.photo_url || p.proof_photo_url) && (
        <Section title={t('det.photos')}>
          {p.photo_url && <Photo uri={fileUrl(p.photo_url)} />}
          {p.proof_photo_url && <Photo uri={fileUrl(p.proof_photo_url)} />}
        </Section>
      )}

      {['pending', 'scheduled'].includes(p.status) && (
        <Button title={t('det.cancel')} variant="danger" icon="close-circle" onPress={cancel} loading={cancelling} style={{ marginTop: space.xl }} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  eta: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.xl, padding: space.lg, marginBottom: space.md },
  etaIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  stepDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepLine: { width: 2, height: 26 },
});
