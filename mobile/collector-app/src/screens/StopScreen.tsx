import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, fileUrl } from '../core/api';
import { Photo as PickedPhoto, pickPhoto } from '../core/device';
import { clock, dateTime, kg, timeUntil } from '../core/format';
import { haptic } from '../core/haptics';
import { t } from '../core/i18n';
import MapView from '../core/MapView';
import { Params, useNav } from '../core/nav';
import { colors, font, radius, space } from '../core/theme';
import type { Stop } from '../core/types';
import { Badge, Banner, Button, Card, Chip, Input, KeyValue, Photo, Row, Screen, Section } from '../core/ui';
import { URGENCY, Urgency, wasteMeta } from '../core/waste';
import { openNavigation } from './RouteScreen';

const SKIP_REASONS = ['st.r1', 'st.r2', 'st.r3', 'st.r4', 'st.r5'];

export default function StopScreen({ params }: { params: Params }) {
  const nav = useNav();
  const stop: Stop = params.stop;
  const r = stop.request;
  const w = wasteMeta(r.waste_type);
  const [actual, setActual] = useState(String(r.est_kg));
  const [proof, setProof] = useState<PickedPhoto | null>(null);
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'collect' | 'skip'>('collect');
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const late = new Date(r.sla_deadline).getTime() < Date.now();

  const collect = async () => {
    const val = parseFloat(actual);
    if (isNaN(val) || val < 0) return Alert.alert(t('st.enterKg'));
    setBusy(true);
    try {
      if (proof) {
        try {
          await api.uploadPhoto(`/collector/stops/${stop.id}/photo64`, proof.base64);
        } catch (e: any) {
          Alert.alert(t('st.proofFail'), e.message);
        }
      }
      const res = await api.post<Stop>(`/collector/stops/${stop.id}/collect`, { actual_kg: val, note: note || null });
      haptic.success();
      Alert.alert(t('st.doneTitle'), t('st.doneBody', { kg: kg(val), n: res.request.credits_awarded }));
      nav.pop();
    } catch (e: any) {
      Alert.alert(t('st.saveFail'), e.message);
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    if (!reason) return Alert.alert(t('st.chooseReason'));
    setBusy(true);
    try {
      await api.post(`/collector/stops/${stop.id}/skip`, { reason: note ? `${t(reason)} – ${note}` : t(reason) });
      nav.pop();
    } catch (e: any) {
      Alert.alert(t('st.saveFail'), e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title={t('st.title', { n: stop.seq })}
      subtitle={r.requester_name ?? undefined}
      back
      footer={
        mode === 'collect' ? (
          <Button title={t('st.markCollected')} icon="checkmark-circle" onPress={collect} loading={busy} />
        ) : (
          <Button title={t('st.skip')} icon="close-circle" variant="danger" onPress={skip} loading={busy} />
        )
      }
    >
      <View style={[styles.banner, { backgroundColor: w.soft }]}>
        <Ionicons name={w.icon as any} size={30} color={w.color} />
        <View style={{ flex: 1 }}>
          <Text style={[font.h2, { color: w.color }]}>{w.label}</Text>
          <Text style={font.small}>
            {t('st.estimate', { kg: kg(r.est_kg), time: clock(stop.eta) })}
          </Text>
        </View>
        {late ? <Badge label={t('rt.late')} color={colors.danger} soft={colors.dangerSoft} /> : null}
      </View>
      {r.ai_mismatch && (
        <View style={{ marginBottom: space.md }}>
          <Banner
            tone="warning"
            icon="sparkles"
            text={t('st.ai', { type: wasteMeta(r.ai_type ?? '').label, item: r.ai_item ?? '', pct: Math.round((r.ai_confidence ?? 0) * 100), chosen: w.label })}
          />
        </View>
      )}
      {r.waste_type === 'hazardous' && (
        <View style={{ marginBottom: space.md }}>
          <Banner tone="danger" text={t('st.hazard')} />
        </View>
      )}

      <MapView markers={[{ id: 1, lat: r.lat, lng: r.lng, kind: 'home', color: w.color }]} center={[r.lat, r.lng]} zoom={16} height={190} />
      <Row style={{ marginTop: space.md }}>
        <Button title={t('rt.navigate')} icon="navigate" variant="secondary" small style={{ flex: 1 }} onPress={() => openNavigation(r.lat, r.lng)} />
        {r.requester_phone ? (
          <Button title={t('st.call')} icon="call" variant="secondary" small style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${r.requester_phone}`)} />
        ) : null}
      </Row>

      <Section title={t('st.request')}>
        <Card>
          <KeyValue label={t('st.by')} value={r.requester_name ?? '—'} />
          <KeyValue label={t('det.address')} value={r.address ?? '—'} />
          <KeyValue label={t('det.urgency')} value={URGENCY[r.urgency as Urgency]?.label ?? r.urgency} />
          <KeyValue label={t('st.deadline')} value={`${dateTime(r.sla_deadline)} (${timeUntil(r.sla_deadline)})`} />
          {r.notes ? <KeyValue label={t('det.notes')} value={r.notes} /> : null}
        </Card>
        {r.photo_url && <Photo uri={fileUrl(r.photo_url)} />}
      </Section>

      <Section title={t('st.outcome')}>
        <Row style={{ marginBottom: space.md }}>
          <Chip label={t('st.collected')} icon="checkmark-circle" active={mode === 'collect'} onPress={() => setMode('collect')} color={colors.success} />
          <Chip label={t('st.cant')} icon="close-circle" active={mode === 'skip'} onPress={() => setMode('skip')} color={colors.danger} />
        </Row>
        {mode === 'collect' ? (
          <>
            <Input label={t('st.weighed')} icon="scale-outline" value={actual} onChangeText={setActual} keyboardType="decimal-pad" />
            {proof ? (
              <Photo uri={proof.uri} maxHeight={320} onPress={async () => setProof((await pickPhoto()) ?? proof)} />
            ) : (
              <Pressable onPress={async () => setProof((await pickPhoto()) ?? proof)} style={styles.proof}>
                <Row>
                  <Ionicons name="camera" size={20} color={colors.accent} />
                  <Text style={{ color: colors.accentDark, fontWeight: '700' }}>{t('st.proof')}</Text>
                </Row>
              </Pressable>
            )}
          </>
        ) : (
          <View style={{ gap: 6, marginBottom: space.md }}>
            {SKIP_REASONS.map((s) => (
              <Pressable key={s} onPress={() => setReason(s)} style={[styles.reason, reason === s && { borderColor: colors.danger, backgroundColor: colors.dangerSoft }]}>
                <Text style={{ fontWeight: '600', color: reason === s ? colors.danger : colors.text }}>{t(s)}</Text>
              </Pressable>
            ))}
            <Text style={font.small}>{t('st.skipNote')}</Text>
          </View>
        )}
        <Input value={note} onChangeText={setNote} icon="create-outline" placeholder={t('st.note')} />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.lg, padding: space.lg, marginBottom: space.md },
  proof: {
    height: 110,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: space.md,
    backgroundColor: colors.accentSoft,
  },
  reason: { padding: space.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
});
