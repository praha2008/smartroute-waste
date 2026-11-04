/**
 * Everything before the user is logged in:
 *   language picker → onboarding slides (first launch) → log in / create account
 *   create account: details → home / yard location → SMS code
 *   forgot password: email → code + new password
 */
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP } from '../appConfig';
import { api, ApiError, getServerUrl, setServerUrl } from './api';
import { CodeSent, useAuth } from './auth';
import { haptic } from './haptics';
import { Lang, t, useLang } from './i18n';
import LocationPicker, { PickedLocation } from './LocationPicker';
import { colors, font, radius, shadow, space } from './theme';
import { Banner, Button, Card, ErrorBox, Input, OtpInput, PhoneInput, Row } from './ui';

export type RegisterExtraProps = { data: Record<string, any>; set: (k: string, v: any) => void };
const ONBOARDED = 'smartroute.onboarded';
const W = Dimensions.get('window').width;

/* ================================================================== language */
export function LanguagePicker({ onDone }: { onDone?: () => void }) {
  const { lang, setLang } = useLang();
  const insets = useSafeAreaInsets();
  const [sel, setSel] = useState<Lang>(lang);
  const opt = (l: Lang, title: string, sub: string, letter: string) => {
    const active = sel === l;
    return (
      <Pressable
        onPress={() => {
          haptic.tap();
          setSel(l);
        }}
        style={[styles.langOpt, active && { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}
      >
        <View style={[styles.langLetter, active && { backgroundColor: colors.accent }]}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: active ? colors.white : colors.accentDark }}>{letter}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[font.h3, { fontSize: 18 }]}>{title}</Text>
          <Text style={font.small}>{sub}</Text>
        </View>
        <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={24} color={active ? colors.accent : colors.textFaint} />
      </Pressable>
    );
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <LinearGradient colors={colors.gradient} style={[styles.langHero, { paddingTop: insets.top + space.xxl }]}>
        <View style={styles.logoLight}>
          <Ionicons name={APP.icon as any} size={34} color={colors.white} />
        </View>
        <Text style={[font.display, { color: colors.white, marginTop: space.lg }]}>{APP.name}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, marginTop: 4 }}>வணக்கம் · Welcome</Text>
      </LinearGradient>
      <View style={{ padding: space.xl, flex: 1 }}>
        <Text style={font.h2}>{sel === 'ta' ? 'உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்' : 'Choose your language'}</Text>
        <Text style={[font.small, { marginTop: 4, marginBottom: space.lg }]}>{sel === 'ta' ? 'இதைப் பின்னர் மாற்றலாம்.' : 'You can change this later.'}</Text>
        {opt('en', 'English', 'Continue in English', 'A')}
        {opt('ta', 'தமிழ்', 'தமிழில் தொடரவும்', 'அ')}
        <View style={{ flex: 1 }} />
        <Button
          title={sel === 'ta' ? 'தொடரவும்' : 'Continue'}
          iconRight="arrow-forward"
          style={{ marginBottom: insets.bottom + space.md }}
          onPress={async () => {
            await setLang(sel);
            onDone?.();
          }}
        />
      </View>
    </View>
  );
}

/* ================================================================== onboarding */
function Onboarding({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const list = useRef<FlatList>(null);
  const icons: Record<string, string[]> = {
    citizen: ['camera', 'navigate-circle', 'leaf'],
    collector: ['git-network', 'map', 'flash'],
    recycler: ['cube', 'location', 'stats-chart'],
  };
  const slides = [1, 2, 3].map((n, i) => ({ key: String(n), icon: icons[APP.role][i], title: t(`onb.${APP.role}.${n}.title`), body: t(`onb.${APP.role}.${n}.body`) }));
  const last = page === slides.length - 1;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="dark" />
      <Pressable onPress={onDone} style={[styles.skip, { top: insets.top + space.md }]} hitSlop={10}>
        <Text style={{ color: colors.textMuted, fontWeight: '700' }}>{t('common.skip')}</Text>
      </Pressable>
      <FlatList
        ref={list}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / W))}
        renderItem={({ item }) => (
          <View style={{ width: W, flex: 1, paddingHorizontal: space.xl, justifyContent: 'center' }}>
            <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.onbArt}>
              <View style={styles.onbRing}>
                <Ionicons name={item.icon as any} size={84} color={colors.white} />
              </View>
            </LinearGradient>
            <Text style={[font.display, { marginTop: space.xxl, fontSize: 26, lineHeight: 34 }]}>{item.title}</Text>
            <Text style={[font.body, { color: colors.textMuted, marginTop: space.md, fontSize: 16, lineHeight: 24 }]}>{item.body}</Text>
          </View>
        )}
      />
      <View style={{ padding: space.xl, paddingBottom: insets.bottom + space.lg }}>
        <Row style={{ justifyContent: 'center', marginBottom: space.lg }} gap={6}>
          {slides.map((s, i) => (
            <View key={s.key} style={[styles.dotPage, i === page && { width: 24, backgroundColor: colors.accent }]} />
          ))}
        </Row>
        <Button
          title={last ? t('onb.getStarted') : t('common.next')}
          iconRight="arrow-forward"
          onPress={() => {
            if (last) onDone();
            else {
              list.current?.scrollToIndex({ index: page + 1 });
              setPage(page + 1);
            }
          }}
        />
      </View>
    </View>
  );
}

/* ================================================================== shell */
function AuthShell({ title, subtitle, onBack, children, onLogoLongPress }: { title: string; subtitle?: string; onBack?: () => void; children: React.ReactNode; onLogoLongPress?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}>
        <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + space.lg }]}>
          <View style={styles.blob1} />
          <View style={styles.blob2} />
          <Row style={{ justifyContent: 'space-between' }}>
            {onBack ? (
              <Pressable onPress={onBack} hitSlop={10} style={styles.heroBack}>
                <Ionicons name="chevron-back" size={22} color={colors.white} />
              </Pressable>
            ) : (
              <Pressable onLongPress={onLogoLongPress} delayLongPress={800}>
                <Row gap={10}>
                  <View style={styles.logoSmall}>
                    <Ionicons name={APP.icon as any} size={20} color={colors.white} />
                  </View>
                  <Text style={{ color: colors.white, fontWeight: '800', fontSize: 17 }}>{APP.name}</Text>
                </Row>
              </Pressable>
            )}
            <LangToggle />
          </Row>
          <Text style={[font.display, { color: colors.white, marginTop: space.xl }]}>{title}</Text>
          {subtitle ? <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: 15, marginTop: 6, lineHeight: 21 }}>{subtitle}</Text> : null}
        </LinearGradient>
        <View style={styles.sheet}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        setLang(lang === 'en' ? 'ta' : 'en');
      }}
      style={styles.langToggle}
    >
      <Ionicons name="language" size={16} color={colors.white} />
      <Text style={{ color: colors.white, fontWeight: '800', fontSize: 13 }}>{lang === 'en' ? 'தமிழ்' : 'English'}</Text>
    </Pressable>
  );
}

/* ================================================================== flow */
type Step =
  | { name: 'login' }
  | { name: 'register' }
  | { name: 'otp'; phone: string; sent: CodeSent }
  | { name: 'forgot' };

export default function AuthFlow({ RegisterExtra }: { RegisterExtra?: React.ComponentType<RegisterExtraProps> }) {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>({ name: 'login' });
  const [meta, setMeta] = useState<{ app_mode?: string } | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDED)
      .then((v) => setOnboarded(v === '1'))
      .catch(() => setOnboarded(true));
    api.get('/meta').then(setMeta).catch(() => setMeta(null));
  }, []);

  if (onboarded === null) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!onboarded)
    return (
      <Onboarding
        onDone={() => {
          AsyncStorage.setItem(ONBOARDED, '1').catch(() => {});
          setOnboarded(true);
        }}
      />
    );

  const demo = meta?.app_mode !== 'release';
  switch (step.name) {
    case 'register':
      return <RegisterScreen RegisterExtra={RegisterExtra} onBack={() => setStep({ name: 'login' })} onSent={(phone, sent) => setStep({ name: 'otp', phone, sent })} />;
    case 'otp':
      return <OtpScreen phone={step.phone} sent={step.sent} onBack={() => setStep({ name: 'login' })} />;
    case 'forgot':
      return <ForgotScreen onBack={() => setStep({ name: 'login' })} />;
    default:
      return (
        <LoginScreen
          demo={demo}
          onRegister={() => setStep({ name: 'register' })}
          onForgot={() => setStep({ name: 'forgot' })}
          onNeedOtp={(phone, sent) => setStep({ name: 'otp', phone, sent })}
        />
      );
  }
}

/* ================================================================== login */
function LoginScreen({ demo, onRegister, onForgot, onNeedOtp }: { demo: boolean; onRegister: () => void; onForgot: () => void; onNeedOtp: (phone: string, sent: CodeSent) => void }) {
  const { login } = useAuth();
  const [ident, setIdent] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const [server, setServer] = useState(getServerUrl());
  const [serverOk, setServerOk] = useState<boolean | null>(null);

  useEffect(() => {
    api.ping(getServerUrl()).then(setServerOk);
  }, []);

  const submit = async () => {
    setError(null);
    if (!ident.trim() || !password) return setError(t('auth.fillAll'));
    setBusy(true);
    try {
      await login(ident, password);
      haptic.success();
    } catch (e: any) {
      if (e instanceof ApiError && e.data?.code === 'PHONE_NOT_VERIFIED') {
        onNeedOtp(e.data.phone, { ok: true, channel: 'sms', target: e.data.target, demo: !!e.data.dev_code, dev_code: e.data.dev_code });
      } else {
        haptic.error();
        setError(e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('auth.welcomeBack')} subtitle={t('auth.loginSubtitle')} onLogoLongPress={() => setShowServer(true)}>
      <Input label={t('auth.identifier')} icon="person-outline" value={ident} onChangeText={setIdent} autoCapitalize="none" keyboardType="email-address" placeholder="98765 43210 / you@mail.com" />
      <Input label={t('auth.password')} icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••" onSubmitEditing={submit} />
      <Pressable onPress={onForgot} style={{ alignSelf: 'flex-end', marginTop: -4, marginBottom: space.lg }} hitSlop={8}>
        <Text style={{ color: colors.accentDark, fontWeight: '700' }}>{t('auth.forgot')}</Text>
      </Pressable>
      {error && <ErrorBox message={error} />}
      <Button title={t('auth.login')} iconRight="arrow-forward" onPress={submit} loading={busy} />

      {APP.allowRegister ? (
        <Row style={{ justifyContent: 'center', marginTop: space.xl }} gap={6}>
          <Text style={font.small}>{t('auth.newHere')}</Text>
          <Pressable onPress={onRegister} hitSlop={8}>
            <Text style={{ color: colors.accentDark, fontWeight: '800' }}>{t('auth.createAccount')}</Text>
          </Pressable>
        </Row>
      ) : (
        <Text style={[font.small, { textAlign: 'center', marginTop: space.xl }]}>{t('auth.staffOnly')}</Text>
      )}

      {demo && (
        <Pressable
          onPress={() => {
            haptic.tap();
            setIdent(APP.demo.email);
            setPassword(APP.demo.password);
          }}
          style={styles.demo}
        >
          <Ionicons name="flask-outline" size={18} color={colors.accentDark} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.accentDark, fontWeight: '800', fontSize: 13 }}>
              {t('auth.demo')} · {t('auth.tapToFill')}
            </Text>
            <Text style={{ color: colors.accentDark, fontSize: 12, marginTop: 1 }}>
              {APP.demo.email} / {APP.demo.password}
            </Text>
          </View>
        </Pressable>
      )}

      {(serverOk === false || showServer) && (
        <Pressable onPress={() => setShowServer((s) => !s)} style={{ marginTop: space.lg }}>
          <Row style={{ justifyContent: 'center' }}>
            <View style={[styles.dot, { backgroundColor: serverOk === null ? colors.textFaint : serverOk ? colors.success : colors.danger }]} />
            <Text style={font.small} numberOfLines={1}>
              {t('server.label')}: {getServerUrl()} {serverOk === false ? `(${t('server.unreachable')})` : ''}
            </Text>
          </Row>
        </Pressable>
      )}
      {showServer && (
        <Card flat style={{ marginTop: space.md }}>
          <Input label={t('server.address')} icon="server-outline" value={server} onChangeText={setServer} autoCapitalize="none" placeholder="https://smartroute-api.onrender.com" />
          <Text style={[font.small, { marginBottom: space.md }]}>{t('server.hint')}</Text>
          <Button
            title={t('server.testSave')}
            small
            onPress={async () => {
              setServerOk(null);
              const ok = await api.ping(server);
              setServerOk(ok);
              if (ok) {
                await setServerUrl(server);
                setShowServer(false);
              }
            }}
          />
        </Card>
      )}
    </AuthShell>
  );
}

/* ================================================================== register */
const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

function RegisterScreen({ RegisterExtra, onBack, onSent }: { RegisterExtra?: React.ComponentType<RegisterExtraProps>; onBack: () => void; onSent: (phone: string, sent: CodeSent) => void }) {
  const { register } = useAuth();
  const { lang } = useLang();
  const [page, setPage] = useState<1 | 2>(1);
  const [data, setData] = useState<Record<string, any>>({ name: '', phone: '', email: '', password: '', account_type: 'household' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const set = (k: string, v: any) => setData((d) => ({ ...d, [k]: v }));
  const recycler = (APP.role as string) === 'recycler';

  const next = () => {
    const e: Record<string, string> = {};
    if (data.name.trim().length < 2) e.name = t('reg.errName');
    if (!/^[6-9]\d{9}$/.test(data.phone)) e.phone = t('reg.errPhone');
    if (!isEmail(data.email)) e.email = t('reg.errEmail');
    if (data.password.length < 6) e.password = t('reg.errPassword');
    setErrors(e);
    if (Object.keys(e).length) return haptic.error();
    setPage(2);
  };

  const submit = async () => {
    setError(null);
    if (data.lat == null) {
      haptic.error();
      return setError(t('reg.errLocation'));
    }
    setBusy(true);
    try {
      const sent = await register({ ...data, name: data.name.trim(), email: data.email.trim().toLowerCase(), language: lang });
      onSent(data.phone, sent);
    } catch (e: any) {
      haptic.error();
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('reg.title')} subtitle={t('reg.step', { n: page, m: 2 })} onBack={page === 1 ? onBack : () => setPage(1)}>
      <View style={styles.progress}>
        <View style={[styles.progressFill, { width: page === 1 ? '50%' : '100%' }]} />
      </View>
      {page === 1 ? (
        <>
          <Input label={t('reg.name')} icon="person-outline" value={data.name} onChangeText={(v) => set('name', v)} error={errors.name} placeholder="Priya Kumar" autoCapitalize="words" />
          <PhoneInput label={t('reg.phone')} value={data.phone} onChangeText={(v) => set('phone', v)} error={errors.phone} hint={t('reg.phoneHint')} />
          <Input label={t('reg.email')} icon="mail-outline" value={data.email} onChangeText={(v) => set('email', v)} error={errors.email} hint={t('reg.emailHint')} autoCapitalize="none" keyboardType="email-address" placeholder="you@mail.com" />
          <Input label={t('auth.password')} icon="lock-closed-outline" value={data.password} onChangeText={(v) => set('password', v)} error={errors.password} hint={t('auth.passwordHint')} secureTextEntry />
          <Button title={t('common.continue')} iconRight="arrow-forward" onPress={next} style={{ marginTop: space.sm }} />
        </>
      ) : (
        <>
          {RegisterExtra && <RegisterExtra data={data} set={set} />}
          <Text style={styles.label}>{recycler ? t('reg.yard') : t('reg.home')}</Text>
          <Pressable onPress={() => setPicker(true)} style={[styles.locCard, data.lat != null && { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}>
            <View style={styles.locIcon}>
              <Ionicons name={data.lat != null ? 'location' : 'map-outline'} size={22} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[font.body, { fontWeight: '700' }]} numberOfLines={1}>
                {data.lat != null ? data.picked_title || t('reg.setOnMap') : t('reg.setOnMap')}
              </Text>
              <Text style={[font.small, { fontSize: 12 }]} numberOfLines={2}>
                {data.lat != null ? data.picked_address : t('reg.locationHint')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Pressable>
          <Input label={t('reg.address')} icon="home-outline" value={data.address ?? ''} onChangeText={(v) => set('address', v)} placeholder="12, Gandhi Road, near bus stand" multiline />
          {error && <ErrorBox message={error} />}
          <Button title={t('reg.sendCode')} icon="chatbubble-ellipses-outline" onPress={submit} loading={busy} />
          <LocationPicker
            visible={picker}
            title={recycler ? t('reg.yard') : t('reg.home')}
            initial={data.lat != null ? { lat: data.lat, lng: data.lng } : null}
            onClose={() => setPicker(false)}
            onConfirm={(p: PickedLocation) => {
              setPicker(false);
              setData((d) => ({ ...d, lat: p.lat, lng: p.lng, picked_title: p.title, picked_address: p.address, address: d.address || p.address }));
            }}
          />
        </>
      )}
    </AuthShell>
  );
}

/* ================================================================== OTP */
function OtpScreen({ phone, sent: first, onBack }: { phone: string; sent: CodeSent; onBack: () => void }) {
  const { verifyPhone, resendCode } = useAuth();
  const [sent, setSent] = useState(first);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(30);

  useEffect(() => {
    if (wait <= 0) return;
    const tm = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(tm);
  }, [wait]);

  const verify = async (c = code) => {
    if (c.length < 6) return;
    setError(null);
    setBusy(true);
    try {
      await verifyPhone(phone, c);
      haptic.success();
    } catch (e: any) {
      haptic.error();
      setError(e.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('otp.title')} subtitle={t('otp.subtitle', { target: sent.target })} onBack={onBack}>
      {sent.dev_code ? <Banner tone="warning" icon="flask-outline" text={t('otp.demoSms', { code: sent.dev_code })} /> : null}
      <OtpInput
        value={code}
        onChange={(v) => {
          setCode(v);
          if (v.length === 6) verify(v);
        }}
      />
      {error && <ErrorBox message={error} />}
      {info && !error ? <Banner tone="success" text={info} /> : null}
      <Button title={t('otp.verify')} icon="shield-checkmark-outline" onPress={() => verify()} loading={busy} disabled={code.length < 6} style={{ marginTop: space.md }} />
      <Pressable
        disabled={wait > 0}
        onPress={async () => {
          setError(null);
          try {
            setSent(await resendCode(phone));
            setInfo(t('otp.sent'));
            setWait(30);
          } catch (e: any) {
            setError(e.message);
          }
        }}
        style={{ alignSelf: 'center', marginTop: space.lg }}
        hitSlop={8}
      >
        <Text style={{ color: wait > 0 ? colors.textFaint : colors.accentDark, fontWeight: '700' }}>{wait > 0 ? t('otp.resendIn', { s: wait }) : t('otp.resend')}</Text>
      </Pressable>
    </AuthShell>
  );
}

/* ================================================================== forgot */
function ForgotScreen({ onBack }: { onBack: () => void }) {
  const { forgotPassword, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<CodeSent | null>(null);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setError(null);
    if (!isEmail(email)) return setError(t('reg.errEmail'));
    setBusy(true);
    try {
      setSent(await forgotPassword(email));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    setError(null);
    if (code.length < 6) return setError(t('forgot.code'));
    if (pw.length < 6) return setError(t('reg.errPassword'));
    setBusy(true);
    try {
      await resetPassword(email, code, pw);
      haptic.success();
    } catch (e: any) {
      haptic.error();
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('forgot.title')} subtitle={sent ? t('forgot.sentTo', { target: sent.target }) : t('forgot.subtitle')} onBack={sent ? () => setSent(null) : onBack}>
      {!sent ? (
        <>
          <Input label={t('reg.email')} icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@mail.com" onSubmitEditing={send} />
          {error && <ErrorBox message={error} />}
          <Button title={t('forgot.send')} icon="paper-plane-outline" onPress={send} loading={busy} />
        </>
      ) : (
        <>
          {sent.dev_code ? <Banner tone="warning" icon="flask-outline" text={t('otp.demoEmail', { code: sent.dev_code })} /> : null}
          <Text style={[styles.label, { marginTop: space.md }]}>{t('forgot.code')}</Text>
          <OtpInput value={code} onChange={setCode} />
          <Input label={t('forgot.newPassword')} icon="lock-closed-outline" value={pw} onChangeText={setPw} secureTextEntry hint={t('auth.passwordHint')} />
          {error && <ErrorBox message={error} />}
          <Button title={t('forgot.set')} icon="checkmark-circle-outline" onPress={reset} loading={busy} />
          <Pressable onPress={send} style={{ alignSelf: 'center', marginTop: space.lg }} hitSlop={8}>
            <Text style={{ color: colors.accentDark, fontWeight: '700' }}>{t('otp.resend')}</Text>
          </Pressable>
        </>
      )}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: space.xl, paddingBottom: space.xxl + space.xl, overflow: 'hidden' },
  blob1: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.08)', top: -60, right: -60 },
  blob2: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.06)', bottom: -30, left: -40 },
  sheet: { backgroundColor: colors.bg, marginTop: -space.xl, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: space.xl, paddingTop: space.xl },
  heroBack: { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  logoSmall: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  logoLight: { width: 68, height: 68, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  langToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.18)' },
  langHero: { paddingHorizontal: space.xl, paddingBottom: space.xxl, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  langOpt: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card, marginBottom: space.md },
  langLetter: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  skip: { position: 'absolute', right: space.xl, zIndex: 5 },
  onbArt: { width: '100%', aspectRatio: 1.15, borderRadius: 36, alignItems: 'center', justifyContent: 'center', ...shadow },
  onbRing: { width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  dotPage: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  demo: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: space.xl, padding: space.md, borderRadius: radius.md, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent + '33', borderStyle: 'dashed' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 13, color: colors.textMuted, marginBottom: 6, fontWeight: '700' },
  progress: { height: 6, borderRadius: 3, backgroundColor: colors.border, marginBottom: space.xl, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  locCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, marginBottom: space.md },
  locIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', ...shadow },
});
