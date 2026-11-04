import React, { useState } from 'react';
import { Alert, Text } from 'react-native';

import { api, fileUrl } from '../core/api';
import { useAuth } from '../core/auth';
import { dateTime, inr, kg, km } from '../core/format';
import { haptic } from '../core/haptics';
import { t } from '../core/i18n';
import MapView from '../core/MapView';
import { Params, useNav } from '../core/nav';
import { colors, font, space } from '../core/theme';
import type { Lot } from '../core/types';
import { Badge, Button, Card, KeyValue, Photo, Row, Screen, Section } from '../core/ui';
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
      haptic.success();
      Alert.alert(msg);
    } catch (e: any) {
      Alert.alert(t('lot.notPossible'), e.message);
      if (path === 'claim') nav.pop();
    } finally {
      setBusy(false);
    }
  };

  const footer =
    lot.status === 'available' ? (
      <Button title={t('lot.claim', { v: inr(lot.total_value) })} icon="hand-left" loading={busy} onPress={() => act('claim', t('lot.claimedMsg'))} />
    ) : lot.status === 'claimed' && mine ? (
      <Row>
        <Button title={t('lot.release')} variant="secondary" style={{ flex: 1 }} loading={busy} onPress={() => act('release', t('lot.releasedMsg'))} />
        <Button title={t('lot.confirmPicked')} icon="checkmark-done" style={{ flex: 1.6 }} loading={busy} onPress={() => act('picked', t('lot.pickedMsg'))} />
      </Row>
    ) : undefined;

  return (
    <Screen title={t('lot.title', { id: lot.id })} subtitle={w.label} back footer={footer}>
      <Card style={{ backgroundColor: w.soft, borderColor: w.soft }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Badge label={s.label} color={s.color} soft="#ffffff" />
          <Text style={font.small}>₹{lot.price_per_kg}/kg</Text>
        </Row>
        <Text style={{ fontSize: 34, fontWeight: '800', color: w.color, marginTop: space.sm }}>{kg(lot.kg)}</Text>
        <Text style={[font.h3, { color: colors.text }]}>{t('lot.value', { v: inr(lot.total_value) })}</Text>
      </Card>

      <MapView markers={[{ id: lot.id, lat: lot.lat, lng: lot.lng, color: w.color, title: lot.ward ?? '' }]} center={[lot.lat, lot.lng]} zoom={15} height={180} />

      <Section title={t('det.details')}>
        <Card>
          <KeyValue label={t('lot.material')} value={w.label} />
          <KeyValue label={t('lot.weighed')} value={kg(lot.kg)} />
          <KeyValue label={t('acct.ward')} value={lot.ward ?? '—'} />
          <KeyValue label={t('lot.distance')} value={lot.distance_km !== null ? km(lot.distance_km) : '—'} />
          <KeyValue label={t('lot.collected')} value={dateTime(lot.created_at)} />
          {lot.claimed_at ? <KeyValue label={t('lot.claimed')} value={dateTime(lot.claimed_at)} /> : null}
          {lot.picked_at ? <KeyValue label={t('lot.picked')} value={dateTime(lot.picked_at)} /> : null}
          <KeyValue label={t('lot.source')} value={`#${lot.request_id}`} />
        </Card>
      </Section>
      {lot.photo_url ? <Photo uri={fileUrl(lot.photo_url)} style={{ marginTop: space.md }} /> : null}
    </Screen>
  );
}
