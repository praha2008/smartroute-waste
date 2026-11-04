import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '../core/api';
import { useAuth } from '../core/auth';
import { getCurrentLocation, Photo as PickedPhoto, pickPhoto } from '../core/device';
import { haptic } from '../core/haptics';
import { t } from '../core/i18n';
import LocationPicker from '../core/LocationPicker';
import MapView from '../core/MapView';
import { useNav } from '../core/nav';
import { colors, font, radius, shadowSoft, space } from '../core/theme';
import type { Pickup } from '../core/types';
import { Banner, Button, Chip, ErrorBox, Input, Photo, Row, Screen, Section } from '../core/ui';
import { URGENCY, URGENCY_ORDER, Urgency, WASTE, WASTE_ORDER, WasteType } from '../core/waste';

// must match backend config.py
const BASE_SLA_H: Record<WasteType, number> = { organic: 12, recyclable: 48, hazardous: 6, e_waste: 48, general: 24 };
const SLA_FACTOR: Record<Urgency, number> = { low: 2, medium: 1, high: 0.5, critical: 0.25 };
const QUICK_KG = [1, 2, 5, 10, 25, 50];

interface AiResult {
  waste_type: string;
  confidence: number;
  item: string;
  item_confidence: number;
  types: Record<string, number>;
}

function slaText(type: WasteType, u: Urgency) {
  const h = BASE_SLA_H[type] * SLA_FACTOR[u];
  return h < 24 ? t('new.withinH', { n: h % 1 ? h.toFixed(1) : h }) : t('new.withinD', { n: Math.round(h / 24) });
}

export default function NewRequestScreen() {
  const nav = useNav();
  const { user } = useAuth();
  const [type, setType] = useState<WasteType | null>(null);
  const [qty, setQty] = useState('');
  const [urgency, setUrgency] = useState<Urgency>('medium');
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(user?.lat && user?.lng ? { lat: user.lat, lng: user.lng } : null);
  const [placeTitle, setPlaceTitle] = useState<string | null>(user?.lat ? t('reg.home') : null);
  const [address, setAddress] = useState(user?.address ?? '');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ai, setAi] = useState<AiResult | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  /** Pick a photo and ask the AI model which waste type it shows (silently skipped if the model is not installed). */
  const takePhoto = async () => {
    const p = await pickPhoto();
    if (!p) return;
    setPhoto(p);
    setAi(null);
    setAiBusy(true);
    try {
      const res = await api.post<AiResult>('/ai/classify', { data: p.base64 });
      setAi(res);
      if (!type) setType(res.waste_type as WasteType);
      haptic.success();
    } catch {
      /* model not available - the citizen just picks the type */
    } finally {
      setAiBusy(false);
    }
  };

  // no saved home location: start from the phone's GPS
  useEffect(() => {
    if (loc) return;
    getCurrentLocation(false).then((p) => {
      if (p) {
        setLoc(p);
        setPlaceTitle(t('loc.current'));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markers = useMemo(() => (loc ? [{ id: 'me', lat: loc.lat, lng: loc.lng, kind: 'home' as const, color: colors.accent }] : []), [loc]);

  const submit = async () => {
    setError(null);
    const est = parseFloat(qty.replace(',', '.'));
    if (!type) return setError(t('new.errType'));
    if (!est || est <= 0) return setError(t('new.errKg'));
    if (!loc) return setError(t('new.errLoc'));
    setBusy(true);
    try {
      const created = await api.post<Pickup>('/requests', { waste_type: type, urgency, est_kg: est, lat: loc.lat, lng: loc.lng, address, notes: notes || null });
      if (photo) {
        try {
          await api.uploadPhoto(`/requests/${created.id}/photo64`, photo.base64);
        } catch (e: any) {
          Alert.alert(t('new.title'), t('new.photoFail', { msg: e.message }));
        }
      }
      haptic.success();
      nav.replace('RequestDetail', { id: created.id, fresh: true });
    } catch (e: any) {
      haptic.error();
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const aiLabel = ai ? WASTE[ai.waste_type as WasteType]?.label ?? ai.waste_type : '';

  return (
    <Screen title={t('new.title')} back footer={<Button title={t('new.submit')} icon="send" onPress={submit} loading={busy} disabled={!type} />}>
      {/* photo + AI */}
      {photo ? (
        <View style={styles.photoCard}>
          <Photo uri={photo.uri} maxHeight={360} onPress={takePhoto} style={{ marginBottom: 0, borderRadius: 0 }} />
          <View style={styles.aiStrip}>
            {aiBusy ? (
              <Row>
                <ActivityIndicator color={colors.accent} />
                <Text style={[font.body, { fontWeight: '700' }]}>{t('new.checking')}</Text>
              </Row>
            ) : ai ? (
              <Row gap={space.md}>
                <View style={styles.aiBadge}>
                  <Ionicons name="sparkles" size={18} color={colors.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[font.tiny, { color: colors.accentDark }]}>{t('new.aiSuggestion')}</Text>
                  <Text style={[font.body, { fontWeight: '800' }]}>
                    {aiLabel} · {Math.round(ai.confidence * 100)}%
                  </Text>
                  <Text style={font.small}>{t('new.looksLike', { item: ai.item })}</Text>
                </View>
              </Row>
            ) : (
              <Text style={font.small}>
                {t('new.photoAdded')} · {t('new.retake')}
              </Text>
            )}
          </View>
        </View>
      ) : (
        <Pressable onPress={takePhoto} style={({ pressed }) => [styles.snap, pressed && { opacity: 0.85 }]}>
          <View style={styles.snapIcon}>
            <Ionicons name="camera" size={30} color={colors.white} />
          </View>
          <Text style={[font.h3, { marginTop: space.md }]}>{t('new.snap')}</Text>
          <Row gap={4} style={{ marginTop: 4 }}>
            <Ionicons name="sparkles" size={13} color={colors.accentDark} />
            <Text style={[font.small, { color: colors.accentDark }]}>{t('new.snapHint')}</Text>
          </Row>
        </Pressable>
      )}
      {ai && type && ai.waste_type !== type && ai.confidence >= 0.7 && (
        <Pressable onPress={() => setType(ai.waste_type as WasteType)} style={{ marginBottom: space.md }}>
          <Banner tone="warning" text={t('new.aiWarn', { type: aiLabel })} />
        </Pressable>
      )}

      <Section title={t('new.step1')}>
        <View style={styles.grid}>
          {WASTE_ORDER.map((wt) => {
            const w = WASTE[wt];
            const active = type === wt;
            return (
              <Pressable
                key={wt}
                onPress={() => {
                  haptic.tap();
                  setType(wt);
                }}
                style={[styles.typeCard, active && { borderColor: w.color, backgroundColor: w.soft }]}
              >
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={[styles.typeIcon, { backgroundColor: active ? w.color : w.soft }]}>
                    <Ionicons name={w.icon as any} size={20} color={active ? colors.white : w.color} />
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={22} color={w.color} />}
                </Row>
                <Text style={[font.h3, { marginTop: 10, fontSize: 15 }]} numberOfLines={1}>
                  {w.label}
                </Text>
                <Text style={[font.small, { fontSize: 12, marginTop: 2 }]} numberOfLines={2}>
                  {w.hint}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {type === 'general' && <Banner tone="warning" icon="bulb-outline" text={t('new.tipMixed')} />}
        {type === 'hazardous' && <Banner tone="danger" text={t('new.tipHaz')} />}
      </Section>

      <Section title={t('new.step2')}>
        <Row style={{ flexWrap: 'wrap', marginBottom: space.md }} gap={6}>
          {QUICK_KG.map((k) => (
            <Chip key={k} label={`${k} kg`} active={qty === String(k)} onPress={() => setQty(String(k))} />
          ))}
        </Row>
        <Input icon="scale-outline" value={qty} onChangeText={setQty} keyboardType="decimal-pad" placeholder={t('new.typeKg')} hint={t('new.kgHint')} />
      </Section>

      <Section title={t('new.step3')}>
        <View style={{ gap: space.sm }}>
          {URGENCY_ORDER.map((u) => {
            const m = URGENCY[u];
            const active = urgency === u;
            return (
              <Pressable
                key={u}
                onPress={() => {
                  haptic.tap();
                  setUrgency(u);
                }}
                style={[styles.urgRow, active && { borderColor: m.color, backgroundColor: m.soft }]}
              >
                <Ionicons name={m.icon as any} size={22} color={m.color} />
                <View style={{ flex: 1 }}>
                  <Text style={[font.body, { fontWeight: '700' }]}>{m.label}</Text>
                  <Text style={[font.small, { fontSize: 12 }]}>{m.hint}</Text>
                </View>
                {type && <Text style={[font.small, { fontWeight: '700', color: m.color, fontSize: 12 }]}>{slaText(type, u)}</Text>}
                <View style={[styles.radio, { borderColor: active ? m.color : colors.border }]}>{active && <View style={[styles.radioDot, { backgroundColor: m.color }]} />}</View>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title={t('new.step4')}>
        <Pressable onPress={() => setPicker(true)} style={styles.locCard}>
          {loc ? (
            <View pointerEvents="none">
              <MapView center={[loc.lat, loc.lng]} zoom={16} markers={markers} fit={false} height={140} rounded={false} interactive={false} />
            </View>
          ) : null}
          <Row style={{ padding: space.md }} gap={space.md}>
            <View style={styles.locIcon}>
              <Ionicons name="location" size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[font.body, { fontWeight: '700' }]} numberOfLines={1}>
                {loc ? placeTitle ?? t('loc.title') : t('new.setLocation')}
              </Text>
              {loc && address ? (
                <Text style={[font.small, { fontSize: 12 }]} numberOfLines={2}>
                  {address}
                </Text>
              ) : null}
            </View>
            <Text style={{ color: colors.accentDark, fontWeight: '800' }}>{t('common.change')}</Text>
          </Row>
        </Pressable>
        <Input icon="home-outline" value={address} onChangeText={setAddress} placeholder={t('reg.address')} />
      </Section>

      <Section title={`${t('new.step5')} (${t('common.optional')})`}>
        <Input icon="chatbox-ellipses-outline" value={notes} onChangeText={setNotes} placeholder={t('new.notesPh')} multiline />
      </Section>

      {error && <ErrorBox message={error} />}

      <LocationPicker
        visible={picker}
        initial={loc}
        onClose={() => setPicker(false)}
        onConfirm={(p) => {
          setPicker(false);
          setLoc({ lat: p.lat, lng: p.lng });
          setPlaceTitle(p.title ?? null);
          setAddress(p.address);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  snap: {
    alignItems: 'center',
    paddingVertical: space.xl,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: colors.accent + '55',
    borderStyle: 'dashed',
  },
  snapIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  photoCard: { backgroundColor: colors.card, borderRadius: radius.xl, overflow: 'hidden', ...shadowSoft, marginBottom: space.md },
  aiStrip: { padding: space.md },
  aiBadge: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  typeCard: { width: '48.5%', backgroundColor: colors.card, borderRadius: radius.lg, padding: space.md, borderWidth: 2, borderColor: 'transparent', ...shadowSoft },
  typeIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  urgRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderRadius: radius.md, padding: space.md, borderWidth: 2, borderColor: 'transparent', ...shadowSoft },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 11, height: 11, borderRadius: 6 },
  locCard: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: 'hidden', marginBottom: space.md, ...shadowSoft },
  locIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
});
