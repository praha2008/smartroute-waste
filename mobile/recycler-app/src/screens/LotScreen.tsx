import React, { useState } from 'react';
import { Alert, Image, StyleSheet, Text } from 'react-native';

import { api, fileUrl } from '../core/api';
import { useAuth } from '../core/auth';
import { dateTime, inr, kg, km } from '../core/format';
import MapView from '../core/MapView';
import { Params, useNav } from '../core/nav';
import { colors, font, radius, space } from '../core/theme';
import type { Lot } from '../core/types';
import { Badge, Button, Card, KeyValue, Row, Screen, Section } from '../core/ui';
import { statusMeta, wasteMeta } from '../core/waste';

export default function LotScreen({ params }: { params: Params }) {
  const nav = useNav();
  const { user } = useAuth();
  const [lot, setLot] = useState<Lot>(params.lot);
  const [busy, setBusy] = useState(false);
  const w = wasteMeta(lot.material);
  const s = statusMeta(lot.status);
  const mine = lot.recycler_id === user?.id;

  const act = async (path: string, msg: string) => {
    setBusy(true);
    try {
      setLot(await api.post<Lot>(`/recycler/lots/${lot.id}/${path}`));
      Alert.alert(msg);
    } catch (e: any) {
      Alert.alert('Not possible', e.message);
      if (path === 'claim') nav.pop();
    } finally {
      setBusy(false);
    }
  };

  const footer =
    lot.status === 'available' ? (
      <Button title={`Claim lot · ${inr(lot.total_value)}`} icon="hand-left" loading={busy} onPress={() => act('claim', 'Lot claimed! Collect it from the ward drop point.')} />
    ) : lot.status === 'claimed' && mine ? (
      <Row>
        <Button title="Release" variant="secondary" style={{ flex: 1 }} loading={busy} onPress={() => act('release', 'Lot released back to the market.')} />
        <Button title="Confirm picked up" icon="checkmark-done" style={{ flex: 1.6 }} loading={busy} onPress={() => act('picked', 'Great! Material recovered.')} />
      </Row>
    ) : undefined;

  return (
    <Screen title={`Lot #${lot.id}`} subtitle={w.label} back footer={footer}>
      <Card style={{ backgroundColor: w.soft, borderColor: w.soft }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Badge label={s.label} color={s.color} soft="#ffffff" />
          <Text style={font.small}>₹{lot.price_per_kg}/kg</Text>
        </Row>
        <Text style={{ fontSize: 34, fontWeight: '800', color: w.color, marginTop: space.sm }}>{kg(lot.kg)}</Text>
        <Text style={[font.h3, { color: colors.text }]}>Estimated value {inr(lot.total_value)}</Text>
      </Card>

      <MapView markers={[{ id: lot.id, lat: lot.lat, lng: lot.lng, color: w.color, title: lot.ward ?? '' }]} center={[lot.lat, lot.lng]} zoom={15} height={180} />

      <Section title="Details">
        <Card>
          <KeyValue label="Material" value={w.label} />
          <KeyValue label="Weighed at pickup" value={kg(lot.kg)} />
          <KeyValue label="Ward" value={lot.ward ?? '—'} />
          <KeyValue label="Distance from yard" value={lot.distance_km !== null ? km(lot.distance_km) : '—'} />
          <KeyValue label="Collected" value={dateTime(lot.created_at)} />
          {lot.claimed_at ? <KeyValue label="Claimed" value={dateTime(lot.claimed_at)} /> : null}
          {lot.picked_at ? <KeyValue label="Picked up" value={dateTime(lot.picked_at)} /> : null}
          <KeyValue label="Source pickup" value={`#${lot.request_id}`} />
        </Card>
      </Section>
      {lot.photo_url ? <Image source={{ uri: fileUrl(lot.photo_url) }} style={styles.photo} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { height: 180, borderRadius: radius.md, backgroundColor: colors.border, marginTop: space.md },
});
