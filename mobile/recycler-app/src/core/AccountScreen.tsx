import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Alert, Text, View } from 'react-native';

import { APP } from '../appConfig';
import { getServerUrl } from './api';
import { useAuth } from './auth';
import { colors, font, space } from './theme';
import { Button, Card, KeyValue, Row, Screen, Section } from './ui';

export default function AccountScreen({ children }: { children?: React.ReactNode }) {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <Screen title="Account">
      <Card>
        <Row gap={space.md}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.accentDark }}>{user.name.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={font.h3}>{user.name}</Text>
            <Text style={font.small}>{user.email}</Text>
            {user.organization ? <Text style={font.small}>{user.organization}</Text> : null}
          </View>
        </Row>
      </Card>
      {children}
      <Section title="Details">
        <Card>
          <KeyValue label="Phone" value={user.phone || '—'} />
          <KeyValue label="Role" value={user.role} />
          {user.account_type ? <KeyValue label="Account type" value={user.account_type} /> : null}
          {user.ward ? <KeyValue label="Ward" value={user.ward} /> : null}
          {user.address ? <KeyValue label="Address" value={user.address} /> : null}
          <KeyValue label="Server" value={getServerUrl()} />
          <KeyValue label="App" value={`${APP.name} v1.0`} />
        </Card>
      </Section>
      <Button
        title="Log out"
        variant="danger"
        icon="log-out-outline"
        style={{ marginTop: space.lg }}
        onPress={() =>
          Alert.alert('Log out?', undefined, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log out', style: 'destructive', onPress: logout },
          ])
        }
      />
      <Row style={{ justifyContent: 'center', marginTop: space.xl }}>
        <Ionicons name="leaf-outline" size={14} color={colors.textFaint} />
        <Text style={font.tiny}>SMARTROUTE WASTE · VIT IDP</Text>
      </Row>
    </Screen>
  );
}
