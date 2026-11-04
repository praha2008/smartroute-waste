import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP } from '../appConfig';
import { api } from './api';
import { useAuth } from './auth';
import { haptic } from './haptics';
import { Lang, t, useLang } from './i18n';
import LocationPicker from './LocationPicker';
import { colors, font, radius, shadow, space } from './theme';
import { Banner, Button, Card, ErrorBox, Input, ListRow, Row, Screen, Section, Segmented } from './ui';

export default function AccountScreen({ children }: { children?: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { lang, setLang } = useLang();
  const [edit, setEdit] = useState(false);
  const [pw, setPw] = useState(false);
  if (!user) return null;
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const changeLang = async (l: Lang) => {
    if (l === lang) return;
    api.patch('/auth/me', { language: l }).catch(() => {});
    await setLang(l);
  };

  return (
    <Screen
      hero={
        <View>
          <Text style={[font.h1, { color: colors.white }]}>{t('acct.title')}</Text>
          <Row gap={space.md} style={{ marginTop: space.lg }}>
            <View style={styles.avatar}>
              <Text style={{ fontSize: 26, fontWeight: '800', color: colors.accentDark }}>{user.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.white, fontSize: 19, fontWeight: '800' }} numberOfLines={1}>
                {user.name}
              </Text>
              {user.organization ? <Text style={styles.heroSub}>{user.organization}</Text> : null}
              <Row gap={6} style={{ marginTop: 4 }}>
                <View style={styles.rolePill}>
                  <Text style={{ color: colors.white, fontSize: 11, fontWeight: '800' }}>{t(`role.${user.role}`).toUpperCase()}</Text>
                </View>
                {user.phone_verified ? (
                  <Row gap={3}>
                    <Ionicons name="shield-checkmark" size={13} color={colors.white} />
                    <Text style={styles.heroSub}>{t('acct.verified')}</Text>
                  </Row>
                ) : null}
              </Row>
            </View>
          </Row>
        </View>
      }
    >
      <Card style={{ padding: 0 }}>
        {user.employee_id ? <ListRow icon="id-card-outline" title={user.employee_id} subtitle={t('drv.empId')} /> : null}
        <ListRow icon="call-outline" title={user.phone || '—'} subtitle={t('acct.phone')} />
        {!user.email.endsWith('.local') ? <ListRow icon="mail-outline" title={user.email} subtitle={t('acct.email')} /> : null}
        {user.ward ? <ListRow icon="business-outline" title={user.ward} subtitle={t('acct.ward')} /> : null}
        {user.address ? <ListRow icon="home-outline" title={user.address} subtitle={t('acct.address')} last /> : null}
      </Card>

      {children}

      <Section title={t('acct.language')}>
        <Segmented<Lang>
          value={lang}
          onChange={changeLang}
          options={[
            { value: 'en', label: 'English' },
            { value: 'ta', label: 'தமிழ்' },
          ]}
        />
      </Section>

      <Section title={t('acct.title')}>
        <Card style={{ padding: 0 }}>
          <ListRow icon="create-outline" title={t('acct.editProfile')} onPress={() => setEdit(true)} />
          {user.role !== 'collector' && <ListRow icon="key-outline" title={t('acct.changePassword')} onPress={() => setPw(true)} />}
          <ListRow
            icon="information-circle-outline"
            title={t('acct.about')}
            subtitle={`${APP.name} · ${t('acct.version')} ${version}`}
            onPress={() => Alert.alert(t('acct.about'), t('acct.aboutBody'))}
            last
          />
        </Card>
      </Section>

      <Card style={{ padding: 0, marginTop: space.lg }}>
        <ListRow
          icon="log-out-outline"
          title={t('acct.logout')}
          danger
          last
          onPress={() =>
            Alert.alert(t('acct.logoutQ'), undefined, [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('acct.logout'), style: 'destructive', onPress: logout },
            ])
          }
        />
      </Card>

      <Row style={{ justifyContent: 'center', marginTop: space.xl }} gap={6}>
        <Ionicons name="leaf-outline" size={14} color={colors.textFaint} />
        <Text style={font.tiny}>SMARTROUTE WASTE · VELLORE · VIT IDP</Text>
      </Row>

      <EditProfileModal visible={edit} onClose={() => setEdit(false)} />
      <PasswordModal visible={pw} onClose={() => setPw(false)} />
    </Screen>
  );
}

/* ------------------------------------------------------------------ modal shell */
function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaProvider>
        <SheetBody title={title} onClose={onClose}>
          {children}
        </SheetBody>
      </SafeAreaProvider>
    </Modal>
  );
}
function SheetBody({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Row style={{ paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, paddingBottom: space.md }} gap={space.md}>
        <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <Text style={[font.h2, { flex: 1 }]}>{title}</Text>
      </Row>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + space.xxl }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ edit profile */
function EditProfileModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} title={t('profile.title')} onClose={onClose}>
      {visible && <EditProfileForm onClose={onClose} />}
    </Sheet>
  );
}
function EditProfileForm({ onClose }: { onClose: () => void }) {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [org, setOrg] = useState(user?.organization ?? '');
  const [address, setAddress] = useState(user?.address ?? '');
  const [loc, setLoc] = useState<{ lat: number; lng: number; label?: string } | null>(user?.lat != null && user?.lng != null ? { lat: user.lat, lng: user.lng } : null);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;
  const showOrg = user.role === 'recycler' || user.account_type === 'business';
  const showLoc = user.role !== 'collector';
  return (
    <>
      <Input label={t('reg.name')} icon="person-outline" value={name} onChangeText={setName} />
      {showOrg && <Input label={user.role === 'recycler' ? t('reg.company') : t('reg.businessName')} icon="briefcase-outline" value={org} onChangeText={setOrg} />}
      {showLoc && (
        <>
          <Text style={styles.label}>{user.role === 'recycler' ? t('reg.yard') : t('reg.home')}</Text>
          <Pressable onPress={() => setPicker(true)} style={styles.locRow}>
            <Ionicons name="location" size={20} color={colors.accent} />
            <Text style={[font.body, { flex: 1 }]} numberOfLines={2}>
              {loc ? loc.label ?? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : t('reg.setOnMap')}
            </Text>
            <Text style={{ color: colors.accentDark, fontWeight: '700' }}>{t('common.change')}</Text>
          </Pressable>
        </>
      )}
      <Input label={t('reg.address')} icon="home-outline" value={address} onChangeText={setAddress} multiline />
      {error && <ErrorBox message={error} />}
      <Button
        title={t('common.save')}
        icon="checkmark"
        loading={busy}
        onPress={async () => {
          setError(null);
          if (name.trim().length < 2) return setError(t('reg.errName'));
          setBusy(true);
          try {
            await updateProfile({ name: name.trim(), organization: org || null, address: address || null, ...(loc ? { lat: loc.lat, lng: loc.lng } : {}) });
            haptic.success();
            onClose();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      />
      <LocationPicker
        visible={picker}
        initial={loc}
        onClose={() => setPicker(false)}
        onConfirm={(p) => {
          setPicker(false);
          setLoc({ lat: p.lat, lng: p.lng, label: p.address });
          if (!address) setAddress(p.address);
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ password */
export function PasswordForm({ forced, onDone }: { forced?: boolean; onDone?: () => void }) {
  const { changePassword } = useAuth();
  const [old, setOld] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {forced && <Banner tone="info" icon="shield-checkmark-outline" text={t('pw.forced')} />}
      <View style={{ height: space.md }} />
      <Input label={t('pw.current')} icon="lock-open-outline" value={old} onChangeText={setOld} secureTextEntry />
      <Input label={t('pw.new')} icon="lock-closed-outline" value={pw} onChangeText={setPw} secureTextEntry hint={t('auth.passwordHint')} />
      <Input label={t('pw.confirm')} icon="lock-closed-outline" value={pw2} onChangeText={setPw2} secureTextEntry />
      {error && <ErrorBox message={error} />}
      <Button
        title={t('common.save')}
        icon="checkmark"
        loading={busy}
        onPress={async () => {
          setError(null);
          if (pw.length < 6) return setError(t('reg.errPassword'));
          if (pw !== pw2) return setError(t('pw.mismatch'));
          setBusy(true);
          try {
            await changePassword(old, pw);
            haptic.success();
            Alert.alert(t('pw.saved'));
            onDone?.();
          } catch (e: any) {
            haptic.error();
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}

function PasswordModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} title={t('pw.title')} onClose={onClose}>
      {visible && <PasswordForm onDone={onClose} />}
    </Sheet>
  );
}

/** Shown right after login when the admin created the account with a temporary password. */
export function ForcedPasswordScreen() {
  const { logout } = useAuth();
  return (
    <Screen title={t('pw.title')} right={<Button title={t('acct.logout')} small variant="ghost" onPress={logout} />}>
      <PasswordForm forced />
    </Screen>
  );
}

/** Recycler accounts wait for the municipality to approve them. */
export function PendingApprovalScreen() {
  const { refreshUser, logout, user } = useAuth();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <LinearGradient colors={colors.gradient} style={[styles.pendingHero, { paddingTop: insets.top + space.xxl }]}>
        <View style={styles.pendingIcon}>
          <Ionicons name="hourglass-outline" size={52} color={colors.white} />
        </View>
      </LinearGradient>
      <View style={{ padding: space.xl }}>
        <Text style={[font.h1, { textAlign: 'center' }]}>{t('pending.title')}</Text>
        <Text style={[font.body, { color: colors.textMuted, textAlign: 'center', marginTop: space.md, lineHeight: 23 }]}>{t('pending.body')}</Text>
        <Card flat style={{ marginTop: space.xl }}>
          <Text style={font.h3}>{user?.organization || user?.name}</Text>
          <Text style={font.small}>
            {user?.phone} · {user?.email}
          </Text>
        </Card>
        <Button
          title={t('pending.check')}
          icon="refresh"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await refreshUser();
            setBusy(false);
          }}
        />
        <Button title={t('acct.logout')} variant="ghost" onPress={logout} style={{ marginTop: space.sm }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadow },
  heroSub: { color: 'rgba(255,255,255,0.88)', fontSize: 13 },
  rolePill: { backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  close: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', ...shadow },
  label: { fontSize: 13, color: colors.textMuted, marginBottom: 6, fontWeight: '700' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.field, marginBottom: space.md },
  pendingHero: { alignItems: 'center', paddingBottom: space.xxl, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  pendingIcon: { width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
});
