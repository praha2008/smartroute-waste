import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '../core/api';
import { useAuth } from '../core/auth';
import { getCurrentLocation, Photo, pickPhoto, reverseGeocode } from '../core/device';
import MapView from '../core/MapView';
import { useNav } from '../core/nav';
import { colors, font, radius, space } from '../core/theme';
import type { Pickup } from '../core/types';
import { Button, Chip, ErrorBox, Input, Row, Screen, Section } from '../core/ui';
import { URGENCY, URGENCY_ORDER, Urgency, WASTE, WASTE_ORDER, WasteType } from '../core/waste';

// must match backend config.py
const BASE_SLA_H: Record<WasteType, number> = { organic: 12, recyclable: 48, hazardous: 6, e_waste: 48, general: 24 };
const SLA_FACTOR: Record<Urgency, number> = { low: 2, medium: 1, high: 0.5, critical: 0.25 };
const QUICK_KG = [1, 2, 5, 10, 25, 50];

function slaText(t: WasteType, u: Urgency) {
  const h = BASE_SLA_H[t] * SLA_FACTOR[u];
  return h < 24 ? `within ${h % 1 ? h.toFixed(1) : h} hours` : `within ${Math.round(h / 24)} day${h >= 48 ? 's' : ''}`;
}

export default function NewRequestScreen() {
  const nav = useNav();
  const { user } = useAuth();
  const [type, setType] = useState<WasteType | null>(null);
  const [qty, setQty] = useState('');
  const [urgency, setUrgency] = useState<Urgency>('medium');
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(user?.lat && user?.lng ? { lat: user.lat, lng: user.lng } : null);
  const [address, setAddress] = useState(user?.address ?? '');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locate = async () => {
    setLocating(true);
    const p = await getCurrentLocation();
    if (p) {
      setLoc(p);
      const a = await reverseGeocode(p.lat, p.lng);
      if (a && !address) setAddress(a);
    }
    setLocating(false);
  };

  useEffect(() => {
    if (!loc) locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markers = useMemo(() => (loc ? [{ id: 'me', lat: loc.lat, lng: loc.lng, kind: 'home' as const, color: colors.accent }] : []), [loc]);

  const submit = async () => {
    setError(null);
    const est = parseFloat(qty);
    if (!type) return setError('Choose the type of waste');
    if (!est || est <= 0) return setError('Enter approximate quantity in kg');
    if (!loc) return setError('Set the pickup location on the map');
    setBusy(true);
    try {
      const created = await api.post<Pickup>('/requests', { waste_type: type, urgency, est_kg: est, lat: loc.lat, lng: loc.lng, address, notes: notes || null });
      if (photo) {
        try {
          await api.uploadPhoto(`/requests/${created.id}/photo64`, photo.base64);
        } catch (e: any) {
          Alert.alert('Request created', `But the photo could not be uploaded: ${e.message}`);
        }
      }
      nav.replace('RequestDetail', { id: created.id, fresh: true });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title="Request a pickup"
      back
      footer={<Button title="Submit request" icon="send" onPress={submit} loading={busy} disabled={!type} />}
    >
      <Text style={font.tiny}>1 · WHAT KIND OF WASTE?</Text>
      <View style={styles.grid}>
        {WASTE_ORDER.map((t) => {
          const w = WASTE[t];
          const active = type === t;
          return (
            <Pressable key={t} onPress={() => setType(t)} style={[styles.typeCard, active && { borderColor: w.color, backgroundColor: w.soft }]}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Ionicons name={w.icon as any} size={24} color={w.color} />
                {active && <Ionicons name="checkmark-circle" size={20} color={w.color} />}
              </Row>
              <Text style={[font.h3, { marginTop: 8, fontSize: 15 }]}>{w.label}</Text>
              <Text style={[font.small, { fontSize: 12, marginTop: 2 }]} numberOfLines={2}>
                {w.hint}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {type === 'general' && (
        <Text style={[font.small, { color: colors.warning, marginTop: -4 }]}>Tip: segregated waste earns +5 extra credits and is easier to recycle.</Text>
      )}
      {type === 'hazardous' && (
        <Text style={[font.small, { color: colors.danger, marginTop: -4 }]}>Hazardous waste gets top priority and a dedicated vehicle. Keep it sealed.</Text>
      )}

      <Section title="2 · How much (approx.)?">
        <Row style={{ flexWrap: 'wrap', marginBottom: space.md }} gap={6}>
          {QUICK_KG.map((k) => (
            <Chip key={k} label={`${k} kg`} active={qty === String(k)} onPress={() => setQty(String(k))} />
          ))}
        </Row>
        <Input value={qty} onChangeText={setQty} keyboardType="decimal-pad" placeholder="Or type kg, e.g. 3.5" />
        <Text style={[font.small, { marginTop: -6 }]}>A normal kitchen bin is about 2–3 kg. Accurate estimates earn bonus credits.</Text>
      </Section>

      <Section title="3 · How urgent?">
        <View style={{ gap: space.sm }}>
          {URGENCY_ORDER.map((u) => {
            const m = URGENCY[u];
            const active = urgency === u;
            return (
              <Pressable key={u} onPress={() => setUrgency(u)} style={[styles.urgRow, active && { borderColor: m.color, backgroundColor: m.soft }]}>
                <View style={[styles.radio, { borderColor: active ? m.color : colors.border }]}>{active && <View style={[styles.radioDot, { backgroundColor: m.color }]} />}</View>
                <View style={{ flex: 1 }}>
                  <Text style={[font.body, { fontWeight: '700' }]}>{m.label}</Text>
                  <Text style={font.small}>{m.hint}</Text>
                </View>
                {type && <Text style={[font.small, { fontWeight: '600', color: m.color }]}>{slaText(type, u)}</Text>}
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section
        title="4 · Pickup location"
        action={<Button title={locating ? 'Locating…' : 'Use my location'} icon="locate" small variant="ghost" onPress={locate} disabled={locating} />}
      >
        <MapView center={loc ? [loc.lat, loc.lng] : [12.9165, 79.1325]} zoom={16} markers={markers} fit={false} onPress={(lat, lng) => setLoc({ lat, lng })} height={220} />
        <Text style={[font.small, { marginVertical: space.sm }]}>Tap the map to move the pin to your gate.</Text>
        <Input value={address} onChangeText={setAddress} placeholder="Address / landmark" />
      </Section>

      <Section title="5 · Photo & notes (optional)">
        <Pressable onPress={async () => setPhoto((await pickPhoto()) ?? photo)} style={styles.photoBox}>
          {photo ? (
            <Image source={{ uri: photo.uri }} style={{ width: '100%', height: '100%' }} />
          ) : (
            <View style={{ alignItems: 'center' }}>
              <Ionicons name="camera-outline" size={28} color={colors.textMuted} />
              <Text style={[font.small, { marginTop: 4 }]}>Add a photo of the waste</Text>
            </View>
          )}
        </Pressable>
        <Input value={notes} onChangeText={setNotes} placeholder="e.g. Bags kept near the gate" multiline />
      </Section>

      {error && <ErrorBox message={error} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm, marginBottom: space.md },
  typeCard: {
    width: '48.5%',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 2,
    borderColor: colors.border,
  },
  urgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 2,
    borderColor: colors.border,
  },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  photoBox: {
    height: 150,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: space.md,
  },
});
