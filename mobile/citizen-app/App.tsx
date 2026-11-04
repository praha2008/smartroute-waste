import React from 'react';
import { Text, View } from 'react-native';

import AccountScreen from './src/core/AccountScreen';
import type { RegisterExtraProps } from './src/core/AuthScreens';
import { t } from './src/core/i18n';
import Root from './src/core/Root';
import { space } from './src/core/theme';
import { Input, Segmented } from './src/core/ui';
import HomeScreen from './src/screens/HomeScreen';
import NewRequestScreen from './src/screens/NewRequestScreen';
import RequestDetailScreen from './src/screens/RequestDetailScreen';
import RequestsScreen from './src/screens/RequestsScreen';
import RewardsScreen from './src/screens/RewardsScreen';

function RegisterExtra({ data, set }: RegisterExtraProps) {
  const type = data.account_type ?? 'household';
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={{ fontSize: 13, color: '#5B6762', marginBottom: 6, fontWeight: '700' }}>{t('reg.household')} / {t('reg.business')}</Text>
      <Segmented
        value={type}
        onChange={(v) => set('account_type', v)}
        options={[
          { value: 'household', label: `🏠  ${t('reg.household')}` },
          { value: 'business', label: `🏪  ${t('reg.business')}` },
        ]}
      />
      {type === 'business' && (
        <View style={{ marginTop: space.md }}>
          <Input label={t('reg.businessName')} icon="storefront-outline" value={data.organization ?? ''} onChangeText={(v) => set('organization', v)} placeholder="Hotel Annapoorna" />
        </View>
      )}
    </View>
  );
}

const Account = () => <AccountScreen />;

export default function App() {
  return (
    <Root
      RegisterExtra={RegisterExtra}
      tabs={[
        { key: 'home', title: 'tab.home', icon: 'home', component: HomeScreen },
        { key: 'requests', title: 'tab.pickups', icon: 'list', component: RequestsScreen },
        { key: 'rewards', title: 'tab.rewards', icon: 'gift', component: RewardsScreen },
        { key: 'account', title: 'tab.account', icon: 'person-circle', component: Account },
      ]}
      screens={{ NewRequest: NewRequestScreen, RequestDetail: RequestDetailScreen }}
    />
  );
}
