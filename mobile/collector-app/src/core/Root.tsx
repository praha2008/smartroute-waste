import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './auth';
import LoginScreen from './LoginScreen';
import { Navigator, ScreenComponent, TabDef } from './nav';
import { Loading } from './ui';

interface RootProps {
  tabs: TabDef[];
  screens: Record<string, ScreenComponent>;
  RegisterExtra?: React.ComponentProps<typeof LoginScreen>['RegisterExtra'];
}

function Gate({ tabs, screens, RegisterExtra }: RootProps) {
  const { ready, user } = useAuth();
  if (!ready) return <Loading text="Starting…" />;
  if (!user) return <LoginScreen RegisterExtra={RegisterExtra} />;
  return <Navigator key={user.id} tabs={tabs} screens={screens} />;
}

export default function Root(props: RootProps) {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Gate {...props} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
