import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ForcedPasswordScreen, PendingApprovalScreen } from './AccountScreen';
import AuthFlow, { LanguagePicker, RegisterExtraProps } from './AuthScreens';
import { AuthProvider, useAuth } from './auth';
import { LanguageProvider, useLang } from './i18n';
import { Navigator, ScreenComponent, TabDef } from './nav';
import { colors, font, space } from './theme';
import { Button } from './ui';

SplashScreen.preventAutoHideAsync().catch(() => {});

interface RootProps {
  tabs: TabDef[];
  screens: Record<string, ScreenComponent>;
  RegisterExtra?: React.ComponentType<RegisterExtraProps>;
}

function Gate({ tabs, screens, RegisterExtra }: RootProps) {
  const { ready, user } = useAuth();
  const lang = useLang();
  const loaded = ready && lang.ready;

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!lang.chosen) return <LanguagePicker />;
  if (!user) return <AuthFlow RegisterExtra={RegisterExtra} />;
  if (user.must_change_password && user.role !== 'collector') return <ForcedPasswordScreen />;
  if (user.role === 'recycler' && user.approved === false) return <PendingApprovalScreen />;
  return <Navigator key={user.id} tabs={tabs} screens={screens} />;
}

/** Catches any screen error so the app shows a "try again" page instead of closing. */
class ErrorBoundary extends React.Component<{ children: React.ReactNode; onLogout: () => Promise<void> }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.warn('Screen error', error);
    SplashScreen.hideAsync().catch(() => {}); // never leave the splash screen stuck
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: space.xl }}>
        <Text style={[font.h1, { textAlign: 'center' }]}>Something went wrong</Text>
        <Text style={[font.small, { textAlign: 'center', marginTop: space.sm, marginBottom: space.xl }]}>{String(this.state.error?.message ?? '')}</Text>
        <Button title="Try again" icon="refresh" onPress={() => this.setState({ error: null })} />
        <Button
          title="Log out and start again"
          variant="ghost"
          style={{ marginTop: space.sm }}
          onPress={async () => {
            await this.props.onLogout();
            this.setState({ error: null });
          }}
        />
      </View>
    );
  }
}

/** Re-mounts the app when the language changes so every screen re-renders in the new language. */
function Keyed(props: RootProps) {
  const { lang } = useLang();
  return <Gate key={lang} {...props} />;
}

function Safe(props: RootProps) {
  const { logout } = useAuth();
  return (
    <ErrorBoundary onLogout={logout}>
      <Keyed {...props} />
    </ErrorBoundary>
  );
}

export default function Root(props: RootProps) {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <Safe {...props} />
        </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
