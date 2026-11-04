import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ForcedPasswordScreen, PendingApprovalScreen } from './AccountScreen';
import AuthFlow, { LanguagePicker, RegisterExtraProps } from './AuthScreens';
import { AuthProvider, useAuth } from './auth';
import { LanguageProvider, useLang } from './i18n';
import { Navigator, ScreenComponent, TabDef } from './nav';
import { colors } from './theme';

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
  if (user.must_change_password) return <ForcedPasswordScreen />;
  if (user.role === 'recycler' && user.approved === false) return <PendingApprovalScreen />;
  return <Navigator key={user.id} tabs={tabs} screens={screens} />;
}

/** Re-mounts the app when the language changes so every screen re-renders in the new language. */
function Keyed(props: RootProps) {
  const { lang } = useLang();
  return <Gate key={lang} {...props} />;
}

export default function Root(props: RootProps) {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <Keyed {...props} />
        </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
