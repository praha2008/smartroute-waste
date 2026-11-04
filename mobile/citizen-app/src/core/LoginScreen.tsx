import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP } from '../appConfig';
import { api, getServerUrl, setServerUrl } from './api';
import { useAuth } from './auth';
import { colors, font, radius, space } from './theme';
import { Button, Card, ErrorBox, Input, Row, Segmented } from './ui';

export default function LoginScreen({ RegisterExtra }: { RegisterExtra?: React.ComponentType<{ data: Record<string, any>; set: (k: string, v: any) => void }> }) {
  const insets = useSafeAreaInsets();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [data, setData] = useState<Record<string, any>>({ email: '', password: '', name: '', phone: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const [server, setServer] = useState(getServerUrl());
  const [serverOk, setServerOk] = useState<boolean | null>(null);

  const set = (k: string, v: any) => setData((d) => ({ ...d, [k]: v }));

  useEffect(() => {
    api.ping(getServerUrl()).then(setServerOk);
  }, []);

  const testServer = async () => {
    setServerOk(null);
    const ok = await api.ping(server);
    setServerOk(ok);
    if (ok) {
      await setServerUrl(server);
      setShowServer(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (!data.email || !data.password) return setError('Enter email and password');
    setBusy(true);
    try {
      if (mode === 'login') await login(data.email, data.password);
      else {
        if (!data.name) throw new Error('Enter your name');
        await register(data);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingTop: insets.top + space.xxl }} keyboardShouldPersistTaps="handled">
        <View style={[styles.logo, { backgroundColor: colors.accent }]}>
          <Ionicons name={APP.icon as any} size={34} color="#fff" />
        </View>
        <Text style={[font.h1, { marginTop: space.lg }]}>{APP.name}</Text>
        <Text style={[font.body, { color: colors.textMuted, marginTop: 4 }]}>{APP.tagline}</Text>

        <View style={{ marginTop: space.xl }}>
          {APP.allowRegister && (
            <View style={{ marginBottom: space.lg }}>
              <Segmented
                value={mode}
                onChange={(m) => {
                  setMode(m);
                  setError(null);
                }}
                options={[
                  { value: 'login', label: 'Log in' },
                  { value: 'register', label: 'Create account' },
                ]}
              />
            </View>
          )}
          {mode === 'register' && (
            <>
              <Input label="Full name" value={data.name} onChangeText={(v) => set('name', v)} placeholder="Your name" />
              <Input label="Phone" value={data.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" placeholder="10-digit mobile" />
              {RegisterExtra && <RegisterExtra data={data} set={set} />}
            </>
          )}
          <Input label="Email" value={data.email} onChangeText={(v) => set('email', v)} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" />
          <Input label="Password" value={data.password} onChangeText={(v) => set('password', v)} secureTextEntry placeholder="At least 6 characters" />
          {error && <ErrorBox message={error} />}
          <Button title={mode === 'login' ? 'Log in' : 'Create account'} onPress={submit} loading={busy} />
        </View>

        {mode === 'login' && (
          <Card style={{ marginTop: space.xl, backgroundColor: colors.accentSoft, borderColor: colors.accentSoft }}>
            <Text style={[font.small, { color: colors.accentDark, fontWeight: '700' }]}>Demo account</Text>
            <Pressable onPress={() => setData((d) => ({ ...d, email: APP.demo.email, password: APP.demo.password }))}>
              <Text style={[font.small, { color: colors.accentDark, marginTop: 2 }]}>
                {APP.demo.email} / {APP.demo.password} · tap to fill
              </Text>
            </Pressable>
          </Card>
        )}

        <Pressable onPress={() => setShowServer((s) => !s)} style={{ marginTop: space.lg }}>
          <Row style={{ justifyContent: 'center' }}>
            <View style={[styles.dot, { backgroundColor: serverOk === null ? colors.textFaint : serverOk ? colors.success : colors.danger }]} />
            <Text style={font.small}>
              Server: {getServerUrl()} {serverOk === false ? '(not reachable)' : ''}
            </Text>
          </Row>
        </Pressable>
        {showServer && (
          <Card style={{ marginTop: space.md }}>
            <Input label="Server address" value={server} onChangeText={setServer} autoCapitalize="none" placeholder="http://192.168.1.5:8000" />
            <Text style={[font.small, { marginBottom: space.md }]}>
              Use your laptop's Wi-Fi IP (run ipconfig) with port 8000. Phone and laptop must be on the same Wi-Fi.
            </Text>
            <Button title="Test & save" small onPress={testServer} />
          </Card>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  logo: { width: 64, height: 64, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
