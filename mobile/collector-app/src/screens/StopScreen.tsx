import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, fileUrl } from '../core/api';
import { Photo, pickPhoto } from '../core/device';
import { clock, dateTime, kg, timeUntil } from '../core/format';
import MapView from '../core/MapView';
import { Params, useNav } from '../core/nav';
import { colors, font, radius, space } from '../core/theme';
import type { Stop } from '../core/types';
import { Badge, Button, Card, Chip, Input, KeyValue, Row, Screen, Section } from '../core/ui';
import { URGENCY, Urgency, wasteMeta } from '../core/waste';
import { openNavigation } from './RouteScreen';

const SKIP_REASONS = ['Gate locked / nobody home', 'Waste not segregated', 'Wrong waste type', 'Location not reachable', 'Unsafe / hazardous handling needed'];

export default function StopScreen({ params }: { params: Params }) {
  const nav = useNav();
  const stop: Stop = params.stop;
  const r = stop.request;
  const w = wasteMeta(r.waste_type);
  const [actual, setActual] = useState(String(r.est_kg));
  const [proof, setProof] = useState<Photo | null>(null);
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'collect' | 'skip'>('collect');
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const late = new Date(r.sla_deadline).getTime() < Date.now();

  const collect = async () => {
    const val = parseFloat(actual);
    if (isNaN(val) || val < 0) return Alert.alert('Enter the weighed amount in kg');
    setBusy(true);
    try {
      if (proof) {
        try {
          await api.uploadPhoto(`/collector/stops/${stop.id}/photo64`, proof.base64);
        } catch (e: any) {
          Alert.alert('Proof photo not uploaded', e.message);
        }
      }
      const res = await api.post<Stop>(`/collector/stops/${stop.id}/collect`, { actual_kg: val, note: note || null });
      Alert.alert('Collected ✔', `${kg(val)} recorded. Citizen earned ${res.request.credits_awarded} credits.`);
      nav.pop();
    } catch (e: any) {
      Alert.alert('Could not save', e.message);
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    if (!reason) return Alert.alert('Choose a reason');
    setBusy(true);
    try {
      await api.post(`/collector/stops/${stop.id}/skip`, { reason: note ? `${reason} – ${note}` : reason });
      nav.pop();
    } catch (e: any) {
      Alert.alert('Could not save', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title={`Stop ${stop.seq}`}
      subtitle={r.requester_name ?? undefined}
      back
      footer={
        mode === 'collect' ? (
          <Button title="Mark as collected" icon="checkmark-circle" onPress={collect} loading={busy} />
        ) : (
          <Button title="Skip this stop" icon="close-circle" variant="danger" onPress={skip} loading={busy} />
        )
      }
    >
      <View style={[styles.banner, { backgroundColor: w.soft }]}>
        <Ionicons name={w.icon as any} size={30} color={w.color} />
        <View style={{ flex: 1 }}>
          <Text style={[font.h2, { color: w.color }]}>{w.label}</Text>
          <Text style={font.small}>
            Estimated {kg(r.est_kg)} · ETA {clock(stop.eta)}
          </Text>
        </View>
        {late ? <Badge label="SLA LATE" color={colors.danger} soft={colors.dangerSoft} /> : null}
      </View>
      {r.waste_type === 'hazardous' && (
        <Card style={{ backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft }}>
          <Text style={{ color: colors.danger, fontWeight: '700' }}>Wear gloves & mask. Keep separate from other waste.</Text>
        </Card>
      )}

      <MapView markers={[{ id: 1, lat: r.lat, lng: r.lng, kind: 'home', color: w.color }]} center={[r.lat, r.lng]} zoom={16} height={170} />
      <Row style={{ marginTop: space.md }}>
        <Button title="Navigate" icon="navigate" variant="secondary" small style={{ flex: 1 }} onPress={() => openNavigation(r.lat, r.lng)} />
        {r.requester_phone ? (
          <Button title="Call" icon="call" variant="secondary" small style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${r.requester_phone}`)} />
        ) : null}
      </Row>

      <Section title="Request">
        <Card>
          <KeyValue label="Requested by" value={r.requester_name ?? '—'} />
          <KeyValue label="Address" value={r.address ?? '—'} />
          <KeyValue label="Urgency" value={URGENCY[r.urgency as Urgency]?.label ?? r.urgency} />
          <KeyValue label="Deadline" value={`${dateTime(r.sla_deadline)} (${timeUntil(r.sla_deadline)})`} />
          {r.notes ? <KeyValue label="Notes" value={r.notes} /> : null}
        </Card>
        {r.photo_url && <Image source={{ uri: fileUrl(r.photo_url) }} style={styles.photo} />}
      </Section>

      <Section title="Outcome">
        <Row style={{ marginBottom: space.md }}>
          <Chip label="Collected" active={mode === 'collect'} onPress={() => setMode('collect')} color={colors.success} />
          <Chip label="Can't collect" active={mode === 'skip'} onPress={() => setMode('skip')} color={colors.danger} />
        </Row>
        {mode === 'collect' ? (
          <>
            <Input label="Weighed amount (kg)" value={actual} onChangeText={setActual} keyboardType="decimal-pad" />
            <Pressable onPress={async () => setProof((await pickPhoto()) ?? proof)} style={styles.proof}>
              {proof ? (
                <Image source={{ uri: proof.uri }} style={{ width: '100%', height: '100%' }} />
              ) : (
                <Row>
                  <Ionicons name="camera" size={20} color={colors.accent} />
                  <Text style={{ color: colors.accentDark, fontWeight: '700' }}>Add proof photo</Text>
                </Row>
              )}
            </Pressable>
          </>
        ) : (
          <View style={{ gap: 6, marginBottom: space.md }}>
            {SKIP_REASONS.map((s) => (
              <Pressable key={s} onPress={() => setReason(s)} style={[styles.reason, reason === s && { borderColor: colors.danger, backgroundColor: colors.dangerSoft }]}>
                <Text style={{ fontWeight: '600', color: reason === s ? colors.danger : colors.text }}>{s}</Text>
              </Pressable>
            ))}
            <Text style={font.small}>Skipped requests go back into the queue for the next planning run.</Text>
          </View>
        )}
        <Input value={note} onChangeText={setNote} placeholder="Note (optional)" />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.lg, padding: space.lg, marginBottom: space.md },
  photo: { height: 160, borderRadius: radius.md, backgroundColor: colors.border },
  proof: {
    height: 120,
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
